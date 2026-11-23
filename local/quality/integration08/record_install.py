"""Publish only sanitized installation outcomes and hashes of the exact executed harness."""

import argparse
import hashlib
import json
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument("revision")
parser.add_argument("kind", choices=("fresh", "existing"))
parser.add_argument("--attempt", default="first")
args = parser.parse_args()
assert args.attempt.isalnum()
attempt_suffix = "" if args.attempt == "first" else "-" + args.attempt
assert args.revision.startswith("r") and args.revision[1:].isdigit()
root = Path(__file__).resolve().parents[3]
private = root / ".local/quality"
work = private / ("08-" + args.revision + "-" + args.kind + attempt_suffix)
raw = json.loads((work / "receipt.json").read_text())
stage = json.loads((private / ("08-" + args.revision + "-stage-" + args.kind + attempt_suffix + ".json")).read_text())
build = json.loads(
	(root / "docs/audit/quality/evidence" / ("08-build-" + args.revision + ".json")).read_text()
)
assert stage["exit_code"] == 0 and not stage["reserve_breached"]
assert raw["image_id"] == build["image_id"] and raw["source_sha256"] == build["source_sha256"]
assert not raw["image_application_source_overlays"] and raw["secret_dollar_check"]
proof = {
	"kind": "actual_new_clean_installation_and_repeat"
	if args.kind == "fresh"
	else "restored_existing_installation_and_functional_business_noop",
	"image_id": raw["image_id"],
	"source_sha256": raw["source_sha256"],
	"host_command": stage["command"],
	"exit_code": 0,
	"application_source_overlays": False,
	"internal_network": raw["internal_network"],
	"ports_published": raw["ports_published"],
	"secret_dollar_check": True,
	"bootstrap_applications": raw["bootstrap_applications"],
	"second_protected_business_state_equal": raw["second_protected_business_state_equal"],
	"metadata_and_controls": {},
	"harness_sha256": raw["validation_harness_sha256"],
	"raw_receipt_sha256": hashlib.sha256((work / "receipt.json").read_bytes()).hexdigest(),
	"stage_log_sha256": stage["log_sha256"],
	"minimum_available_GiB": stage["minimum_available_bytes"] / 2**30,
	"memory_reserve_breached": False,
	"global_acceptance": False,
}
for name in (
	"video-metadata-first.log",
	"video-metadata-second.log",
	"native-metadata.log",
	"control-proof-first.json",
	"control-proof-second.json",
):
	path = work / name
	if path.exists():
		proof["metadata_and_controls"][name] = json.loads(path.read_text())
output = root / "docs/audit/quality/evidence" / ("08-" + args.revision + "-" + args.kind + attempt_suffix + ".json")
assert not output.exists(), "Preserve published outcomes"
output.write_text(json.dumps(proof, ensure_ascii=False, indent=2) + "\n")
print(
	json.dumps(
		{
			"image_id": proof["image_id"],
			"kind": args.kind,
			"exit_code": 0,
			"output": str(output.relative_to(root)),
		}
	)
)
