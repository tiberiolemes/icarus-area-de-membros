"""Development reduction against native Singles; never an immutable-image acceptance."""

import subprocess
from pathlib import Path

root = Path(__file__).resolve().parents[3]
source = (root / "lms/patches/v2_0/account_security_policy.py").read_text()
code = """import frappe
from unittest.mock import patch
frappe.init(site='tiberio.localhost', sites_path='/home/frappe/frappe-bench/sites')
frappe.connect()
frappe.set_user('Administrator')
assert frappe.conf.mute_emails and frappe.conf.pause_scheduler
try:
 frappe.db.delete('Singles',{'doctype':'System Settings','field':['in',['language','time_zone']]})
 before = [frappe.db.get_single_value('System Settings', key, cache=False) for key in ('language','time_zone')]
 assert before == ['','']
 frappe.db.set_single_value('System Settings','reset_password_link_expiry_duration',7200)
 namespace = {}
 exec(SOURCE,namespace)
 with patch.object(frappe,'reload_doc'), patch.object(frappe.db,'set_single_value',wraps=frappe.db.set_single_value) as writer:
  namespace['execute']()
  expiry = frappe.db.get_single_value('System Settings','reset_password_link_expiry_duration',cache=False)
  assert int(expiry) == 3600, repr(expiry)
  namespace['execute']()
  writer.assert_called_once_with('System Settings','reset_password_link_expiry_duration',3600)
 frappe.db.set_single_value('System Settings','reset_password_link_expiry_duration',1800)
 with patch.object(frappe,'reload_doc'), patch.object(frappe.db,'set_single_value',wraps=frappe.db.set_single_value) as writer:
  namespace['execute']()
  assert int(frappe.db.get_single_value('System Settings','reset_password_link_expiry_duration',cache=False)) == 1800
  writer.assert_not_called()
 assert before == [frappe.db.get_single_value('System Settings', key, cache=False) for key in ('language','time_zone')]
 print('native Singles reduction passed; schema reload mocked; transaction rolled back; not artifact acceptance')
finally:
 frappe.db.rollback()
 frappe.destroy()
""".replace("SOURCE", repr(source))
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
	stdout=subprocess.PIPE,
	stderr=subprocess.STDOUT,
)
(root / ".local/quality/08-install-policy-native-reduction.log").write_bytes(result.stdout)
print(result.stdout.decode())
raise SystemExit(result.returncode)
