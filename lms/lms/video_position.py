"""Canonical media identities and atomic, monotonic learner playback positions."""

import hashlib
import json
import math
import re
from contextlib import contextmanager
from urllib.parse import parse_qs, quote, urljoin, urlsplit, urlunsplit

import frappe
from frappe import _
from pymysql.constants import ER


class VideoPositionConflictError(frappe.ValidationError):
	http_status_code = 409


class VideoSourceUnavailableError(frappe.PermissionError):
	pass


@contextmanager
def position_snapshot_read():
	try:
		yield
	except frappe.QueryDeadlockError as error:
		cause = error.__cause__
		if isinstance(cause, frappe.db.OperationalError) and cause.args and cause.args[0] == ER.CHECKREAD:
			raise VideoPositionConflictError(
				_(
					"The video position changed in another request. Review the saved position before saving again."
				)
			) from error
		raise


def position_time(value):
	if isinstance(value, bool) or not isinstance(value, (str, int, float)):
		frappe.throw(_("Video position must be a finite, non-negative number."))
	try:
		seconds = float(value)
	except (ValueError, TypeError, OverflowError):
		seconds = float("nan")
	if not math.isfinite(seconds) or seconds < 0:
		frappe.throw(_("Video position must be a finite, non-negative number."))
	return seconds


def provider_source(source):
	"""Stable provider identifiers only: never persist embed signatures or credentials."""
	if not isinstance(source, str):
		return None
	if bare := re.fullmatch(r"([\w-]{11})(?:[?&].*)?", source, flags=re.ASCII):
		return "https://www.youtube.com/watch?v=" + bare.group(1)
	try:
		url = urlsplit(source)
		if url.scheme != "https" or url.username or url.password or url.port not in (None, 443):
			return None
		host = url.hostname
		if host in ("youtube.com", "www.youtube.com", "www.youtube-nocookie.com", "youtu.be"):
			values = parse_qs(url.query).get("v", [])
			if url.path == "/watch" and len(values) != 1:
				return None
			video = values[0] if url.path == "/watch" else url.path.rstrip("/").rsplit("/", 1)[-1]
			if re.fullmatch(r"[\w-]{11}", video, flags=re.ASCII):
				return "https://www.youtube.com/watch?v=" + video
		if host in ("vimeo.com", "www.vimeo.com", "player.vimeo.com"):
			video = url.path.rstrip("/").rsplit("/", 1)[-1]
			if re.fullmatch(r"[0-9]+", video):
				return "https://vimeo.com/" + video
		if host in ("iframe.mediadelivery.net", "player.mediadelivery.net"):
			if re.fullmatch(r"/embed/[0-9]+/[A-Za-z0-9-]+", url.path):
				return "https://iframe.mediadelivery.net" + url.path
	except ValueError:
		pass
	return None


def _strings(value):
	if isinstance(value, str):
		yield value
	elif isinstance(value, dict):
		for item in value.values():
			yield from _strings(item)
	elif isinstance(value, list):
		for item in value:
			yield from _strings(item)


def _remote_url(value):
	try:
		url = urlsplit(value)
		if url.scheme not in ("http", "https") or not url.hostname or url.username or url.password:
			return None
		if any(ord(char) < 32 or ord(char) == 127 for char in value):
			return None
		host = url.hostname.lower()
		if ":" in host:
			host = "[" + host + "]"
		else:
			host = host.encode("idna").decode("ascii")
		if url.port and (url.scheme, url.port) not in {("http", 80), ("https", 443)}:
			host += ":" + str(url.port)
		path = urlsplit(urljoin(url.scheme + "://" + host, url.path or "/")).path
		return urlunsplit(
			(
				url.scheme,
				host,
				quote(path, safe="/%:@!$&'()*+,;=~-._"),
				quote(url.query, safe="/%?:@!$&'()*+,;=~-._"),
				"",
			)
		)
	except (TypeError, ValueError):
		return None


def remote_source_bindings(doc):
	"""Opaque positions for declared remote players, including long signed video URLs."""
	from bs4 import BeautifulSoup
	from frappe.utils import get_url

	from lms.lms.md import find_macros
	from lms.lms.utils import get_editorjs_blocks

	urls = [value for kind, value in find_macros(doc.get("body")) if kind == "Video"]
	for tag in BeautifulSoup(doc.get("body") or "", "html.parser").select("video[src], video source[src]"):
		urls.append(tag.get("src"))
	for block in get_editorjs_blocks(doc.get("content")):
		data = block.get("data") or {}
		if block.get("type") == "embed" and data.get("service") in {
			"youtube",
			"vimeo",
			"bunnyStream",
			"cloudflareStream",
		}:
			urls.extend(data.get(field) for field in ("embed", "source"))
		elif block.get("type") == "upload" and str(data.get("file_type", "")).lower() in {
			"mp4",
			"webm",
			"mov",
			"mkv",
			"m4v",
		}:
			urls.append(data.get("file_url"))
	local_hosts = {frappe.local.site, urlsplit(get_url()).hostname}
	request = getattr(frappe.local, "request", None)
	if request:
		local_hosts.add(urlsplit(request.url).hostname)
	bindings = {}
	for value in urls:
		if not isinstance(value, str) or not value or len(value) > 4096 or provider_source(value):
			continue
		url = _remote_url(value)
		if not url:
			continue
		parts = urlsplit(url)
		if parts.hostname in local_hosts and parts.path.startswith(("/files/", "/private/files/")):
			continue
		bindings[url] = "external:" + hashlib.sha256(url.encode()).hexdigest()
	return bindings


