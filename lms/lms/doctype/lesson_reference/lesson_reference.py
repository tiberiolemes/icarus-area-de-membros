# Copyright (c) 2021, FOSS United and contributors
# For license information, please see license.txt

# import frappe
from frappe.model.document import Document


class LessonReference(Document):
	def validate(self):
		from lms.lms.child_content import validate_reference

		validate_reference(self)

	def on_trash(self):
		from lms.lms.child_content import refuse_reference_delete

		refuse_reference_delete(self)
