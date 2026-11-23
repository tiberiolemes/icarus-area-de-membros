"""Stage legacy discussions as pending, without deletion or historical notifications."""

import json
from pathlib import Path

import frappe
from frappe.custom.doctype.custom_field.custom_field import create_custom_fields
from frappe.custom.doctype.property_setter.property_setter import make_property_setter


def legacy_preview():
	"""Read-only preflight; run before migration and retain its counts in the backup receipt."""
	return {doctype: frappe.db.count(doctype) for doctype in ("Discussion Topic", "Discussion Reply")}


def execute():
	from lms.lms.api import give_discussions_permission

	for name in ("lms_community", "lms_community_grant", "lms_discussion_decision"):
		frappe.reload_doc("lms", "doctype", name)
	fields = [
		{
			"fieldname": "lms_moderation_state",
			"label": "Publication state",
			"fieldtype": "Select",
			"options": "Pending\nApproved\nRejected",
			"default": "Pending",
			"read_only": 1,
		},
		{
			"fieldname": "lms_legacy",
			"label": "Legacy message without retroactive notifications",
			"fieldtype": "Check",
			"read_only": 1,
			"hidden": 1,
		},
		{
			"fieldname": "lms_notified_on",
			"label": "Approval notification recorded on",
			"fieldtype": "Datetime",
			"read_only": 1,
			"hidden": 1,
		},
	]
	create_custom_fields(
		{
			"Discussion Topic": fields
			+ [
				{
					"fieldname": "lms_root_reply",
					"label": "Topic body",
					"fieldtype": "Link",
					"options": "Discussion Reply",
					"read_only": 1,
				},
				{
					"fieldname": "lms_single_thread",
					"label": "Shared discussion thread",
					"fieldtype": "Check",
					"read_only": 1,
				},
			],
			"Discussion Reply": fields,
		}
	)
	for doctype in ("Discussion Topic", "Discussion Reply"):
		frappe.db.sql(
			f"UPDATE `tab{doctype}` SET lms_moderation_state='Pending' WHERE COALESCE(lms_moderation_state, '')='' "
		)
		frappe.db.add_index(doctype, ["lms_moderation_state", "creation"])
		frappe.db.sql(f"UPDATE `tab{doctype}` SET lms_legacy=1")
	make_property_setter("Discussion Reply", None, "track_changes", 1, "Check", for_doctype=True)
	give_discussions_permission()
	for topic in frappe.get_all(
		"Discussion Topic", fields=["name", "reference_doctype", "reference_docname", "lms_root_reply"]
	):
		# Batch conversations have no question-body reply; every message is a response.
		if topic.reference_doctype == "LMS Batch":
			frappe.db.set_value(
				"Discussion Topic",
				topic.name,
				{"lms_single_thread": 1, "lms_moderation_state": "Approved"},
				update_modified=False,
			)
		elif not topic.lms_root_reply:
			first = frappe.get_all(
				"Discussion Reply",
				{"topic": topic.name},
				pluck="name",
				order_by="creation, name",
				limit_page_length=1,
			)
			if first:
				frappe.db.set_value(
					"Discussion Topic", topic.name, "lms_root_reply", first[0], update_modified=False
				)
	# Local creation is explicit; no price or payment endpoint is published.
	if not frappe.db.exists("LMS Community", "geracao-vaibe"):
		community = frappe.get_doc(
			{
				"doctype": "LMS Community",
				"community_key": "geracao-vaibe",
				"title": "Geração vAIbe",
				"term_months": 12,
				"renewal_policy": "Explicit dates",
				"refund_policy": "Manual revocation",
			}
		)
		# nosemgrep: lms-unjustified-ignore-permissions - serialized schema upgrade creates the explicitly authorized local community.
		community.insert(ignore_permissions=True)
	frappe.db.add_index("LMS Community Grant", ["community", "member", "starts_on", "ends_on"])
	# Domain strings use native Translation records; never hand-edit upstream locale files.
	catalog = Path(frappe.get_app_path("lms")).parent / "local" / "i18n" / "community-pt-BR.json"
	for source, target in json.loads(catalog.read_text()).items():
		if not frappe.db.exists("Translation", {"source_text": source, "language": "pt-BR"}):
			translation = frappe.get_doc(
				{
					"doctype": "Translation",
					"language": "pt-BR",
					"source_text": source,
					"translated_text": target,
				}
			)
			# nosemgrep: lms-unjustified-ignore-permissions - native Translation records from the reviewed domain catalog, during migration only.
			translation.insert(ignore_permissions=True)
