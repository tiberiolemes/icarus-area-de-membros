"""Reversible native outline archival and audience-specific curriculum."""

import json
from contextlib import contextmanager
from contextvars import ContextVar

import frappe
from frappe import _
from frappe.query_builder import Case
from frappe.utils import cint, escape_html, get_datetime, now_datetime
from pypika import functions as fn
from pypika.terms import Function, LiteralValue, Term

_transition = ContextVar("lms_child_archive_transition", default=None)
_grading_progress = ContextVar("lms_grading_progress", default=None)
CHILDREN = {"Course Chapter", "Course Lesson"}


def archive_allows_member(is_archived, archived_on, enrolled_on, *, now=None) -> bool:
	if not is_archived:
		return True
	if not archived_on or not enrolled_on:
		return False
	try:
		cutoff, enrolled = get_datetime(archived_on), get_datetime(enrolled_on)
		return enrolled < cutoff <= (now or now_datetime())
	except (ValueError, TypeError, OverflowError):
		return False


def archive_condition(row, enrolled_on=None):
	condition = row.is_archived == 0
	if enrolled_on is not None:
		created = (
			enrolled_on
			if isinstance(enrolled_on, Term)
			else LiteralValue(frappe.db.escape(str(get_datetime(enrolled_on))))
		)
		condition |= (
			(row.is_archived == 1)
			& row.archived_on.isnotnull()
			& (row.archived_on <= LiteralValue(frappe.db.escape(str(now_datetime()))))
			& (row.archived_on > created)
		)
	return condition


def chapter_visibility_condition(chapter, user):
	enrollment = frappe.qb.DocType("LMS Enrollment").as_("archive_enrollment")
	created = (
		frappe.qb.from_(enrollment)
		.select(enrollment.creation)
		.where(
			(enrollment.member == LiteralValue(frappe.db.escape(user)))
			& (enrollment.course == chapter.course)
		)
		.limit(1)
	)
	return archive_condition(chapter, LiteralValue(created.get_sql(subquery=True)))


def lesson_visibility_condition(lesson, chapter, user):
	enrollment = frappe.qb.DocType("LMS Enrollment").as_("archive_enrollment")
	created = (
		frappe.qb.from_(enrollment)
		.select(enrollment.creation)
		.where(
			(enrollment.member == LiteralValue(frappe.db.escape(user)))
			& (enrollment.course == chapter.course)
		)
		.limit(1)
	)
	created = LiteralValue(created.get_sql(subquery=True))
	return archive_condition(lesson, created) & archive_condition(chapter, created)


def enrollment_creation(course, member=None):
	member = member or frappe.session.user
	if not member or member == "Guest":
		return None
	return frappe.db.get_value("LMS Enrollment", {"course": course, "member": member}, "creation")


def chapter_is_eligible(chapter, *, user=None, as_member=False):
	from lms.lms.permissions import can_author_course

	row = frappe.db.get_value(
		"Course Chapter", chapter, ["course", "is_archived", "archived_on"], as_dict=True
	)
	if not row:
		return False
	if not as_member and can_author_course(row.course, user=user):
		return True
	return archive_allows_member(row.is_archived, row.archived_on, enrollment_creation(row.course, user))


def lesson_is_eligible(lesson, *, user=None, as_member=False):
	from lms.lms.permissions import can_author_course

	row = frappe.db.get_value(
		"Course Lesson", lesson, ["chapter", "is_archived", "archived_on"], as_dict=True
	)
	if not row or not row.chapter:
		return False
	chapter = frappe.db.get_value(
		"Course Chapter", row.chapter, ["course", "is_archived", "archived_on"], as_dict=True
	)
	if not chapter:
		return False
	if not as_member and can_author_course(chapter.course, user=user):
		return True
	created = enrollment_creation(chapter.course, user)
	return (
		archive_allows_member(row.is_archived, row.archived_on, created)
		and archive_allows_member(chapter.is_archived, chapter.archived_on, created)
		and bool(curriculum_rows(chapter.course, user, lesson_name=lesson))
	)


