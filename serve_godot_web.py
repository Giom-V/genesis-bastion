#!/usr/bin/env python3
"""
@file serve_godot_web.py
@description HTTP server for Genesis Bastion — Godot 4.3 WebAssembly HTML5 Edition (Port 5175).
Serves `build/web/` with required WebAssembly MIME types (`application/wasm`),
Cross-Origin Isolation headers (COOP/COEP), and CORS headers so the exported
Godot 4.3 project runs smoothly at `http://giom-us.c.googlers.com:5175/`.

Usage:
  python3 serve_godot_web.py --port 5175
  python3 serve_godot_web.py --dry-run
"""

import argparse
import functools
import http.server
import logging
import os
import socketserver
import sys

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] [GODOT-WEB-SERVER] %(message)s",
)
logger = logging.getLogger("serve_godot_web")


class GodotWebRequestHandler(http.server.SimpleHTTPRequestHandler):
    """HTTP handler adding COOP/COEP, CORS, and WebAssembly MIME types for Godot 4.3 HTML5 exports."""

    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        ".wasm": "application/wasm",
        ".pck": "application/octet-stream",
        ".js": "application/javascript",
        ".mjs": "application/javascript",
        ".html": "text/html; charset=utf-8",
        ".png": "image/png",
        ".svg": "image/svg+xml",
    }

    def end_headers(self) -> None:
        """Injects COOP, COEP, and CORS headers required by Godot 4 WebAssembly builds."""
        self.send_header("Cross-Origin-Opener-Policy", "same-origin")
        self.send_header("Cross-Origin-Embedder-Policy", "require-corp")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    def log_message(self, fmt: str, *args) -> None:
        """Logs HTTP requests via structured logger."""
        logger.info("%s - %s", self.address_string(), fmt % args)


class ReusableTCPServer(socketserver.ThreadingMixIn, http.server.HTTPServer):
    """Multi-threaded HTTP server with SO_REUSEADDR enabled."""

    allow_reuse_address = True
    daemon_threads = True


def parse_args() -> argparse.Namespace:
    """Parses command-line flags."""
    parser = argparse.ArgumentParser(
        description="Serve Genesis Bastion Godot 4.3 WebAssembly build on port 5175."
    )
    parser.add_argument("--host", default="0.0.0.0", help="Bind address (default: 0.0.0.0)")
    parser.add_argument("--port", type=int, default=5175, help="Port number (default: 5175)")
    parser.add_argument(
        "--dir",
        default=os.path.join(os.path.dirname(os.path.abspath(__file__)), "build", "web"),
        help="Directory containing exported Godot Web build (default: ./build/web)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Validate exported build/web files without binding the network socket.",
    )
    return parser.parse_args()


def main() -> int:
    """Main entry point for the Godot 4.3 WebAssembly server."""
    args = parse_args()
    web_dir = os.path.abspath(args.dir)
    logger.info("Starting Genesis Bastion Godot 4.3 Web server check (dir=%s)", web_dir)

    if args.dry_run:
        index_html = os.path.join(web_dir, "index.html")
        wasm_file = os.path.join(web_dir, "index.wasm")
        pck_file = os.path.join(web_dir, "index.pck")
        logger.info(
            "[DRY-RUN] Checking build/web artifacts: index.html=%s, index.wasm=%s, index.pck=%s",
            os.path.isfile(index_html),
            os.path.isfile(wasm_file),
            os.path.isfile(pck_file),
        )
        return 0

    os.makedirs(web_dir, exist_ok=True)
    handler_cls = functools.partial(GodotWebRequestHandler, directory=web_dir)
    with ReusableTCPServer((args.host, args.port), handler_cls) as httpd:
        logger.info(
            "Serving Genesis Bastion (Godot 4.3 WebAssembly) at http://giom-us.c.googlers.com:%d/ (dir=%s)",
            args.port,
            web_dir,
        )
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            logger.info("Shutting down Godot 4.3 Web server.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
