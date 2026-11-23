"""Synthetic-only native session actions; credentials stay in the isolated site."""

import json
import os
import secrets
import signal
import sys
import time
from pathlib import Path

import frappe
from frappe.sessions import delete_session, hash_sid
from frappe.utils.password import update_password

from lms.lms import account_security as security
from lms.lms.test_helpers import BaseTestUtils

site = "test_quality08.localhost"
frappe.init(site=site)
frappe.connect()
frappe.set_user("Administrator")
assert frappe.conf.mute_emails and frappe.conf.allow_tests and site.startswith("test_")
path = Path(site) / "private/qc08-ws-fixtures.json"
args = json.load(sys.stdin)
try:
	if args["action"] == "setup":
		assert not path.exists()
		fixtures = []
		for role in ("LMS Student", "Course Creator", "LMS Student"):
			name = "qc08-ws-" + secrets.token_hex(10) + "@example.test"
			user = BaseTestUtils._create_user(name, "QC08", "WebSocket", [role])
			user.simultaneous_sessions = 5
			user.save()
			password = "Aa9!" + secrets.token_urlsafe(24)
			update_password(name, password)
			fixtures.append({"user": name, "password": password, "idle_limit": security.idle_limit(name)})
		from frappe.realtime import get_socketio_secret

		get_socketio_secret()
		path.write_text(json.dumps(fixtures))
		path.chmod(0o600)
		print(json.dumps({"synthetic_users": len(fixtures), "secrets_printed": False}))
	elif args["action"] == "publish":
		fixtures = json.loads(path.read_text())
		for entry in fixtures:
			frappe.publish_realtime(
				"qc08_native_probe",
				{"marker": args["marker"], "published_at_ms": time.time() * 1000},
				user=entry["user"],
			)
		print(json.dumps({"published": args["marker"]}))
	elif args["action"] == "publish_public":
		frappe.publish_realtime("qc08_native_probe", {"marker": args["marker"]}, room="website")
		print(json.dumps({"published_public": args["marker"]}))
	elif args["action"] == "api_credentials":
		fixtures = json.loads(path.read_text())
		user = frappe.get_doc("User", fixtures[1]["user"])
		user.api_key, user.api_secret = secrets.token_hex(16), secrets.token_hex(24)
		user.save()
		# Captured only by the in-container test process, never its public result.
		print(json.dumps({"authorization": "token " + user.api_key + ":" + user.get_password("api_secret")}))
	elif args["action"] == "stop_http":
		wrapper = Path("/home/frappe/frappe-bench/logs/qc08-http-wrapper.pid")
		pid = int(
			(
				wrapper if wrapper.exists() else Path("/home/frappe/frappe-bench/logs/qc08-http-master.pid")
			).read_text()
		)
		assert (b"safe_process.py" if wrapper.exists() else b"gunicorn") in Path(
			f"/proc/{pid}/cmdline"
		).read_bytes()
		os.kill(pid, signal.SIGTERM)
		print(json.dumps({"isolated_http_shutdown_requested": True}))
	elif args["action"] == "revoke":
		fixtures = json.loads(path.read_text())
		assert frappe.db.get_value("Sessions", {"sid": hash_sid(args["sid"])}, "user", order_by="sid") in {
			row["user"] for row in fixtures
		}
		delete_session(sid=args["sid"], reason="QC08 synthetic revocation")
		print(json.dumps({"revoked": True}))
	elif args["action"] == "idle":
		fixtures = json.loads(path.read_text())
		assert frappe.db.get_value("Sessions", {"sid": hash_sid(args["sid"])}, "user", order_by="sid") in {
			row["user"] for row in fixtures
		}
		frappe.cache.set_value(
			security._activity_key(args["sid"]), time.time() - args["age"], expires_in_sec=7260
		)
		print(json.dumps({"simulated_activity_age": args["age"], "system_clock_changed": False}))
	elif args["action"] == "activity":
		print(
			json.dumps(
				{
					"activity": frappe.cache.get_value(
						security._activity_key(args["sid"]), use_local_cache=False
					)
				}
			)
		)
	elif args["action"] == "inspect":
		data = frappe.cache.hget("session", hash_sid(args["sid"]))
		if not data:
			rows = frappe.db.sql(
				"select user, sessiondata from tabSessions where sid=%s", hash_sid(args["sid"])
			)
			assert len(rows) == 1
			data = frappe.parse_json(rows[0][1])
			data.user = rows[0][0]
		assert data and data.get("user") in {row["user"] for row in json.loads(path.read_text())}
		last = frappe.cache.get_value(security._activity_key(args["sid"]), use_local_cache=False)
		print(
			json.dumps(
				{
					"idle_limit": security.idle_limit(data.get("user")),
					"activity_age": time.time() - float(last),
					"expired": security.session_expired(data, args["sid"]),
					"roles": frappe.get_roles(data.get("user")),
				}
			)
		)
	elif args["action"] == "disable":
		fixtures = json.loads(path.read_text())
		user = frappe.get_doc("User", fixtures[args["index"]]["user"])
		user.enabled = 0
		user.save()
		print(json.dumps({"disabled_synthetic_user": True}))
	elif args["action"] == "cleanup":
		from frappe.sessions import clear_sessions

		from lms.tests.test_coupon_redemption import _delete_committed_user

		for entry in json.loads(path.read_text()):
			clear_sessions(user=entry["user"], force=True)
			if frappe.db.exists("LMS Account Security", entry["user"]):
				frappe.delete_doc("LMS Account Security", entry["user"], force=True)
			_delete_committed_user(entry["user"])
		path.unlink()
		print(json.dumps({"owned_fixtures_removed": True}))
	else:
		raise ValueError("Unsupported synthetic action")
	frappe.db.commit()
finally:
	frappe.db.rollback()
	frappe.destroy()
