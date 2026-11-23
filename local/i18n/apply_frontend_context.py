"""Integrator-only: install the reviewed final lookup precedence after frontend handoff."""
import argparse
import json
from pathlib import Path

from apply_overlay import apply

if __name__=='__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('--lms-app',type=Path,required=True)
    args=parser.parse_args()
    manifest=json.loads((Path(__file__).parent/'frontend-context-overlay.json').read_text())
    print(json.dumps({'frontend_context_files_patched':apply(args.lms_app,manifest)}))
