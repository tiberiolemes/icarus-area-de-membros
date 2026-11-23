"""Local annual entitlements; no payment or provider integration."""

import re
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

import frappe
from frappe import _
from frappe.utils import add_months, cint, get_datetime, now_datetime

from lms.lms.permissions import is_community_admin


def require_admin():
	if not is_community_admin():
		frappe.throw(_("Community administration is required."), frappe.PermissionError)


def access_datetime(value):
	try:
		value = get_datetime(value)
		if not value.tzinfo:
			zone = ZoneInfo(frappe.utils.get_system_timezone())
			local = value.replace(tzinfo=zone)
			if (
				local.utcoffset() != local.replace(fold=1).utcoffset()
				or local.astimezone(timezone.utc).astimezone(zone).replace(tzinfo=None) != value
			):
				frappe.throw(_("Enter an explicit timezone offset for an ambiguous access date."))
			value = local
		return value.astimezone(timezone.utc).replace(tzinfo=None)
	except (ValueError, TypeError, OverflowError):
		frappe.throw(_("Enter a valid access date."))


def utc_now():
	return datetime.now(timezone.utc).replace(tzinfo=None)


def grant_state(grant, at=None):
	if grant.get("revoked_on"):
		return "Revoked"
	at = get_datetime(at or utc_now())
	if at < get_datetime(grant.starts_on):
		return "Scheduled"
	return "Active" if at < get_datetime(grant.ends_on) else "Expired"


def can_access_community(community, user=None):
	user = user or frappe.session.user
	if user == "Guest" or not frappe.db.get_value("User", user, "enabled"):
		return False
	if not frappe.db.exists("LMS Community", community):
		return False
	if is_community_admin(user):
		return True
	at = utc_now()
	return bool(
		frappe.db.exists(
			"LMS Community Grant",
			{
				"community": community,
				"member": user,
				"revoked_on": ("is", "not set"),
				"starts_on": ("<=", at),
				"ends_on": (">", at),
			},
		)
	)


@frappe.whitelist()
def get_access(community="geracao-vaibe"):
	if frappe.session.user == "Guest":
		frappe.throw(_("Please sign in to view the community."), frappe.PermissionError)
	doc = frappe.get_doc("LMS Community", community)
	grants = frappe.get_all(
		"LMS Community Grant",
		{"community": community, "member": frappe.session.user},
		["name", "starts_on", "ends_on", "revoked_on"],
		order_by="starts_on desc, name desc",
	)
	for grant in grants:
		grant.state = grant_state(grant)
		_format_dates(grant)
	return {
		"name": doc.name,
		"title": doc.title,
		"can_access": can_access_community(community),
		"is_admin": is_community_admin(),
		"timezone": frappe.utils.get_system_timezone(),
		"grants": grants,
	}


@frappe.whitelist(methods=["POST"])
def grant_access(member, request_key, community="geracao-vaibe", starts_on=None, ends_on=None, reason=None):
	require_admin()
	if not isinstance(request_key, str) or not re.fullmatch(r"[A-Za-z0-9_-]{8,100}", request_key):
		frappe.throw(_("Use a unique grant request key of 8 to 100 characters."))
	if not frappe.db.get_value("User", member, "enabled") or member == "Guest":
		frappe.throw(_("Select an enabled member."))
	policy = frappe.get_doc("LMS Community", community)
	reason = (reason or "").strip()
	requested_start = access_datetime(starts_on) if starts_on else None
	requested_end = access_datetime(ends_on) if ends_on else None
	# The common parent lock serializes grants and retries, including first insert.
	frappe.db.get_value("LMS Community", community, "name", for_update=True)
	existing = frappe.db.get_value("LMS Community Grant", {"request_key": request_key}, "name")
	if existing:
		grant = frappe.get_doc("LMS Community Grant", existing)
		if (
			grant.member != member
			or grant.community != community
			or (grant.reason or "") != reason
			or (requested_start and requested_start != get_datetime(grant.starts_on))
			or (requested_end and requested_end != get_datetime(grant.ends_on))
		):
			frappe.throw(_("This grant request key belongs to a different request."))
		return {"name": grant.name, "state": grant_state(grant)}
	start = requested_start or utc_now()
	end = requested_end or get_datetime(add_months(start, cint(policy.term_months)))
	grant = frappe.get_doc(
		{
			"doctype": "LMS Community Grant",
			"community": community,
			"member": member,
			"request_key": request_key,
			"starts_on": start,
			"ends_on": end,
			"reason": reason,
			"granted_by": frappe.session.user,
		}
	)
	# nosemgrep: lms-unjustified-ignore-permissions - require_admin gates this immutable grant; no generic create grant.
	grant.insert(ignore_permissions=True)
	# Native portal capabilities; revocation removes this grant, never course roles/rights.
	if "LMS Student" not in frappe.get_roles(member):
		user = frappe.get_doc("User", member)
		user.append_roles("LMS Student")
		# nosemgrep: lms-unjustified-ignore-permissions - require_admin grants only the fixed portal role, never client-supplied roles.
		user.save(ignore_permissions=True)
	frappe.publish_realtime(
		"lms_community_access_changed", {"community": community}, user=member, after_commit=True
	)
	return {"name": grant.name, "state": grant_state(grant)}


@frappe.whitelist(methods=["POST"])
def revoke_access(grant, reason):
	require_admin()
	if not isinstance(reason, str) or not reason.strip():
		frappe.throw(_("Give a reason for revoking this access."))
	frappe.db.get_value("LMS Community Grant", grant, "name", for_update=True)
	doc = frappe.get_doc("LMS Community Grant", grant)
	if not doc.revoked_on:
		doc.revoked_on, doc.revoked_by, doc.revocation_reason = (
			now_datetime(),
			frappe.session.user,
			reason.strip(),
		)
		# nosemgrep: lms-unjustified-ignore-permissions - require_admin gates revocation; controller preserves immutable grant fields.
		doc.save(ignore_permissions=True)
		frappe.publish_realtime(
			"lms_community_access_changed", {"community": doc.community}, user=doc.member, after_commit=True
		)
	return {"name": doc.name, "state": grant_state(doc)}


@frappe.whitelist()
def list_grants(community="geracao-vaibe", start=0):
	require_admin()
	rows = frappe.get_all(
		"LMS Community Grant",
		{"community": community},
		["name", "member", "starts_on", "ends_on", "revoked_on", "reason", "revocation_reason"],
		order_by="creation desc, name desc",
		limit_start=max(0, cint(start)),
		limit_page_length=20,
	)
	for row in rows:
		row.state = grant_state(row)
		_format_dates(row)
	return rows


def _format_dates(row):
	row.starts_at = get_datetime(row.starts_on).replace(tzinfo=timezone.utc).isoformat()
	row.ends_at = get_datetime(row.ends_on).replace(tzinfo=timezone.utc).isoformat()
