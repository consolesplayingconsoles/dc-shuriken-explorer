#!/usr/bin/env python3
"""Serves web/ (the built page) on 127.0.0.1 with no caching, so a rebuilt page is what the browser loads. Stdlib only.

    python3 serve.py <port>
"""
import functools
import os
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer


class NoCache(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def log_message(self, *a):
        pass


port = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
web = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'web')
ThreadingHTTPServer(('127.0.0.1', port), functools.partial(NoCache, directory=web)).serve_forever()
