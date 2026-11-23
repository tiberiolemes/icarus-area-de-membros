"""Local privacy workflow composed with Frappe's native requests and audit trail.

No policy is supplied by the application. A site manager must configure and approve
the installation's own information before public registration can use it.
"""

import hashlib
import json
import re
from contextlib import contextmanager
from contextvars import ContextVar
from uuid import UUID, uuid4

import frappe
from frappe import _
from frappe.rate_limiter import rate_limit
from frappe.utils import escape_html
from pymysql.constants import ER


class PrivacyImpactConflictError(frappe.ValidationError):
	"""A rejected asynchronous job; its native transaction must roll back."""


_registration = ContextVar("icarus_registration", default=None)
_invited_registration = ContextVar("icarus_invited_registration", default=None)
_deletion = ContextVar("icarus_deletion", default=None)
HELP_REVISION = "2026-11-21-quality07"
HELP_ARTICLES = {
	"aluno",
	"criador",
	"arquivo",
	"moderacao",
	"comunidade",
	"sessao",
	"arquivos",
	"privacidade",
	"recuperacao",
	"versao",
	"avaliacoes",
	"turmas",
	"relatorios",
	"importacao",
	"perfil",
	"tour",
}
REQUIRED = {
	"controller_name": "Responsible controller",
	"contact_channel": "Privacy contact channel",
	"purposes_and_bases": "Purposes and legal bases",
	"retention_policy": "Retention by data category",
	"service_providers": "Service providers and transfers",
	"privacy_notice": "Privacy notice",
}
AUTHORING = {
	"LMS Course": ("instructors", "Course Instructor", "instructor"),
	"LMS Batch": ("instructors", "Course Instructor", "instructor"),
	"LMS Program": ("authors", "LMS Content Author", "author"),
	"LMS Quiz": ("authors", "LMS Content Author", "author"),
	"LMS Assignment": ("authors", "LMS Content Author", "author"),
	"LMS Programming Exercise": ("authors", "LMS Content Author", "author"),
}

# No joins, credentials, grader comments, private course content or other members.
# Native user_data_fields uses these same owner filters for discovery/redaction;
# its exporter ignores export_fields, so SafePersonalDataDownload supplies them.
PROFILE_FIELDS = (
	"email",
	"first_name",
	"middle_name",
	"last_name",
	"full_name",
	"username",
	"birth_date",
	"user_image",
	"cover_image",
	"banner_image",
	"bio",
	"headline",
	"open_to",
	"linkedin",
	"github",
	"twitter",
	"gender",
	"location",
	"interest",
	"phone",
	"mobile_no",
	"language",
	"time_zone",
	"desk_theme",
	"email_signature",
	"country",
	"user_category",
	"medium",
	"profession",
	"preferred_location",
	"dream_companies",
	"attire",
	"collaboration",
	"role",
	"location_preference",
	"time",
	"company_type",
	"city",
	"college",
	"branch",
)
NATIVE_PROFILE_IDENTIFIERS = {
	"email",
	"first_name",
	"middle_name",
	"last_name",
	"full_name",
	"username",
	"birth_date",
}
PROFILE_CHILDREN = (
	(
		"Education Detail",
		("education",),
		(
			"institution_name",
			"location",
			"degree_type",
			"grade_type",
			"grade",
			"major",
			"start_date",
			"end_date",
		),
	),
	(
		"Work Experience",
		("work_experience", "internship"),
		("title", "company", "location", "from_date", "to_date", "description", "current"),
	),
	(
		"Certification",
		("certification",),
		("certification_name", "organization", "issue_date", "description", "expiration_date", "expire"),
	),
	("Skills", ("skill",), ("skill_name",)),
	("Preferred Function", ("preferred_functions",), ("function",)),
	("Preferred Industry", ("preferred_industries",), ("industry",)),
)
USER_DATA_FIELDS = [
	{
		"doctype": "User",
		"filter_by": "name",
		"export_fields": ["name", *PROFILE_FIELDS, "creation", "verify_terms"],
	},
	{
		"doctype": "LMS Enrollment",
		"filter_by": "member",
		"export_fields": ["name", "course", "creation", "progress"],
	},
	{
		"doctype": "LMS Course Progress",
		"filter_by": "member",
		"export_fields": ["name", "course", "lesson", "status", "creation"],
	},
	{
		"doctype": "LMS Video Watch Duration",
		"filter_by": "member",
		"export_fields": ["name", "lesson", "watch_time", "creation"],
	},
	{
		"doctype": "LMS Lesson Note",
		"filter_by": "member",
		"export_fields": ["name", "lesson", "note", "creation"],
	},
	{
		"doctype": "LMS Batch Enrollment",
		"filter_by": "member",
		"export_fields": ["name", "batch", "creation"],
	},
	{
		"doctype": "LMS Certificate",
		"filter_by": "member",
		"export_fields": ["name", "course", "batch_name", "issue_date", "expiry_date"],
	},
	{
		"doctype": "LMS Quiz Submission",
		"filter_by": "member",
		"export_fields": ["name", "quiz", "score", "score_out_of", "percentage", "creation"],
	},
	{
		"doctype": "LMS Assignment Submission",
		"filter_by": "member",
		"export_fields": ["name", "assignment", "status", "answer", "creation"],
	},
	{
		"doctype": "LMS Programming Exercise Submission",
		"filter_by": "member",
		"export_fields": ["name", "exercise", "status", "code", "creation"],
	},
	{
		"doctype": "LMS Community Grant",
		"filter_by": "member",
		"export_fields": ["name", "community", "starts_on", "ends_on", "revoked_on"],
	},
	{
		"doctype": "LMS Help Feedback",
		"filter_by": "member",
		"export_fields": ["name", "article", "help_revision", "useful", "creation"],
	},
	{
		"doctype": "LMS Tour Progress",
		"filter_by": "member",
		"export_fields": [
			"name",
			"page",
			"revision",
			"status",
			"step",
			"started_count",
			"completed_count",
			"skipped_count",
			"helpful",
		],
	},
]


