"""Native discussions with manual, fail-closed publication and private invalidation."""

import re
from contextvars import ContextVar
from urllib.parse import urlsplit
from zoneinfo import ZoneInfo

import frappe
from frappe import _
from frappe.query_builder import Order
from frappe.utils import cint, get_datetime, get_system_timezone, now_datetime
from frappe.website.doctype.discussion_reply.discussion_reply import DiscussionReply
from frappe.website.doctype.discussion_topic.discussion_topic import DiscussionTopic
from pypika import functions as fn

from lms.lms.html_sanitizer import sanitize_rich_text
from lms.lms.permissions import is_community_admin

_transition = ContextVar("discussion_transition", default=False)
STATES = ("Pending", "Approved", "Rejected")
REFERENCES = ("Course Lesson", "LMS Batch", "LMS Community")
CONTROLLED = ("lms_moderation_state", "lms_notified_on", "lms_root_reply", "lms_single_thread", "lms_legacy")


def require_topic(topic, user=None):
	from lms.lms.utils import can_access_topic, is_topic_participant

	user = user or frappe.session.user
	if topic.reference_doctype not in REFERENCES:
		frappe.throw(_("Unsupported discussion reference."), frappe.PermissionError)
	allowed = (
		can_access_topic(topic.reference_doctype, topic.reference_docname)
		if user == frappe.session.user
		else is_topic_participant(user, topic)
	)
	if not allowed:
		frappe.throw(_("You do not have access to this discussion."), frappe.PermissionError)


def visible(doc, user=None):
	user = user or frappe.session.user
	return is_community_admin(user) or doc.owner == user or doc.get("lms_moderation_state") == "Approved"


def get_topic(name, user=None):
	topic = frappe.get_doc("Discussion Topic", name)
	require_topic(topic, user)
	if not visible(topic, user):
		frappe.throw(_("You do not have access to this discussion."), frappe.PermissionError)
	return topic


def validate_document(doc):
	if doc.doctype == "Discussion Topic":
		topic = doc
		if topic.reference_doctype not in REFERENCES:
			frappe.throw(_("Unsupported discussion reference."), frappe.PermissionError)
		if not isinstance(doc.title, str):
			frappe.throw(_("Title cannot be empty."))
		doc.title = doc.title.strip()
		if len(doc.title) > 140:
			frappe.throw(_("A title must contain at most 140 characters."))
		if not doc.title:
			frappe.throw(_("Title cannot be empty."))
	else:
		topic = get_topic(doc.topic)
		if not isinstance(doc.reply, str) or len(doc.reply) > 100000:
			frappe.throw(_("A message must contain at most 100,000 characters."))
		doc.reply = sanitize_rich_text(doc.reply)
		if not frappe.utils.strip_html(doc.reply or "").strip() and not re.search(r"<img\b", doc.reply, re.I):
			frappe.throw(_("Reply cannot be empty."))
	require_topic(topic)
	if not doc.is_new():
		old = doc.get_doc_before_save()
		immutable = (
			("owner", "creation", "reference_doctype", "reference_docname")
			if doc.doctype == "Discussion Topic"
			else ("owner", "creation", "topic")
		)
		if any(doc.get(f) != old.get(f) for f in immutable):
			frappe.throw(_("Discussion authorship and reference cannot be changed."), frappe.PermissionError)
		if doc.owner != frappe.session.user and not _transition.get():
			frappe.throw(_("You can only edit your own replies."), frappe.PermissionError)
		if not _transition.get() and any(doc.get(f) != old.get(f) for f in CONTROLLED):
			frappe.throw(_("Use the moderation queue to change publication state."), frappe.PermissionError)
		changed = doc.has_value_changed("title" if doc.doctype == "Discussion Topic" else "reply")
	else:
		# Never accept author, publication or timestamp authority from the caller.
		doc.owner, doc.creation = frappe.session.user, now_datetime()
		changed = True
		if not _transition.get():
			for field in CONTROLLED:
				doc.set(field, None)
	if changed and (doc.is_new() or not _transition.get()):
		doc.lms_moderation_state = "Pending"
		if doc.doctype == "Discussion Reply" and topic.lms_root_reply == doc.name:
			frappe.db.set_value("Discussion Topic", topic.name, "lms_moderation_state", "Pending")


