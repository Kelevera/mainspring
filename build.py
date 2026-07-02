#!/usr/bin/env python3
"""MAINSPRING build: inline src/* into single-file dist/index.html (full)
and dist-demo/index.html (demo), then zip both for itch.io upload.
Usage: python3 build.py
Env:   ITCH_URL=https://you.itch.io/mainspring   (baked into demo upsell + share text)
       UNLOCK_CODES=CODE1,CODE2                  (or put codes in unlock_codes.txt)
"""
import os, zipfile

ROOT = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(ROOT, 'src')

def load_unlock_codes():
    """Unlock codes live OUTSIDE the source tree (sold via Stripe/itch rewards).
    Priority: UNLOCK_CODES env var (comma-separated) > unlock_codes.txt > none."""
    env = os.environ.get('UNLOCK_CODES')
    if env:
        return [c.strip().upper() for c in env.split(',') if c.strip()]
    p = os.path.join(ROOT, 'unlock_codes.txt')
    if os.path.exists(p):
        with open(p, encoding='utf-8') as f:
            return [l.strip().upper() for l in f if l.strip() and not l.startswith('#')]
    print('NOTE: no unlock_codes.txt / UNLOCK_CODES env - demo build will accept no unlock codes.')
    return []

UNLOCK_CODES = load_unlock_codes()

def djb2(s):
    h = 5381
    for ch in s:
        h = ((h * 33) + ord(ch)) & 0xFFFFFFFF
    return h

def read(name):
    with open(os.path.join(SRC, name), encoding='utf-8') as f:
        return f.read().replace('\x00', '').replace('\r\n', '\n')

FAVICON = ("data:image/svg+xml," +
  "%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E"
  "%3Ccircle cx='12' cy='12' r='6' fill='%23e9c34a'/%3E"
  "%3Cg fill='%23e9c34a'%3E%3Crect x='11' y='2' width='2' height='4'/%3E"
  "%3Crect x='11' y='18' width='2' height='4'/%3E%3Crect x='2' y='11' width='4' height='2'/%3E"
  "%3Crect x='18' y='11' width='4' height='2'/%3E%3C/g%3E"
  "%3Ccircle cx='12' cy='12' r='2.4' fill='%231d1710'/%3E%3C/svg%3E")

TEMPLATE = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>MAINSPRING - a clockwork engine-building roguelike</title>
<meta name="description" content="Place gears, mind your loops: meshed gears counter-rotate, and a tight loop jams the whole train. An engine-building roguelike about building one beautiful machine.">
<meta property="og:title" content="MAINSPRING">
<meta property="og:description" content="A clockwork engine-building roguelike. Meshed gears counter-rotate - close a tight loop and everything jams.">
<meta property="og:type" content="website">
<link rel="icon" href="__FAVICON__">
<style>
__CSS__
</style>
</head>
<body>
<div id="app"></div>
<script>
__JS__
</script>
</body>
</html>
"""

def build(demo, outdir, itch_url):
    js_parts = []
    for name in ['data.js', 'engine.js', 'audio.js', 'ui.js', 'main.js']:
        code = read(name)
        if name == 'main.js':
            code = code.replace('const MS_DEMO = false;', 'const MS_DEMO = ' + str(demo).lower() + ';')
            code = code.replace("const MS_ITCH_URL = 'https://YOURNAME.itch.io/mainspring';",
                                "const MS_ITCH_URL = '" + itch_url + "';")
            hashes = ', '.join(str(djb2(c)) for c in UNLOCK_CODES)
            code = code.replace('/*@HASHES@*/', hashes)
        js_parts.append('/* ===== ' + name + ' ===== */\n' + code)
    js = '\n\n'.join(js_parts)
    assert '</script' not in js.lower(), 'script-breaking token found in JS!'
    html = (TEMPLATE
            .replace('__FAVICON__', FAVICON)
            .replace('__CSS__', read('style.css'))
            .replace('__JS__', js))
    if demo:
        html = html.replace('<title>MAINSPRING -', '<title>MAINSPRING (free demo) -')
    os.makedirs(os.path.join(ROOT, outdir), exist_ok=True)
    out = os.path.join(ROOT, outdir, 'index.html')
    with open(out, 'w', encoding='utf-8') as f:
        f.write(html)
    print('built ' + outdir + '/index.html  (' + str(len(html)//1024) + ' KB)')
    return out

def zipit(src_html, zip_name):
    zp = os.path.join(ROOT, zip_name)
    with zipfile.ZipFile(zp, 'w', zipfile.ZIP_DEFLATED) as z:
        z.write(src_html, 'index.html')
    print('zipped ' + zip_name + '  (' + str(os.path.getsize(zp)//1024) + ' KB)')

if __name__ == '__main__':
    itch = os.environ.get('ITCH_URL', 'https://YOURNAME.itch.io/mainspring')
    full = build(False, 'dist', itch)
    demo = build(True, 'dist-demo', itch)
    zipit(full, 'mainspring-itch-FULL.zip')
    zipit(demo, 'mainspring-itch-DEMO.zip')
    if UNLOCK_CODES:
        print('\nUnlock codes baked into this build (keep private):')
        for c in UNLOCK_CODES:
            print('  ' + c)