# nosemgrep: frappe-semgrep-rules.rules.security.guest-whitelisted-method
@frappe.whitelist(allow_guest=True, methods=["POST"])
@rate_limit(limit=10, seconds=60)
def rate_help(article: str, useful: int, request_key: str):
	try:
		key = str(UUID(request_key, version=4))
	except (ValueError, TypeError, AttributeError):
		frappe.throw(_("Reload the help page before sending your rating."))
	if (
		key != request_key
		or article not in HELP_ARTICLES
		or type(useful) not in (int, bool)
		or useful not in (0, 1)
	):
		frappe.throw(_("Choose an available article and a valid rating."))
	if not frappe.db.exists("LMS Help Feedback", key):
		# Bounded guest feedback: no free text or client-chosen identity, private DocPerm.
		try:
			frappe.get_doc(
				{
					"doctype": "LMS Help Feedback",
					"request_key": key,
					"article": article,
					"help_revision": HELP_REVISION,
					"useful": int(useful),
					"member": frappe.session.user if frappe.session.user != "Guest" else None,
				}
			).insert(ignore_permissions=True)
		except frappe.DuplicateEntryError:
			pass
	return {"recorded": True}


def effective_true(value):
	return value is True or type(value) is int and value == 1 or type(value) is str and value == "1"


def policy_state():
	doc = frappe.get_single("LMS Privacy Settings")
	terms = frappe.db.get_single_value("LMS Settings", "custom_signup_content") or ""
	values = {field: (doc.get(field) or "").strip() for field in REQUIRED}
	values["terms"] = terms.strip()
	missing = [_(label) for field, label in REQUIRED.items() if not values[field]]
	if not values["terms"]:
		missing.append(_("Terms in LMS Settings / Custom Signup Content"))
	revision = hashlib.sha256(json.dumps(values, sort_keys=True, ensure_ascii=False).encode()).hexdigest()
	ready = not missing and effective_true(doc.publication_approved) and doc.approved_revision == revision
	return {"ready": bool(ready), "missing": missing, "revision": revision, "values": values}


def signup_template():
	return "lms/templates/signup-form.html"


def signup_context():
	state = policy_state()
	if not state["ready"]:
		return {"ready": False, "terms_html": "", "revision": ""}
	from frappe.utils.html_utils import sanitize_html

	return {
		"ready": True,
		"revision": state["revision"],
		"terms_html": sanitize_html(state["values"]["terms"], always_sanitize=True),
	}


