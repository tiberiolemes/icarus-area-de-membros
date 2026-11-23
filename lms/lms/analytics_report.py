# Copyright (c) 2026, Frappe and Contributors
# See license.txt
"""The course and batch dashboards' analytics export: one report, rendered as Excel, PDF or HTML."""

import csv
import io
import re
from decimal import Decimal

import frappe
from frappe import _
from frappe.utils.jinja_globals import is_rtl
from frappe.utils.pdf import get_pdf
from frappe.utils.xlsxutils import handle_html, make_xlsx

REPORT_TEMPLATE = "lms/templates/analytics_report.html"
# A cell starting with one of these is run as a formula by spreadsheet apps.
FORMULA_PREFIXES = ("=", "+", "-", "@", "\t", "\r")
SHEET_COLUMN_WIDTH = 18
# The image is one tall picture, so it shows the newest students and points to the files for the rest.
IMAGE_STUDENTS = 60
PREVIEW_STUDENTS = 25


def send_analytics(report: frappe._dict, file_format: str) -> None:
	"""Answer the request with the report as `<name>-analytics.<xlsx|pdf>`."""
	filename = f"{re.sub(r'[^A-Za-z0-9_-]+', '-', report.name)}-analytics.{file_format}"
	frappe.response.filename = filename
	if file_format == "pdf":
		frappe.response.filecontent = report_pdf(report)
		frappe.response.type = "pdf"
	elif file_format == "csv":
		stream = io.StringIO(newline="")
		writer = csv.writer(stream, delimiter=";", lineterminator="\r\n")
		rows = report_sheet(report)
		percentages = _percentage_cells(report, rows)
		for row_index, row in enumerate(rows):
			writer.writerow(
				[
					f"{cell:.2f}".replace(".", ",")
					if (row_index, column) in percentages and isinstance(cell, (int, float, Decimal))
					else str(cell).replace(".", ",")
					if isinstance(cell, (float, Decimal))
					else sheet_cell(cell)
					for column, cell in enumerate(row)
				]
			)
		frappe.response.filecontent = ("\ufeff" + stream.getvalue()).encode("utf-8")
		frappe.response.type = "binary"
	else:
		frappe.response.filecontent = report_xlsx(report)
		frappe.response.type = "binary"


def report_sheet(report: frappe._dict, max_students: int | None = None) -> list[list]:
	"""The title, time frame and headline numbers, then the student header and a row per student."""
	rows = report.sheet_rows if max_students is None else report.sheet_rows[:max_students]
	return [
		[
			sheet_cell(report.title),
			sheet_cell(frappe.get_cached_value("Website Settings", None, "app_name") or ""),
		],
		[_("Time frame"), report.time_frame],
		[_("Generated on"), report.generated_on],
		[],
		*([f"{kpi['label']} (%)" if kpi["suffix"] else kpi["label"], kpi["value"]] for kpi in report.kpis),
		[],
		report.sheet_header,
		*([sheet_cell(cell) for cell in row] for row in rows),
	]


def report_xlsx(report: frappe._dict) -> bytes:
	widths = [SHEET_COLUMN_WIDTH] * len(report.sheet_header)
	rows = report_sheet(report)
	styles = {
		"styles": [{"num_format": "0.00"}, {"bold": True}],
		"row_styles": {0: [1]},
		"cell_styles": {cell: [0] for cell in _percentage_cells(report, rows)},
	}
	return make_xlsx(rows, _("Analytics"), column_widths=widths, styles=styles).getvalue()


def _percentage_cells(report, rows):
	first_student = len(rows) - len(report.sheet_rows)
	columns = [index for index, label in enumerate(report.sheet_header) if label.endswith("(%)")]
	return {(4 + index, 1) for index, kpi in enumerate(report.kpis) if kpi["suffix"] == "%"} | {
		(row, column) for row in range(first_student, len(rows)) for column in columns
	}


def report_pdf(report: frappe._dict) -> bytes:
	html = (
		f'<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>{report_html(report)}</body></html>'
	)
	return get_pdf(html, {"page-size": "A4", "orientation": "Portrait"})


def report_html(report: frappe._dict, max_students: int | None = None, hidden_note: str | None = None) -> str:
	"""The report as one self-contained, inline-styled element: wkhtmltopdf and an SVG image both draw it.

	`hidden_note` replaces the line under a capped student table; `{0}` is how many it left out."""
	rows = report.table_rows if max_students is None else report.table_rows[:max_students]
	hidden_rows = len(report.table_rows) - len(rows)
	note = hidden_note or _("And {0} more. Export as Excel or PDF for every student.")
	return frappe.render_template(  # nosemgrep: frappe-ssti - a fixed template file of this app
		REPORT_TEMPLATE,
		{
			"report": report,
			"rows": rows,
			"hidden_note": note.format(hidden_rows) if hidden_rows else "",
			"rtl": is_rtl(),
			"brand_name": frappe.get_cached_value("Website Settings", None, "app_name") or "",
			"brand_logo": _report_logo(),
		},
	)


def report_preview(report: frappe._dict, file_format: str) -> dict:
	"""What the export holds, capped so that a large course is still a small reply."""
	students = len(report.table_rows)
	if file_format == "png":
		html = report_html(report, IMAGE_STUDENTS)
		return {"students": students, "shown": min(students, IMAGE_STUDENTS), "html": html, "sheet": None}
	shown = min(students, PREVIEW_STUDENTS)
	if file_format == "pdf":
		html = report_html(report, PREVIEW_STUDENTS, _("And {0} more in the PDF."))
		return {"students": students, "shown": shown, "html": html, "sheet": None}
	rows = report_sheet(report, PREVIEW_STUDENTS)
	sheet = {
		# The cells as make_xlsx writes them, so a name holding markup reads the same in both.
		"rows": [[handle_html(cell) if isinstance(cell, str) else cell for cell in row] for row in rows],
		"header_row": len(rows) - shown - 1,
		"columns": len(report.sheet_header),
	}
	return {"students": students, "shown": shown, "html": None, "sheet": sheet}


def sheet_cell(value):
	if value is None:
		return ""
	if isinstance(value, str) and (
		value.startswith(FORMULA_PREFIXES) or value.lstrip().startswith(FORMULA_PREFIXES)
	):
		return f"'{value}"
	return value


def _report_logo():
	"""Embed only the configured local public logo; never fetch a remote URL for a report."""
	import base64
	from pathlib import Path

	from PIL import Image, UnidentifiedImageError

	url = frappe.get_cached_value("Website Settings", None, "banner_image")
	if not url or not url.startswith("/files/"):
		return None
	root = Path(frappe.get_site_path("public", "files")).resolve()
	path = (root / url.removeprefix("/files/")).resolve()
	if root not in path.parents or not path.is_file() or path.stat().st_size > 512000:
		return None
	if path.suffix.lower() not in {".png", ".jpg", ".jpeg", ".webp"}:
		return None
	try:
		with Image.open(path) as logo:
			if logo.width * logo.height > 40_000_000:
				return None
			logo.thumbnail((1200, 400))
			stream = io.BytesIO()
			logo.convert("RGBA").save(stream, format="PNG")
	except (OSError, UnidentifiedImageError, Image.DecompressionBombError):
		return None
	# wkhtmltopdf does not reliably decode WebP; embed a bounded PNG for every renderer.
	return f"data:image/png;base64,{base64.b64encode(stream.getvalue()).decode()}"
