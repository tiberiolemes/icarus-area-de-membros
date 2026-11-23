"""Product tour state, owned by the authenticated user and the current Frappe site."""

import hashlib
import json
from functools import lru_cache
from pathlib import Path

import frappe
from frappe import _
from frappe.rate_limiter import rate_limit


@lru_cache(maxsize=1)
def catalogue():
	return json.loads(Path(frappe.get_app_path("lms", "public", "tours", "quality07.json")).read_text())


def definition(page, revision):
	data = catalogue()
	if revision != data["revision"] or page not in data["pages"]:
		frappe.throw(_("This tour changed. Reopen the page before continuing."))
	user = frappe.session.user
	if user == "Guest" or not frappe.db.get_value("User", user, "enabled"):
		frappe.throw(_("Sign in to use a guided tour."), frappe.PermissionError)
	item = data["pages"][page]
	from lms.lms.permissions import is_community_admin, is_site_administrator
	from lms.lms.utils import has_course_instructor_role, has_moderator_role

	allowed = item["audience"] == "signed" or (
		item["audience"] == "manager"
		and is_site_administrator()
		or item["audience"] == "community_admin"
		and is_community_admin()
		or item["audience"] == "author"
		and (has_course_instructor_role(user) or has_moderator_role(user))
	)
	if not allowed:
		frappe.throw(_("This tour is not available for your current permissions."), frappe.PermissionError)
	return item, len(data["tours"][item["tour"]])


def record_name(page, revision):
	return hashlib.sha256(f"{frappe.session.user}\0{page}\0{revision}".encode()).hexdigest()


def snapshot(doc, total):
	return {
		"status": doc.status,
		"step": doc.step or 0,
		"total": total,
		"helpful": doc.helpful or "",
		"started_count": doc.started_count or 0,
		"completed_count": doc.completed_count or 0,
		"skipped_count": doc.skipped_count or 0,
	}


@frappe.whitelist(methods=["POST"])
@rate_limit(limit=120, seconds=60)
def get_state(page: str, revision: str):
	item, total = definition(page, revision)
	name = record_name(page, revision)
	if not frappe.db.exists("LMS Tour Progress", name):
		return {
			"status": "Not Started",
			"step": 0,
			"total": total,
			"helpful": "",
			"started_count": 0,
			"completed_count": 0,
			"skipped_count": 0,
		}
	doc = frappe.get_doc("LMS Tour Progress", name)
	if doc.member != frappe.session.user or doc.tour != item["tour"]:
		frappe.throw(_("Tour state is unavailable."), frappe.PermissionError)
	return snapshot(doc, total)