def curriculum_rows(course, member=None, *, include_archived=False, lesson_name=None, for_update=False):
	"""Identity/order only; preserved references are filtered, never renumbered."""
	if not isinstance(course, str) or not course:
		return []
	cr, cc = frappe.qb.DocType("Chapter Reference"), frappe.qb.DocType("Course Chapter")
	lr, lesson = frappe.qb.DocType("Lesson Reference"), frappe.qb.DocType("Course Lesson")
	owner = frappe.qb.DocType("Course Chapter").as_("owning_chapter")
	query = (
		frappe.qb.from_(cr)
		.join(cc)
		.on(cc.name == cr.chapter)
		.join(lr)
		.on(lr.parent == cc.name)
		.join(lesson)
		.on(lesson.name == lr.lesson)
		.join(owner)
		.on((owner.name == lesson.chapter) & (owner.course == cc.course))
		.select(lesson.name, cc.name.as_("chapter_name"), cr.idx.as_("chapter_idx"), lr.idx.as_("lesson_idx"))
		.where(
			(cr.parent == course)
			& (cc.course == course)
			& (cr.parenttype == "LMS Course")
			& (cr.parentfield == "chapters")
			& (lr.parenttype == "Course Chapter")
			& (lr.parentfield == "lessons")
		)
		.orderby(cr.idx)
		.orderby(lr.idx)
	)
	if not include_archived:
		created = enrollment_creation(course, member)
		query = query.where(
			archive_condition(cc, created)
			& archive_condition(owner, created)
			& archive_condition(lesson, created)
		)
	if lesson_name:
		query = query.where(lesson.name == lesson_name).limit(1)
	if for_update:
		query = query.for_update()
	return query.run(as_dict=True)


def curriculum_progress_query(courses, members=None):
	"""Eligible counts per enrollment, usable before dashboard filtering/pagination."""
	e = frappe.qb.DocType("LMS Enrollment")
	cr, cc = frappe.qb.DocType("Chapter Reference"), frappe.qb.DocType("Course Chapter")
	lr, lesson = frappe.qb.DocType("Lesson Reference"), frappe.qb.DocType("Course Lesson")
	owner = frappe.qb.DocType("Course Chapter").as_("curriculum_owner")
	p = frappe.qb.DocType("LMS Course Progress")
	valid = (
		lesson.name.isnotnull()
		& owner.name.isnotnull()
		& archive_condition(cc, e.creation)
		& archive_condition(owner, e.creation)
		& archive_condition(lesson, e.creation)
	)
	total = fn.Count(Case().when(valid, lesson.name)).distinct()
	done = fn.Count(Case().when(valid & p.name.isnotnull(), lesson.name)).distinct()
	query = (
		frappe.qb.from_(e)
		.left_join(cr)
		.on((cr.parent == e.course) & (cr.parenttype == "LMS Course") & (cr.parentfield == "chapters"))
		.left_join(cc)
		.on((cc.name == cr.chapter) & (cc.course == e.course))
		.left_join(lr)
		.on((lr.parent == cc.name) & (lr.parenttype == "Course Chapter") & (lr.parentfield == "lessons"))
		.left_join(lesson)
		.on(lesson.name == lr.lesson)
		.left_join(owner)
		.on((owner.name == lesson.chapter) & (owner.course == e.course))
		.left_join(p)
		.on(
			(p.member == e.member)
			& (p.course == e.course)
			& (p.lesson == lesson.name)
			& (p.status == "Complete")
		)
		.select(
			e.name.as_("enrollment"),
			e.member,
			e.course,
			total.as_("total_lessons"),
			done.as_("lessons_completed"),
			Case().when(total > 0, done * 100.0 / fn.NullIf(total, 0)).else_(0).as_("progress"),
			fn.Max(Case().when(valid & p.name.isnotnull(), p.creation)).as_("last_completed_at"),
		)
		.groupby(e.name, e.member, e.course)
	)
	if courses is not None:
		query = query.where(e.course.isin(courses or [""]))
	if members is not None:
		query = query.where(e.member.isin(members or [""]))
	return query


def completed_enrollments_query():
	progress = curriculum_progress_query(None).as_("eligible_completion")
	return (
		frappe.qb.from_(progress)
		.select(progress.enrollment)
		.where((progress.total_lessons > 0) & (progress.progress >= 100))
	)


