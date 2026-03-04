#!/usr/bin/env python3
import time
import random
from pathlib import Path

import pygame
from common import setup_logging, resolve_path

SUPPORTED = {".png", ".jpg", ".jpeg", ".bmp", ".webp"}


_STATE = {
    "loaded": False,
    "folder": None,
    "fit": None,
    "shuffle": None,
    "images": [],
    "idx": 0,
    "last_switch": 0.0,
    "cache": {},          # path -> surface sized to current layout
    "last_size": None,    # (W,H)
}


def load_images(folder: Path):
    try:
        return sorted([p for p in folder.iterdir() if p.is_file() and p.suffix.lower() in SUPPORTED])
    except Exception:
        return []


def scale_contain(img: pygame.Surface, w: int, h: int) -> pygame.Surface:
    iw, ih = img.get_width(), img.get_height()
    if iw <= 0 or ih <= 0:
        return pygame.Surface((w, h))
    scale = min(w / iw, h / ih)
    return pygame.transform.smoothscale(img, (max(1, int(iw * scale)), max(1, int(ih * scale))))


def scale_cover(img: pygame.Surface, w: int, h: int) -> pygame.Surface:
    iw, ih = img.get_width(), img.get_height()
    if iw <= 0 or ih <= 0:
        return pygame.Surface((w, h))
    scale = max(w / iw, h / ih)
    return pygame.transform.smoothscale(img, (max(1, int(iw * scale)), max(1, int(ih * scale))))


