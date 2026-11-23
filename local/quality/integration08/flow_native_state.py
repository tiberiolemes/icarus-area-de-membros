"""Native metadata/permission fixtures only: no provider, key, model request or Flow run."""

import json
import os
import secrets
import sys
from pathlib import Path

# Native LiteLLM otherwise fetches public price metadata at import; this is an offline fixture.
os.environ["LITELLM_LOCAL_MODEL_COST_MAP"] = "True"

import frappe
from frappe.utils.password import update_password

from lms.lms.test_helpers import BaseTestUtils

site = "test_quality08.localhost"
frappe.init(site=site)
frappe.connect()
frappe.set_user("Administrator")
assert frappe.conf.allow_tests and frappe.conf.mute_emails
args = json.load(sys.stdin)
path = Path(site) / "private/qc08-flow-fixtures.json"
try:
	if args["action"] == "setup":
		assert not path.exists()
		fixture = {
			"actors": [],
			"documents": [],
			"runs_before": frappe.db.count("Flow Run"),
			"models_before": frappe.db.count("Flow Model"),
		}
		for role in ("owner", "viewer", "outsider"):
			name = "qc08-flow-" + role + "-" + secrets.token_hex(6) + "@example.test"
			BaseTestUtils._create_user(name, "QC08 Flow", role, ["Flow User"], "System User")
			password = "Aa9!" + secrets.token_urlsafe(24)
			update_password(name, password)
			fixture["actors"].append({"user": name, "password": password})
			fixture["documents"].append(["User", name])
		# Normal native create/update, no mandatory/validation bypass. No API credentials are configured.
		model = frappe.get_doc(
			{
				"doctype": "Flow Model",
				"title": "QC08 metadata only " + secrets.token_hex(6),
				"model_id": "openai/qc08-metadata-only",
				"context_window": 8192,
				"enabled": 0,
				"base_url": "http://127.0.0.1:9",
			}
		).insert()
		model.enabled = 1
		model.save()
		fixture["documents"].append(["Flow Model", model.name])
		agent = frappe.get_doc(
			{
				"doctype": "Flow Agent",
				"title": "QC08 relay metadata " + secrets.token_hex(6),
				"model": model.name,
				"instructions": "Synthetic metadata for local realtime access tests only. Never run.",
				"enabled": 1,
			}
		).insert()
		fixture["documents"].append(["Flow Agent", agent.name])
		frappe.set_user(fixture["actors"][0]["user"])
		session = frappe.get_doc(
			{
				"doctype": "Flow Session",
				"agent": agent.name,
				"title": "QC08 relay access only",
				"approval_mode": "Ask",
			}
		).insert()
		fixture["session"] = session.name
		fixture["documents"].append(["Flow Session", session.name])
		assert frappe.db.count("Flow Run") == fixture["runs_before"]
		frappe.db.commit()
		path.write_text(json.dumps(fixture))
		path.chmod(0o600)
		print(
			json.dumps(
				{
					"actors": 3,
					"native_metadata_created": True,
					"provider_credentials_configured": False,
					"provider_requests": 0,
					"flow_runs_created": 0,
				}
			)
		)
	else:
		fixture = json.loads(path.read_text())
		if args["action"] in ("share", "unshare"):
			from frappe import share

			viewer = fixture["actors"][1]["user"]
			if args["action"] == "share":
				share.add("Flow Session", fixture["session"], user=viewer, read=1, write=0, share=0, notify=0)
			else:
				share.remove("Flow Session", fixture["session"], user=viewer)
			print(json.dumps({"native_share_change": args["action"]}))
		elif args["action"] == "publish":
			import redis
			from frappe.flow.daemon.lifecycle import _redis_url

			channel = "harness:" + site + ":" + fixture["session"]
			redis.Redis.from_url(_redis_url()).publish(
				channel, json.dumps({"marker": args["marker"], "synthetic_transport_frame": True})
			)
			print(json.dumps({"synthetic_frame_published": True}))
		elif args["action"] == "revoke":
			from frappe.sessions import delete_session, hash_sid

			assert frappe.db.get_value(
				"Sessions", {"sid": hash_sid(args["sid"])}, "user", order_by="sid"
			) in {row["user"] for row in fixture["actors"]}
			delete_session(args["sid"], reason="QC08 native Flow transport test")
			print(json.dumps({"synthetic_session_revoked": True}))
		elif args["action"] == "inspect":
			assert frappe.db.count("Flow Run") == fixture["runs_before"]
			print(
				json.dumps(
					{
						"flow_runs_created": 0,
						"provider_credentials_configured": False,
						"only_synthetic_transport_frames": True,
					}
				)
			)
		else:
			raise ValueError("Unknown owned Flow fixture action")
		frappe.db.commit()
finally:
	frappe.db.rollback()
	frappe.destroy()