def completed_enrollment_count():
	completed = completed_enrollments_query().as_("completed_enrollments")
	return frappe.qb.from_(completed).select(fn.Count("*")).run()[0][0]


def program_progress(programs, member=None):
	"""Native program average, projected from eligible course progress, not cached100."""
	member = member or frappe.session.user
	pc = frappe.qb.DocType("LMS Program Course")
	progress = curriculum_progress_query(None, [member]).as_("program_course_progress")
	rows = (
		frappe.qb.from_(pc)
		.left_join(progress)
		.on(progress.course == pc.course)
		.select(
			pc.parent,
			Function("CEIL", fn.Sum(fn.Coalesce(progress.progress, 0)) / fn.Count(pc.name)).as_("progress"),
		)
		.where(pc.parent.isin(programs or [""]))
		.groupby(pc.parent)
		.run(as_dict=True)
	)
	return {row.parent: row.progress for row in rows}


def _course_for(doc):
	if doc.doctype == "Course Chapter":
		return doc.course
	return frappe.db.get_value("Course Chapter", doc.chapter, "course")


def effective_archived(doc, *, for_update=False):
	if doc.get("is_archived"):
		return True
	if doc.doctype == "Course Lesson" and frappe.db.get_value(
		"Course Chapter", doc.chapter, "is_archived", for_update=for_update
	):
		return True
	course = _course_for(doc)
	return not course or bool(frappe.db.get_value("LMS Course", course, "is_archived", for_update=for_update))


def transition_authorized(doc):
	return _transition.get() == (doc.doctype, doc.name, frappe.session.user)


def require_child_purge(doc):
	from lms.lms.course_lifecycle import require_course_purge_context

	require_course_purge_context(_course_for(doc))


def validate_child_rename(doc, old, new, merge=False):
	# Rename/merge is a native write path that does not run validate().
	if merge:
		frappe.throw(_("Content cannot be merged."), frappe.PermissionError)
	if effective_archived(doc, for_update=True):
		frappe.throw(_("Restore this content and its parents before editing it."), frappe.PermissionError)


def validate_child(doc):
	previous = None if doc.is_new() else doc.get_doc_before_save()
	if transition_authorized(doc):
		return
	if cint(doc.get("is_archived")) != cint(previous.get("is_archived") if previous else 0) or (
		(doc.get("archived_on") or None) != (previous.get("archived_on") or None if previous else None)
	):
		frappe.throw(_("Use the archive or restore action."), frappe.PermissionError)
	if doc.is_new() and not _course_for(doc):
		return  # Native mandatory/link validation owns an incomplete new document.
	if effective_archived(doc, for_update=True) or (
		previous and effective_archived(previous, for_update=True)
	):
		frappe.throw(_("Restore this content and its parents before editing it."), frappe.PermissionError)
	parent_field = "course" if doc.doctype == "Course Chapter" else "chapter"
	if previous and doc.get(parent_field) != previous.get(parent_field):
		frappe.throw(_("Use the outline move action."), frappe.PermissionError)
	if doc.doctype == "Course Lesson" and doc.course != _course_for(doc):
		frappe.throw(_("The lesson must belong to its chapter's course."), frappe.PermissionError)


def _reference_course(doc):
	if doc.doctype == "Chapter Reference":
		return doc.parent
	return frappe.db.get_value("Course Chapter", doc.parent, "course")


