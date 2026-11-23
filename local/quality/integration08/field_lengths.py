"""Bind existing native input descriptions to proven varchar limits, never invent limits."""

import json
import re
import subprocess
from pathlib import Path

root = Path(__file__).resolve().parents[3]
# Explicit model-to-native-field mapping; query filters, numeric values, editors,
# secrets and deferred integrations are not mistaken for bounded text columns.
mapping = {
	"pages/Batches/BatchForm.vue": {"batchDetail.doc.title": ("LMS Batch", "title")},
	"pages/Forms/AssignmentForm.vue": {"assignment.title": ("LMS Assignment", "title")},
	"pages/Forms/ChapterForm.vue": {"chapter.title": ("Course Chapter", "title")},
	"pages/Forms/EmailTemplateForm.vue": {
		"template.name": ("Email Template", "name"),
		"template.subject": ("Email Template", "subject"),
	},
	"pages/Forms/JobForm.vue": {
		"job." + key: ("Job Opportunity", key)
		for key in ("job_title", "location", "company_name", "company_website", "company_email_address")
	},
	"pages/Forms/LiveClassForm.vue": {"liveClass.title": ("LMS Live Class", "title")},
	"pages/Forms/NewBatchForm.vue": {"batch.title": ("LMS Batch", "title")},
	"pages/Forms/NewCourseForm.vue": {
		"course.title": ("LMS Course", "title"),
		"course.short_introduction": ("LMS Course", "short_introduction"),
	},
	"pages/Forms/ProgramForm.vue": {"program.name": ("LMS Program", "name")},
	"pages/Forms/ProgrammingExerciseForm.vue": {"exercise.title": ("LMS Programming Exercise", "title")},
	"pages/Forms/QuizForm.vue": {"doc.title": ("LMS Quiz", "title")},
	"components/Courses/CourseDetailsSection.vue": {
		"doc.title": ("LMS Course", "title"),
		"doc.short_introduction": ("LMS Course", "short_introduction"),
	},
	"components/Modals/DiscussionModal.vue": {"topic.title": ("Discussion Topic", "title")},
	"components/Settings/Categories.vue": {"draft": ("LMS Category", "category")},
	"components/Controls/Link.vue": {"newItemName": ("LMS Category", "name")},
	"components/Settings/Members/MemberForm.vue": {
		"member." + key: ("User", key)
		for key in ("first_name", "last_name", "email", "username", "phone", "mobile_no", "location", "bio")
	},
	"components/ContactUsEmail.vue": {"subject": ("Communication", "subject")},
	"pages/JobApplications.vue": {"emailForm.subject": ("Communication", "subject")},
	"components/Quiz/QuestionAnswers.vue": {
		f"question[`{key}_${{n}}`]": ("LMS Question", key + "_1")
		for key in ("option", "explanation", "possibility")
	},
	"pages/Community.vue": {
		"grantForm.member": ("LMS Community Grant", "member"),
		"grantForm.reason": ("LMS Community Grant", "reason"),
	},
}
for filename, prefix, fields in (
	("pages/Forms/MemberForm.vue", "member", ("email", "first_name", "last_name")),
	("components/Modals/NewMemberModal.vue", "member", ("email", "first_name", "last_name")),
	(
		"pages/Forms/ProfileEditForm.vue",
		"profile",
		("first_name", "last_name", "headline", "linkedin", "github", "twitter"),
	),
):
	mapping[filename] = {prefix + "." + key: ("User", key) for key in fields}
doctypes = sorted({doctype for fields in mapping.values() for doctype, field in fields.values()})
program = """import frappe,json
frappe.init(site='tiberio.localhost',sites_path='/home/frappe/frappe-bench/sites')
frappe.connect()
try:
 result={}
 for doctype in DOCTYPES:
  rows=frappe.db.sql('SELECT COLUMN_NAME,DATA_TYPE,CHARACTER_MAXIMUM_LENGTH FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=%s', 'tab'+doctype)
  result[doctype]={name:{'sql_type':kind,'maximum':maximum} for name,kind,maximum in rows}
 print(json.dumps(result))
finally:
 frappe.db.rollback();frappe.destroy()
""".replace("DOCTYPES", repr(doctypes))
data = subprocess.check_output(
	[
		"docker",
		"exec",
		"-i",
		"-w",
		"/home/frappe/frappe-bench/sites",
		"tiberio-quality08-final-existing-app",
		"/home/frappe/frappe-bench/env/bin/python",
		"-",
	],
	input=program.encode(),
)
schema = json.loads(data)
inventory = []
for filename, fields in mapping.items():
	path = root / "frontend/src" / filename
	text = path.read_text()
	touched = False
	for model, (doctype, field) in fields.items():
		column = schema[doctype].get(field)
		assert column, (doctype, field)
		row = {"component": filename, "model": model, "doctype": doctype, "field": field, **column}
		inventory.append(row)
		if column["sql_type"] != "varchar":
			row["counter"] = False
			continue
		maximum = int(column["maximum"])
		row["counter"] = True
		pattern = r'(<FormControl\b[^<>]*?v-model(?:\.\w+)?="' + re.escape(model) + r'"[^<>]*?>)'
		matches = list(re.finditer(pattern, text, re.S))
		assert len(matches) == 1, (filename, model, len(matches))
		tag = matches[0].group()
		description = f':description="textLengthInfo({model}, {maximum})"'
		if f"textLengthInfo({model}, {maximum})" not in tag:
			if existing := re.search(r':description="([^"]+)"', tag):
				merged = (
					f":description=\"[{existing.group(1)}, textLengthInfo({model}, {maximum})].join(' · ')\""
				)
				replacement = tag[: existing.start()] + merged + tag[existing.end() :]
			else:
				replacement = tag.replace(f'v-model="{model}"', f'v-model="{model}"\n\t\t\t{description}')
			text = text[: matches[0].start()] + replacement + text[matches[0].end() :]
			touched = True
			tag = replacement
			matches = list(re.finditer(pattern, text, re.S))
		if tag.endswith("/>"):
			expression = re.search(r':description="([^"]+)"', tag).group(1)
			replacement = (
				tag[:-2] + ">\n<template #description>{{ " + expression + " }}</template>\n</FormControl>"
			)
			text = text[: matches[0].start()] + replacement + text[matches[0].end() :]
			touched = True
	if touched:
		match = re.search(r'<script setup(?: lang="ts")?>', text)
		assert match, filename
		if "import { textLengthInfo }" not in text:
			text = (
				text[: match.end()]
				+ "\nimport { textLengthInfo } from '@/utils/textLength'"
				+ text[match.end() :]
			)
		path.write_text(text)
(root / "docs/audit/quality/evidence/08-field-lengths.json").write_text(
	json.dumps(
		{
			"native_schema_source": "immutable candidate80df isolated restored site; varchar verified through information_schema",
			"unicode_count": "Python len / Unicode codepoints",
			"fields": inventory,
			"counters": sum(row["counter"] for row in inventory),
			"not_counters": "SQL text editors, transient searches, numeric inputs, secrets with separate policy, deferred billing/AI integration configuration; no new limits imposed",
		},
		ensure_ascii=False,
		indent=2,
	)
	+ "\n"
)
print(
	json.dumps(
		{
			"reviewed_fields": len(inventory),
			"native_varchar_counters": sum(row["counter"] for row in inventory),
		}
	)
)
