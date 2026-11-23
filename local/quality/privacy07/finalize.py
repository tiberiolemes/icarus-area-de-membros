"""Verify and seal the worker07 source delivery, never a product acceptance."""

import ast
import hashlib
import json
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
AUDIT = ROOT / "docs/audit/quality"
EVIDENCE = AUDIT / "evidence"


def read(path):
	return json.loads((ROOT / path).read_text())


def digest(path):
	return hashlib.sha256((ROOT / path).read_bytes()).hexdigest()


def main():
	candidate = read("docs/audit/quality/07-coverage-candidate.json")
	assert candidate["counts"]["active_rules"] == 294
	assert len(candidate["applicable_rules"]) + len(candidate["current_not_applicable"]) == 294
	assert len(candidate["historical_not_applicable"]) == 65
	assert len(candidate["unapproved_proposals"]) == 7
	assert all(
		row["source_receipts"]
		or row["status"] == "blocked"
		or row["status"] == "scope_adjusted"
		and row.get("extra_evidence")
		for row in candidate["applicable_rules"]
	)
	on03 = next(row for row in candidate["applicable_rules"] if row["id"] == "ON-03")
	assert on03["status"] == "verified_isolated" and "source_gap" not in on03
	assert not on03["full_rule_closed"] and not candidate["full_LMS_acceptance"]
	before = read("docs/audit/quality/evidence/07-before-shared.json")
	shared = {}
	for path, previous in before.items():
		snapshot = ROOT / ".local/quality/07-before" / path.replace("/", "__")
		assert hashlib.sha256(snapshot.read_bytes()).hexdigest() == previous, path
		shared[path] = {
			"before_sha256": previous,
			"final_sha256": digest(path),
			"preimage_method": "exact_inverse_of_single_anchor_then_capture"
			if path
			in {
				"frontend/src/components/CourseOutline.vue",
				"frontend/src/components/FormFeedback.vue",
				"frontend/src/components/Discussions.vue",
			}
			else "captured_before_worker07_edit",
		}
		result = subprocess.run(
			["git", "diff", "--no-index", "--check", str(snapshot), str(ROOT / path)],
			capture_output=True,
			text=True,
			check=False,
		)
		assert not result.stdout and not result.stderr, (path, result.stdout, result.stderr)
	for path, data in read("docs/audit/quality/evidence/07-security-test-assertions.json").items():
		old = (ROOT / ".local/quality/07-before" / path.replace("/", "__")).read_text()

		def assertions(source):
			return sorted(
				ast.dump(node)
				for node in ast.walk(ast.parse(source))
				if isinstance(node, ast.Call)
				and isinstance(node.func, ast.Attribute)
				and node.func.attr.startswith("assert")
			)

		assert assertions(old) == assertions((ROOT / path).read_text()), path
		assert data["unchanged"]
	final_tests = read("docs/audit/quality/evidence/07-vitest-broad.json")
	assert final_tests["success"] and final_tests["numFailedTests"] == 0
	assert all(result["status"] == "passed" for result in final_tests["testResults"])
	final_delta = read("docs/audit/quality/evidence/07-tour-import-final.json")
	assert final_delta["success"] and final_delta["numFailedTests"] == 0
	for filename, count in (
		("07-python-source.log", 23),
		("07-prices-source.log", 5),
		("07-tours-python.log", 7),
	):
		log = (EVIDENCE / filename).read_text()
		assert f"Ran {count} tests" in log and log.rstrip().endswith("OK")
	assert read("docs/audit/quality/evidence/07-impeccable-source.json") == []
	own = set(before)
	for folder in (
		"local/quality/privacy07",
		"lms/public/tours",
		"lms/lms/doctype/lms_privacy_settings",
		"lms/lms/doctype/lms_help_feedback",
		"lms/lms/doctype/lms_tour_progress",
		"frontend/src/tours",
		"docs/icarus",
	):
		own.update(
			str(path.relative_to(ROOT))
			for path in (ROOT / folder).rglob("*")
			if path.is_file() and "__pycache__" not in str(path)
		)
	own.update(
		[
			"lms/lms/privacy.py",
			"lms/lms/tours.py",
			"lms/patches/v2_0/privacy_controls.py",
			"lms/public/js/privacy_request.js",
			"lms/public/js/privacy_tours.js",
			"lms/tests/test_privacy_isolated.py",
			"lms/tests/test_privacy_prices_isolated.py",
			"lms/tests/test_tours_isolated.py",
			"lms/tests/security/test_privacy_lifecycle.py",
			"lms/tests/security/test_guided_tours.py",
			"frontend/src/pages/HelpUsage.vue",
			"frontend/src/utils/help.ts",
			"frontend/src/tour-desk.js",
			"frontend/vite.tour.config.js",
			"local/i18n/privacy07-pt-BR.json",
			"docs/audit/quality/contracts/07-privacy-help.md",
			"docs/audit/quality/07-help-privacy-completeness.md",
			"docs/audit/quality/07-coverage-candidate.json",
		]
	)
	own.update(
		"frontend/src/components/" + name + ".vue"
		for name in ("ContextHelp", "FirstResultGuide", "ReleaseNotes", "GuidedTour", "TourHost")
	)
	own.update(
		"frontend/src/tests/" + name + ".test.ts"
		for name in ("helpOnboarding", "releaseNotes", "guidedTour", "tourHost", "tourReport")
	)
	own.update(
		"lms/www/" + name + suffix
		for name in ("help", "privacy", "terms", "your-data")
		for suffix in (".html", ".py")
	)
	own.update(str(path.relative_to(ROOT)) for path in (ROOT / "lms/templates/emails").glob("privacy*.html"))
	own.update(
		str(path.relative_to(ROOT))
		for path in EVIDENCE.glob("07-*")
		if path.name not in {"07-source-files.json", "07-source-receipt.json", "07-final-delivery.log"}
	)
	assert not any(path.endswith("execution-ledger.json") or "/tasks/" in path for path in own)
	manifest = {path: digest(path) for path in sorted(own)}
	(EVIDENCE / "07-source-files.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
	receipt = {
		"schema_version": 1,
		"task": "07",
		"date": "2026-11-21",
		"placement": "local",
		"status": "verified_isolated",
		"source_scope_complete": True,
		"integrated_acceptance": False,
		"authorization_messages": ["msg_523dd472952b", "msg_03ffe0b0acb9", "msg_fbf683937114"],
		"source_manifest": "docs/audit/quality/evidence/07-source-files.json",
		"source_manifest_sha256": digest("docs/audit/quality/evidence/07-source-files.json"),
		"composition": shared,
		"candidate_counts": candidate["counts"],
		"receipt_inputs": {path: digest(path) for path in candidate["receipt_inputs"].values()},
		"rules": [
			{
				"ids": [row["id"]],
				"status": row["status"],
				"scope": row.get("source_scope", row["status_scope"]),
				"full_rule_closed": row["full_rule_closed"],
				"runtime_checks": row["runtime_checks"],
			}
			for row in candidate["applicable_rules"]
			if any(claim["front"].startswith("07") for claim in row["source_receipts"])
		],
		"verification": {
			"python_privacy": {
				"command": "python3 lms/tests/test_privacy_isolated.py",
				"passed": 23,
				"exit_code": 0,
			},
			"python_prices": {
				"command": "python3 lms/tests/test_privacy_prices_isolated.py",
				"passed": 5,
				"exit_code": 0,
			},
			"python_tours": {
				"command": "python3 lms/tests/test_tours_isolated.py",
				"passed": 7,
				"exit_code": 0,
			},
			"frontend": {
				"command": "docker run --rm --platform linux/amd64 --network none --entrypoint python -v <repo>:/source:ro -v <repo>/docs/audit/quality/evidence:/out tiberio-frappe-local:i18n-20261121 /source/local/quality/privacy07/run_tool.py src/tests",
				"image_id": "sha256:81045a6d8e1db3c49fd7aca81c5d145bdbd9715b4f2454ef4612b66fbaa3ed2c",
				"files": len(final_tests["testResults"]),
				"passed": final_tests["numPassedTests"],
				"failed": 0,
				"exit_code": 0,
				"native_site_initialized": False,
				"runtime_acceptance": False,
			},
			"frontend_final_delta": {
				"report": "07-tour-import-final.json",
				"scope": "ZIP course tour versus native record import; shared tour/help/report and import consumers",
				"passed": final_delta["numPassedTests"],
				"failed": 0,
				"exit_code": 0,
				"add_to_broad_as_unique_tests": False,
			},
			"public_templates": {
				"templates": 5,
				"articles": 16,
				"mode": "sandbox_jinja_fixtures_and_node_parse",
				"exit_code": 0,
			},
			"catalogue": {"log": "07-catalogue.log", "missing": 0, "interpolation_checked": True},
			"routes": read("docs/audit/quality/evidence/07-tour-route-map.json")["named_routes"],
			"static": {
				"ruff_log": "07-ruff-final.log",
				"native_js": "node --check",
				"impeccable": "07-impeccable-source.json",
				"own_shared_whitespace": "git diff --no-index --check against verified preimage",
				"visual_proof": False,
			},
		},
		"integration_contract": "docs/audit/quality/contracts/07-privacy-help.md",
		"runtime_groups": candidate["runtime_checks"],
		"production_owner_decisions": [
			"controlador/canal reais",
			"finalidades e bases",
			"retenção por categoria/backups/texto livre",
			"prestadores/regiões/transferências efetivos",
			"termos/aviso aprovados",
			"repositório/identidade técnica/licenciamento da futura distribuição",
		],
		"known_external_scope_gaps": [
			{
				"ids": ["SE-15", "SE-16"],
				"cause": "Servidor de salasSocket.IO não revalida sessão existente conforme recibo12; remediação e prova08",
				"evidence": "docs/audit/quality/12-websocket-session.json",
			}
		],
		"not_executed": [
			"runtime build/recreate/migration/HTTP/site DB",
			"native suites/two-session/visual UAT",
			"real account deletion",
			"remote CI",
			"commit/push/publication",
			"memory/Obsidian",
		],
		"preserved": [
			"prior lifecycle01/11",
			"forms/drafts02",
			"session04",
			"theme/media05",
			"navigation/moderation06",
			"upstream licenses/credits",
			"central ledger and historical reports",
		],
		"obsolete_code_removed": [
			"unused external IP country helper after production/import/config/test search; six stale mocks and unused imports only"
		],
	}
	(EVIDENCE / "07-source-receipt.json").write_text(json.dumps(receipt, ensure_ascii=False, indent=2) + "\n")
	assert read("docs/audit/quality/evidence/07-source-receipt.json")["source_manifest_sha256"] == digest(
		"docs/audit/quality/evidence/07-source-files.json"
	)
	print(
		json.dumps(
			{
				"source_files": len(manifest),
				"shared_preimages_verified": len(shared),
				"frontend_passed": final_tests["numPassedTests"],
				"python_passed": 35,
				"candidate": candidate["counts"],
				"source_complete": True,
				"native_runtime_pending08": True,
			},
			ensure_ascii=False,
		)
	)


if __name__ == "__main__":
	main()