def validate_reference(doc, method=None, *, parent_checked=False):
	parenttype, field, target = (
		("LMS Course", "chapter", "Course Chapter")
		if doc.doctype == "Chapter Reference"
		else ("Course Chapter", "lesson", "Course Lesson")
	)
	if doc.parenttype != parenttype or doc.parentfield != ("chapters" if field == "chapter" else "lessons"):
		frappe.throw(_("Invalid outline reference."), frappe.PermissionError)
	course = _reference_course(doc)
	if not parent_checked:
		from lms.lms.course_lifecycle import _require_author

		_require_author(course)
	stored = (
		frappe.db.get_value(doc.doctype, doc.name, ["parent", field, "idx"], as_dict=True, for_update=True)
		if doc.name
		else None
	)
	if stored and (stored.parent != doc.parent or stored.get(field) != doc.get(field)):
		frappe.throw(_("Use the outline move action."), frappe.PermissionError)
	from lms.lms.permissions import can_author_course

	if not can_author_course(course):
		frappe.throw(_("You cannot change this outline."), frappe.PermissionError)
	child = frappe.db.get_value(
		target,
		doc.get(field),
		["name", "course", "is_archived"] + (["chapter"] if target == "Course Lesson" else []),
		as_dict=True,
		for_update=True,
	)
	if not child:
		frappe.throw(_("Invalid outline reference."), frappe.PermissionError)
	child.doctype = target
	if _course_for(child) != course:
		frappe.throw(_("The content must belong to this course."), frappe.PermissionError)
	if (not stored or stored.idx != doc.idx) and effective_archived(child, for_update=True):
		frappe.throw(_("Restore this content and its parents before editing it."), frappe.PermissionError)


def refuse_reference_delete(doc, method=None):
	from lms.lms.course_lifecycle import require_course_purge_context

	require_course_purge_context(_reference_course(doc))


def validate_outline_parent(doc):
	field, _reference, link = (
		("chapters", "Chapter Reference", "chapter")
		if doc.doctype == "LMS Course"
		else ("lessons", "Lesson Reference", "lesson")
	)
	previous = None if doc.is_new() else doc.get_doc_before_save()
	stored = {row.name: row.get(link) for row in previous.get(field) or []} if previous else {}
	current = {row.name: row.get(link) for row in doc.get(field) or [] if row.name}
	if any(current.get(name) != value for name, value in stored.items()):
		frappe.throw(_("Archive content instead of removing its outline reference."), frappe.PermissionError)
	if previous and doc.doctype == "LMS Course" and previous.get("is_archived"):
		before = [(row.name, row.chapter, row.idx) for row in previous.get(field) or []]
		after = [(row.name, row.chapter, row.idx) for row in doc.get(field) or []]
		if before != after:
			frappe.throw(_("Restore the parent content first."), frappe.PermissionError)
	for row in doc.get(field) or []:
		validate_reference(row, parent_checked=True)


def set_child_archived(doctype, name, archived, *, chapter=None):
	from lms.lms.course_lifecycle import _require_author

	if doctype not in CHILDREN or not isinstance(name, str) or not name or len(name) > 140:
		frappe.throw(_("Invalid content."), frappe.PermissionError)
	details = frappe.db.get_value(
		doctype, name, ["course", "chapter"] if doctype == "Course Lesson" else ["course"], as_dict=True
	)
	if not details:
		frappe.throw(_("Invalid content."), frappe.PermissionError)
	course = (
		details.course
		if doctype == "Course Chapter"
		else frappe.db.get_value("Course Chapter", details.chapter, "course")
	)
	_require_author(course)
	doc = frappe.get_doc(doctype, name, for_update=True)
	if _course_for(doc) != course or (
		chapter is not None and (not isinstance(chapter, str) or doc.get("chapter") != chapter)
	):
		frappe.throw(_("The lesson is not in that chapter."), frappe.PermissionError)
	if not archived and (
		frappe.db.get_value("LMS Course", course, "is_archived", for_update=True)
		or (
			doctype == "Course Lesson"
			and frappe.db.get_value("Course Chapter", doc.chapter, "is_archived", for_update=True)
		)
	):
		frappe.throw(_("Restore the parent content first."), frappe.PermissionError)
	if bool(doc.is_archived) == archived:
		if archived and (not doc.archived_on or get_datetime(doc.archived_on) > now_datetime()):
			frappe.throw(_("This archived content has no cutoff. Restore it and archive it again."))
	else:
		context = _transition.set((doctype, name, frappe.session.user))
		try:
			doc.is_archived = int(archived)
			doc.archived_on = now_datetime() if archived else None
			# nosemgrep: lms-unjustified-ignore-permissions - current course author checked under lock; private transition validates the exact document
			doc.save(ignore_permissions=True)
			payload = {
				"doctype": doctype,
				"name": name,
				"course": course,
				"actor": frappe.session.user,
				"is_archived": doc.is_archived,
				"archived_on": str(doc.archived_on) if doc.archived_on else None,
			}
			frappe.get_doc(
				{
					"doctype": "Activity Log",
					"user": frappe.session.user,
					"status": "Success",
					"subject": _("Content archived: {0}").format(name)
					if archived
					else _("Content restored: {0}").format(name),
					"content": "<pre>" + escape_html(json.dumps(payload, sort_keys=True)) + "</pre>",
				}
			).insert(ignore_permissions=True)
		finally:
			_transition.reset(context)
	return {
		"doctype": doctype,
		"name": name,
		"course": course,
		**({"chapter": doc.chapter} if doctype == "Course Lesson" else {}),
		"is_archived": cint(doc.is_archived),
		"archived_on": doc.archived_on,
	}


