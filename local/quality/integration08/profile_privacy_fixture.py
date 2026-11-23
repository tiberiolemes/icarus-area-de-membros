"""Nonempty synthetic profile values; no credentials, external recipients or file deletion."""

import hashlib
import io

import frappe
from PIL import Image


def fill_profile(user, suffix, remember):
	phone = next(
		"+120255501" + f"{number:02d}"
		for number in range(100)
		if not frappe.db.exists("User", {"mobile_no": "+120255501" + f"{number:02d}"})
	)
	lookups = {}
	for doctype, field in (
		("Gender", "gender"),
		("User Skill", "skill"),
		("Function", "function"),
		("Industry", "industry"),
	):
		doc = frappe.get_doc({"doctype": doctype, field: "QC08 synthetic " + suffix}).insert(
			ignore_permissions=True
		)
		remember(doctype, doc.name)
		lookups[doctype] = doc.name
	image = io.BytesIO()
	Image.new("RGB", (64, 64), (43, 68, 99)).save(image, format="PNG")
	file = frappe.get_doc(
		{
			"doctype": "File",
			"file_name": "qc08-profile-" + suffix + ".png",
			"content": image.getvalue(),
			"is_private": 1,
			"attached_to_doctype": "User",
			"attached_to_name": user,
		}
	).insert(ignore_permissions=True)
	file.db_set("owner", user)
	remember("File", file.name)
	values = {
		"first_name": "QC08",
		"middle_name": "Synthetic",
		"last_name": suffix,
		"birth_date": "1990-03-14",
		"user_image": file.file_url,
		"cover_image": file.file_url,
		"banner_image": file.file_url,
		"bio": "QC08 synthetic biography " + suffix,
		"headline": "QC08 synthetic headline",
		"open_to": "Work",
		"linkedin": "https://example.test/linkedin/" + suffix,
		"github": "https://example.test/github/" + suffix,
		"twitter": "https://example.test/twitter/" + suffix,
		"medium": "https://example.test/medium/" + suffix,
		"gender": lookups["Gender"],
		"location": "QC08 synthetic location",
		"interest": "QC08 synthetic interest",
		"phone": phone,
		"mobile_no": phone,
		"language": "en",
		"time_zone": "America/Sao_Paulo",
		"desk_theme": "Dark",
		"email_signature": "<p>QC08 synthetic signature " + suffix + "</p>",
		"country": frappe.get_all("Country", pluck="name", limit=1)[0],
		"user_category": "Student",
		"profession": "QC08 synthetic profession",
		"preferred_location": "QC08 synthetic preference",
		"dream_companies": "QC08 synthetic company",
		"attire": "Casual Wear",
		"collaboration": "Team Work",
		"role": "Clearly Defined Role",
		"location_preference": "Travel",
		"time": "Flexible Time",
		"company_type": "Startup Organization",
		"city": "QC08 synthetic city",
		"college": "QC08 synthetic college",
		"branch": "QC08 synthetic branch",
	}
	doc = frappe.get_doc("User", user)
	doc.update(values)
	doc.append(
		"education",
		{
			"institution_name": "QC08 synthetic school",
			"location": "QC08 synthetic city",
			"degree_type": "QC08 synthetic degree",
			"grade_type": "Letter Grade (e.g. A, B-)",
			"grade": "A",
			"major": "QC08 synthetic major",
			"start_date": "2010-01-01",
			"end_date": "2012-01-01",
		},
	)
	for parentfield in ("work_experience", "internship"):
		doc.append(
			parentfield,
			{
				"title": "QC08 synthetic title",
				"company": "QC08 synthetic employer",
				"location": "QC08 synthetic location",
				"from_date": "2013-01-01",
				"to_date": "2014-01-01",
				"description": "QC08 synthetic work " + parentfield,
				"current": 1,
			},
		)
	doc.append(
		"certification",
		{
			"certification_name": "QC08 self-declared CV certificate",
			"organization": "QC08 synthetic organization",
			"issue_date": "2015-01-01",
			"description": "QC08 synthetic certification description",
			"expiration_date": "2016-01-01",
			"expire": 1,
		},
	)
	doc.append("skill", {"skill_name": lookups["User Skill"]})
	doc.append("preferred_functions", {"function": lookups["Function"]})
	doc.append("preferred_industries", {"industry": lookups["Industry"]})
	doc.save(ignore_permissions=True)
	doc.reload()
	values = {field: doc.get(field) for field in (*values, "email", "username", "full_name")}
	assert len(values) == 40 and all(value not in (None, "") for value in values.values())
	children = []
	for parentfield in (
		"education",
		"work_experience",
		"internship",
		"certification",
		"skill",
		"preferred_functions",
		"preferred_industries",
	):
		for row in doc.get(parentfield):
			fields = [
				f.fieldname for f in row.meta.fields if f.fieldtype not in {"Column Break", "Section Break"}
			]
			data = {field: row.get(field) for field in fields}
			assert all(value not in (None, "") for value in data.values())
			children.append(
				{
					"doctype": row.doctype,
					"name": row.name,
					"parentfield": parentfield,
					"idx": row.idx,
					"values": data,
				}
			)
	controls = []
	other = frappe.get_all(
		"User", filters={"name": ["like", "qc08-privacy-manager-%@example.test"]}, pluck="name"
	)[0]
	for parent, parenttype, parentfield in (
		(other, "User", "work_experience"),
		(user, "LMS Course", "work_experience"),
		(user, "User", "qc08_undeclared_profile"),
	):
		row = frappe.get_doc(
			{
				"doctype": "Work Experience",
				"parent": parent,
				"parenttype": parenttype,
				"parentfield": parentfield,
				"idx": 17,
				"title": "QC08 untouched control " + suffix,
				"company": "QC08 control company",
				"location": "QC08 control location",
				"from_date": "2013-01-01",
			}
		)
		row.db_insert()
		remember(row.doctype, row.name)
		controls.append(
			{
				key: row.get(key)
				for key in (
					"name",
					"parent",
					"parenttype",
					"parentfield",
					"idx",
					"title",
					"company",
					"location",
					"from_date",
				)
			}
		)
	return {
		"values": values,
		"children": children,
		"file": file.name,
		"file_sha256": hashlib.sha256(image.getvalue()).hexdigest(),
		"controls": controls,
	}


