"""Record the SmartHours advert HTML to a 1920x1080 MP4."""
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
import os
import shutil
import subprocess
import threading
import time

import imageio_ffmpeg
from playwright.sync_api import sync_playwright

ROOT = os.path.join(os.path.dirname(__file__), '..', 'public')
OUT_DIR = os.path.join(ROOT, 'smarthours-assets', 'about')
TMP = os.path.join(os.path.dirname(__file__), '..', '.tmp-ad')
PORT = 8778
TOTAL_MS = 20400


class Handler(SimpleHTTPRequestHandler):
    def log_message(self, format, *args):
        return

    def translate_path(self, path):
        p = path.split('?', 1)[0]
        if p in ('/SmartHours/ad', '/SmartHours/assets/about/advert.html'):
            return os.path.join(OUT_DIR, 'advert.html')
        if p.startswith('/SmartHours/assets/'):
            rel = p[len('/SmartHours/assets/'):].replace('/', os.sep)
            return os.path.join(ROOT, 'smarthours-assets', rel)
        return os.path.join(ROOT, p.lstrip('/').replace('/', os.sep))


def main():
    os.makedirs(TMP, exist_ok=True)
    for name in os.listdir(TMP):
        path = os.path.join(TMP, name)
        if os.path.isfile(path):
            os.remove(path)

    server = ThreadingHTTPServer(('127.0.0.1', PORT), Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    time.sleep(0.3)

    with sync_playwright() as p:
        browser = p.chromium.launch()
        context = browser.new_context(
            viewport={'width': 1920, 'height': 1080},
            device_scale_factor=1,
            record_video_dir=TMP,
            record_video_size={'width': 1920, 'height': 1080},
        )
        page = context.new_page()
        page.goto(
            f'http://127.0.0.1:{PORT}/SmartHours/assets/about/advert.html?record=1',
            wait_until='networkidle',
        )
        page.wait_for_timeout(TOTAL_MS)
        webm = page.video.path()
        context.close()
        browser.close()

    mp4 = os.path.abspath(os.path.join(OUT_DIR, 'smarthours-advert.mp4'))
    mp3 = os.path.abspath(os.path.join(OUT_DIR, 'smarthours-advert.mp3'))
    ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
    cmd = [ffmpeg, '-y', '-i', webm]
    if os.path.isfile(mp3):
        cmd += ['-i', mp3, '-map', '0:v:0', '-map', '1:a:0', '-t', '19.8', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k']
    else:
        cmd += ['-c:v', 'libx264', '-pix_fmt', 'yuv420p']
    cmd += ['-movflags', '+faststart', mp4]
    subprocess.check_call(cmd)
    server.shutdown()
    shutil.rmtree(TMP, ignore_errors=True)
    print('Wrote', mp4)


if __name__ == '__main__':
    main()