def require_public_registration(verify_terms, accepted_revision=None):
	state = policy_state()
	if not state["ready"]:
		frappe.throw(
			_(
				"Public registration is awaiting the site's terms and privacy information. Existing accounts can still log in."
			)
		)
	if not effective_true(verify_terms):
		frappe.throw(_("Please accept the terms to continue."))
	if accepted_revision is not None and accepted_revision != state["revision"]:
		frappe.throw(_("The terms changed. Reopen the registration page, review them and accept again."))
	return state["revision"]


@contextmanager
def public_registration(revision):
	token = _registration.set(revision)
	try:
		yield
	finally:
		_registration.reset(token)


def validate_public_user(doc, method=None):
	# Covers the native signup sibling and generic REST insert as well as our UI.
	# Admin-created users/invitations and login of an existing user remain native.
	if frappe.session.user == "Guest":
		if (email := _invited_registration.get()) and doc.get("email") == email:
			return
		revision = require_public_registration(doc.get("verify_terms"))
		if _registration.get() != revision:
			frappe.throw(
				_("Use the public registration form to review and accept the current terms."),
				frappe.PermissionError,
			)


@frappe.whitelist(allow_guest=True, methods=["GET"])
@rate_limit(limit=20, seconds=60)
def accept_native_invitation(key: str):
	from frappe.core.api.user_invitation import accept_invitation
	from frappe.utils.file_lock import LockTimeoutError
	from frappe.utils.synchronization import filelock

	request = frappe.local.request
	lock = filelock("lms-accept-invitation", timeout=10)
	try:
		lock.__enter__()
	except (LockTimeoutError, OSError):
		frappe.clear_messages()
		frappe.local.response["type"] = "redirect"
		frappe.local.response["location"] = "/login?invitation-busy=1#forgot"
		return

	released = False

	def release():
		nonlocal released
		if not released:
			released = True
			lock.__exit__(None, None, None)

	# The native GET commits itself; failures keep the lock through its HTTP rollback.
	token = _invited_registration.set(None)
	try:
		frappe.db.after_commit.add(release)
		frappe.db.after_rollback.add(release)
		hashed_key = frappe.utils.sha256_hash(key)
		name = frappe.db.get_value("User Invitation", {"key": hashed_key}, "name")
		proof = (
			frappe.db.get_value(
				"User Invitation", name, ["email", "key", "status"], for_update=True, as_dict=True
			)
			if name
			else None
		)
		email = proof.email if proof and proof.key == hashed_key and proof.status == "Pending" else None
		# Only this current, server-verified recipient can be created by the native token flow.
		_invited_registration.set(email)
		return accept_invitation(key)
	except frappe.QueryDeadlockError as error:
		from pymysql.constants import ER

		cause = error.__cause__
		if (
			not isinstance(cause, frappe.db.OperationalError)
			or not cause.args
			or cause.args[0] != ER.CHECKREAD
		):
			raise
		# This exclusive invitation request owns the same rejection boundary as the native API.
		_invited_registration.set(None)
		frappe.db.rollback()
		frappe.clear_messages()
		frappe.local.response["type"] = "redirect"
		frappe.local.response["location"] = "/login?invitation-expired=1#forgot"
	finally:
		_invited_registration.reset(token)
		request.after_response.add(release)


def record_terms(doc, method=None):
	if revision := _registration.get():
		doc.add_comment("Info", text=_("Terms accepted. Policy revision: {0}").format(revision))


# nosemgrep: frappe-semgrep-rules.rules.security.guest-whitelisted-method
@frappe.whitelist(allow_guest=True, methods=["POST"])
@rate_limit(limit=10, seconds=60)
def native_sign_up(
	email: str,
	full_name: str,
	redirect_to: str = "",
	verify_terms: bool = False,
	user_category: str = "",
	policy_revision: str = "",
):
	from lms.lms.user import sign_up

	return sign_up(email, full_name, verify_terms, user_category, policy_revision)


def safe_export(user):
	data = {
		spec["doctype"]: frappe.get_all(
			spec["doctype"], filters={spec["filter_by"]: user}, fields=spec["export_fields"]
		)
		for spec in USER_DATA_FIELDS
	}
	for doctype, parentfields, fields in PROFILE_CHILDREN:
		data[doctype] = frappe.get_all(
			doctype,
			filters={"parent": user, "parenttype": "User", "parentfield": ["in", parentfields]},
			fields=["name", "parentfield", "idx", *fields],
		)
	return json.dumps(
		data,
		default=str,
		ensure_ascii=False,
		indent=2,
	)


