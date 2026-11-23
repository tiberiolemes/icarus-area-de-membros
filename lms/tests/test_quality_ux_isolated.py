"""Actual policy functions at isolated boundaries; no production DB or service writes."""

import ast
import csv
import io
import re
import secrets
import tempfile
import unittest
from contextvars import ContextVar
from datetime import datetime, time, timedelta
from decimal import Decimal
from pathlib import Path, PurePath
from types import SimpleNamespace
from zoneinfo import ZoneInfo

from jinja2 import Environment
from PIL import Image, ImageOps, UnidentifiedImageError

ROOT = Path(__file__).resolve().parents[1]


class Denied(Exception):
	pass


def throw(message, exception=Denied):
	raise exception(message)


def functions(relative, names, env):
	nodes = [
		node
		for node in ast.parse((ROOT / relative).read_text()).body
		if isinstance(node, ast.FunctionDef) and node.name in names
	]
	assert {node.name for node in nodes} == set(names)
	for node in nodes:
		node.decorator_list = []
	exec(compile(ast.Module(body=nodes, type_ignores=[]), relative, "exec"), env)
	return env


class TestReportDays(unittest.TestCase):
	def setUp(self):
		self.env = functions(
			"lms/report_period.py",
			["report_window", "previous_window", "within"],
			{
				"datetime": datetime,
				"time": time,
				"timedelta": timedelta,
				"ZoneInfo": ZoneInfo,
				"REPORT_ZONE": ZoneInfo("America/Sao_Paulo"),
				"get_system_timezone": lambda: "UTC",
				"frappe": SimpleNamespace(throw=throw),
				"_": lambda value: value,
			},
		)
		self.now = datetime(2026, 3, 1, 1, 30, tzinfo=ZoneInfo("UTC"))

	def test_month_default_and_brazil_midnight_to_site_database_zone(self):
		cut = self.env["report_window"](now=self.now)
		self.assertEqual(cut["from_date"], "2026-02-01")
		self.assertEqual(cut["to_date"], "2026-02-28")
		self.assertEqual(cut["lower"], datetime(2026, 2, 1, 3))
		self.assertEqual(cut["upper"], datetime(2026, 3, 1, 1, 30))
		filters = self.env["within"]([["enabled", "=", 1]], "creation", cut)
		self.assertEqual(filters[-1], ["creation", "<", cut["upper"]])

	def test_previous_window_has_equal_days_and_zero_never_invents_growth(self):
		cut = self.env["report_window"]("2026-02-22", "2026-02-28", now=self.now)
		previous = self.env["previous_window"](cut)
		self.assertEqual((previous["from_date"], previous["to_date"]), ("2026-02-15", "2026-02-21"))
		self.assertIsNone(self.env["previous_window"](self.env["report_window"]("", "", now=self.now)))

	def test_invalid_partial_reversed_future_dates_are_denied(self):
		for first, last in [
			("2026-02-31", "2026-02-28"),
			("2026-2-1", "2026-02-28"),
			("2026-02-01", None),
			("2026-02-28", "2026-02-01"),
			("2026-02-01", "2026-03-01"),
		]:
			with self.subTest(first=first, last=last), self.assertRaises(Denied):
				self.env["report_window"](first, last, now=self.now)