@frappe.whitelist(methods=["POST"])
@rate_limit(limit=120, seconds=60)
def record_event(page: str, revision: str, action: str, step: int = 0, helpful: int | None = None):
	item, total = definition(page, revision)
	if action not in {"start", "restart", "progress", "complete", "skip", "pause", "rate"}:
		frappe.throw(_("Choose a valid tour action."))
	name = record_name(page, revision)
	if not frappe.db.exists("LMS Tour Progress", name):
		if action not in {"start", "restart"}:
			frappe.throw(_("Start or resume this tour first."))
		try:
			# Actor is server-derived; private DocPerm prevents direct client edits.
			frappe.get_doc(
				{
					"doctype": "LMS Tour Progress",
					"member": frappe.session.user,
					"page": page,
					"tour": item["tour"],
					"revision": revision,
					"status": "Not Started",
					"step": 0,
				}
			).insert(ignore_permissions=True, set_name=name)
		except frappe.DuplicateEntryError:
			pass
	doc = frappe.get_doc("LMS Tour Progress", name, for_update=True)
	if doc.member != frappe.session.user or doc.page != page or doc.revision != revision or doc.tour != item["tour"]:
		frappe.throw(_("Tour state is unavailable."), frappe.PermissionError)
	if action in {"start", "restart"}:
		if doc.status == "In Progress" or action == "start" and doc.status == "Completed":
			return snapshot(doc, total)
		if action == "restart" or doc.status in {"Not Started", "Skipped", "Completed"}:
			doc.step = 0
			doc.started_count = (doc.started_count or 0) + 1
		doc.status = "In Progress"
	elif action == "progress":
		if (
			doc.status != "In Progress"
			or type(step) is not int
			or step not in {doc.step, doc.step + 1}
			or not 0 <= step < total
		):
			frappe.throw(_("Follow the tour steps in order."))
		doc.step = step
	elif action == "complete":
		if doc.status == "Completed":
			return snapshot(doc, total)
		if doc.status != "In Progress" or doc.step != total - 1:
			frappe.throw(_("Finish the available steps before completing the tour."))
		doc.status = "Completed"
		doc.completed_count = (doc.completed_count or 0) + 1
	elif action == "skip":
		if doc.status == "Skipped":
			return snapshot(doc, total)
		if doc.status not in {"In Progress", "Paused"}:
			frappe.throw(_("Start or resume this tour first."))
		doc.status = "Skipped"
		doc.skipped_count = (doc.skipped_count or 0) + 1
	elif action == "pause":
		if doc.status == "In Progress":
			doc.status = "Paused"
	elif action == "rate":
		if (
			doc.status not in {"Completed", "Skipped"}
			or type(helpful) not in {int, bool}
			or helpful not in (0, 1)
		):
			frappe.throw(_("Evaluate a completed or skipped tour with yes or no."))
		doc.helpful = "Yes" if helpful else "No"
	doc.save(ignore_permissions=True)
	return snapshot(doc, total)


@frappe.whitelist(methods=["POST"])
@rate_limit(limit=30, seconds=60)
def report(page: str = "", offset: int = 0, page_length: int = 25):
	from lms.lms.permissions import is_community_admin

	if not is_community_admin() or not frappe.db.get_value("User", frappe.session.user, "enabled"):
		frappe.throw(_("Only administrators can read individual tour statistics."), frappe.PermissionError)
	if page and page not in catalogue()["pages"]:
		frappe.throw(_("Choose an available tour page."))
	if type(offset) is not int or offset < 0 or type(page_length) is not int or not 1 <= page_length <= 100:
		frappe.throw(_("Choose a valid report page."))
	filters = {"revision": catalogue()["revision"]}
	if page:
		filters["page"] = page
	clause = "AND page = %(page)s" if page else ""
	counts = frappe.db.sql(
		"""SELECT COUNT(*) AS participations,
		SUM(CASE WHEN completed_count > 0 THEN 1 ELSE 0 END) AS completed,
		SUM(CASE WHEN skipped_count > 0 THEN 1 ELSE 0 END) AS skipped,
		SUM(CASE WHEN helpful IN ('Yes', 'No') THEN 1 ELSE 0 END) AS rated,
		SUM(CASE WHEN helpful = 'Yes' THEN 1 ELSE 0 END) AS useful
		FROM `tabLMS Tour Progress` WHERE revision = %(revision)s AND started_count > 0 """
		+ clause,
		filters,
		as_dict=True,
	)[0]
	summary = {
		key: int(counts.get(key) or 0)
		for key in ("participations", "completed", "skipped", "rated", "useful")
	}
	rows = frappe.get_all(
		"LMS Tour Progress",
		filters={**filters, "started_count": [">", 0]},
		fields=[
			"member",
			"page",
			"tour",
			"revision",
			"status",
			"step",
			"started_count",
			"completed_count",
			"skipped_count",
			"helpful",
			"modified",
		],
		order_by="modified desc, name desc",
		limit_start=offset,
		limit_page_length=page_length,
	)
	return {
		"site": frappe.local.site,
		"revision": catalogue()["revision"],
		"summary": summary,
		"rows": rows,
		"offset": offset,
		"page_length": page_length,
		"denominator": "one authenticated member per page and revision in this site; counters show attempts, not learning completion",
	}