def assert_profile_export(exported, fixture):
	row = exported["User"][0]
	assert (
		not {"api_key", "api_secret", "new_password", "reset_password_key", "roles", "role_profiles"}
		& row.keys()
	)
	for field, expected in fixture["values"].items():
		assert field in row and str(row[field]) == str(expected), "Profile export mismatch: " + field
	for child in fixture["children"]:
		row = next(row for row in exported[child["doctype"]] if row["name"] == child["name"])
		assert row["parentfield"] == child["parentfield"] and row["idx"] == child["idx"]
		for field, expected in child["values"].items():
			assert str(row[field]) == str(expected), "Profile child export mismatch: " + field
	assert not {row["name"] for row in exported["Work Experience"]} & {
		row["name"] for row in fixture["controls"]
	}


def assert_profile_redacted(user, fixture):
	doc = frappe.get_doc("User", user)
	identifiers = {"email", "first_name", "middle_name", "last_name", "full_name", "username", "birth_date"}
	for field, before in fixture["values"].items():
		if field in identifiers:
			assert doc.get(field) and str(doc.get(field)) != str(before), (
				"Profile identifier retained: " + field
			)
		else:
			assert doc.get(field) is None, "Profile value retained: " + field
	assert str(doc.birth_date) == "1111-01-01" and doc.email == user and doc.username == user
	for child in fixture["children"]:
		row = frappe.get_doc(child["doctype"], child["name"])
		assert (row.parent, row.parenttype, row.parentfield, row.idx) == (
			user,
			"User",
			child["parentfield"],
			child["idx"],
		)
		for field, before in child["values"].items():
			assert str(row.get(field)) != str(before), "Profile CV value retained: " + field
			kind = row.meta.get_field(field).fieldtype
			if (row.doctype, field) in {("Skills", "skill_name"), ("Preferred Industry", "industry")}:
				assert row.get(field) == "[REDACTED]"
				target = "User Skill" if row.doctype == "Skills" else "Industry"
				assert (
					frappe.db.get_value(
						target, "[REDACTED]", "skill" if target == "User Skill" else "industry"
					)
					== "[REDACTED]"
				)
				continue
			assert row.get(field) == (
				None
				if kind in {"Link", "Select", "Small Text"}
				else 0
				if kind == "Check"
				else "[REDACTED]"
				if kind == "Data"
				else __import__("datetime").date(1111, 1, 1)
			), "Invalid redaction type: " + field
	file = frappe.get_doc("File", fixture["file"])
	assert file.owner == user and file.attached_to_name == user and file.is_private
	assert hashlib.sha256(file.get_content()).hexdigest() == fixture["file_sha256"]
	doc._action = "save"
	doc._validate_mandatory()
	doc._validate_links()
	doc._validate_selects()
	for child in doc.get_all_children():
		child._validate_selects()
	for before in fixture["controls"]:
		row = frappe.get_doc("Work Experience", before["name"])
		for field, expected in before.items():
			# Native User rename remaps its child links, including an undeclared field.
			if (
				field == "parent"
				and before["parenttype"] == "User"
				and expected == fixture["values"]["email"]
			):
				expected = user
			assert str(row.get(field)) == str(expected), "Unrelated profile data changed: " + field