def canonical_source(lesson, source):
	"""Resolve only a real video belonging to this lesson's learner-facing content."""
	from lms.lms.doctype.course_lesson.course_lesson import (
		_contains_resource_url,
		_references_vouched_by_owner,
		_resolve_lesson_references,
	)
	from lms.lms.md import find_macros
	from lms.lms.utils import get_editorjs_blocks

	if (
		not isinstance(source, str)
		or not source
		or len(source) > 4096
		or any(ord(char) < 32 or ord(char) == 127 for char in source)
	):
		raise VideoSourceUnavailableError(_("Choose a video belonging to this lesson."))
	doc = frappe.get_doc("Course Lesson", lesson)
	bindings = remote_source_bindings(doc)
	if source in bindings.values():
		return source
	if (remote := _remote_url(source)) in bindings:
		return bindings[remote]
	if source.startswith(("/private/files/", "/files/")) and "?" not in source and "#" not in source:
		if ".." in source or "\\" in source:
			raise VideoSourceUnavailableError(_("Choose a video belonging to this lesson."))
		files = frappe.get_all("File", filters={"file_url": source}, fields=["file_url", "file_type"])
		if not any(
			row.file_url == source and (row.file_type or "").lower() in {"mp4", "webm", "mov", "m4v", "mkv"}
			for row in files
		):
			raise VideoSourceUnavailableError(_("Choose a video belonging to this lesson."))
		if source.startswith("/private/files/"):
			vouched = _references_vouched_by_owner(_resolve_lesson_references(source))
			belongs = (doc.name, False) in vouched
		else:
			belongs = any(_contains_resource_url(doc.get(field), source) for field in ("content", "body"))
			belongs = belongs or any(
				kind == "Video" and value == source.removeprefix("/files/")
				for kind, value in find_macros(doc.get("body"))
			)
		if belongs and len(source) <= 140:
			return source
	else:
		from bs4 import BeautifulSoup

		candidate = provider_source(source)
		declared = [doc.get("youtube") or "", doc.get("body") or ""]
		declared.extend(value for kind, value in find_macros(doc.get("body")) if kind == "YouTubeVideo")
		for tag in BeautifulSoup(doc.get("body") or "", "html.parser").select(
			"[data-plyr-provider][data-plyr-embed-id]"
		):
			provider, video = tag.get("data-plyr-provider"), tag.get("data-plyr-embed-id")
			if provider == "youtube":
				declared.append(video)
			elif provider == "vimeo" and isinstance(video, str) and video.isascii() and video.isdigit():
				declared.append("https://vimeo.com/" + video)
		for block in get_editorjs_blocks(doc.get("content")):
			if block.get("type") == "embed":
				declared.extend(_strings(block.get("data")))
		for text in declared:
			for value in [text, *re.findall(r'https://[^\s"\'<>)}]+', text)]:
				if candidate and provider_source(value) == candidate and len(candidate) <= 140:
					return candidate
	raise VideoSourceUnavailableError(_("Choose a video belonging to this lesson."))


def position_identity(member, lesson, source):
	member = frappe.db.get_value("User", member, "name")
	lesson = frappe.db.get_value("Course Lesson", lesson, "name")
	if not member or not lesson:
		frappe.throw(_("Invalid lesson progress."), frappe.PermissionError)
	return hashlib.sha256(
		json.dumps([member, lesson, source], ensure_ascii=False, separators=(",", ":")).encode()
	).hexdigest()


def backfill_identities():
	"""Preview everything before any write; preserve all original rows and source bytes."""
	rows = frappe.get_all(
		"LMS Video Watch Duration", fields=["name", "member", "lesson", "source", "source_identity"]
	)
	identities, updates = set(), []
	for row in rows:
		canonical = canonical_source(row.lesson, row.source)
		identity = position_identity(row.member, row.lesson, canonical)
		if identity in identities or row.source_identity not in (None, "", identity):
			frappe.throw(_("Video positions need an integrity review before this migration can continue."))
		identities.add(identity)
		if row.source_identity != identity:
			updates.append((row.name, identity))
	for name, identity in updates:
		frappe.db.set_value(
			"LMS Video Watch Duration", name, "source_identity", identity, update_modified=False
		)
	return {"rows": len(rows), "updated": len(updates)}