class ModeratedDiscussionTopic(DiscussionTopic):
	def notify_update(self):
		# Generic list_update broadcasts pending identifiers to the whole website.
		# on_update already emits the authorized per-user invalidation.
		return

	def validate(self):
		validate_document(self)

	def on_update(self):
		publish_change(self)

	def on_trash(self):
		frappe.throw(_("Discussion history must be preserved. Withdraw the message instead."))


class ModeratedDiscussionReply(DiscussionReply):
	def notify_update(self):
		# Keep pending replies inside the same audience as their protected API.
		return

	def validate(self):
		validate_document(self)

	def after_insert(self):
		# The native handler broadcasts rendered content to the website room.
		# No content or template is ever broadcast from a moderated discussion.
		frappe.db.get_value("Discussion Topic", self.topic, "name", for_update=True)
		topic = frappe.get_doc("Discussion Topic", self.topic)
		if not topic.lms_single_thread and not topic.lms_root_reply:
			frappe.db.set_value("Discussion Topic", topic.name, "lms_root_reply", self.name)

	def on_update(self):
		publish_change(self)

	def after_delete(self):
		pass

	def on_trash(self):
		frappe.throw(_("Discussion history must be preserved. Withdraw the message instead."))


def publish_change(doc):
	from lms.lms.api import discussion_people
	from lms.lms.utils import is_topic_participant

	topic = doc if doc.doctype == "Discussion Topic" else frappe.get_doc("Discussion Topic", doc.topic)
	users = {doc.owner}
	old = doc.get_doc_before_save()
	was_public = old and old.lms_moderation_state == "Approved"
	if was_public or (doc.lms_moderation_state == "Approved" and topic.lms_moderation_state == "Approved"):
		users |= discussion_people(topic.reference_doctype, topic.reference_docname)
	for user in users:
		if user != "Guest" and is_topic_participant(user, topic):
			frappe.publish_realtime(
				"lms_discussion_changed", {"topic": topic.name}, user=user, after_commit=True
			)
	if doc.doctype == "Discussion Reply":
		notify_once(doc, topic)


def notify_once(doc, topic=None):
	from lms.lms.utils import send_approved_discussion_notifications

	topic = topic or frappe.get_doc("Discussion Topic", doc.topic)
	if doc.lms_moderation_state != "Approved" or topic.lms_moderation_state != "Approved":
		return
	if doc.lms_legacy:
		return
	stored = frappe.db.get_value(
		"Discussion Reply",
		doc.name,
		["lms_notified_on", "lms_moderation_state"],
		as_dict=True,
		for_update=True,
	)
	if stored.lms_notified_on or stored.lms_moderation_state != "Approved":
		return
	frappe.db.set_value(
		"Discussion Reply", doc.name, "lms_notified_on", now_datetime(), update_modified=False
	)
	send_approved_discussion_notifications(doc, topic)


def _record(doc, previous, reason):
	decision = frappe.get_doc(
		{
			"doctype": "LMS Discussion Decision",
			"reference_doctype": doc.doctype,
			"reference_name": doc.name,
			"previous_state": previous or "Pending",
			"state": doc.lms_moderation_state,
			"actor": frappe.session.user,
			"reason": reason,
			"content_snapshot": sanitize_rich_text(doc.reply)
			if doc.doctype == "Discussion Reply"
			else frappe.utils.escape_html(doc.title),
		}
	)
	# nosemgrep: lms-unjustified-ignore-permissions - only guarded decisions/own withdrawals create immutable audit snapshots.
	decision.insert(ignore_permissions=True)