def build_image_surface(path: Path, W: int, H: int, fit: str) -> pygame.Surface:
    # Use convert_alpha to support PNG transparency
    img = pygame.image.load(str(path)).convert_alpha()

    if fit == "cover":
        scaled = scale_cover(img, W, H)
        x = (scaled.get_width() - W) // 2
        y = (scaled.get_height() - H) // 2
        surf = pygame.Surface((W, H)).convert()
        surf.blit(scaled, (-x, -y))
        return surf
    else:
        scaled = scale_contain(img, W, H)
        surf = pygame.Surface((W, H)).convert()
        surf.fill((0, 0, 0))
        surf.blit(
            scaled,
            ((W - scaled.get_width()) // 2, (H - scaled.get_height()) // 2),
        )
        return surf


def _reset_state():
    _STATE["loaded"] = False
    _STATE["folder"] = None
    _STATE["fit"] = None
    _STATE["shuffle"] = None
    _STATE["images"] = []
    _STATE["idx"] = 0
    _STATE["last_switch"] = 0.0
    _STATE["cache"] = {}
    _STATE["last_size"] = None


def _ensure_loaded(cfg: dict):
    s_cfg = cfg.get("slideshow", {}) or {}

    folder = resolve_path(s_cfg.get("folder", "images"))
    fit = (s_cfg.get("fit", "contain") or "contain").lower()
    shuffle = bool(s_cfg.get("shuffle", True))

    if (
        (not _STATE["loaded"])
        or (_STATE["folder"] != str(folder))
        or (_STATE["fit"] != fit)
        or (_STATE["shuffle"] != shuffle)
    ):
        folder.mkdir(parents=True, exist_ok=True)
        images = load_images(folder)
        if shuffle:
            random.shuffle(images)

        _STATE["loaded"] = True
        _STATE["folder"] = str(folder)
        _STATE["fit"] = fit
        _STATE["shuffle"] = shuffle
        _STATE["images"] = images
        _STATE["idx"] = 0
        _STATE["last_switch"] = time.time()
        _STATE["cache"] = {}
        _STATE["last_size"] = None


def _get_layout_rects(W: int, H: int, s_cfg: dict):
    clock_cfg = s_cfg.get("clock", {}) or {}
    clock_enabled = bool(clock_cfg.get("enabled", False))
    layout = (clock_cfg.get("layout", "center") or "center").lower()

    full = pygame.Rect(0, 0, W, H)

    # For left/right, split screen: half for clock, half for image
    if clock_enabled and layout in ("left", "right"):
        half_w = W // 2
        left = pygame.Rect(0, 0, half_w, H)
        right = pygame.Rect(half_w, 0, W - half_w, H)

        if layout == "left":
            # clock on left, image on right
            return {"clock": left, "image": right}
        else:
            # clock on right, image on left
            return {"clock": right, "image": left}

    # Otherwise, fullscreen image; clock is overlay
    return {"clock": full, "image": full}


def _get_current_image_surface(W: int, H: int, s_cfg: dict):
    images = _STATE["images"]
    if not images:
        return None

    rects = _get_layout_rects(W, H, s_cfg)
    img_rect = rects["image"]

    # Cache key based on path + size of image area + fit mode
    path = images[_STATE["idx"] % len(images)]
    key = (str(path), img_rect.w, img_rect.h, _STATE["fit"])

    if key in _STATE["cache"]:
        return _STATE["cache"][key]

    surf = build_image_surface(path, img_rect.w, img_rect.h, _STATE["fit"])
    _STATE["cache"][key] = surf
    return surf


def _draw_no_images(canvas: pygame.Surface, folder: str):
    W, H = canvas.get_size()
    canvas.fill((0, 0, 0))
    font = pygame.font.SysFont("Arial", max(18, int(H * 0.12)), bold=True)
    msg = f"No images in {folder}"
    txt = font.render(msg, True, (255, 255, 255))
    canvas.blit(txt, ((W - txt.get_width()) // 2, (H - txt.get_height()) // 2))


def _draw_clock(canvas: pygame.Surface, rect: pygame.Rect, clock_cfg: dict):
    if not bool(clock_cfg.get("enabled", False)):
        return

    fmt = clock_cfg.get("format", "%H:%M")
    font_name = clock_cfg.get("font_name", None)
    font_size = int(clock_cfg.get("font_size", 120))
    bold = bool(clock_cfg.get("bold", True))
    color = tuple(clock_cfg.get("color_rgb", [255, 255, 255]))

    box = bool(clock_cfg.get("box", True))
    box_alpha = int(clock_cfg.get("box_alpha", 120))
    box_pad = int(clock_cfg.get("box_pad", 24))

    # Render clock text
    font = pygame.font.SysFont(font_name, font_size, bold=bold)
    now = time.strftime(fmt)
    text = font.render(now, True, color)
    tw, th = text.get_width(), text.get_height()

    # Center within the clock rect
    x = rect.x + (rect.w - tw) // 2
    y = rect.y + (rect.h - th) // 2

    if box:
        bw = tw + box_pad * 2
        bh = th + box_pad * 2
        bx = x - box_pad
        by = y - box_pad
        bg = pygame.Surface((bw, bh), pygame.SRCALPHA)
        bg.fill((0, 0, 0, max(0, min(255, box_alpha))))
        canvas.blit(bg, (bx, by))

    canvas.blit(text, (x, y))


def run_frame(cfg: dict, canvas: pygame.Surface):
    if not pygame.get_init():
        pygame.init()

    s_cfg = cfg.get("slideshow", {}) or {}
    seconds = float(s_cfg.get("seconds_per_slide", 6))

    _ensure_loaded(cfg)

    W, H = canvas.get_size()
    # If canvas size changes (logical_resolution change), invalidate caches
    if _STATE["last_size"] != (W, H):
        _STATE["last_size"] = (W, H)
        _STATE["cache"] = {}

    images = _STATE["images"]
    folder = _STATE["folder"]

    if not images:
        _draw_no_images(canvas, folder)
        return

    # Advance slide
    now = time.time()
    if seconds > 0 and (now - _STATE["last_switch"]) >= seconds:
        _STATE["idx"] = (_STATE["idx"] + 1) % len(images)
        _STATE["last_switch"] = now

    rects = _get_layout_rects(W, H, s_cfg)
    img_rect = rects["image"]
    clock_rect = rects["clock"]

    # Background
    canvas.fill((0, 0, 0))

    # Draw image into its region
    img = _get_current_image_surface(W, H, s_cfg)
    if img is not None:
        canvas.blit(img, (img_rect.x, img_rect.y))

    # Draw clock overlay
    clock_cfg = s_cfg.get("clock", {}) or {}
    _draw_clock(canvas, clock_rect, clock_cfg)


def run(cfg: dict):
    """
    Legacy compatibility loop. The new launcher should call run_frame().
    """
    setup_logging()
    pygame.init()
    screen = pygame.display.set_mode((0, 0), pygame.FULLSCREEN)
    clock = pygame.time.Clock()

    while True:
        for event in pygame.event.get():
            if event.type == pygame.KEYDOWN and event.key == pygame.K_ESCAPE:
                pygame.quit()
                return

        run_frame(cfg, screen)
        pygame.display.flip()
        clock.tick(30)


if __name__ == "__main__":
    from common import load_config

    setup_logging()
    run(load_config())