class SafePersonalDataDownload:
	def after_insert(self):
		# Preserve native private File, owner binding, signed link, queue and email.
		frappe.enqueue_doc(
			self.doctype,
			self.name,
			"generate_file_and_send_mail",
			queue="short",
			personal_data=safe_export(self.user),
			now=frappe.in_test,
		)


def require_manager():
	frappe.only_for("System Manager")


def dependency_preview(user):
	"""Conservative blockers; transfers happen through existing document forms."""
	dependencies = []
	for doctype in AUTHORING:
		for row in frappe.get_all(
			doctype, filters={"owner": user}, fields=["name", "modified"], order_by="name"
		):
			if not has_active_successor(doctype, row.name, user):
				dependencies.append(
					{
						"doctype": doctype,
						"name": row.name,
						"modified": str(row.modified),
						"relation": "owner",
						"blocking": True,
					}
				)
	for doctype, field in (("Course Instructor", "instructor"), ("LMS Content Author", "author")):
		for row in frappe.get_all(
			doctype,
			filters={field: user},
			fields=["name", "parent", "parenttype", "modified"],
			order_by="name",
		):
			dependencies.append(
				{
					"doctype": row.parenttype,
					"name": row.parent,
					"modified": str(row.modified),
					"relation": field,
					"blocking": True,
				}
			)
	for doctype, field in (
		("Course Evaluator", "evaluator"),
		("LMS Zoom Settings", "member"),
		("LMS Google Meet Settings", "member"),
	):
		for row in frappe.get_all(
			doctype, filters={field: user}, fields=["name", "modified"], order_by="name"
		):
			dependencies.append(
				{
					"doctype": doctype,
					"name": row.name,
					"modified": str(row.modified),
					"relation": "reassign_or_reconnect",
					"blocking": True,
				}
			)
	# Files are retained until separately reviewed; the confirmation requires a
	# recorded decision and never treats User redaction as byte destruction.
	for row in frappe.get_all(
		"File", filters={"owner": user, "is_folder": 0}, fields=["name", "modified"], order_by="name"
	):
		dependencies.append(
			{
				"doctype": "File",
				"name": row.name,
				"modified": str(row.modified),
				"relation": "review_file_retention",
				"blocking": False,
			}
		)
	return dependencies


def has_active_successor(doctype, name, departing):
	collection, table, field = AUTHORING[doctype]
	for row in frappe.get_all(
		table, filters={"parent": name, "parenttype": doctype, field: ["!=", departing]}, fields=[field]
	):
		if row.get(field) and frappe.db.get_value("User", row[field], "enabled"):
			from lms.lms.utils import has_course_instructor_role, has_moderator_role

			if has_course_instructor_role(row[field]) or has_moderator_role(row[field]):
				return True
	return False


@frappe.whitelist(methods=["POST"])
@rate_limit(limit=10, seconds=60)
def transfer_authoring(doctype: str, name: str, departing: str, successor: str, confirmation: str):
	from lms.lms.utils import has_course_instructor_role, has_moderator_role

	require_manager()
	if doctype not in AUTHORING or confirmation != name or successor in (departing, "Guest", "Administrator"):
		frappe.throw(
			_("Select the document, confirm its identifier and choose a different active instructor.")
		)
	if not frappe.db.get_value("User", successor, "enabled") or not (
		has_course_instructor_role(successor) or has_moderator_role(successor)
	):
		frappe.throw(_("The successor must be an active course creator or moderator."))
	doc = frappe.get_doc(doctype, name)
	doc.check_permission("write")
	field, table, link = AUTHORING[doctype]
	rows = doc.get(field) or []
	if not any(row.get(link) == departing for row in rows) and any(
		row.get(link) == successor for row in rows
	):
		return {"transferred": True}
	if not any(row.get(link) == departing for row in rows) and doc.owner != departing:
		frappe.throw(_("The departing instructor is not responsible for this document."))
	# Preserve provenance/owner and collaborators; change only live authority.
	kept = [row for row in rows if row.get(link) != departing]
	doc.set(field, kept)
	if not any(row.get(link) == successor for row in kept):
		doc.append(field, {link: successor})
	doc.save()
	doc.add_comment(
		"Info",
		text=_("Authoring responsibility transferred from {0} to {1}; learning history preserved.").format(
			escape_html(departing), escape_html(successor)
		),
	)
	return {"transferred": True}