@frappe.whitelist(methods=["POST"])
def decide(doctype, name, state, reason=None, expected_modified=None):
	if not is_community_admin():
		frappe.throw(_("Community administration is required."), frappe.PermissionError)
	if not expected_modified:
		frappe.throw(_("Refresh the queue and review the current message before deciding."))
	if doctype == "Discussion Reply":
		topic = frappe.db.get_value("Discussion Reply", name, "topic")
		if frappe.db.get_value("Discussion Topic", topic, "lms_root_reply") == name:
			frappe.throw(_("Review the topic together with its message."))
	return _decide(doctype, name, state, reason, expected_modified)


def _decide(doctype, name, state, reason, expected_modified=None):
	if doctype not in ("Discussion Topic", "Discussion Reply") or state not in ("Approved", "Rejected"):
		frappe.throw(_("Invalid moderation decision."))
	if state == "Rejected" and not (reason or "").strip():
		frappe.throw(_("Give a reason for refusing this message."))
	# Same topic-first lock order for root and response decisions.
	topic_name = name if doctype == "Discussion Topic" else frappe.db.get_value(doctype, name, "topic")
	frappe.db.get_value("Discussion Topic", topic_name, "name", for_update=True)
	topic = get_topic(topic_name)
	if doctype == "Discussion Topic" and topic.lms_single_thread:
		frappe.throw(_("Review the messages in this shared thread individually."))
	if (
		doctype == "Discussion Topic"
		and state == "Approved"
		and not topic.lms_root_reply
		and not topic.lms_single_thread
	):
		frappe.throw(_("A topic needs its message before approval."))
	if doctype == "Discussion Reply" and topic.lms_root_reply == name:
		return _decide("Discussion Topic", topic.name, state, reason)
	frappe.db.get_value(doctype, name, "name", for_update=True)
	doc = frappe.get_doc(doctype, name)
	if expected_modified and get_datetime(expected_modified) != get_datetime(doc.modified):
		frappe.throw(_("Refresh the queue and review the current message before deciding."))
	if doctype == "Discussion Reply" and state == "Approved" and topic.lms_moderation_state != "Approved":
		frappe.throw(_("Approve the topic before its responses."))
	token = _transition.set(True)
	try:
		for item in (
			[doc, frappe.get_doc("Discussion Reply", doc.lms_root_reply)]
			if doctype == "Discussion Topic" and doc.lms_root_reply
			else [doc]
		):
			previous = item.lms_moderation_state
			if previous == state:
				continue
			item.lms_moderation_state = state
			# nosemgrep: lms-unjustified-ignore-permissions - explicit admin decision or own withdrawal; reference checked under lock.
			item.save(ignore_permissions=True)
			_record(item, previous, reason)
	finally:
		_transition.reset(token)
	return {"name": doc.name, "state": state}


@frappe.whitelist(methods=["POST"])
def withdraw(name):
	doc = frappe.get_doc("Discussion Reply", name)
	if doc.owner != frappe.session.user:
		frappe.throw(_("You can only edit your own replies."), frappe.PermissionError)
	return _decide("Discussion Reply", name, "Rejected", _("Withdrawn by the author."))


@frappe.whitelist(methods=["POST"])
def create_topic(doctype, docname, title, reply):
	from lms.lms.utils import can_access_topic

	if not can_access_topic(doctype, docname):
		frappe.throw(_("You do not have access to this discussion."), frappe.PermissionError)
	frappe.has_permission("Discussion Topic", "create", throw=True)
	frappe.has_permission("Discussion Reply", "create", throw=True)
	topic = frappe.get_doc(
		{
			"doctype": "Discussion Topic",
			"reference_doctype": doctype,
			"reference_docname": docname,
			"title": title,
		}
	)
	# nosemgrep: lms-unjustified-ignore-permissions - native create grants and authoritative reference access checked above.
	topic.insert(ignore_permissions=True)
	root = frappe.get_doc({"doctype": "Discussion Reply", "topic": topic.name, "reply": reply})
	# nosemgrep: lms-unjustified-ignore-permissions - atomic body for the authorized topic; native controller forces pending.
	root.insert(ignore_permissions=True)
	frappe.db.set_value("Discussion Topic", topic.name, "lms_root_reply", root.name)
	return {"name": topic.name, "state": "Pending"}


