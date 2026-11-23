"""Format only integration08's changed Vue/tests with the installed formatter."""

import subprocess
from pathlib import Path

root = Path(__file__).resolve().parents[3]
for name in ("frontend/src/components/Quiz.vue", "frontend/src/tests/quizSubmissionRetry.test.ts"):
	path = root / name
	formatted = subprocess.run(
		[
			"docker",
			"exec",
			"-i",
			"tiberio-quality08-sandbox-app",
			"node",
			"/home/frappe/frappe-bench/apps/frappe/node_modules/.bin/prettier",
			"--stdin-filepath",
			"/source/" + name,
		],
		input=path.read_bytes(),
		capture_output=True,
		check=True,
	)
	assert formatted.stdout and len(formatted.stdout) > len(path.read_bytes()) / 2
	path.write_bytes(formatted.stdout)
	print(name)