def deletion_preview(request):
	require_manager()
	doc = frappe.get_doc("Personal Data Deletion Request", request)
	doc.check_permission("read")
	if doc.email in ("Administrator", "Guest"):
		frappe.throw(_("Standard accounts cannot be removed."))
	dependencies = dependency_preview(doc.email)
	state = policy_state()
	data = {
		"request": doc.name,
		"status": doc.status,
		"modified": str(doc.modified),
		"dependencies": dependencies,
		"policy_revision": state["revision"],
	}
	data["user_revision"] = str(frappe.db.get_value("User", doc.email, "modified"))
	data["profile_fields"] = list(PROFILE_FIELDS)
	data["profile_records"] = {}
	for doctype, parentfields, fields in PROFILE_CHILDREN:
		rows = frappe.get_all(
			doctype,
			filters={"parent": doc.email, "parenttype": "User", "parentfield": ["in", parentfields]},
			fields=["name", "parentfield", "idx", "modified", *fields],
			order_by="name",
		)
		data["profile_records"][doctype] = [
			{
				**{key: row.get(key) for key in ("name", "parentfield", "idx", "modified")},
				"revision": hashlib.sha256(json.dumps(row, sort_keys=True, default=str).encode()).hexdigest(),
			}
			for row in rows
		]
	data["retained_records"] = {
		spec["doctype"]: frappe.get_all(
			spec["doctype"],
			filters={spec["filter_by"]: doc.email},
			fields=["name", "modified"],
			order_by="name",
		)
		for spec in USER_DATA_FIELDS
		if spec["doctype"] != "User"
	}
	data["digest"] = hashlib.sha256(json.dumps(data, sort_keys=True, default=str).encode()).hexdigest()
	data["ready"] = (
		state["ready"]
		and doc.status == "Pending Approval"
		and not any(row["blocking"] for row in dependencies)
	)
	data["authoring_targets"] = list(
		{
			(row["doctype"], row["name"]): {"doctype": row["doctype"], "name": row["name"]}
			for row in dependencies
			if row["doctype"] in AUTHORING
		}.values()
	)
	return data


@frappe.whitelist(methods=["POST"])
@rate_limit(limit=10, seconds=60)
def get_deletion_preview(request: str):
	return deletion_preview(request)


@frappe.whitelist(methods=["POST"])
@rate_limit(limit=5, seconds=300)
def confirm_data_deletion(
	request: str, confirmation: str, digest: str, reviewed_retention: bool = False, retention_note: str = ""
):
	preview = deletion_preview(request)
	if (
		not effective_true(reviewed_retention)
		or not isinstance(retention_note, str)
		or not 20 <= len(retention_note.strip()) <= 2000
	):
		frappe.throw(
			_(
				"Record the retention and free-text review before confirming. Do not include credentials or other people's data."
			)
		)
	if confirmation != request or digest != preview["digest"] or not preview["ready"]:
		frappe.throw(_("Review the current impact, resolve dependencies and confirm the verified request."))
	# A document job keeps native queue/retry semantics. It rechecks the entire
	# preview at execution, before disabling the user or sending a completion mail.
	job_id = "lms-privacy-" + uuid4().hex
	frappe.enqueue_doc(
		"Personal Data Deletion Request",
		request,
		"icarus_anonymize",
		queue="long",
		digest=digest,
		actor=frappe.session.user,
		retention_note=retention_note.strip(),
		enqueue_after_commit=True,
		job_id=job_id,
		on_failure=privacy_job_failure,
	)
	return {"queued": True, "job_id": job_id}


def privacy_job_failure(job, connection, error_type, error, traceback):
	from frappe.utils.background_jobs import truncate_failed_registry

	job.meta["lms_privacy_state"] = "conflict" if isinstance(error, PrivacyImpactConflictError) else "failed"
	job.meta.pop("lms_privacy_conflict_code", None)
	if isinstance(error, PrivacyImpactConflictError) and getattr(error, "native_code", None) in {
		ER.CHECKREAD,
		ER.LOCK_DEADLOCK,
	}:
		job.meta["lms_privacy_conflict_code"] = error.native_code
	job.save_meta()
	truncate_failed_registry(job, connection, error_type, error, traceback)