@frappe.whitelist()
def queue(state="Pending", start=0):
	if not is_community_admin():
		frappe.throw(_("Community administration is required."), frappe.PermissionError)
	if state not in STATES:
		frappe.throw(_("Invalid moderation decision."))
	rows = []
	has_more = False
	for doctype in ("Discussion Topic", "Discussion Reply"):
		filters = {"lms_moderation_state": state}
		if doctype == "Discussion Topic":
			filters["lms_single_thread"] = 0
		fields = ["name", "owner", "creation", "modified", "lms_moderation_state"] + (
			["title", "reference_doctype", "reference_docname", "lms_root_reply"]
			if doctype == "Discussion Topic"
			else ["reply", "topic"]
		)
		page = frappe.get_all(
			doctype,
			filters,
			fields,
			order_by="creation, name",
			limit_start=max(0, cint(start)),
			limit_page_length=21,
		)
		has_more = has_more or len(page) > 20
		for row in page[:20]:
			topic = row if doctype == "Discussion Topic" else frappe.get_doc("Discussion Topic", row.topic)
			try:
				require_topic(topic)
			except frappe.PermissionError:
				continue
			if doctype == "Discussion Reply" and topic.lms_root_reply == row.name:
				continue
			if doctype == "Discussion Topic" and row.lms_root_reply:
				row.reply = frappe.db.get_value("Discussion Reply", row.lms_root_reply, "reply")
			if row.get("reply"):
				row.reply = sanitize_rich_text(row.reply)
			row.doctype = doctype
			row.created_at = site_datetime(row.creation)
			row.author = frappe.db.get_value("User", row.owner, "full_name")
			row.pop("owner", None)
			rows.append(row)
	return {"rows": rows, "has_more": has_more, "start": max(0, cint(start))}


def has_permission(doc, ptype=None, user=None, **kwargs):
	user = user or frappe.session.user
	if user == "Guest":
		return False
	try:
		topic = doc if doc.doctype == "Discussion Topic" else frappe.get_doc("Discussion Topic", doc.topic)
		require_topic(topic, user)
	except (frappe.PermissionError, frappe.DoesNotExistError):
		return False
	if ptype in ("delete", "share", "export", "email"):
		return False
	if ptype in ("write", "create"):
		return doc.is_new() or doc.owner == user
	return visible(topic, user) and visible(doc, user)


def _visibility_condition(doctype, user):
	if is_community_admin(user):
		return "1=1"
	return (
		f"(`tab{doctype}`.lms_moderation_state='Approved' OR `tab{doctype}`.owner={frappe.db.escape(user)})"
	)


def query_conditions(user=None, doctype="Discussion Topic"):
	user = user or frappe.session.user
	if user == "Guest":
		return "1=0"
	# Evaluate each reference once with the authoritative cohort/annual-access guard.
	references = []
	for topic in frappe.get_all(
		"Discussion Topic",
		fields=["reference_doctype", "reference_docname"],
		group_by="reference_doctype, reference_docname",
	):
		try:
			require_topic(topic, user)
		except frappe.PermissionError:
			continue
		references.append(
			f"(`tabDiscussion Topic`.reference_doctype={frappe.db.escape(topic.reference_doctype)}"
			f" AND `tabDiscussion Topic`.reference_docname={frappe.db.escape(topic.reference_docname)})"
		)
	if not references:
		return "1=0"
	parents = f"({' OR '.join(references)}) AND {_visibility_condition('Discussion Topic', user)}"
	if doctype == "Discussion Topic":
		return parents
	return f"`tabDiscussion Reply`.topic IN (SELECT name FROM `tabDiscussion Topic` WHERE {parents}) AND {_visibility_condition('Discussion Reply', user)}"


