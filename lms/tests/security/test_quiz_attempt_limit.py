import json
import secrets
import threading
from unittest.mock import patch

import frappe
from frappe.utils import get_test_client
from pymysql.constants import ER

from lms.lms.doctype.lms_quiz.lms_quiz import create_submission
from lms.lms.doctype.lms_quiz_submission.lms_quiz_submission import (
	LMSQuizSubmission,
	MaximumAttemptsExceededError,
	QuizAttemptConflictError,
	attempt_snapshot_read,
)
from lms.lms.test_helpers import BaseTestUtils
from lms.tests.test_coupon_redemption import THREAD_TIMEOUT, _delete_committed, _delete_committed_user

# How long a worker that has counted waits for the others to count too. The lock keeps
# them out, so with it in place this wait always runs out.
COUNTED_TIMEOUT = 3


class _QuizAttemptFixtures:
	"""Mixed into a savepoint-isolated class and a commit-based one."""

	def _submit(self):
		submission = frappe.get_doc(
			{
				"doctype": "LMS Quiz Submission",
				"quiz": self.quiz,
				"member": self.member,
				"percentage": 0,
				"passing_percentage": 70,
			}
		)
		# nosemgrep: lms-unjustified-ignore-permissions - create_submission saves the same way; the limit is under test
		return submission.insert(ignore_permissions=True)


class TestQuizAttemptLimit(_QuizAttemptFixtures, BaseTestUtils):
	"""max_attempts is a count of the member's submissions. Under REPEATABLE READ a plain
	count is read from the request's snapshot, so parallel submits all see the same
	number. The member's User row serialises them and the count is a locking read."""

	@classmethod
	def setUpClass(cls):
		super().setUpClass()
		hash = frappe.generate_hash(length=6)
		cls.member = cls._create_user(f"qal-{hash}@example.com", "Qal", "Student", ["LMS Student"]).name
		cls.quiz = cls._create_quiz([], title=f"Attempt Limit Quiz {hash}").name

	def _set_max_attempts(self, value):
		frappe.db.set_value("LMS Quiz", self.quiz, "max_attempts", value)

	def test_an_attempt_past_the_limit_is_refused(self):
		self._set_max_attempts(1)
		self._submit()
		with self.assertRaises(MaximumAttemptsExceededError):
			self._submit()

	def test_no_limit_allows_any_number_of_attempts(self):
		self._set_max_attempts(0)
		self._submit()
		self._submit()
		self.assertEqual(
			frappe.db.count("LMS Quiz Submission", {"quiz": self.quiz, "member": self.member}), 2
		)

	def test_only_the_native_snapshot_code_is_translated_to_attempt_conflict(self):
		for code in (ER.CHECKREAD, ER.LOCK_DEADLOCK, ER.BAD_FIELD_ERROR):
			cause = frappe.db.OperationalError(code, "synthetic driver failure")

			def fail():
				try:
					raise cause
				except frappe.db.OperationalError as error:
					raise frappe.QueryDeadlockError(error) from error

			with self.assertRaises(
				QuizAttemptConflictError if code == ER.CHECKREAD else frappe.QueryDeadlockError
			):
				with attempt_snapshot_read():
					fail()


