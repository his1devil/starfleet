"""Assemble the prototype pages and inline the traces.

Each variant is a scene on the shared renderer and HUD:
  van     MV-01, a cut-open van lab                     → dist/starfleet.html
  engine  TK-1, an inference engine as a machine        → dist/engine.html
  soc     HX-1, the grok-build harness drawn as a chip  → dist/soc.html

A page is shared/head.html (with the variant's title) + shared/style.css + <variant>/body.html
+ shared/tail.html, and its script is shared/js/*.js plus <variant>/js/*.js concatenated in file
name order into one <script type="module">. For local preview each variant also gets
dist/<variant>/index.html wrapped in a full document.

Usage: python3 prototype/build.py [--variant van|engine|soc|all] [--data prototype/data/sample-trace.json]
"""
import argparse
import json
import pathlib
import shutil
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parent
SRC = ROOT / 'src'
VARIANTS = {
    'van': {'title': 'Starfleet', 'out': 'starfleet.html'},
    'engine': {'title': 'TK-1 Inference Engine', 'out': 'engine.html'},
    'soc': {'title': 'HX-1 Harness SoC', 'out': 'soc.html'},
}

ap = argparse.ArgumentParser()
ap.add_argument('--variant', default='all', choices=['all', *VARIANTS])
ap.add_argument('--data', default=str(ROOT / 'data' / 'sample-trace.json'))
args = ap.parse_args()

dist = ROOT / 'dist'
dist.mkdir(exist_ok=True)

data = pathlib.Path(args.data).read_text(encoding='utf-8')
json.loads(data)  # fail fast on a broken trace
# the staged full-coverage session is synthetic, so it is rebuilt here rather than kept in git
demo_path = ROOT / 'data' / 'demo-trace.json'
subprocess.run([sys.executable, str(ROOT.parent / 'tools' / 'make_demo_trace.py'), '--out', str(demo_path)], check=True, capture_output=True)
demo = demo_path.read_text(encoding='utf-8')
json.loads(demo)


def build(name, cfg):
    vdir = SRC / name
    parts = sorted([*(SRC / 'shared' / 'js').glob('*.js'), *(vdir / 'js').glob('*.js')], key=lambda p: p.name)
    script = '\n'.join(f'// ── {p.parent.parent.name}/{p.name} ──\n' + p.read_text(encoding='utf-8') for p in parts)
    if '</script' in script.lower():
        sys.exit(f'{name}: a script module contains "</script", which would end the inline <script> early')
    # syntax check the assembled module before it reaches a browser
    if shutil.which('node'):
        probe = dist / f'{name}.check.mjs'
        probe.write_text(script, encoding='utf-8')
        res = subprocess.run(['node', '--check', str(probe)], capture_output=True, text=True)
        probe.unlink()
        if res.returncode != 0:
            sys.exit(f'{name}: script syntax error:\n' + res.stderr)
    head = (SRC / 'shared' / 'head.html').read_text(encoding='utf-8').replace('__TITLE__', cfg['title'])
    page = (head + '<style>\n' + (SRC / 'shared' / 'style.css').read_text(encoding='utf-8') + '</style>\n\n'
            + (vdir / 'body.html').read_text(encoding='utf-8') + '\n' + (SRC / 'shared' / 'tail.html').read_text(encoding='utf-8'))
    page = (page.replace('__SCRIPT__', script)
            .replace('__TRACE_JSON__', data.replace('</', '<\\/'))
            .replace('__DEMO_JSON__', demo.replace('</', '<\\/')))
    (dist / cfg['out']).write_text(page, encoding='utf-8')
    (dist / name).mkdir(exist_ok=True)
    (dist / name / 'index.html').write_text(
        '<!doctype html>\n<html lang="zh-CN"><head><meta charset="utf-8">'
        '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">'
        '</head><body>\n' + page + '\n</body></html>\n',
        encoding='utf-8',
    )
    print(f'built {dist}/{cfg["out"]} ({len(page) / 1024:.0f} KB, {len(parts)} modules) and {name}/index.html')


for name, cfg in VARIANTS.items():
    if args.variant in ('all', name) and (SRC / name / 'body.html').exists():
        build(name, cfg)
