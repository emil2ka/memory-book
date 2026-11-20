#!/usr/bin/env python3
"""Tiny local receiver: POST /save?name=<file> with raw bytes -> writes to the target dir.
Used to pull generated images out of the built-in browser.
Run: python3 tools/recv_server.py <dir> [port]"""
import sys
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

OUT = Path(sys.argv[1]).resolve()
PORT = int(sys.argv[2]) if len(sys.argv) > 2 else 8765


class H(BaseHTTPRequestHandler):
    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "*")
        self.send_header("Access-Control-Allow-Private-Network", "true")

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_GET(self):
        # relay page: a cross-site tab stores {name, b64, back} in window.name and navigates
        # here; window.name survives the navigation, this same-origin page POSTs it to /save.
        page = b"""<!doctype html><meta charset=utf-8><body style="background:#111;color:#eee;font:16px monospace">
<pre id=o>relay...</pre><script>
(async()=>{const o=document.getElementById('o');try{
const d=JSON.parse(window.name);window.name='';
const bin=Uint8Array.from(atob(d.b64),c=>c.charCodeAt(0));
const r=await fetch('/save?name='+encodeURIComponent(d.name),{method:'POST',body:bin});
o.textContent='saved '+d.name+' '+(await r.text());document.title='SAVED '+d.name;
if(d.back)setTimeout(()=>location.href=d.back,300);
}catch(e){o.textContent='ERR '+e;document.title='ERR'}})();
</script>"""
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.end_headers()
        self.wfile.write(page)

    def do_POST(self):
        q = parse_qs(urlparse(self.path).query)
        name = Path(q.get("name", ["upload.bin"])[0]).name  # no path traversal
        data = self.rfile.read(int(self.headers.get("Content-Length", 0)))
        (OUT / name).write_bytes(data)
        self.send_response(200)
        self._cors()
        self.end_headers()
        self.wfile.write(f"ok {len(data)}".encode())


HTTPServer(("127.0.0.1", PORT), H).serve_forever()