class TestFutureClasses(unittest.TestCase):
	def setUp(self):
		self.env = functions(
			"lms/upcoming.py",
			["class_instant", "future_classes"],
			{
				"datetime": datetime,
				"timedelta": timedelta,
				"ZoneInfo": ZoneInfo,
				"get_system_timezone": lambda: "America/Sao_Paulo",
			},
		)

	def test_old_same_day_classes_do_not_eat_the_limit_and_time_order_is_global(self):
		rows = [
			{"name": "past1", "date": "2026-11-21", "time": "09:00:00", "timezone": "America/Sao_Paulo"},
			{
				"name": "past2",
				"date": "2026-11-21",
				"time": timedelta(hours=10),
				"timezone": "America/Sao_Paulo",
			},
			{"name": "future2", "date": "2026-11-21", "time": "15:00:00", "timezone": "America/Sao_Paulo"},
			{"name": "future1", "date": "2026-11-21", "time": "17:30:00", "timezone": "UTC"},
		]
		self.assertEqual(
			[
				r["name"]
				for r in self.env["future_classes"](
					rows, limit=1, now=datetime(2026, 11, 21, 17, tzinfo=ZoneInfo("UTC"))
				)
			],
			["future1"],
		)
		self.assertEqual(
			[
				r["name"]
				for r in self.env["future_classes"](
					rows, start=1, limit=1, now=datetime(2026, 11, 21, 17, tzinfo=ZoneInfo("UTC"))
				)
			],
			["future2"],
		)

	def test_invalid_zone_never_exposes_an_unfiltered_class(self):
		self.assertEqual(
			self.env["future_classes"](
				[{"name": "bad", "date": "2026-11-21", "time": "14:30:00", "timezone": "bad/zone"}]
			),
			[],
		)


class TestMedia(unittest.TestCase):
	def setUp(self):
		self.frappe = SimpleNamespace(
			throw=throw,
			PermissionError=Denied,
			session=SimpleNamespace(user="author"),
			has_permission=lambda *args: True,
		)
		self.env = functions(
			"lms/media.py",
			["inspect_bytes", "optimized_image", "_authorize", "validate_native_file"],
			{
				"frappe": self.frappe,
				"_": lambda value: value,
				"io": io,
				"Image": Image,
				"ImageOps": ImageOps,
				"UnidentifiedImageError": UnidentifiedImageError,
				"PurePath": PurePath,
				"LIMITS": {
					"avatar": 10 * 1024 * 1024,
					"cover": 20 * 1024 * 1024,
					"brand": 20 * 1024 * 1024,
					"material": 25 * 1024 * 1024,
					"video": 2 * 1024**3,
					"intro_video": 2 * 1024**3,
				},
				"IMAGE_LIMITS": {
					"avatar": 250 * 1024,
					"cover": 500 * 1024,
					"brand": 500 * 1024,
					"material": 500 * 1024,
				},
				"_internal_original": ContextVar("test_original", default=False),
				"can_author_course": lambda name: name == "own",
				"can_author_batch": lambda name: name == "own-batch",
				"resolve_lesson_course": lambda name: "own" if name == "own-lesson" else "foreign",
				"is_site_administrator": lambda: False,
				"has_course_instructor_role": lambda: True,
			},
		)

	def image(self):
		buffer = io.BytesIO()
		Image.new("RGBA", (1800, 900), (15, 25, 35, 100)).save(buffer, format="PNG")
		return buffer.getvalue()

	def test_real_image_bytes_derivative_limit_crop_and_transparency(self):
		original = self.image()
		self.assertEqual(self.env["inspect_bytes"](original, "x.png", "avatar"), "image")
		derivative = self.env["optimized_image"](original, "avatar", "square")
		self.assertLessEqual(len(derivative), 250 * 1024)
		with Image.open(io.BytesIO(derivative)) as image:
			self.assertEqual(image.size, (512, 512))
			self.assertIn("A", image.getbands())
		with Image.open(io.BytesIO(self.env["optimized_image"](original, "cover", "contain"))) as image:
			self.assertEqual(image.width / image.height, 2)
		with self.assertRaises(Denied):
			self.env["optimized_image"](original, "brand", "square")

	def test_wrong_content_extension_svg_and_image_as_video_are_denied(self):
		for content, name, purpose in [
			(b"<svg></svg>", "x.png", "avatar"),
			(self.image(), "x.jpg", "cover"),
			(self.image(), "x.png", "video"),
			(b"<script>", "x.svg", "cover"),
			(b"%PDF-1.7", "x.mp4", "video"),
		]:
			with self.subTest(name=name), self.assertRaises(Denied):
				self.env["inspect_bytes"](content, name, purpose)

	def test_didactic_video_does_not_inherit_image_or_material_size_limit(self):
		video = b"\x00\x00\x00\x18ftypisom" + b"\x00" * (26 * 1024 * 1024)
		self.assertEqual(self.env["inspect_bytes"](video, "lesson.mp4", "video"), "video")
		with self.assertRaises(Denied):
			self.env["inspect_bytes"](video, "lesson.mp4", "material")

	def test_wrong_lesson_other_avatar_and_guest_deny_before_storage(self):
		for purpose, doctype, docname in [
			("material", "Course Lesson", "foreign-lesson"),
			("avatar", "User", "someone-else"),
		]:
			with self.assertRaises(Denied):
				self.env["_authorize"](purpose, doctype, docname)
		self.env["_authorize"]("material", "Course Lesson", "own-lesson")
		self.frappe.session.user = "Guest"
		with self.assertRaises(Denied):
			self.env["_authorize"]("cover", None, None)

	def test_native_hook_rejects_public_lesson_media(self):
		doc = SimpleNamespace(
			attached_to_doctype="Course Lesson",
			attached_to_field="content",
			file_name="x.pdf",
			is_private=0,
			get_content=lambda: b"%PDF-1.7 test",
		)
		with self.assertRaises(Denied):
			self.env["validate_native_file"](doc)
		doc.is_private = 1
		self.env["validate_native_file"](doc)

	def test_native_video_limit_is_scoped_and_does_not_weaken_other_file_limits(self):
		self.env["_validated_upload_limit"] = ContextVar("test_limit", default=None)
		node = next(
			node
			for node in ast.parse((ROOT / "lms/media.py").read_text()).body
			if isinstance(node, ast.ClassDef) and node.name == "MediaFilePolicyMixin"
		)
		exec(compile(ast.Module(body=[node], type_ignores=[]), "media-mixin", "exec"), self.env)

		class NativeLimit:
			def check_max_file_size(self):
				return "native limit unchanged"

		Policy = type("Policy", (self.env["MediaFilePolicyMixin"], NativeLimit), {})
		doc = Policy()
		doc.attached_to_doctype = "Course Lesson"
		doc.file_name = "lesson.mp4"
		doc._content = b"\x00\x00\x00\x18ftypisom" + b"\x00" * (26 * 1024 * 1024)
		self.assertEqual(doc.check_max_file_size(), len(doc._content))
		doc.attached_to_doctype = "Other DocType"
		self.assertEqual(doc.check_max_file_size(), "native limit unchanged")
		doc.attached_to_doctype = "Course Lesson"
		doc._content = b"<html>not video</html>"
		with self.assertRaises(Denied):
			doc.check_max_file_size()


