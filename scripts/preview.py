#!/usr/bin/env python3
"""Local static preview with production page aliases; the museum API is separate."""
import argparse
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit

PAGES = {path: '/index.html' for path in ('/', '/projects', '/tools', '/patchlog', '/gallery', '/downloads')}
PAGES.update({'/museum': '/museum.html', '/mc-calc': '/mc-calc.html'})
LEGACY = {'/index.html': '/', '/museum.html': '/museum', '/mc-calc.html': '/mc-calc'}


class Preview(SimpleHTTPRequestHandler):
    def send_head(self):
        request = urlsplit(self.path)
        destination = LEGACY.get(request.path)
        if request.path != '/' and request.path.endswith('/') and request.path.rstrip('/') in PAGES:
            destination = request.path.rstrip('/')
        if destination is not None:
            self.send_response(301)
            self.send_header('Location', destination + ('?' + request.query if request.query else ''))
            self.send_header('Content-Length', '0')
            self.end_headers()
            return None
        return super().send_head()

    def translate_path(self, path):
        return super().translate_path(PAGES.get(urlsplit(path).path, path))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--port', type=int, default=8000)
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[1]
    server = ThreadingHTTPServer(('127.0.0.1', args.port), partial(Preview, directory=str(root)))
    print(f'Preview: http://127.0.0.1:{args.port}/', flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        server.server_close()
