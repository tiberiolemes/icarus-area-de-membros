"""Tie a completed build to its exact test stage, input manifest and immutable ID."""

import argparse
import hashlib
import json
import re
import subprocess
from pathlib import Path

root = Path(__file__).resolve().parents[3]
private = root / ".local/quality"
parser = argparse.ArgumentParser()
parser.add_argument("--revision", choices=("final", "r2", "r3", "r4", "r6", "r7", "r8", "r9", "r10", "r11", "r12", "r13", "r14", "r15", "r16", "r17", "r18", "r19", "r20", "r21"), default="r10")
revision = parser.parse_args().revision
stem = "08-build-" + revision
result = json.loads((private / (stem + "-result.json")).read_text())
assert result["exit_code"] == 0
log = private / (stem + ".log")
lines = [re.sub(r"\x1b\[[0-9;]*m", "", line) for line in log.read_text().splitlines()]
proof = [
	{"line": index + 1, "text": text}
	for index, text in enumerate(lines)
	if re.search(
		r"Test Files\s+\d+ passed|Tests\s+\d+ passed|applied_overlays_verified|session_delivery_overlay_verified",
		text,
	)
]
totals = [re.search(r"Tests\s+(\d+) passed \((\d+)\)", row["text"]) for row in proof]
totals = [match for match in totals if match]
assert len(totals) == 1 and totals[0].group(1) == totals[0].group(2)
image = json.loads(subprocess.check_output(["docker", "image", "inspect", result["image"]]))[0]
assert image["Config"]["Labels"]["local.tiberio.source-sha256"] == result["source_sha256"]
if "effective_recipe_sha256" in result:
	assert image["Config"]["Labels"]["local.tiberio.build-recipe-sha256"] == result["effective_recipe_sha256"]
receipt = {
	**result,
	"kind": "immutable_candidate_build_not_product_acceptance",
	"image_id": image["Id"],
	"build_log_private": str(log.relative_to(root)),
	"build_log_sha256": hashlib.sha256(log.read_bytes()).hexdigest(),
	"input_manifest_sha256": hashlib.sha256(
		(private / (stem + "-inputs.json")).read_bytes()
	).hexdigest(),
	"frontend_tests": int(totals[0].group(1)),
	"proof": proof,
	"previous_build_preserved": "docs/audit/quality/evidence/08-build.json",
	"original_product_not_cut_over": True,
}
(root / ("docs/audit/quality/evidence/" + stem + ".json")).write_text(
	json.dumps(receipt, ensure_ascii=False, indent=2) + "\n"
)
print(
	json.dumps(
		{key: receipt[key] for key in ("image_id", "source_sha256", "frontend_tests", "build_log_sha256")}
	)
)
