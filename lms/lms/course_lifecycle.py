"""Native course lifecycle: reversible archive, explicit reauthenticated purge."""

import hashlib
import json
import re
import secrets
import time
from contextvars import ContextVar

import frappe
from frappe import _
from frappe.auth import LoginAttemptTracker
from frappe.utils import cint, escape_html
from frappe.utils.password import check_password

from lms.lms.locking import locked_get_all
from lms.lms.permissions import can_author_course, is_site_administrator

_archive_transition = ContextVar("lms_course_archive_transition", default=None)
_purge_context = ContextVar("lms_course_purge_context", default=None)
PURGE_TTL = 300


def _deny():
	frappe.throw(_("You are not permitted to perform this course action."), frappe.PermissionError)


def _require_author(course: str):
	if (
		not isinstance(course, str)
		or not course
		or len(course) > 140
		or frappe.session.user in (None, "", "Guest")
	):
		_deny()
	if not frappe.db.get_value("User", frappe.session.user, "enabled", for_update=True):
		_deny()
	if not frappe.db.get_value("LMS Course", course, "name", for_update=True):
		_deny()
	if not can_author_course(course, for_update=True):
		_deny()
	return frappe.get_doc("LMS Course", course, for_update=True)


def is_archive_transition_authorized(course: str) -> bool:
	return _archive_transition.get() == (course, frappe.session.user)


def is_course_purge_authorized(course: str, *, user: str | None = None) -> bool:
	return _purge_context.get() == (course, user or frappe.session.user)


def course_purge_in_progress() -> bool:
	context = _purge_context.get()
	return bool(context and context[1] == frappe.session.user)


def require_course_purge_context(course: str):
	if not is_course_purge_authorized(course):
		frappe.throw(
			_("Archive this course instead. Permanent deletion requires the explicit purge action."),
			frappe.PermissionError,
		)


def _audit(event: str, course: str, *, authorizer: str | None = None, impact: dict | None = None):
	# No Dynamic Link to the course: the purge must not delete its own audit record.
	subjects = {
		"archived": _("Course archived: {0}"),
		"restored": _("Course restored: {0}"),
		"purge authorized": _("Course purge authorized: {0}"),
		"purged": _("Course purged: {0}"),
	}
	content = {"event": event, "course": course, "actor": frappe.session.user}
	if authorizer:
		content["authorizer"] = authorizer
	if impact is not None:
		content["impact"] = impact
	# nosemgrep: lms-unjustified-ignore-permissions - server-owned audit event, no client document fields
	frappe.get_doc(
		{
			"doctype": "Activity Log",
			"user": frappe.session.user,
			"subject": escape_html(subjects[event].format(course)),
			"content": "<pre>" + escape_html(json.dumps(content, sort_keys=True)) + "</pre>",
			"status": "Success",
		}
	).insert(ignore_permissions=True)


def set_course_archived(course: str, archived: bool) -> dict:
	doc = _require_author(course)
	if bool(doc.is_archived) != archived:
		context = _archive_transition.set((course, frappe.session.user))
		try:
			doc.is_archived = int(archived)
			# Restore deliberately stays unpublished; publication is a separate decision.
			doc.published = 0
			doc.save()
			_audit("archived" if archived else "restored", course)
		finally:
			_archive_transition.reset(context)
	return {"course": course, "is_archived": cint(doc.is_archived), "published": cint(doc.published)}


def validate_new_enrollment(doc, method=None):
	"""before_insert hook, after the controller, under the same course-row lock."""
	state = frappe.db.get_value("LMS Course", doc.course, "is_archived", for_update=True)
	if state is None or state:
		frappe.throw(_("New enrollment is unavailable for this course."), frappe.PermissionError)


def _impact_snapshot(doc) -> tuple[dict, str]:
	from lms.lms.doctype.lms_course.lms_course import COURSE_OWNED_DOCTYPES

	counts, identities = {}, {}

	def capture(label, doctype, filters):
		rows = locked_get_all(doctype, filters, ["name", "modified"])
		counts[label] = len(rows)
		identities[label] = sorted((row.name, str(row.modified)) for row in rows)
		return [row.name for row in rows]

	for doctype in COURSE_OWNED_DOCTYPES:
		capture(doctype, doctype, {"course": doc.name})
	capture("Chapter Reference", "Chapter Reference", {"parent": doc.name, "parenttype": "LMS Course"})
	chapters = capture("Course Chapter", "Course Chapter", {"course": doc.name})
	if chapters:
		capture(
			"Lesson Reference",
			"Lesson Reference",
			{"parent": ("in", chapters), "parenttype": "Course Chapter"},
		)
	lessons = capture("Course Lesson", "Course Lesson", {"chapter": ("in", chapters)}) if chapters else []
	for doctype, filters in (
		("LMS Lesson Note", {"lesson": ("in", lessons)}),
		("Discussion Topic", {"reference_doctype": "Course Lesson", "reference_docname": ("in", lessons)}),
		("LMS Batch Timetable", {"reference_doctype": "Course Lesson", "reference_docname": ("in", lessons)}),
	):
		if lessons:
			names = capture(doctype, doctype, filters)
			if doctype == "Discussion Topic" and names:
				capture("Discussion Reply", "Discussion Reply", {"topic": ("in", names)})
	capture("LMS Program Course", "LMS Program Course", {"course": doc.name})
	for doctype in ("LMS Quiz", "LMS Quiz Submission", "LMS Assignment", "LMS Assignment Submission"):
		capture("Unlink " + doctype, doctype, {"course": doc.name})
	if lessons:
		for doctype in ("LMS Quiz", "LMS Assignment Submission"):
			capture("Unlink lesson " + doctype, doctype, {"lesson": ("in", lessons)})
		capture("Clear current lesson", "LMS Enrollment", {"current_lesson": ("in", lessons)})
		for doctype in ("LMS Course Progress", "LMS Video Watch Duration"):
			capture("Lesson cleanup " + doctype, doctype, {"lesson": ("in", lessons)})
	for doctype, names in (
		("LMS Course", [doc.name]),
		("Course Chapter", chapters),
		("Course Lesson", lessons),
	):
		if names:
			capture(
				"Attachments " + doctype,
				"File",
				{"attached_to_doctype": doctype, "attached_to_name": ("in", names)},
			)
	identities["course"] = (doc.name, str(doc.modified), cint(doc.is_archived))
	digest = hashlib.sha256(json.dumps(identities, sort_keys=True).encode()).hexdigest()
	return {"course": doc.name, "is_archived": cint(doc.is_archived), "counts": counts}, digest


