import copy
import json
import logging
import unittest
from unittest.mock import patch

from lms.lms.log_sanitizer import (
	REDACTED,
	LogSanitizingFormatter,
	sanitize_data,
	sanitize_log_line,
	sanitized_url,
)


class LogBoundaryTests(unittest.TestCase):
	def test_native_signatures_are_credentials_in_structures_and_embedded_text(self):
		for key in ("signature", "_signature", "_SIGNATURE", "request_signature"):
			with self.subTest(key=key):
				value = {
					key: "MARKER-direct",
					"nested": [{key: "MARKER-list", "safe_count": 11}],
					"data": json.dumps({key: "MARKER-json", "safe_count": 11}),
					"context": "verified_command " + key + "=MARKER-text safe_count=11",
					"safe_count": 11,
				}
				before = copy.deepcopy(value)
				clean = sanitize_data(value)
				self.assertNotIn("MARKER", json.dumps(clean))
				self.assertEqual(clean["safe_count"], 11)
				self.assertEqual(clean["nested"][0]["safe_count"], 11)
				self.assertEqual(json.loads(clean["data"])["safe_count"], 11)
				self.assertIn("safe_count=11", clean["context"])
				self.assertEqual(value, before)
				line = "ERROR correlation=qc08 " + key + "=MARKER-text safe_count=11"
				self.assertNotIn("MARKER", sanitize_log_line(line))
				formatter = LogSanitizingFormatter("%(levelname)s %(message)s")
				record = logging.LogRecord("qc08", logging.ERROR, __file__, 1, "%s", (line,), None)
				formatted = formatter.format(record)
				self.assertNotIn("MARKER", formatted)
				self.assertIn("ERROR correlation=qc08", formatted)
				self.assertIn("safe_count=11", formatted)

	def test_unquoted_native_password_hash_diffs_never_reach_a_destination(self):
		for prefix in ("$argon2id$", "$argon2i$", "$argon2d$", "$pbkdf2-sha256$", "$2b$"):
			value = prefix + "synthetic-MARKER-for-log-test"
			with self.subTest(prefix=prefix):
				self.assertNotIn("MARKER", sanitize_log_line("- " + value + "\n+ " + value))
				self.assertNotIn("MARKER", json.dumps(sanitize_data({"value": value})))

	def test_native_upstream_error_keeps_level_errno_and_cause_without_quoted_context(self):
		line = '2026 [error] 1#1: *2 connect() failed (111: Connection refused), request: "GET /api/method/ping?key=MARKER1&token=MARKER2 HTTP/1.1", upstream: "http://backend:8000/api?key=MARKER3", referrer: "http://academy/login?key=MARKER4"'
		clean = sanitize_log_line(line)
		self.assertNotIn("MARKER", clean)
		self.assertIn("[error]", clean)
		self.assertIn("111: Connection refused", clean)

	def test_safe_structured_request_context_remains_useful(self):
		line = "2026 request_id=correlation123 method=GET uri=/api/method/ping status=502 time=0.010 upstream_status=502\n"
		self.assertEqual(sanitize_log_line(line), line)

	def test_escaped_and_truncated_native_fields_fail_closed(self):
		for line in (
			'request: "GET /api?key=MARKER\\"escaped HTTP/1.1"',
			'referrer: "http://example/login?key=MARKER',
			'request: "GET /api?key=%22MARKER%22 HTTP/1.1"',
		):
			with self.subTest(line=line):
				self.assertNotIn("MARKER", sanitize_log_line(line))

	def test_headers_and_unquoted_query_are_redacted(self):
		for line in (
			"GET /api?key=MARKER1&token=MARKER2 HTTP/1.1",
			"Authorization: Bearer MARKER",
			"Cookie: sid=MARKER",
			"url=http://user:MARKER@host/reset?key=MARKER",
			"new_password=MARKER",
		):
			self.assertNotIn("MARKER", sanitize_log_line(line))

	def test_recursive_fields_serialized_payload_and_urls_preserve_input(self):
		value = {
			"doctype": "User",
			"data": json.dumps(
				{"new_password": "MARKER", "nested": [{"api_secret": "MARKER", "enabled": 1}]}
			),
			"options": {"headers": {"Authorization": "Bearer MARKER"}},
			"referrer": "http://user:MARKER@host/login?key=MARKER#MARKER",
		}
		before = copy.deepcopy(value)
		clean = sanitize_data(value)
		self.assertNotIn("MARKER", json.dumps(clean))
		self.assertEqual(clean["doctype"], "User")
		self.assertEqual(json.loads(clean["data"])["nested"][0]["enabled"], 1)
		self.assertEqual(value, before)
		self.assertEqual(clean["referrer"], "http://host/login")

	def test_malformed_structures_cycles_and_urls_never_return_raw_fallback(self):
		self.assertEqual(sanitize_data('{"password":"MARKER"'), REDACTED)
		self.assertEqual(sanitized_url("http://[MARKER"), REDACTED)
		value = {}
		value["next"] = value
		self.assertIn(REDACTED, str(sanitize_data(value)))

	def test_file_formatter_sanitizes_message_arguments_traceback_and_its_own_failure(self):
		formatter = LogSanitizingFormatter("%(levelname)s %(message)s")
		record = logging.LogRecord("qc08", logging.ERROR, __file__, 1, "GET %s", ("/api?key=MARKER",), None)
		self.assertEqual(formatter.format(record), "ERROR GET /api?********")
		try:
			raise ValueError("url=http://host/login?key=MARKER")
		except ValueError:
			import sys

			record.exc_info = sys.exc_info()
		self.assertNotIn("MARKER", formatter.format(record))
		with patch("lms.lms.log_sanitizer.sanitize_log_line", side_effect=RuntimeError("MARKER")):
			self.assertEqual(formatter.format(record), "ERROR local log sanitizer failed; record withheld")


if __name__ == "__main__":
	unittest.main()