def reply_query_conditions(user=None):
	return query_conditions(user, "Discussion Reply")


def _profile(row, doctype="Discussion Reply", profiles=None, reasons=None):
	if row.get("reply"):
		row.reply = sanitize_rich_text(row.reply)
	row.user = (
		profiles.get(row.owner)
		if profiles is not None
		else frappe.db.get_value("User", row.owner, ["full_name", "user_image"], as_dict=True)
	) or frappe._dict(full_name=_("Member"))
	if urlsplit(row.user.user_image or "").path.startswith("/private/"):
		row.user.user_image = None
	row.created_at = site_datetime(row.creation)
	if row.lms_moderation_state == "Rejected" and (row.owner == frappe.session.user or is_community_admin()):
		row.moderation_reason = (
			reasons.get(row.name)
			if reasons is not None
			else frappe.db.get_value(
				"LMS Discussion Decision",
				{"reference_doctype": doctype, "reference_name": row.name},
				"reason",
				order_by="creation desc, name desc",
			)
		)
	return row


def site_datetime(value):
	return (
		get_datetime(value)
		.replace(tzinfo=ZoneInfo(get_system_timezone()))
		.astimezone(ZoneInfo("America/Sao_Paulo"))
		.isoformat()
	)


def reply_query(topic):
	reply = frappe.qb.DocType("Discussion Reply")
	query = frappe.qb.from_(reply).where(reply.topic == topic.name)
	if topic.lms_root_reply:
		query = query.where(reply.name != topic.lms_root_reply)
	if not is_community_admin():
		query = query.where((reply.lms_moderation_state == "Approved") | (reply.owner == frappe.session.user))
	return reply, query


def reply_count(topic):
	reply, query = reply_query(topic)
	return query.select(fn.Count(reply.name).as_("total")).run(as_dict=True)[0].total


