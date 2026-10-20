#!/usr/bin/env python3
"""
Lightweight HTTP Server for Cayetino R4 Web Interface
Serves the 'framework' directory locally with proper MIME types and CORS
so you can test Web Serial and Web Bluetooth before deploying to GitHub Pages.
"""

import sys
import os
import argparse
import webbrowser
from http.server import HTTPServer, SimpleHTTPRequestHandler
from pathlib import Path


class FrameworkHTTPRequestHandler(SimpleHTTPRequestHandler):
    """Custom HTTP handler with CORS and explicit MIME types."""
    
    extensions_map = {
        **SimpleHTTPRequestHandler.extensions_map,
        '.js': 'application/javascript',
        '.mjs': 'application/javascript',
        '.css': 'text/css',
        '.csv': 'text/csv; charset=utf-8',
        '.txt': 'text/plain; charset=utf-8',
        '.json': 'application/json',
        '.svg': 'image/svg+xml',
        '.ico': 'image/x-icon',
        '.woff2': 'font/woff2',
    }

    def end_headers(self):
        # Enable CORS for local testing
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'X-Requested-With, Content-Type')
        self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()

    def log_message(self, format, *args):
        # Clean logging
        sys.stdout.write(f"[{self.log_date_time_string()}] {args[0]} - {args[1]}\n")


def run_server(port: int = 8000, directory: Path = None, auto_open: bool = True):
    if directory is None:
        # Default to root/framework
        base_dir = Path(__file__).resolve().parent.parent
        framework_dir = base_dir / "framework"
        if framework_dir.exists():
            directory = framework_dir
        else:
            directory = base_dir
            
    os.chdir(directory)
    handler = FrameworkHTTPRequestHandler
    
    server_address = ('', port)
    try:
        httpd = HTTPServer(server_address, handler)
    except OSError as e:
        print(f"[ERROR] Could not start server on port {port}: {e}")
        print(f"Trying port {port + 1}...")
        port = port + 1
        server_address = ('', port)
        httpd = HTTPServer(server_address, handler)

    url = f"http://localhost:{port}"
    print("=" * 65)
    print("  CAYETINO R4 - Servidor Local de Pruebas (Pre-GitHub Pages)")
    print("=" * 65)
    print(f"  Directorio servido: {directory.resolve()}")
    print(f"  URL Local:          {url}")
    print(f"  Para detener:       Presiona Ctrl+C")
    print("=" * 65)
    print("  Nota: Las APIs de Web Serial y Web Bluetooth requieren")
    print("  un origen seguro (localhost o HTTPS como GitHub Pages).")
    print("=" * 65 + "\n")

    if auto_open:
        try:
            webbrowser.open(url)
        except Exception:
            pass

    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n[INFO] Servidor detenido por el usuario.")
        httpd.server_close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Servidor HTTP local para Cayetino R4")
    parser.add_argument("--port", "-p", type=int, default=8080, help="Puerto HTTP (defecto: 8080)")
    parser.add_argument("--no-browser", action="store_true", help="No abrir el navegador automáticamente")
    args = parser.parse_args()
    
    run_server(port=args.port, auto_open=not args.no_browser)
