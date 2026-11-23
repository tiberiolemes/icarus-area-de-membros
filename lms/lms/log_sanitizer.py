"""Small local log boundary; request credentials never belong in diagnostics."""

import json
import logging
import re
from urllib.parse import urlsplit, urlunsplit

REDACTED = "********"
SENSITIVE = re.compile(
	r"password|passwd|secret|token|signature|key|pwd|otp|tmp_id|recovery|trusted_device|authorization|cookie|csrf|sid",
	re.I,
)
QUOTED = re.compile(r""""(?:\\.|[^"\\\r\n])*"|'(?:\\.|[^'\\\r\n])*'|["'][^\r\n]*$""", re.M)
URL = re.compile(r"https?://[^\s<>\"']+", re.I)
QUERY = re.compile(r"(?P<path>/[^\s?<>\"']*)\?[^\s<>\"']*")
HEADER = re.compile(r"\b(?:authorization|cookie|set-cookie)\s*[:=][^\r\n]*", re.I)
SECRET_VALUE = re.compile(
	r"\b(?:[\w.-]*(?:password|passwd|secret|token|signature|key|pwd|otp|tmp_id|recovery|trusted_device|csrf)[\w.-]*|sid)\s*[:=]\s*[^\s,;]+",
	re.I,
)
PASSWORD_HASH = re.compile(r"\$(?:argon2(?:id|i|d)|pbkdf2-sha256|2[aby])\$[^\s'\"<>]+")


def sanitized_url(value):
	if not value:
		return value
	try:
		parsed = urlsplit(str(value))
		if parsed.scheme not in ("http", "https") or not parsed.hostname:
			return REDACTED
		host = parsed.hostname
		if ":" in host:
			host = "[" + host + "]"
		if parsed.port:
			host += ":" + str(parsed.port)
		return urlunsplit((parsed.scheme, host, parsed.path, "", ""))
	except (ValueError, TypeError):
		return REDACTED


def sanitize_data(value, depth=0):
	if depth > 12:
		return REDACTED
	if isinstance(value, dict):
		return {
			key: REDACTED
			if isinstance(key, str) and SENSITIVE.search(key)
			else sanitize_data(item, depth + 1)
			for key, item in value.items()
		}
	if isinstance(value, list | tuple):
		return type(value)(sanitize_data(item, depth + 1) for item in value)
	if isinstance(value, str):
		stripped = value.strip()
		if stripped.startswith(("{", "[")):
			try:
				parsed = json.loads(value)
			except (ValueError, RecursionError):
				return REDACTED
			return json.dumps(sanitize_data(parsed, depth + 1), ensure_ascii=False)
		if stripped.lower().startswith(("http://", "https://")):
			return sanitized_url(stripped)
		return sanitize_log_line(value)
	return value


def sanitize_log_line(value):
	# Native nginx error context cannot use log_format: redact its quoted fields before the driver.
	text = QUOTED.sub('"' + REDACTED + '"', str(value))
	text = URL.sub(lambda match: sanitized_url(match[0]), text)
	text = QUERY.sub(lambda match: match["path"] + "?" + REDACTED, text)
	text = HEADER.sub("sensitive-header=" + REDACTED, text)
	text = PASSWORD_HASH.sub(REDACTED, text)
	return SECRET_VALUE.sub("sensitive-value=" + REDACTED, text)


class LogSanitizingFormatter(logging.Formatter):
	"""Apply the same boundary before native rotating file handlers persist a record."""

	def format(self, record):
		try:
			return sanitize_log_line(super().format(record))
		except Exception:
			# Logging's default handleError prints the original record on formatter failure.
			return "ERROR local log sanitizer failed; record withheld"
