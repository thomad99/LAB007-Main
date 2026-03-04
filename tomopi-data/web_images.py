#!/usr/bin/env python3
import time
import random
import re
from pathlib import Path
from urllib.parse import urljoin, urlparse

import pygame
import requests

from common import setup_logging, resolve_path

IMG_EXTS = (".png", ".jpg", ".jpeg", ".bmp", ".webp")

def _is_image_url(u: str) -> bool:
    p = urlparse(u).path.lower()
    return any(p.endswith(ext) for ext in IMG_EXTS)

def _fetch_manifest_json(url: str, timeout: int = 8):
    r = requests.get(url, timeout=timeout)
    r.raise_for_status()
    data = r.json()
    if isinstance(data, dict) and "images" in data:
        data = data["images"]
    if not isinstance(data, list):
        raise ValueError("Manifest JSON must be a list (or {images:[...]})")
    return [str(x) for x in data]

def _scrape_links_from_html(index_url: str, timeout: int = 8):
    r = requests.get(index_url, timeout=timeout)
    r.raise_for_status()
    html = r.text

    # Grab href="..." and src="..."
    candidates = set()
    for m in re.finditer(r'''href\s*=\s*["']([^"']+)["']''', html, flags=re.IGNORECASE):
        candidates.add(m.group(1))
    for m in re.finditer(r'''src\s*=\s*["']([^"']+)["']''', html, flags=re.IGNORECASE):
        candidates.add(m.group(1))

    # Normalize to absolute URLs and filter to images
    out = []
    for c in candidates:
        u = urljoin(index_url, c)
        if _is_image_url(u):
            out.append(u)

    # De-dupe, stable order
    out = sorted(set(out))
    return out

def _download_to_cache(url: str, cache_dir: Path, timeout: int = 10) -> Path:
    cache_dir.mkdir(parents=True, exist_ok=True)

    # File name from URL path
    fname = Path(urlparse(url).path).name
    if not fname:
        # fallback
        fname = f"img_{abs(hash(url))}.bin"
    dest = cache_dir / fname

    # If exists, keep it (simple cache)
    if dest.exists() and dest.stat().st_size > 0:
        return dest

    r = requests.get(url, timeout=timeout)
    r.raise_for_status()
    dest.write_bytes(r.content)
    return dest

def _scale_contain(img, w, h):
    iw, ih = img.get_width(), img.get_height()
    scale = min(w/iw, h/ih)
    return pygame.transform.smoothscale(img, (max(1,int(iw*scale)), max(1,int(ih*scale))))

def _scale_cover(img, w, h):
    iw, ih = img.get_width(), img.get_height()
    scale = max(w/iw, h/ih)
    return pygame.transform.smoothscale(img, (max(1,int(iw*scale)), max(1,int(ih*scale))))

