"""Reduce private native failures to source frames and the exception cause."""

import re
import sys
from pathlib import Path

source = Path(".local/quality/08-native-broad-first.log").read_text()
for part in re.split(r"\n={60,}\n", source):
	if not part.startswith(("ERROR:", "FAIL:")) or not any(needle in part for needle in sys.argv[1:]):
		continue
	print(part.splitlines()[0])
	for line in part.splitlines():
		if "/apps/lms/" in line:
			print(line)
	print(part[-650:])
