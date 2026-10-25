"""Inline a normalized trace into the prototype page.

Writes two files under prototype/dist/:
  starfleet.html  page content only (the artifact host wraps it in a document)
  index.html      the same page wrapped in a full document, for local preview

Usage: python3 prototype/build.py [--data prototype/data/sample-trace.json]
"""
import argparse
import json
import pathlib

ROOT = pathlib.Path(__file__).resolve().parent

ap = argparse.ArgumentParser()
ap.add_argument('--data', default=str(ROOT / 'data' / 'sample-trace.json'))
args = ap.parse_args()

src = (ROOT / 'src' / 'page.html').read_text(encoding='utf-8')
data = pathlib.Path(args.data).read_text(encoding='utf-8')
json.loads(data)  # fail fast on a broken trace
page = src.replace('__TRACE_JSON__', data.replace('</', '<\\/'))

dist = ROOT / 'dist'
dist.mkdir(exist_ok=True)
(dist / 'starfleet.html').write_text(page, encoding='utf-8')
(dist / 'index.html').write_text(
    '<!doctype html>\n<html lang="zh-CN"><head><meta charset="utf-8">'
    '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">'
    '</head><body>\n' + page + '\n</body></html>\n',
    encoding='utf-8',
)
print(f'built {dist}/starfleet.html ({len(page) / 1024:.0f} KB) and index.html')
