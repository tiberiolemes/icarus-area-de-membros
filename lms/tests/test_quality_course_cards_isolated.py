"""Query-boundary measurement, preserving actor-specific output. No latency/capacity claim."""

import ast
import copy
import json
import os
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from lms.tests.test_quality_ux_isolated import functions


class Row(dict):
	__getattr__ = dict.get
	__setattr__ = dict.__setitem__


class Term:
	def __init__(self, table, column):
		self.table, self.column = table, column

	def __eq__(self, value):
		return ("eq", self, value)

	def isin(self, value):
		return ("in", self, value)


class Table:
	def __init__(self, table):
		self.table = table

	def __getattr__(self, column):
		return Term(self.table, column)


class Query:
	def __init__(self, db):
		self.db, self.conditions, self.fields = db, [], []

	def join(self, *args):
		return self

	def on(self, *args):
		return self

	def select(self, *args):
		self.fields = args
		return self

	def where(self, condition):
		self.conditions.append(condition)
		return self

	def orderby(self, *args):
		return self

	def run(self, **kwargs):
		self.db.calls += 1
		rows = []
		for record in sorted(self.db.records, key=lambda row: (row["parent"], row["idx"])):
			if all(
				record[field.column] == value if op == "eq" else record[field.column] in value
				for op, field, value in self.conditions
			):
				rows.append(
					Row(
						{
							field.column: record["instructor"]
							if field.column == "name"
							else record[field.column]
							for field in self.fields
						}
					)
				)
		return rows


class TestCourseCardQueries(unittest.TestCase):
	def test_baseline_and_batch_have_identical_actor_output_with_one_query_per_page(self):
		root = Path(__file__).resolve().parents[2]
		baseline = (root / "docs/audit/quality/evidence/05-course-card-before.py").read_text()
		measurements = []
		for actor in ("self@example.test", "other@example.test", "Guest"):
			for count in (0, 1, 24):
				db = SimpleNamespace(calls=0, records=[])
				for index in range(count):
					if index % 3 == 0:
						continue
					for idx, author in enumerate(("self@example.test", "colleague@example.test"), 1):
						db.records.append(
							dict(
								parent=f"course-{index}",
								parenttype="LMS Course",
								idx=idx,
								instructor=author,
								username=author.split("@")[0],
								full_name="Nome ORIGINAL IA",
								user_image="/files/image.webp",
								first_name="Nome",
								bio="Bio",
							)
						)
				# A batch row with the same parent must never enter a course card.
				db.records.append(
					dict(
						parent="course-1",
						parenttype="LMS Batch",
						idx=1,
						instructor="foreign@example.test",
						username="foreign",
						full_name="Foreign",
						user_image="",
						first_name="Foreign",
						bio="",
					)
				)
				qb = SimpleNamespace(DocType=Table, from_=lambda table: Query(db))
				env = {
					"frappe": SimpleNamespace(qb=qb, session=SimpleNamespace(user=actor)),
					"check_multicurrency": lambda *args: (0, "BRL"),
					"fmt_money": lambda *args: "0",
				}
				functions(
					"lms/utils.py",
					[
						"get_instructors",
						"get_public_instructors",
						"hide_user_emails",
						"get_course_instructors_in_bulk",
					],
					env,
				)
				exec(compile(baseline, "baseline-course-cards", "exec"), env)
				courses = [Row(name=f"course-{index}", paid_course=0, published=1) for index in range(count)]
				before = env["get_course_card_details"](copy.deepcopy(courses))
				before_calls = db.calls
				functions("lms/utils.py", ["get_course_card_details"], env)
				db.calls = 0
				# The temporal curriculum query belongs to11; this baseline measures instructors only.
				with patch.dict(
					sys.modules,
					{
						"lms.lms.child_content": SimpleNamespace(
							curriculum_progress_query=lambda *args: SimpleNamespace(run=lambda **kwargs: [])
						)
					},
				):
					after = env["get_course_card_details"](copy.deepcopy(courses))
				after_calls = db.calls
				self.assertEqual(before, after)
				self.assertEqual(before_calls, count)
				self.assertEqual(after_calls, int(count > 0))
				measurements.append(
					{
						"actor": actor.split("@")[0],
						"courses": count,
						"before_query_boundaries": before_calls,
						"after_query_boundaries": after_calls,
						"identical_output": True,
					}
				)
		if output := os.getenv("QUALITY_NPLUSONE_RECEIPT"):
			Path(output).write_text(
				json.dumps(
					{
						"kind": "isolated_instructor_query_boundary",
						"real_database_latency_measured": False,
						"temporal_curriculum_query_measured": False,
						"measurements": measurements,
					},
					indent=2,
				)
				+ "\n"
			)


if __name__ == "__main__":
	unittest.main()