def require_editable(doctype, name):
	from lms.lms.course_lifecycle import _require_author

	if not isinstance(name, str) or not name:
		frappe.throw(_("Invalid content."), frappe.PermissionError)
	row = frappe.db.get_value(
		doctype, name, ["course", "chapter"] if doctype == "Course Lesson" else ["course"], as_dict=True
	)
	if not row:
		frappe.throw(_("Invalid content."), frappe.PermissionError)
	course = (
		row.course
		if doctype == "Course Chapter"
		else frappe.db.get_value("Course Chapter", row.chapter, "course")
	)
	_require_author(course)
	doc = frappe.get_doc(doctype, name, for_update=True)
	if _course_for(doc) != course or effective_archived(doc, for_update=True):
		frappe.throw(_("Restore this content and its parents before editing it."), frappe.PermissionError)
	return doc


@contextmanager
def grading_progress(lesson, member):
	# Only the validated submission controller calls the non-whitelisted grading path.
	context = _grading_progress.set((lesson, member, frappe.session.user))
	try:
		yield
	finally:
		_grading_progress.reset(context)


def is_grading_progress(doc):
	return _grading_progress.get() == (doc.lesson, doc.member, frappe.session.user)


def lock_learning_write(doc):
	"""Course → enrollment → progress, before Frappe locks an existing progress row."""
	from lms.lms.permissions import resolve_lesson_course

	if not doc.is_new():
		stored = frappe.db.get_value(doc.doctype, doc.name, ["lesson", "course", "member"], as_dict=True)
		if stored and any(doc.get(field) != stored.get(field) for field in ("lesson", "course", "member")):
			frappe.throw(_("Progress identity cannot be changed."), frappe.PermissionError)
	course = resolve_lesson_course(doc.lesson)
	if not course or (doc.get("course") and course != doc.course):
		frappe.throw(_("Invalid lesson progress."), frappe.PermissionError)
	frappe.db.get_value("LMS Course", course, "name", for_update=True)
	doc.course = course
	enrollment = frappe.db.get_value(
		"LMS Enrollment", {"course": course, "member": doc.member}, "name", for_update=True
	)
	if not enrollment:
		from lms.lms.course_lifecycle import is_course_purge_authorized

		if not is_course_purge_authorized(course):
			frappe.throw(_("You cannot access this lesson."), frappe.PermissionError)


def validate_progress(doc, method=None):
	"""Native doc-event guard for generic REST writes, in addition to save_progress."""
	from lms.lms.permissions import can_author_course, resolve_lesson_access, resolve_lesson_course

	course = resolve_lesson_course(doc.lesson)
	if not course or course != doc.course or not doc.member or doc.member == "Guest":
		frappe.throw(_("Invalid lesson progress."), frappe.PermissionError)
	previous = None if doc.is_new() else doc.get_doc_before_save()
	if previous and any(doc.get(field) != previous.get(field) for field in ("lesson", "course", "member")):
		frappe.throw(_("Progress identity cannot be changed."), frappe.PermissionError)
	if doc.member != frappe.session.user and not can_author_course(course) and not is_grading_progress(doc):
		frappe.throw(_("You cannot record this learner's progress."), frappe.PermissionError)
	if not frappe.db.exists(
		"LMS Enrollment", {"course": course, "member": doc.member}
	) or not lesson_is_eligible(doc.lesson, user=doc.member, as_member=True):
		frappe.throw(_("You cannot access this lesson."), frappe.PermissionError)
	# Resolve sequence as the learner, including when staff records their progress.
	access = resolve_lesson_access(doc.lesson, user=doc.member)
	if not access[1]:
		frappe.throw(_("You cannot access this lesson."), frappe.PermissionError)