@frappe.whitelist(methods=["POST"])
@rate_limit(limit=30, seconds=60)
def get_anonymization_status(request: str, job_id: str):
	from frappe.utils.background_jobs import get_job

	require_manager()
	doc = frappe.get_doc("Personal Data Deletion Request", request)
	doc.check_permission("read")
	if not isinstance(job_id, str) or not re.fullmatch(r"lms-privacy-[0-9a-f]{32}", job_id):
		frappe.throw(_("You cannot access this anonymization job."), frappe.PermissionError)
	job = get_job(job_id)
	arguments = job.kwargs if job else {}
	target = arguments.get("kwargs", {})
	if (
		not job
		or arguments.get("site") != frappe.local.site
		or arguments.get("method") != "frappe.utils.background_jobs.run_doc_method"
		or target.get("doctype") != doc.doctype
		or target.get("name") != doc.name
		or target.get("doc_method") != "icarus_anonymize"
		or target.get("actor") != arguments.get("user")
	):
		frappe.throw(_("You cannot access this anonymization job."), frappe.PermissionError)
	# A losing job never turns the winner's completed request into a failure.
	if doc.status == "Deleted":
		return {"status": "completed", "message": _("Profile anonymization completed")}
	status = job.get_status(refresh=True)
	if status and status.value in {"failed", "stopped", "canceled", "finished"}:
		if job.meta.get("lms_privacy_state") == "conflict":
			return {
				"status": "conflict",
				"message": _(
					"The operation did not complete because of a conflict. Check the current status, review and confirm again if needed."
				),
			}
		return {
			"status": "failed",
			"message": _("Anonymization did not complete. Review the impact before confirming again."),
		}
	return {
		"status": "pending",
		"message": _("Anonymization is pending. Check again before taking another action."),
	}


def redacted_profile_reference(doctype, field):
	if (doctype, field) not in {("User Skill", "skill"), ("Industry", "industry")}:
		raise ValueError("Unsupported profile redaction reference")
	marker = "[REDACTED]"
	existing = frappe.db.get_value(doctype, marker, ["name", field], as_dict=True)
	if not existing:
		frappe.get_doc({"doctype": doctype, field: marker}).insert(
			ignore_permissions=True, ignore_if_duplicate=True
		)
	# A current locking read also validates a concurrently inserted reference.
	existing = frappe.db.get_value(doctype, marker, ["name", field], as_dict=True, for_update=True)
	if not existing or existing.name != marker or existing[field] != marker:
		frappe.throw(
			_("The technical profile redaction reference is inconsistent. Contact the site administrator.")
		)
	return marker