class TestQuizAttemptLimitConcurrency(_QuizAttemptFixtures, BaseTestUtils):
	"""Parallel submits on their own connections, which commit. Skips BaseTestUtils'
	savepoint, as TestCouponRedemptionConcurrency does, and cleans up explicitly."""

	def setUp(self):
		# Skip BaseTestUtils.setUp: these tests commit.
		super(BaseTestUtils, self).setUp()
		frappe.set_user("Administrator")
		hash = frappe.generate_hash(length=6)
		self.member = self._create_user(f"qalc-{hash}@example.com", "Qalc", "Student", ["LMS Student"]).name
		self.other = self._create_user(f"qalc-{hash}-2@example.com", "Qalc", "Other", ["LMS Student"]).name
		self.quiz = self._create_quiz([], title=f"Attempt Limit Race Quiz {hash}").name
		frappe.db.set_value("LMS Quiz", self.quiz, "max_attempts", 1)

	def tearDown(self):
		# Skip BaseTestUtils.tearDown: _in_parallel already cleaned up.
		super(BaseTestUtils, self).tearDown()

	def test_parallel_submits_at_the_limit_admit_one(self):
		"""Without the User lock both workers insert and then each counts the other's
		uncommitted row."""
		outcomes = self._in_parallel([self.member, self.member])

		self.assertEqual(outcomes.count("submitted"), 1)
		self.assertEqual(len(outcomes), 2)
		self.assertIn(next(result for result in outcomes if result != "submitted"), {"exceeded", "conflict"})

	def test_same_learner_with_two_available_attempts_can_explicitly_retry(self):
		frappe.db.set_value("LMS Quiz", self.quiz, "max_attempts", 2)
		outcomes = self._in_parallel([self.member, self.member], limit=2)
		self.assertEqual(outcomes.count("submitted") + outcomes.count("conflict"), 2)
		self.assertGreaterEqual(outcomes.count("submitted"), 1)

	def test_different_learners_submitting_together_both_get_in(self):
		"""Their counts lock the same empty stretch of the member index. Each counts after
		inserting, so one insert waits for the other's commit instead of deadlocking."""
		outcomes = self._in_parallel([self.member, self.other])

		self.assertEqual(outcomes, ["submitted", "submitted"])

	def test_http_conflict_rolls_back_results_progress_and_callbacks(self):
		self.assertTrue(frappe.local.site.startswith("test_") and frappe.conf.mute_emails)
		frappe.set_user("Administrator")
		actor = frappe.get_doc("User", self.other)
		actor.add_roles("Course Creator")
		course = self._create_course("HTTP Quiz Race " + secrets.token_hex(8), instructor=self.other)
		lesson = self._place_in_lesson(course.name, "LMS Quiz", self.quiz)
		self._create_enrollment(self.member, course.name)
		questions = self._create_quiz_questions()
		quiz = frappe.get_doc("LMS Quiz", self.quiz)
		for question in questions:
			quiz.append("questions", {"question": question.name, "marks": 5})
		quiz.save()
		member = frappe.get_doc("User", self.member)
		member.api_key = secrets.token_hex(16)
		member.api_secret = secrets.token_hex(24)
		member.save()
		authorization = "token " + member.api_key + ":" + member.get_password("api_secret")
		frappe.db.commit()
		site = frappe.local.site
		barrier = threading.Barrier(2)
		counted = threading.Barrier(2)
		validate = LMSQuizSubmission.validate_if_max_attempts_exceeded
		on_update = LMSQuizSubmission.on_update
		responses, inserted, callbacks = [], [], []

		def validate_then_wait(doc):
			inserted.append(doc.name)
			validate(doc)
			try:
				counted.wait(timeout=COUNTED_TIMEOUT)
			except threading.BrokenBarrierError:
				pass

		def track_commit(doc):
			on_update(doc)
			frappe.db.after_commit.add(lambda: callbacks.append(doc.name))

		def request():
			barrier.wait(timeout=THREAD_TIMEOUT)
			client = get_test_client()
			response = client.post(
				"/api/method/lms.lms.doctype.lms_quiz.lms_quiz.submit_quiz",
				base_url="http://" + site,
				headers={"Authorization": authorization},
				json={
					"quiz": self.quiz,
					"results": json.dumps(
						[{"question_name": q.name, "answer": ["Option 1"]} for q in questions]
					),
				},
			)
			responses.append(response)

		try:
			with (
				patch("frappe.app.get_site_name", return_value=site),
				patch.object(LMSQuizSubmission, "validate_if_max_attempts_exceeded", validate_then_wait),
				patch.object(LMSQuizSubmission, "on_update", track_commit),
			):
				threads = [threading.Thread(target=request) for _ in range(2)]
				for thread in threads:
					thread.start()
				for thread in threads:
					thread.join(timeout=THREAD_TIMEOUT)
					self.assertFalse(thread.is_alive())
			self.assertEqual(len(responses), 2)
			success = [response for response in responses if response.status_code == 200]
			self.assertEqual(
				len(success), 1, [(response.status_code, response.json) for response in responses]
			)
			rejected = next(response for response in responses if response.status_code != 200)
			self.assertIn(
				rejected.json.get("exc_type"), {"QuizAttemptConflictError", "MaximumAttemptsExceededError"}
			)
			if rejected.json["exc_type"] == "QuizAttemptConflictError":
				self.assertEqual(rejected.status_code, 409)
				self.assertNotIn("CHECKREAD", rejected.get_data(as_text=True))
				self.assertNotIn("Record has changed", rejected.get_data(as_text=True))
			frappe.db.rollback()
			name = success[0].json["message"]["submission"]
			self.assertEqual(frappe.get_all("LMS Quiz Submission", {"quiz": self.quiz}, pluck="name"), [name])
			self.assertEqual(callbacks, [name])
			self.assertEqual(frappe.db.count("LMS Quiz Result", {"parent": name}), 3)
			for rejected_name in set(inserted) - {name}:
				self.assertEqual(frappe.db.count("LMS Quiz Result", {"parent": rejected_name}), 0)
				self.assertEqual(frappe.db.count("Notification Log", {"document_name": rejected_name}), 0)
			self.assertEqual(
				frappe.db.count(
					"LMS Course Progress",
					{"course": course.name, "member": self.member, "lesson": lesson.name},
				),
				1,
			)
			# A completely new HTTP transaction reads the committed limit, rather than
			# reusing the snapshot rejected above. This is an explicit new POST.
			with patch("frappe.app.get_site_name", return_value=site):
				client = get_test_client()
				response = client.post(
					"/api/method/lms.lms.doctype.lms_quiz.lms_quiz.submit_quiz",
					base_url="http://" + site,
					headers={"Authorization": authorization},
					json={"quiz": self.quiz},
				)
			self.assertEqual(response.json.get("exc_type"), "MaximumAttemptsExceededError")
			frappe.db.rollback()
			self.assertEqual(frappe.db.count("LMS Quiz Submission", {"quiz": self.quiz}), 1)
			print(
				json.dumps(
					{
						"http_quiz_race": [
							{"status": row.status_code, "error_type": row.json.get("exc_type")}
							for row in responses
						],
						"confirmed_submissions": 1,
						"confirmed_children": 3,
						"confirmed_progress_rows": 1,
						"committed_callbacks": len(callbacks),
						"new_transaction_error_type": response.json.get("exc_type"),
					}
				)
			)
		finally:
			frappe.db.rollback()
			frappe.set_user("Administrator")
			for doctype, filters in (
				("Notification Log", {"document_type": "LMS Quiz Submission", "for_user": self.member}),
				("LMS Course Progress", {"course": course.name}),
				("LMS Enrollment", {"course": course.name}),
				("Lesson Reference", {"lesson": lesson.name}),
				("Chapter Reference", {"parent": course.name}),
			):
				frappe.db.delete(doctype, filters)
			# Only these test-owned fixture IDs; no site-wide reset or production data.
			for doctype, name in (
				("Course Lesson", lesson.name),
				("Course Chapter", lesson.chapter),
				("LMS Course", course.name),
			):
				for field in frappe.get_meta(doctype).get_table_fields():
					frappe.db.delete(field.options, {"parent": name, "parenttype": doctype})
				frappe.db.delete(doctype, {"name": name})
			self._commit_cleanup()
			for question in questions:
				_delete_committed("LMS Question", question.name)
			frappe.db.commit()

	def _in_parallel(self, members, limit=1) -> list:
		"""Submit once per member, each on its own connection. A worker that has counted
		waits for the rest to count before it commits."""
		workers = len(members)
		site = frappe.local.site
		# The workers run on their own connections, so the fixtures have to be
		# visible outside this test's transaction.
		frappe.db.commit()  # nosemgrep
		started = threading.Barrier(workers)
		counted = threading.Barrier(workers)
		validate = LMSQuizSubmission.validate_if_max_attempts_exceeded
		outcomes = []

		def count_then_wait(doc):
			validate(doc)
			try:
				counted.wait(timeout=COUNTED_TIMEOUT)
			except threading.BrokenBarrierError:
				pass  # the others are queued on a lock this worker holds

		def run(member):
			try:
				frappe.init(site=site)
				frappe.connect()
				try:
					frappe.set_user(member)
					started.wait(timeout=THREAD_TIMEOUT)
					create_submission(self.quiz, [], 0, 70)
					frappe.db.commit()  # nosemgrep
					outcomes.append("submitted")
				finally:
					frappe.db.rollback()
					frappe.destroy()
			except MaximumAttemptsExceededError:
				outcomes.append("exceeded")
			except QuizAttemptConflictError:
				outcomes.append("conflict")
			except Exception as e:  # surfaced in the assertion
				import traceback

				traceback.print_exc()
				outcomes.append(repr(e))
				started.abort()

		threads = [threading.Thread(target=run, args=(member,)) for member in members]
		try:
			with patch.object(LMSQuizSubmission, "validate_if_max_attempts_exceeded", count_then_wait):
				for thread in threads:
					thread.start()
				for thread in threads:
					thread.join(timeout=THREAD_TIMEOUT)
					self.assertFalse(thread.is_alive(), "a worker did not finish")
			frappe.db.rollback()
			committed = frappe.db.count("LMS Quiz Submission", {"quiz": self.quiz})
			self.assertEqual(committed, outcomes.count("submitted"))
			self.assertEqual(
				frappe.db.count(
					"LMS Quiz Result",
					{
						"parent": [
							"in",
							frappe.get_all("LMS Quiz Submission", {"quiz": self.quiz}, pluck="name"),
						]
					},
				),
				0,
			)
			if len(set(members)) == 1:
				frappe.set_user(self.member)
				if committed < limit:
					create_submission(self.quiz, [], 0, 70)
					frappe.db.commit()
				with self.assertRaises(MaximumAttemptsExceededError):
					create_submission(self.quiz, [], 0, 70)
				frappe.db.rollback()
				self.assertEqual(frappe.db.count("LMS Quiz Submission", {"quiz": self.quiz}), limit)
			return outcomes
		finally:
			self._commit_cleanup()

	def _commit_cleanup(self):
		"""The fixtures and submissions were committed, so rolling back the test cannot
		remove them."""
		frappe.set_user("Administrator")
		for name in frappe.get_all("LMS Quiz Submission", {"quiz": self.quiz}, pluck="name"):
			_delete_committed("LMS Quiz Submission", name)
		_delete_committed("LMS Quiz", self.quiz)
		_delete_committed_user(self.member)
		_delete_committed_user(self.other)
		frappe.db.commit()  # nosemgrep