def get_course_deletion_impact(course: str) -> dict:
	return _impact_snapshot(_require_author(course))[0]


def _session_fingerprint() -> str:
	sid = frappe.session.get("sid")
	if not sid or sid == "Guest":
		_deny()
	return hashlib.sha256(sid.encode()).hexdigest()


def _authorizer(identifier: str):
	from frappe.core.doctype.user.user import User

	if not isinstance(identifier, str) or not identifier or len(identifier) > 140:
		_deny()
	identity = User.find_by_credentials(identifier, "", validate_password=False)
	if not identity:
		_deny()
	user = frappe.db.get_value(
		"User", identity.name, ["name", "enabled", "modified"], as_dict=True, for_update=True
	)
	if not user or not user.enabled or not is_site_administrator(user.name, for_update=True):
		_deny()
	return user


def prepare_course_purge(course: str, authorizer: str, password: str) -> dict:
	doc = _require_author(course)
	if not doc.is_archived:
		frappe.throw(_("Archive the course before requesting permanent deletion."))
	if not isinstance(password, str) or not password or len(password) > 1024:
		_deny()
	session = _session_fingerprint()
	# A stable actor bucket also limits attempts made from different IP addresses.
	tracker = LoginAttemptTracker("lms-course-purge:" + frappe.session.user, max_consecutive_login_attempts=4)
	if not tracker.is_user_allowed():
		frappe.throw(_("Too many attempts. Wait five minutes and try again."), frappe.PermissionError)
	try:
		approver = _authorizer(authorizer)
		check_password(approver.name, password, delete_tracker_cache=False)
	except (frappe.PermissionError, frappe.AuthenticationError):
		tracker.add_failure_attempt()
		frappe.logger("lms.security").warning(
			"Course purge authorization refused: actor=%s", frappe.session.user
		)
		_deny()
	tracker.add_success_attempt()
	impact, digest = _impact_snapshot(doc)
	token = secrets.token_urlsafe(32)
	approval = {
		"course": course,
		"actor": frappe.session.user,
		"authorizer": approver.name,
		"authorizer_modified": str(approver.modified),
		"session": session,
		"digest": digest,
		"expires_at": time.time() + PURGE_TTL,
	}
	frappe.cache.set(_approval_key(token), json.dumps(approval), ex=PURGE_TTL)
	_audit("purge authorized", course, authorizer=approver.name, impact=impact)
	return {"token": token, "expires_in": PURGE_TTL, "impact": impact}


def _approval_key(token: str):
	return frappe.cache.make_key("lms-course-purge:" + hashlib.sha256(token.encode()).hexdigest())


def purge_course(course: str, confirmation: str, token: str) -> dict:
	doc = _require_author(course)
	if not doc.is_archived or not isinstance(confirmation, str) or confirmation != course:
		_deny()
	if not isinstance(token, str) or not re.fullmatch(r"[A-Za-z0-9_-]{43}", token):
		_deny()
	# Redis GETDEL is atomic: concurrent requests cannot both consume an approval.
	stored = frappe.cache.getdel(_approval_key(token))
	if not stored:
		_deny()
	approval = json.loads(stored)
	if (
		approval["course"] != course
		or approval["actor"] != frappe.session.user
		or approval["session"] != _session_fingerprint()
		or approval["expires_at"] <= time.time()
	):
		_deny()
	approver = _authorizer(approval["authorizer"])
	impact, digest = _impact_snapshot(doc)
	if str(approver.modified) != approval["authorizer_modified"] or digest != approval["digest"]:
		frappe.throw(_("The course or authorization changed. Review the impact and authorize again."))
	context = _purge_context.set((course, frappe.session.user))
	try:
		# nosemgrep: lms-unjustified-ignore-permissions - author, privileged reauthentication and single-use server approval checked above; on_trash enforces the private context too
		frappe.delete_doc("LMS Course", course, ignore_permissions=True)
		_audit("purged", course, authorizer=approver.name, impact=impact)
	finally:
		_purge_context.reset(context)
	return {"course": course, "purged": True}
