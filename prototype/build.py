"""Assemble the prototype page and inline a normalized trace.

The page is src/page.html plus the script modules in src/js/ (concatenated in name order
into one <script type="module">). Writes two files under prototype/dist/:
  starfleet.html  page content only (the artifact host wraps it in a document)
  index.html      the same page wrapped in a full document, for local preview

Usage: python3 prototype/build.py [--data prototype/data/sample-trace.json]
"""
import argparse
import json
import pathlib
import shutil
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parent

ap = argparse.ArgumentParser()
ap.add_argument('--data', default=str(ROOT / 'data' / 'sample-trace.json'))
args = ap.parse_args()

src = (ROOT / 'src' / 'page.html').read_text(encoding='utf-8')
parts = sorted((ROOT / 'src' / 'js').glob('*.js'))
script = '\n'.join(f'// ── {p.name} ──\n' + p.read_text(encoding='utf-8') for p in parts)
if '</script' in script.lower():
    sys.exit('a script module contains "</script", which would end the inline <script> early')

dist = ROOT / 'dist'
dist.mkdir(exist_ok=True)

# syntax check the assembled module before it reaches a browser
if shutil.which('node'):
    probe = dist / 'app.check.mjs'
    probe.write_text(script, encoding='utf-8')
    res = subprocess.run(['node', '--check', str(probe)], capture_output=True, text=True)
    probe.unlink()
    if res.returncode != 0:
        sys.exit('script syntax error:\n' + res.stderr)

data = pathlib.Path(args.data).read_text(encoding='utf-8')
json.loads(data)  # fail fast on a broken trace
# the staged full-coverage session is synthetic, so it is rebuilt here rather than kept in git
demo_path = ROOT / 'data' / 'demo-trace.json'
subprocess.run([sys.executable, str(ROOT.parent / 'tools' / 'make_demo_trace.py'), '--out', str(demo_path)], check=True, capture_output=True)
demo = demo_path.read_text(encoding='utf-8')
json.loads(demo)
page = (src.replace('__SCRIPT__', script)
        .replace('__TRACE_JSON__', data.replace('</', '<\\/'))
        .replace('__DEMO_JSON__', demo.replace('</', '<\\/')))

(dist / 'starfleet.html').write_text(page, encoding='utf-8')
(dist / 'index.html').write_text(
    '<!doctype html>\n<html lang="zh-CN"><head><meta charset="utf-8">'
    '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">'
    '</head><body>\n' + page + '\n</body></html>\n',
    encoding='utf-8',
)
print(f'built {dist}/starfleet.html ({len(page) / 1024:.0f} KB, {len(parts)} modules) and index.html')
