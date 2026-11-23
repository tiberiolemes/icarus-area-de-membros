"""Reduce pending functions in one CLI process, without changing container source."""

import ast
import hashlib
import json
import subprocess
from pathlib import Path

root = Path(__file__).resolve().parents[3]
api_source = (root / "lms/lms/api.py").read_text()
tree = ast.parse(api_source)
node = next(node for node in tree.body if isinstance(node, ast.FunctionDef) and node.name == "get_branding")
start = min([node.lineno, *[item.lineno for item in node.decorator_list]]) - 1
branding = "\n".join(api_source.splitlines()[start : node.end_lineno])
policy = (root / "lms/patches/v2_0/account_security_policy.py").read_text()
test_files = (
	"lms/tests/security/test_install_security_policy.py",
	"lms/tests/security/test_bundled_branding.py",
)
tests = {name: (root / name).read_text() for name in test_files}
code = (
	"""import sys,types,unittest,frappe
frappe.init(site='tiberio.localhost',sites_path='/home/frappe/frappe-bench/sites')
frappe.connect()
frappe.set_user('Administrator')
assert frappe.conf.mute_emails and frappe.conf.pause_scheduler
frappe.flags.in_test = True
import lms.lms.api as api
import lms.patches.v2_0.account_security_policy as policy
exec(BRANDING,api.__dict__)
exec(POLICY,policy.__dict__)
suite=unittest.TestSuite()
for index,(name,source) in enumerate(TESTS.items()):
 module=types.ModuleType('qc08_pending_'+str(index))
 module.__file__=name
 sys.modules[module.__name__]=module
 exec(compile(source,name,'exec'),module.__dict__)
 suite.addTests(unittest.defaultTestLoader.loadTestsFromModule(module))
try:
 result=unittest.TextTestRunner(verbosity=2).run(suite)
 if not result.wasSuccessful(): raise SystemExit(1)
finally:
 frappe.db.rollback()
 frappe.destroy()
""".replace("BRANDING", repr(branding))
	.replace("POLICY", repr(policy))
	.replace("TESTS", repr(tests))
)
result = subprocess.run(
	[
		"docker",
		"exec",
		"-i",
		"-w",
		"/home/frappe/frappe-bench/sites",
		"tiberio-quality08-final-existing-app",
		"/home/frappe/frappe-bench/env/bin/python",
		"-",
	],
	input=code.encode(),
	capture_output=True,
)
(root / ".local/quality/08-pending-backend-reduction.log").write_bytes(result.stdout + result.stderr)
print(
	json.dumps(
		{
			"exit_code": result.returncode,
			"function_sha256": {
				"branding": hashlib.sha256(branding.encode()).hexdigest(),
				"policy": hashlib.sha256(policy.encode()).hexdigest(),
			},
			"native_database": True,
			"application_source_changed": False,
			"immutable_artifact_acceptance": False,
		}
	)
)
raise SystemExit(result.returncode)