class SafePersonalDataDeletion:
	def redact_full_match_data(self, ref, email):
		if not ref.get("profile_parentfields"):
			return super().redact_full_match_data(ref, email)
		# Only this User's declared CV children; preserve row IDs and other parents.
		docs = frappe.get_all(
			ref["doctype"],
			filters={
				"parent": email,
				"parenttype": "User",
				"parentfield": ["in", ref["profile_parentfields"]],
			},
			fields=["name", "parent"],
		)
		if not docs:
			return
		self.anonymize_fields_dict = self.generate_anonymization_dict(ref)
		for doc in docs:
			super().redact_doc(doc, ref)

	def generate_anonymization_dict(self, ref):
		values = super().generate_anonymization_dict(ref)
		if ref["doctype"] == "User":
			# Native placeholders are invalid for optional Link/Select and image references.
			for field in PROFILE_FIELDS:
				if field not in NATIVE_PROFILE_IDENTIFIERS:
					values[field] = None
		elif ref.get("profile_parentfields"):
			meta = frappe.get_meta(ref["doctype"])
			for field in ref["redact_fields"]:
				reference = {
					("Skills", "skill_name"): ("User Skill", "skill"),
					("Preferred Industry", "industry"): ("Industry", "industry"),
				}.get((ref["doctype"], field))
				if reference:
					values[field] = redacted_profile_reference(*reference)
				elif meta.get_field(field).fieldtype in {"Link", "Select", "Small Text"}:
					values[field] = None
				elif meta.get_field(field).fieldtype == "Check":
					values[field] = 0
		return values

	def generate_url_for_confirmation(self):
		from frappe.utils.verified_command import get_signed_params

		params = {"email": self.email, "name": self.name, "host_name": frappe.local.site}
		api = frappe.utils.get_url(
			"/api/method/frappe.website.doctype.personal_data_deletion_request.personal_data_deletion_request.confirm_deletion"
		)
		return f"{api}?{get_signed_params(params)}"

	def send_verification_mail(self):
		frappe.sendmail(
			recipients=self.email,
			subject=_("Confirm your personal data request"),
			template="privacy_request_confirmation",
			args={"link": self.generate_url_for_confirmation()},
		)

	@frappe.whitelist(methods=["POST"])
	def trigger_data_deletion(self):
		frappe.throw(
			_("Use the privacy impact preview and explicit confirmation before deleting personal data.")
		)

	def _anonymize_data(self, *args, **kwargs):
		if _deletion.get() != self.name:
			frappe.throw(
				_("Personal data deletion requires a verified impact preview."), frappe.PermissionError
			)
		return super()._anonymize_data(*args, **kwargs)

	def icarus_anonymize(self, digest, actor, retention_note):
		# Queue runs with native actor context; do not accept caller-provided roles.
		if actor != frappe.session.user:
			frappe.throw(_("The requesting administrator must execute this job."), frappe.PermissionError)
		require_manager()
		try:
			frappe.db.get_value(self.doctype, self.name, "name", for_update=True)
			self.reload()
			frappe.db.get_value("User", self.email, "name", for_update=True)
			preview = deletion_preview(self.name)
			if not preview["ready"] or preview["digest"] != digest:
				frappe.throw(_("The privacy impact changed. Review and confirm again."))
			# Core strict partial redaction rewrites global free text. Use only the
			# native User redaction here: preserve learning records and stable links.
			self.full_match_privacy_docs = [
				{
					"doctype": "User",
					"filter_by": "name",
					"redact_fields": list(PROFILE_FIELDS),
				}
			] + [
				{
					"doctype": doctype,
					"filter_by": "parent",
					"profile_parentfields": parentfields,
					"redact_fields": list(fields),
				}
				for doctype, parentfields, fields in PROFILE_CHILDREN
			]
			self.partial_privacy_docs = []
			token = _deletion.set(self.name)
			try:
				self.disable_user()
				super()._anonymize_data()
				self.add_comment(
					"Info",
					text=_("Personal data anonymization completed after administrative impact review.")
					+ " "
					+ escape_html(retention_note),
				)
				self.notify_user_after_deletion()
			finally:
				_deletion.reset(token)
		except frappe.QueryDeadlockError as error:
			cause = error.__cause__
			if (
				isinstance(cause, frappe.db.OperationalError)
				and cause.args
				and cause.args[0] in {ER.CHECKREAD, ER.LOCK_DEADLOCK}
			):
				# End this rejected job for native rollback; do not reread the invalid transaction.
				conflict = PrivacyImpactConflictError(
					_(
						"The operation did not complete because of a conflict. Check the current status, review and confirm again if needed."
					)
				)
				conflict.native_code = cause.args[0]
				raise conflict from None
			raise

	def notify_user_after_deletion(self):
		frappe.sendmail(
			recipients=self.email,
			subject=_("Profile anonymization completed"),
			template="privacy_anonymization_completed",
			args={},
		)


class PreserveLearningUser:
	def on_trash(self):
		if dependency_preview(self.name) or has_learning_history(self.name):
			frappe.throw(
				_("Use a verified Personal Data Deletion Request. Learning history must be preserved.")
			)
		return super().on_trash()


def has_learning_history(user):
	for doctype in (
		"LMS Enrollment",
		"LMS Batch Enrollment",
		"LMS Course Progress",
		"LMS Video Watch Duration",
		"LMS Lesson Note",
		"LMS Certificate",
		"LMS Quiz Submission",
		"LMS Assignment Submission",
		"LMS Programming Exercise Submission",
		"LMS Community Grant",
		"LMS Tour Progress",
		"LMS Help Feedback",
	):
		if frappe.db.exists(doctype, {"member": user}):
			return True
	return False


def public_context(context):
	from frappe.utils.html_utils import sanitize_html

	state = policy_state()
	context.no_cache = 1
	context.no_index = True
	context.metatags = {"robots": "noindex, nofollow"} if not state["ready"] else {}
	context.policy_ready = state["ready"]
	context.policy_revision = state["revision"] if state["ready"] else ""
	context.policy = state["values"] if state["ready"] else {}
	if state["ready"]:
		for field in ("terms", "privacy_notice"):
			context.policy[field] = sanitize_html(context.policy[field], always_sanitize=True)
	context.missing_policy_fields = state["missing"]
	return context
