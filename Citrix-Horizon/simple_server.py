#!/usr/bin/env python3
"""
Simple HTTP server to serve Citrix-Horizon web files and handle config saving.
This allows the config.html to work locally and save to LAB007-Tools-Config.json
"""

import http.server
import socketserver
import json
import os
from urllib.parse import urlparse, parse_qs
from http import HTTPStatus

class ConfigHandler(http.server.SimpleHTTPRequestHandler):
    def do_POST(self):
        if self.path == '/api/audit-config':
            self.handle_config_save()
        else:
            self.send_error(HTTPStatus.NOT_FOUND, "Endpoint not found")

    def handle_config_save(self):
        """Handle saving configuration to LAB007-Tools-Config.json"""
        try:
            # Read the request body
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            config = json.loads(post_data.decode('utf-8'))

            # Save to LAB007-Tools-Config.json
            config_path = 'LAB007-Tools-Config.json'
            with open(config_path, 'w') as f:
                json.dump(config, f, indent=2)

            print(f"Configuration saved to {config_path}")

            # Send success response
            self.send_response(HTTPStatus.OK)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            response = {'success': True, 'message': 'Configuration saved successfully'}
            self.wfile.write(json.dumps(response).encode('utf-8'))

        except Exception as e:
            print(f"Error saving config: {e}")
            self.send_error(HTTPStatus.INTERNAL_SERVER_ERROR, f"Failed to save configuration: {str(e)}")

    def do_GET(self):
        if self.path == '/api/audit-config':
            self.handle_config_load()
        else:
            # Serve static files from Web directory
            self.path = '/Web' + self.path
            super().do_GET()

    def handle_config_load(self):
        """Handle loading configuration from LAB007-Tools-Config.json"""
        try:
            config_path = 'LAB007-Tools-Config.json'
            if os.path.exists(config_path):
                with open(config_path, 'r') as f:
                    config = json.load(f)
            else:
                # Return default config if file doesn't exist
                config = {
                    "citrixVersion": "1912",
                    "ddcName": "localhost",
                    "usageDays": 30,
                    "vCenterServer": "shcvcsacx01v.ccr.cchcs.org",
                    "masterImagePrefix": "SHC-M-",
                    "runPreReqCheck": True,
                    "auditComponents": {
                        "SiteInfo": True,
                        "Applications": True,
                        "Desktops": True,
                        "Catalogs": True,
                        "DeliveryGroups": True,
                        "UsageStats": True,
                        "Policies": True,
                        "Roles": True,
                        "VMwareSpecs": False,
                        "Servers": True,
                        "DirectorOData": True
                    }
                }

            self.send_response(HTTPStatus.OK)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps(config).encode('utf-8'))

        except Exception as e:
            print(f"Error loading config: {e}")
            self.send_error(HTTPStatus.INTERNAL_SERVER_ERROR, f"Failed to load configuration: {str(e)}")

def run_server(port=8000):
    """Run the HTTP server"""
    with socketserver.TCPServer(("", port), ConfigHandler) as httpd:
        print(f"Server started at http://localhost:{port}")
        print(f"Open http://localhost:{port}/config.html to configure settings")
        print("Press Ctrl+C to stop the server")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nServer stopped")

if __name__ == "__main__":
    run_server()