def topics(doctype, docname, single_thread=False, page=1, discussion=None):
	from lms.lms.utils import can_access_topic, hide_user_emails

	if not can_access_topic(doctype, docname):
		frappe.throw(_("You do not have access to this discussion."), frappe.PermissionError)
	filters = {"reference_doctype": doctype, "reference_docname": docname}
	if cint(single_thread):
		if doctype != "LMS Batch":
			frappe.throw(_("Unsupported discussion reference."))
		frappe.db.get_value("LMS Batch", docname, "name", for_update=True)
		name = frappe.db.exists("Discussion Topic", {**filters, "lms_single_thread": 1})
		if not name:
			doc = frappe.get_doc({"doctype": "Discussion Topic", **filters, "title": docname})
			# nosemgrep: lms-unjustified-ignore-permissions - authorized batch reader; batch lock creates one content-free container.
			doc.insert(ignore_permissions=True)
			frappe.db.set_value(
				"Discussion Topic", doc.name, {"lms_single_thread": 1, "lms_moderation_state": "Approved"}
			)
			name = doc.name
		return {"name": name}
	topic = frappe.qb.DocType("Discussion Topic")
	query = frappe.qb.from_(topic).where(
		(topic.reference_doctype == doctype) & (topic.reference_docname == docname)
	)
	admin = is_community_admin()
	if not admin:
		query = query.where((topic.lms_moderation_state == "Approved") | (topic.owner == frappe.session.user))
	total = query.select(fn.Count(topic.name).as_("total")).run(as_dict=True)[0].total
	size = 20
	page = max(1, min(cint(page), max(1, (total + size - 1) // size)))
	fields = [
		topic.name,
		topic.title,
		topic.owner,
		topic.creation,
		topic.modified,
		topic.lms_moderation_state,
		topic.lms_root_reply,
	]
	rows = (
		query.select(*fields)
		.orderby(topic.creation, order=Order.desc)
		.orderby(topic.name, order=Order.desc)
		.limit(size)
		.offset((page - 1) * size)
		.run(as_dict=True)
	)
	selected = next((row for row in rows if row.name == discussion), None)
	if discussion and selected is None:
		selected = next(
			iter(query.where(topic.name == discussion).select(*fields).limit(1).run(as_dict=True)), None
		)
	visible_rows = rows + ([selected] if selected is not None and selected not in rows else [])
	if visible_rows:
		names = [row.name for row in visible_rows]
		reply = frappe.qb.DocType("Discussion Reply")
		counts = (
			frappe.qb.from_(reply)
			.join(topic)
			.on(reply.topic == topic.name)
			.where(
				topic.name.isin(names)
				& (topic.lms_root_reply.isnull() | (reply.name != topic.lms_root_reply))
			)
		)
		if not admin:
			counts = counts.where(
				(reply.lms_moderation_state == "Approved") | (reply.owner == frappe.session.user)
			)
		counts = {
			row.topic: row.total
			for row in counts.select(reply.topic, fn.Count(reply.name).as_("total"))
			.groupby(reply.topic)
			.run(as_dict=True)
		}
		profiles = {
			row.name: row
			for row in frappe.get_all(
				"User",
				filters={"name": ["in", list({row.owner for row in visible_rows})]},
				fields=["name", "full_name", "user_image"],
			)
		}
		# Only latest reasons for the bounded, authorized page; no history transferred to Python.
		rejected = [row.name for row in visible_rows if row.lms_moderation_state == "Rejected"]
		reasons = (
			{
				row.reference_name: row.reason
				for row in frappe.db.sql(
					"""SELECT reference_name, reason FROM (
			SELECT reference_name, reason, ROW_NUMBER() OVER (PARTITION BY reference_name ORDER BY creation DESC, name DESC) AS position
			FROM `tabLMS Discussion Decision` WHERE reference_doctype=%s AND reference_name IN %s
		) latest WHERE position=1""",
					("Discussion Topic", tuple(rejected)),
					as_dict=True,
				)
			}
			if rejected
			else {}
		)
		for row in visible_rows:
			_profile(row, "Discussion Topic", profiles, reasons)
			row.user = frappe._dict(full_name=row.user.full_name, user_image=row.user.user_image)
			row.reply_count = counts.get(row.name, 0)
		hide_user_emails(visible_rows, "owner")
	return {
		"topics": rows,
		"total": total,
		"page": page,
		"page_size": size,
		"start": (page - 1) * size + 1 if total else 0,
		"end": (page - 1) * size + len(rows),
		"selected_topic": selected,
		"selected_unavailable": bool(discussion and selected is None),
	}


def replies(topic, page=0):
	from lms.lms.utils import hide_user_emails

	topic = get_topic(topic)
	total = reply_count(topic)
	page = max(0, min(cint(page), max(1, (total + 9) // 10)))
	# Page zero is three newest responses; expanded pages are ten, also newest first.
	size = 10 if page else 3
	offset = (page - 1) * 10 if page else 0
	reply, query = reply_query(topic)
	rows = (
		query.select(
			reply.name, reply.owner, reply.creation, reply.modified, reply.reply, reply.lms_moderation_state
		)
		.orderby(reply.creation, order=Order.desc)
		.orderby(reply.name, order=Order.desc)
		.limit(size)
		.offset(offset)
		.run(as_dict=True)
	)
	root = None
	if topic.lms_root_reply:
		root_doc = frappe.get_doc("Discussion Reply", topic.lms_root_reply)
		if visible(root_doc):
			root = _profile(
				frappe._dict(
					{
						key: root_doc.get(key)
						for key in ("name", "owner", "creation", "modified", "reply", "lms_moderation_state")
					}
				)
			)
	for row in rows:
		_profile(row)
	return {
		"replies": hide_user_emails(rows, "owner"),
		"root": hide_user_emails([root], "owner")[0] if root else None,
		"total": total,
		"page": page,
		"page_size": size,
		"start": offset + 1 if total else 0,
		"end": offset + len(rows),
	}