class TestStatisticsAccess(unittest.TestCase):
	def test_statistics_comparison_preserves_precision_and_zero_or_missing_baseline(self):
		window = dict(
			from_date="2026-11-01",
			to_date="2026-11-21",
			updated_at="2026-11-21",
			timezone="America/Sao_Paulo",
			lower=None,
			upper=datetime(2026, 11, 22),
			period="current",
		)
		old = 3
		previous = dict(period="previous")
		env = functions(
			"lms/statistics.py",
			["get_statistics"],
			{
				"_access": lambda: None,
				"report_window": lambda *args: window,
				"previous_window": lambda *args: previous,
				"_population": lambda metric, cut: (metric, cut["period"], "title"),
				"_completion_count": lambda cut: (
					0
				),  # 11 owns the SQL population; this test covers comparison precision.
				"METRICS": {
					key: () for key in ["courses", "users", "enrollments", "completions", "certifications"]
				},
				"get_system_timezone": lambda: "America/Sao_Paulo",
				"REPORT_ZONE": ZoneInfo("America/Sao_Paulo"),
				"frappe": SimpleNamespace(
					db=SimpleNamespace(
						count=lambda metric, filters: (
							(old if filters == "previous" else 4) if metric == "courses" else 0
						),
						sql=lambda *args, **kwargs: [],
					)
				),
			},
		)
		self.assertAlmostEqual(env["get_statistics"]()["comparison"]["courses"]["percent"], 100 / 3)
		old = 0
		self.assertIsNone(env["get_statistics"]()["comparison"]["courses"]["percent"])
		previous = None
		self.assertEqual(env["get_statistics"]()["comparison"], {})

	def test_report_template_keeps_all_rows_escapes_content_and_formats_percentages(self):
		template = Environment().from_string((ROOT / "templates/analytics_report.html").read_text())
		rows = [[f"Student {index}", "12,50%"] for index in range(250)]
		report = SimpleNamespace(
			kind_label="Curso",
			title="<script>bad()</script>",
			time_frame="Todos",
			generated_on="21/11/2026",
			kpis=[dict(label="Conclusao", value=12.5, suffix="%")],
			funnel=[dict(label="Concluido", count=1, percent=12.5)],
			classes=None,
			table_header=["Nome", "Progresso"],
			table_rows=rows,
			note="Coorte",
		)
		html = template.render(
			report=report,
			rows=rows,
			brand_name="Marca",
			brand_logo=None,
			rtl=False,
			hidden_note="",
			_=lambda value: value,
		)
		self.assertIn("12,50%", html)
		self.assertIn("Student 249", html)
		self.assertIn("&lt;script&gt;bad()&lt;/script&gt;", html)
		self.assertNotIn("<script>", html)

	def test_indicator_report_uses_its_metric_instead_of_students_or_an_empty_funnel(self):
		template = Environment().from_string((ROOT / "templates/analytics_report.html").read_text())
		report = SimpleNamespace(
			kind_label="Registros do indicador",
			title="Matrículas",
			time_frame="Todos",
			generated_on="21/11/2026",
			kpis=[],
			funnel=[],
			classes=None,
			table_header=["Identificador", "Nome"],
			table_rows=[["E1", "Pessoa"]],
			table_title="Matrículas",
			empty_message="Nenhum registro neste indicador e período.",
			note="Coorte",
		)
		context = dict(
			report=report,
			rows=report.table_rows,
			brand_name="Marca",
			brand_logo=None,
			rtl=False,
			hidden_note="",
			_=lambda value: value,
		)
		html = template.render(**context)
		self.assertIn("Matrículas", html)
		self.assertIn("E1", html)
		self.assertNotIn("Completion funnel", html)
		self.assertNotIn("Students", html)
		report.table_rows = []
		context["rows"] = []
		html = template.render(**context)
		self.assertIn(report.empty_message, html)
		self.assertNotIn("No students enrolled", html)

	def test_exports_keep_numeric_excel_cells_and_csv_percentages_with_two_decimals(self):
		response = SimpleNamespace()
		captured = {}

		def make_xlsx(rows, title, **kwargs):
			captured.update(rows=rows, **kwargs)
			return io.BytesIO(b"xlsx")

		report = SimpleNamespace(
			name="course",
			title="Curso",
			time_frame="Todo o periodo",
			generated_on="21/11/2026",
			kpis=[{"label": "Conclusao", "value": 12.5, "suffix": "%"}],
			sheet_header=["Name", "Progress (%)"],
			sheet_rows=[[" =1+1", 12.5]],
		)
		env = functions(
			"lms/analytics_report.py",
			["send_analytics", "report_sheet", "report_xlsx", "_percentage_cells", "sheet_cell"],
			{
				"frappe": SimpleNamespace(
					_dict=dict, response=response, get_cached_value=lambda *args: "Marca"
				),
				"_": lambda value: value,
				"io": io,
				"csv": csv,
				"re": re,
				"Decimal": Decimal,
				"SHEET_COLUMN_WIDTH": 18,
				"FORMULA_PREFIXES": ("=", "+", "-", "@", "\t", "\r"),
				"make_xlsx": make_xlsx,
			},
		)
		env["send_analytics"](report, "csv")
		self.assertTrue(response.filecontent.startswith(b"\xef\xbb\xbf"))
		text = response.filecontent.decode("utf-8-sig")
		self.assertIn("Conclusao (%);12,50\r\n", text)
		self.assertIn("' =1+1;12,50\r\n", text)
		env["report_xlsx"](report)
		self.assertEqual(captured["rows"][-1][1], 12.5)
		self.assertEqual(captured["styles"]["cell_styles"][(7, 1)], [0])
		self.assertEqual(captured["styles"]["styles"][0]["num_format"], "0.00")

	def test_report_embeds_webp_as_bounded_png_without_fetching_remote_or_private_files(self):
		with tempfile.TemporaryDirectory() as directory:
			root = Path(directory)
			Image.new("RGBA", (1800, 300), (20, 30, 40, 0)).save(root / "logo.webp", format="WEBP")
			settings = SimpleNamespace(url="/files/logo.webp")
			env = functions(
				"lms/analytics_report.py",
				["_report_logo"],
				{
					"io": io,
					"frappe": SimpleNamespace(
						get_cached_value=lambda *args: settings.url,
						get_site_path=lambda *args: str(root),
					),
				},
			)
			data = env["_report_logo"]()
			self.assertTrue(data.startswith("data:image/png;base64,"))
			import base64

			with Image.open(io.BytesIO(base64.b64decode(data.split(",", 1)[1]))) as logo:
				self.assertEqual(logo.size, (1200, 200))
				self.assertEqual(logo.mode, "RGBA")
			for url in ["https://example.com/logo.webp", "/private/files/logo.webp", "/files/../secret.png"]:
				settings.url = url
				self.assertIsNone(env["_report_logo"]())
			(root / "bad.png").write_bytes(b"<html>not a logo</html>")
			settings.url = "/files/bad.png"
			self.assertIsNone(env["_report_logo"]())

	def test_record_and_count_queries_share_filters_search_and_stable_server_sort(self):
		calls = []

		def get_all(doctype, **kwargs):
			calls.append(kwargs)
			if kwargs["fields"] == [{"COUNT": "name", "as": "total"}]:
				return [SimpleNamespace(total=1)]
			return [
				SimpleNamespace(
					name="user", title="Tibério IA", username="tiberio", creation=datetime(2026, 2, 1)
				)
			]

		env = functions(
			"lms/statistics.py",
			["_population", "_records"],
			{
				"frappe": SimpleNamespace(throw=throw, get_all=get_all),
				"_": lambda value: value,
				"METRICS": {"users": ("User", [["enabled", "=", 1]], "full_name")},
				"within": lambda filters, field, window: list(filters) + [[field, "<", window["upper"]]],
			},
		)
		rows, total = env["_records"]("users", {"upper": datetime(2026, 2, 2)}, "tiberio%", "title", "asc")
		self.assertEqual(len(rows), total)
		self.assertEqual(calls[1]["fields"], [{"COUNT": "name", "as": "total"}])
		self.assertEqual(calls[0]["filters"], calls[1]["filters"])
		self.assertEqual(calls[0]["or_filters"], calls[1]["or_filters"])
		self.assertEqual(calls[0]["order_by"], "full_name asc, name asc")
		self.assertIn("\\%", calls[0]["or_filters"][0][2])
		with self.assertRaises(Denied):
			env["_records"]("users", {"upper": datetime(2026, 2, 2)}, sort="name; drop table User")

	def test_direct_call_denies_guest_and_student_before_reading_any_metric(self):
		for admin, moderator in [(False, False), (True, False), (False, True)]:
			env = functions(
				"lms/statistics.py",
				["_access"],
				{
					"frappe": SimpleNamespace(throw=throw, PermissionError=Denied),
					"_": lambda value: value,
					"is_site_administrator": lambda: admin,
					"has_moderator_role": lambda: moderator,
				},
			)
			if admin or moderator:
				env["_access"]()
			else:
				with self.assertRaises(Denied):
					env["_access"]()

	def test_formula_protection_after_leading_whitespace(self):
		env = functions(
			"lms/analytics_report.py", ["sheet_cell"], {"FORMULA_PREFIXES": ("=", "+", "-", "@", "\t", "\r")}
		)
		for text in ["=1+1", "  =1+1", "\t@SUM(A1)", "+cmd", "-cmd", "@cmd"]:
			self.assertTrue(env["sheet_cell"](text).startswith("'"))
		self.assertEqual(env["sheet_cell"](1.5), 1.5)


if __name__ == "__main__":
	unittest.main()