def _load_surface(path: Path, W: int, H: int, fit: str):
    # convert_alpha keeps transparency if present
    img = pygame.image.load(str(path)).convert_alpha()
    if fit == "cover":
        scaled = _scale_cover(img, W, H)
        x = (scaled.get_width() - W)//2
        y = (scaled.get_height() - H)//2
        surf = pygame.Surface((W, H))
        surf.fill((0,0,0))
        surf.blit(scaled, (-x, -y))
        return surf
    else:
        scaled = _scale_contain(img, W, H)
        surf = pygame.Surface((W, H))
        surf.fill((0,0,0))
        surf.blit(scaled, ((W-scaled.get_width())//2, (H-scaled.get_height())//2))
        return surf

def _message_screen(msg: str, seconds: int = 8):
    pygame.init()
    info = pygame.display.Info()
    screen = pygame.display.set_mode((info.current_w, info.current_h), pygame.FULLSCREEN)
    font = pygame.font.SysFont("Arial", 34, bold=True)
    start = time.time()
    while time.time() - start < seconds:
        for _ in pygame.event.get():
            pass
        screen.fill((0,0,0))
        y = 40
        for line in msg.splitlines():
            screen.blit(font.render(line, True, (255,170,90)), (30, y))
            y += 44
        pygame.display.flip()
        pygame.time.wait(50)
    pygame.quit()

def run(cfg: dict):
    setup_logging()

    wcfg = cfg.get("web_images", {})
    # Prefer manifest_url if supplied
    manifest_url = wcfg.get("manifest_url")  # e.g. https://.../images/images.json
    index_url = wcfg.get("index_url")        # e.g. https://.../images/
    seconds_per_slide = float(wcfg.get("seconds_per_slide", 6))
    refresh_list_seconds = int(wcfg.get("refresh_list_seconds", 300))
    shuffle = bool(wcfg.get("shuffle", True))
    fit = wcfg.get("fit", "contain")  # contain|cover

    transition = wcfg.get("transition", "fade")  # none|fade
    fade_ms = int(wcfg.get("fade_ms", 400))

    cache_dir = resolve_path(wcfg.get("cache_dir", "web_cache"))
    cache_dir.mkdir(parents=True, exist_ok=True)

    if not manifest_url and not index_url:
        _message_screen("web_images misconfigured.\nSet manifest_url or index_url in JSON.", 10)
        return

    pygame.init()
    info = pygame.display.Info()
    W, H = info.current_w, info.current_h
    screen = pygame.display.set_mode((W, H), pygame.FULLSCREEN)
    clock = pygame.time.Clock()

    def fetch_list():
        try:
            if manifest_url:
                items = _fetch_manifest_json(manifest_url)
                # items can be absolute or relative to index_url/base
                base = index_url or manifest_url
                urls = [urljoin(base, x) for x in items]
            else:
                urls = _scrape_links_from_html(index_url)

            urls = [u for u in urls if _is_image_url(u)]
            urls = sorted(set(urls))
            if shuffle:
                random.shuffle(urls)
            return urls, None
        except Exception as e:
            return [], f"{type(e).__name__}: {e}"

    urls, err = fetch_list()
    if not urls:
        msg = "No web images found.\n"
        if manifest_url:
            msg += f"manifest_url: {manifest_url}\n"
        if index_url:
            msg += f"index_url: {index_url}\n"
        msg += f"\nError: {err or 'Unknown'}"
        _message_screen(msg, 12)
        return

    last_list_refresh = time.time()
    idx = 0

    # Preload first
    def get_surface_for(url: str):
        p = _download_to_cache(url, cache_dir)
        return _load_surface(p, W, H, fit)

    current = get_surface_for(urls[idx])
    last_switch = time.time()

    def fade_to(next_surf):
        if transition != "fade" or fade_ms <= 0:
            return next_surf
        start = pygame.time.get_ticks()
        while True:
            now = pygame.time.get_ticks()
            t = now - start
            a = min(255, int(255 * (t / fade_ms)))
            screen.blit(current, (0,0))
            tmp = next_surf.copy()
            tmp.set_alpha(a)
            screen.blit(tmp, (0,0))
            pygame.display.flip()
            clock.tick(60)
            if t >= fade_ms:
                break
        return next_surf

    while True:
        for event in pygame.event.get():
            if event.type == pygame.KEYDOWN and event.key == pygame.K_ESCAPE:
                pygame.quit()
                return

        # Refresh list occasionally
        if time.time() - last_list_refresh >= refresh_list_seconds:
            new_urls, new_err = fetch_list()
            if new_urls:
                urls = new_urls
                idx = min(idx, len(urls)-1)
            last_list_refresh = time.time()

        if time.time() - last_switch >= seconds_per_slide:
            idx = (idx + 1) % len(urls)
            try:
                nxt = get_surface_for(urls[idx])
                current = fade_to(nxt)
            except Exception:
                # Skip broken image
                pass
            last_switch = time.time()

        screen.blit(current, (0,0))
        pygame.display.flip()
        clock.tick(30)

if __name__ == "__main__":
    from common import load_config
    run(load_config())