def preserve_archived_evidence(doc, method=None):
	from lms.lms.course_lifecycle import is_course_purge_authorized
	from lms.lms.permissions import resolve_lesson_course

	course = resolve_lesson_course(doc.lesson)
	if is_course_purge_authorized(course):
		return
	validate_progress(doc)
	lesson = frappe.get_doc("Course Lesson", doc.lesson)
	if effective_archived(lesson):
		frappe.throw(_("Archived learning history cannot be deleted."), frappe.PermissionError)


def _position(idx, count):
	if not isinstance(idx, int) or isinstance(idx, bool) or idx < 0 or idx > count:
		frappe.throw(_("Invalid outline position."))


def _reindex(reference, names):
	for index, name in enumerate(names, 1):
		frappe.db.set_value(reference, name, "idx", index)


def _outline_references(reference, parent, parenttype, link):
	from lms.lms.locking import locked_get_all

	return sorted(
		locked_get_all(reference, {"parent": parent, "parenttype": parenttype}, ["name", link, "idx"]),
		key=lambda row: (row.idx, row.name),
	)


def move_lesson(lesson, source, target, idx):
	from lms.lms.course_lifecycle import _require_author

	if not all(isinstance(value, str) and value for value in (lesson, source, target)):
		frappe.throw(_("Invalid outline reference."), frappe.PermissionError)
	courses = [frappe.db.get_value("Course Chapter", name, "course") for name in (source, target)]
	if not all(courses):
		frappe.throw(_("Invalid outline reference."), frappe.PermissionError)
	for course in sorted(set(courses)):
		_require_author(course)
	source_doc, target_doc = (
		require_editable("Course Chapter", source),
		require_editable("Course Chapter", target),
	)
	doc = require_editable("Course Lesson", lesson)
	if doc.chapter != source or (source_doc.course, target_doc.course) != tuple(courses):
		frappe.throw(_("The lesson is not in that chapter."), frappe.PermissionError)
	if courses[0] != courses[1] and frappe.db.exists("LMS Enrollment", {"course": courses[0]}):
		frappe.throw(_("Content with enrolled learners cannot be moved to another course."))
	rows = _outline_references("Lesson Reference", source, "Course Chapter", "lesson")
	selected = [row for row in rows if row.lesson == lesson]
	if len(selected) != 1:
		frappe.throw(_("Invalid outline reference."), frappe.PermissionError)
	reference = selected[0].name
	source_names = [row.name for row in rows if row.name != reference]
	target_names = (
		source_names
		if source == target
		else [row.name for row in _outline_references("Lesson Reference", target, "Course Chapter", "lesson")]
	)
	_position(idx, len(target_names))
	target_names.insert(idx, reference)
	if source != target:
		frappe.db.set_value("Lesson Reference", reference, "parent", target)
		frappe.db.set_value("Course Lesson", lesson, {"chapter": target, "course": target_doc.course})
		_reindex("Lesson Reference", source_names)
	_reindex("Lesson Reference", target_names)
	from lms.lms.utils import get_lesson_count

	for course in set(courses):
		frappe.db.set_value("LMS Course", course, "lessons", get_lesson_count(course))


def move_chapter(chapter, course, idx):
	doc = require_editable("Course Chapter", chapter)
	if not isinstance(course, str) or doc.course != course:
		frappe.throw(_("Invalid outline reference."), frappe.PermissionError)
	rows = _outline_references("Chapter Reference", course, "LMS Course", "chapter")
	selected = [row for row in rows if row.chapter == chapter]
	if len(selected) != 1:
		frappe.throw(_("Invalid outline reference."), frappe.PermissionError)
	names = [row.name for row in rows if row.name != selected[0].name]
	_position(idx, len(names))
	names.insert(idx, selected[0].name)
	_reindex("Chapter Reference", names)
