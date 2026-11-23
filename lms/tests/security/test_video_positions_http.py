"""Native HTTP/MariaDB evidence for every playback-position writer and rollback."""

import json
import secrets
import threading
import unittest
from concurrent.futures import ThreadPoolExecutor
from unittest.mock import patch

import frappe
from frappe.utils import get_test_client
from MySQLdb import IntegrityError
from pymysql.constants import ER

from lms.lms import video_position
from lms.lms.doctype.lms_video_watch_duration.lms_video_watch_duration import LMSVideoWatchDuration
from lms.lms.test_helpers import BaseTestUtils
from lms.tests.course_lifecycle_helpers import purge_course_fixture
from lms.tests.test_coupon_redemption import _delete_committed_user

SOURCE = "https://www.youtube.com/watch?v=Qc08Video01"
SECOND = "https://vimeo.com/123456789"
SAVE = "/api/method/lms.lms.api.track_video_watch_duration"
READ = "/api/method/lms.lms.api.get_video_positions"
RESOURCE = "/api/resource/LMS Video Watch Duration"


class TestVideoPositionsHTTP(unittest.TestCase):
	def test_removed_video_remains_history_without_blocking_the_current_lesson(self):
		self.assertEqual(self.save(3).status_code, 200)
		before = self.rows()[0]
		frappe.set_user("Administrator")
		lesson = frappe.get_doc("Course Lesson", self.lessons[0])
		lesson.content = json.dumps(
			{"blocks": [{"type": "paragraph", "data": {"text": "Current synthetic content"}}]}
		)
		lesson.save()
		frappe.db.commit()
		read = self.request(READ, {"lesson": self.lessons[0]})
		self.assertEqual(read.status_code, 200)
		self.assertEqual(read.json["message"], [])
		self.assertFalse(read.json.get("_server_messages"))
		response = self.request(
			"/api/method/lms.lms.utils.get_lesson", {"course": self.course, "chapter": 1, "lesson": 1}
		)
		self.assertEqual(response.status_code, 200)
		self.assertEqual(response.json["message"]["videos"], [])
		after = self.rows()[0]
		self.assertEqual(dict(after), dict(before))

	def setUp(self):
		assert frappe.local.site.startswith("test_") and frappe.conf.mute_emails and frappe.conf.allow_tests
		self.site = frappe.local.site
		self.assertTrue(frappe.in_test)
		frappe.set_user("Administrator")
		suffix = secrets.token_hex(8)
		self.members, self.tokens, self.files = [], [], []
		for index in range(2):
			member = BaseTestUtils._create_user(
				f"watch08-{index}-{suffix}@example.test", "Watch08", "Student", ["LMS Student"]
			)
			member.api_key, member.api_secret = secrets.token_hex(16), secrets.token_hex(24)
			member.save()
			self.members.append(member.name)
			self.tokens.append("token " + member.api_key + ":" + member.get_password("api_secret"))
		self.course = BaseTestUtils._create_course("Watch08 " + suffix, "Administrator").name
		chapter = BaseTestUtils._create_chapter("Watch08 Chapter " + suffix, self.course)
		content = json.dumps(
			{
				"blocks": [
					{"type": "embed", "data": {"service": service, "embed": source}}
					for service, source in [("youtube", SOURCE), ("vimeo", SECOND)]
				]
			}
		)
		self.lessons = [
			BaseTestUtils._create_outline_lesson(
				f"Watch08 Lesson {index} {suffix}", chapter.name, self.course, content
			).name
			for index in range(2)
		]
		for member in self.members:
			BaseTestUtils._create_enrollment(member, self.course)
		frappe.db.commit()

	def tearDown(self):
		frappe.db.rollback()
		frappe.set_user("Administrator")
		purge_course_fixture(self.course)
		for name in self.files:
			if frappe.db.exists("File", name):
				frappe.delete_doc("File", name, ignore_permissions=True, force=True)
		for member in self.members:
			_delete_committed_user(member)
		frappe.db.commit()

	def request(self, path, data=None, actor=0, method="post"):
		with patch("frappe.app.get_site_name", return_value=self.site):
			return getattr(get_test_client(), method)(
				path, base_url="http://" + self.site, headers={"Authorization": self.tokens[actor]}, json=data
			)

	def save(self, seconds, source=SOURCE, lesson=None, actor=0):
		return self.request(
			SAVE,
			{"lesson": lesson or self.lessons[0], "videos": [{"source": source, "watch_time": seconds}]},
			actor,
		)

	def rows(self, lesson=None, actor=0):
		frappe.db.rollback()
		return frappe.get_all(
			"LMS Video Watch Duration",
			{"lesson": lesson or self.lessons[0], "member": self.members[actor]},
			["name", "source", "watch_time", "source_identity"],
		)

	def race(self, send, provider_barrier=False):
		barrier, seen = threading.Barrier(2), set()
		original = video_position.canonical_source

		def synchronized_source(*args, **kwargs):
			result = original(*args, **kwargs)
			thread = threading.get_ident()
			if thread not in seen:
				seen.add(thread)
				barrier.wait(timeout=10)
			return result

		def start(index):
			if not provider_barrier:
				barrier.wait(timeout=10)
			return send(index)

		with (
			patch.object(
				video_position, "canonical_source", synchronized_source if provider_barrier else original
			),
			ThreadPoolExecutor(max_workers=2) as pool,
		):
			return list(pool.map(start, range(2), timeout=30))

	def assert_position_race(self, existing):
		if existing:
			self.assertEqual(self.save(3).status_code, 200)
		responses = self.race(lambda index: self.save(7 + index), provider_barrier=True)
		confirmed = []
		for index, response in enumerate(responses):
			if response.status_code == 200:
				confirmed.append(7 + index)
			else:
				self.assertEqual(
					(response.status_code, response.json.get("exc_type")), (409, "VideoPositionConflictError")
				)
				self.assertNotIn("CHECKREAD", response.get_data(as_text=True))
		self.assertTrue(confirmed)
		rows = self.rows()
		self.assertEqual(len(rows), 1)
		self.assertEqual(float(rows[0].watch_time), max(confirmed))
		self.assertEqual(self.save(8).status_code, 200)
		self.assertEqual(self.save(5).status_code, 200)
		self.assertEqual(float(self.rows()[0].watch_time), 8)
		print(
			json.dumps(
				{
					"video_position_race_existing": existing,
					"http": [
						{"status": r.status_code, "error_type": r.json.get("exc_type")} for r in responses
					],
					"rows": 1,
					"confirmed_maximum": max(confirmed),
					"explicit_recovery": 8,
				}
			)
		)

	def test_absent_position_race(self):
		self.assert_position_race(False)

	def test_existing_position_race(self):
		self.assert_position_race(True)

	def test_generic_rest_constraint_source_and_monotonicity(self):
		data = {
			"lesson": self.lessons[0],
			"member": self.members[0],
			"source": SOURCE,
			"watch_time": 3,
			"source_identity": "forged",
		}
		responses = self.race(lambda _: self.request(RESOURCE, data))
		self.assertEqual(sum(row.status_code == 200 for row in responses), 1)
		denied = next(row for row in responses if row.status_code != 200)
		self.assertIn(
			(denied.status_code, denied.json.get("exc_type")),
			{(409, "VideoPositionConflictError"), (417, "UniqueValidationError")},
		)
		row = self.rows()[0]
		self.assertEqual(
			row.source_identity, video_position.position_identity(self.members[0], self.lessons[0], SOURCE)
		)
		self.assertEqual(
			self.request(RESOURCE + "/" + row.name, {"source": SECOND}, method="put").status_code, 403
		)
		for seconds in (-1, 1):
			self.assertEqual(
				self.request(RESOURCE + "/" + row.name, {"watch_time": seconds}, method="put").status_code,
				417,
			)
		self.assertEqual(
			self.request(RESOURCE + "/" + row.name, {"watch_time": 6}, method="put").status_code, 200
		)
		self.assertEqual(float(self.rows()[0].watch_time), 6)
		frappe.db.savepoint("watch08_unique")
		try:
			with self.assertRaises(IntegrityError) as failure:
				frappe.db.sql(
					"INSERT INTO `tabLMS Video Watch Duration` (name,source_identity) VALUES (%s,%s)",
					("watch08-duplicate-" + secrets.token_hex(8), row.source_identity),
				)
			self.assertEqual(failure.exception.args[0], ER.DUP_ENTRY)
		finally:
			frappe.db.rollback(save_point="watch08_unique")

	def test_batch_failure_rolls_back_first_position_and_callbacks(self):
		self.assertEqual(self.save(3).status_code, 200)
		self.assertEqual(self.save(4, SECOND).status_code, 200)
		original, callbacks = LMSVideoWatchDuration.validate, []

		def validate(doc):
			original(doc)
			if doc.source == SECOND:
				frappe.throw("Synthetic second position failure")

		def after_update(doc):
			frappe.db.after_commit.add(lambda: callbacks.append(doc.name))

		with (
			patch.object(LMSVideoWatchDuration, "validate", validate),
			patch.object(LMSVideoWatchDuration, "on_update", after_update, create=True),
		):
			response = self.request(
				SAVE,
				{
					"lesson": self.lessons[0],
					"videos": [{"source": SOURCE, "watch_time": 8}, {"source": SECOND, "watch_time": 9}],
				},
			)
		self.assertEqual((response.status_code, response.json.get("exc_type")), (417, "ValidationError"))
		self.assertEqual({row.source: float(row.watch_time) for row in self.rows()}, {SOURCE: 3, SECOND: 4})
		self.assertEqual(callbacks, [])
		self.assertEqual(frappe.db.count("LMS Course Progress", {"course": self.course}), 0)

	def test_actors_lessons_sources_and_invalid_input(self):
		for actor, lesson, source, seconds in [
			(0, self.lessons[0], SOURCE, 3),
			(1, self.lessons[0], SOURCE, 4),
			(0, self.lessons[1], SOURCE, 5),
			(0, self.lessons[0], SECOND, 6),
		]:
			self.assertEqual(self.save(seconds, source, lesson, actor).status_code, 200)
		self.assertEqual({row.source: float(row.watch_time) for row in self.rows()}, {SOURCE: 3, SECOND: 6})
		self.assertEqual(float(self.rows(actor=1)[0].watch_time), 4)
		self.assertEqual(float(self.rows(self.lessons[1])[0].watch_time), 5)
		for value in [-1, float("nan"), float("inf"), True, {}, None]:
			self.assertEqual(self.save(value).status_code, 417)
		self.assertEqual(self.save(7, "https://www.youtube.com/watch?v=Qc08Other01").status_code, 403)
		self.assertEqual(
			self.request(
				RESOURCE,
				{"lesson": self.lessons[0], "member": self.members[1], "source": SOURCE, "watch_time": 99},
			).status_code,
			403,
		)
		read = self.request(READ, {"lesson": self.lessons[0]})
		self.assertEqual(read.status_code, 200)
		self.assertEqual(
			{row["source"]: row["watch_time"] for row in read.json["message"]}, {SOURCE: 3, SECOND: 6}
		)

	def test_private_file_reference_owner_field_and_case_are_exact(self):
		def attach(lesson, field="content", owner="Administrator"):
			frappe.set_user(owner)
			row = frappe.get_doc(
				{
					"doctype": "File",
					"file_name": "watch08-" + secrets.token_hex(12) + ".mp4",
					"is_private": 1,
					"content": b"\x00\x00\x00\x18ftypisom" + secrets.token_bytes(32),
					"attached_to_doctype": "Course Lesson" if lesson else None,
					"attached_to_name": lesson,
					"attached_to_field": field if lesson else None,
				}
			).insert(ignore_permissions=True)
			self.files.append(row.name)
			frappe.set_user("Administrator")
			return row

		first, other, instructor, personal = (
			attach(self.lessons[0]),
			attach(self.lessons[1]),
			attach(self.lessons[0], "instructor_content"),
			attach(None, owner=self.members[0]),
		)
		# Even a pasted personal URL cannot manufacture the uploader's authority.
		lesson = frappe.get_doc("Course Lesson", self.lessons[0])
		lesson.content = json.dumps(
			{"blocks": [{"type": "upload", "data": {"file_url": personal.file_url, "file_type": "mp4"}}]}
		)
		lesson.save()
		frappe.db.commit()
		self.assertEqual(self.save(3, first.file_url).status_code, 200)
		case_alias = first.file_url.rsplit("/", 1)[0] + "/" + first.file_url.rsplit("/", 1)[1].upper()
		for source in (other.file_url, instructor.file_url, personal.file_url, case_alias):
			self.assertEqual(self.save(4, source).status_code, 403)
		self.assertEqual(self.rows()[0].source, first.file_url)

	def test_source_keys_preserve_case_and_never_store_provider_signatures(self):
		frappe.set_user("Administrator")
		lesson = frappe.get_doc("Course Lesson", self.lessons[0])
		lower = SOURCE.lower()
		lesson.content = json.dumps(
			{
				"blocks": [
					{"type": "embed", "data": {"service": "youtube", "embed": source}}
					for source in (SOURCE, lower)
				]
				+ [{"type": "embed", "data": {"service": "vimeo", "embed": SECOND}}]
			}
		)
		lesson.save()
		frappe.db.commit()
		self.assertEqual(self.save(3).status_code, 200)
		self.assertEqual(self.save(4, lower).status_code, 200)
		signed = "https://player.vimeo.com/video/123456789?h=synthetic-private-signature"
		self.assertEqual(
			self.request(
				RESOURCE,
				{"lesson": self.lessons[0], "member": self.members[0], "source": signed, "watch_time": 5},
			).status_code,
			200,
		)
		rows = self.rows()
		self.assertEqual({row.source for row in rows}, {SOURCE, lower, SECOND})
		self.assertEqual(len({row.source_identity for row in rows}), 3)

	def test_snapshot_classifier_does_not_hide_other_sql_errors(self):
		for code in (ER.CHECKREAD, ER.LOCK_DEADLOCK, ER.BAD_FIELD_ERROR):
			cause = frappe.db.OperationalError(code, "synthetic driver failure")
			with self.assertRaises(
				video_position.VideoPositionConflictError
				if code == ER.CHECKREAD
				else frappe.QueryDeadlockError
			):
				with video_position.position_snapshot_read():
					try:
						raise cause
					except frappe.db.OperationalError as error:
						raise frappe.QueryDeadlockError(error) from error

	def test_patch_is_noop_and_previews_all_legacy_duplicates_before_writing(self):
		self.assertEqual(self.save(3).status_code, 200)
		row = self.rows()[0]
		for _ in range(2):
			self.assertEqual(video_position.backfill_identities(), {"rows": 1, "updated": 0})
		legacy = frappe.copy_doc(frappe.get_doc("LMS Video Watch Duration", row.name))
		legacy.name = "legacy-watch08-" + secrets.token_hex(8)
		legacy.source_identity = None
		legacy.db_insert()
		fields = ["name", "source_identity", "source", "watch_time", "modified"]
		before = frappe.get_all("LMS Video Watch Duration", fields=fields, order_by="name")
		with self.assertRaises(frappe.ValidationError):
			video_position.backfill_identities()
		self.assertEqual(frappe.get_all("LMS Video Watch Duration", fields=fields, order_by="name"), before)

	def test_concurrent_other_actors_lessons_and_sources_do_not_mix(self):
		responses = self.race(
			lambda index: self.save(3 + index, SOURCE, self.lessons[index], index), provider_barrier=True
		)
		self.assertEqual([row.status_code for row in responses], [200, 200])
		self.assertEqual(float(self.rows()[0].watch_time), 3)
		self.assertEqual(float(self.rows(self.lessons[1], actor=1)[0].watch_time), 4)
		responses = self.race(
			lambda index: self.save(7 + index, (SOURCE, SECOND)[index]), provider_barrier=True
		)
		self.assertEqual([row.status_code for row in responses], [200, 200])
		self.assertEqual({row.source: float(row.watch_time) for row in self.rows()}, {SOURCE: 7, SECOND: 8})

	def test_existing_players_keep_declared_remote_signed_and_legacy_sources(self):
		frappe.set_user("Administrator")
		lesson = frappe.get_doc("Course Lesson", self.lessons[0])
		bunny = "https://player.mediadelivery.net/embed/123/abc-def?token=synthetic-signature"
		cloudflare = "https://customer-demo.cloudflarestream.com/abc/iframe?token=synthetic-signature"
		remote = "https://video.example.test/Áula.mp4?signature=" + "synthetic" * 30
		macro = "https://video.example.test/legacy.mp4?signature=synthetic-macro"
		lesson.content = json.dumps(
			{
				"blocks": [
					{"type": "embed", "data": {"service": "youtube", "embed": "Qc08Video01"}},
					{"type": "embed", "data": {"service": "vimeo", "embed": SECOND}},
					{"type": "embed", "data": {"service": "bunnyStream", "embed": bunny}},
					{"type": "embed", "data": {"service": "cloudflareStream", "embed": cloudflare}},
					{"type": "upload", "data": {"file_type": "mp4", "file_url": remote}},
				]
			}
		)
		lesson.body = '{{ YouTubeVideo("Qc08Video01") }}\n{{ Video("' + macro + '") }}'
		lesson.save()
		frappe.db.commit()
		bindings = video_position.remote_source_bindings(lesson)
		self.assertEqual(len(bindings), 3)
		for source in (
			SOURCE,
			"https://youtu.be/Qc08Video01?t=3",
			"https://player.vimeo.com/video/123456789?h=synthetic",
			bunny,
			cloudflare,
			remote,
			macro,
		):
			self.assertEqual(self.save(3, source).status_code, 200)
		rows = self.rows()
		self.assertEqual(len(rows), 6)
		self.assertTrue(
			all(
				len(row.source) <= 140 and "signature" not in row.source and "token=" not in row.source
				for row in rows
			)
		)
		for identity in bindings.values():
			self.assertEqual(self.save(4, identity).status_code, 200)
		self.assertEqual(self.save(9, "external:" + "f" * 64).status_code, 403)
