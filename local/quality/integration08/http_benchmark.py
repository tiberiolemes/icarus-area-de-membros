"""Small read-only local HTTP/asset baseline; never a public capacity estimate."""

import argparse
import gzip
import hashlib
import json
import re
import statistics
import time
import urllib.request
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument("stage", choices=("before", "after"))
args = parser.parse_args()
root = Path(__file__).resolve().parents[3]
destination = root / ".local/quality" / ("08-http-" + args.stage + ".json")
assert not destination.exists(), "Preserve the previous benchmark"


def get(path):
	request = urllib.request.Request(
		"http://127.0.0.1:8088" + path, headers={"Host": "tiberio.localhost", "Accept-Encoding": "gzip"}
	)
	start = time.perf_counter()
	with urllib.request.urlopen(request, timeout=15) as response:
		data = response.read()
		elapsed = (time.perf_counter() - start) * 1000
		decoded = gzip.decompress(data) if response.headers.get("Content-Encoding") == "gzip" else data
		return decoded, {
			"path": path,
			"status": response.status,
			"elapsed_ms": round(elapsed, 3),
			"wire_bytes": len(data),
			"decoded_bytes": len(decoded),
			"sha256": hashlib.sha256(decoded).hexdigest(),
			"content_encoding": response.headers.get("Content-Encoding"),
			"cache_control": response.headers.get("Cache-Control"),
		}


samples = [get("/lms") for _ in range(7)]
html = samples[-1][0].decode()
assets = sorted(set(re.findall(r'(?:src|href)=["\'](/assets/[^"\']+)["\']', html)))
measurements = [get(path)[1] for path in assets]
result = {
	"stage": args.stage,
	"scope": "single local process, unauthenticated shell, sequential requests; no public capacity claim",
	"page_samples": [row[1] for row in samples],
	"median_page_ms": statistics.median(row[1]["elapsed_ms"] for row in samples),
	"entry_assets": measurements,
	"asset_wire_bytes": sum(row["wire_bytes"] for row in measurements),
	"asset_decoded_bytes": sum(row["decoded_bytes"] for row in measurements),
}
destination.write_text(json.dumps(result, indent=2) + "\n")
print(
	json.dumps(
		{key: result[key] for key in ("stage", "median_page_ms", "asset_wire_bytes", "asset_decoded_bytes")}
	)
)
