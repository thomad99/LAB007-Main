#!/usr/bin/env python3
import time
import pygame
from common import setup_logging


# Module-level state so animation persists across frames
_STATE = {
    "prev": None,
    "tiles": None,        # list of {"old":surf,"new":surf,"anim_start":int|None}
    "fmt": None,
    "font_sig": None,     # (tile_w, tile_h, font_name, bold)
    "font": None,
}


def _make_font(tile_h: int, font_name: str, bold: bool):
    size = max(12, int(tile_h * 0.55))
    try:
        return pygame.font.SysFont(font_name, size, bold=bold)
    except Exception:
        return pygame.font.SysFont(None, size, bold=bold)


def _render_tile(text: str, tile_w: int, tile_h: int, font: pygame.font.Font):
    surf = pygame.Surface((tile_w, tile_h), pygame.SRCALPHA)

    top = pygame.Rect(0, 0, tile_w, tile_h // 2)
    bottom = pygame.Rect(0, tile_h // 2, tile_w, tile_h // 2)

    pygame.draw.rect(surf, (25, 25, 25), top, border_radius=max(8, tile_h // 12))
    pygame.draw.rect(surf, (15, 15, 15), bottom, border_radius=max(8, tile_h // 12))
    pygame.draw.line(surf, (0, 0, 0), (0, tile_h // 2), (tile_w, tile_h // 2), 2)

    txt = font.render(text, True, (240, 240, 240))
    surf.blit(
        txt,
        (
            (tile_w - txt.get_width()) // 2,
            (tile_h - txt.get_height()) // 2 - int(tile_h * 0.04),
        ),
    )

    return surf


def _draw_colon(canvas: pygame.Surface, x: int, y: int, tile_h: int):
    r = max(2, int(tile_h * 0.03))
    cy = y + tile_h // 2
    pygame.draw.circle(canvas, (240, 240, 240), (x, cy - int(tile_h * 0.12)), r)
    pygame.draw.circle(canvas, (240, 240, 240), (x, cy + int(tile_h * 0.12)), r)


def run_frame(cfg: dict, canvas: pygame.Surface):
    if not pygame.get_init():
        pygame.init()

    fcfg = cfg.get("flip_clock", {}) or {}
    fmt = fcfg.get("format", "%H:%M")
    fps = int(fcfg.get("fps", 45))         # unused in frame mode; launcher ticks
    flip_ms = int(fcfg.get("flip_ms", 450))
    font_name = fcfg.get("font_name", "Arial")
    bold = bool(fcfg.get("bold", True))

    W, H = canvas.get_size()
    canvas.fill((0, 0, 0))

    now = time.strftime(fmt)
    groups = now.split(":")  # ["HH","MM"] or ["HH","MM","SS"]
    n = len(groups)

    # Layout tuned for wide ribbon
    tile_h = max(60, int(H * 0.78))
    # Leave room for colons + gaps
    gap = max(10, int(W * 0.02))
    colon_w = max(14, int(tile_h * 0.14))

    usable_w = W - (gap * (n - 1)) - (colon_w * (n - 1))
    tile_w = max(80, int(usable_w / n))

    # Ensure font
    font_sig = (tile_w, tile_h, font_name, bold)
    if _STATE["font"] is None or _STATE["font_sig"] != font_sig:
        _STATE["font"] = _make_font(tile_h, font_name, bold)
        _STATE["font_sig"] = font_sig

    font = _STATE["font"]

    # Initialize state if needed
    if _STATE["prev"] is None or _STATE["fmt"] != fmt or _STATE["tiles"] is None:
        _STATE["fmt"] = fmt
        _STATE["prev"] = now
        _STATE["tiles"] = []
        for g in groups:
            t = _render_tile(g, tile_w, tile_h, font)
            _STATE["tiles"].append({"old": t, "new": t, "anim_start": None})

    # If group count changes (switching formats), rebuild
    if len(_STATE["tiles"]) != n:
        _STATE["prev"] = None
        _STATE["tiles"] = None
        run_frame(cfg, canvas)
        return

    # Start animations for changed groups
    prev_groups = (_STATE["prev"] or now).split(":")
    if prev_groups != groups:
        tick = pygame.time.get_ticks()
        for i in range(n):
            if i >= len(prev_groups) or prev_groups[i] != groups[i]:
                _STATE["tiles"][i]["old"] = _render_tile(prev_groups[i] if i < len(prev_groups) else groups[i], tile_w, tile_h, font)
                _STATE["tiles"][i]["new"] = _render_tile(groups[i], tile_w, tile_h, font)
                _STATE["tiles"][i]["anim_start"] = tick
        _STATE["prev"] = now

    # Positioning
    total_w = n * tile_w + (n - 1) * gap + (n - 1) * colon_w
    x0 = (W - total_w) // 2
    y0 = (H - tile_h) // 2

    # Draw each tile + optional flip animation
    for i in range(n):
        x = x0 + i * tile_w + i * gap + i * colon_w

        tile = _STATE["tiles"][i]
        old_tile = tile["old"]
        new_tile = tile["new"]
        anim_start = tile["anim_start"]

        if anim_start is None:
            canvas.blit(new_tile, (x, y0))
        else:
            tms = pygame.time.get_ticks() - anim_start
            p = min(1.0, tms / max(1, flip_ms))

            # Base: draw new tile
            canvas.blit(new_tile, (x, y0))

            top_old = old_tile.subsurface((0, 0, tile_w, tile_h // 2))
            bottom_new = new_tile.subsurface((0, tile_h // 2, tile_w, tile_h // 2))

            if p < 0.5:
                k = 1.0 - (p / 0.5)
                h = max(1, int((tile_h // 2) * k))
                top_scaled = pygame.transform.smoothscale(top_old, (tile_w, h))
                canvas.blit(top_scaled, (x, y0 + (tile_h // 2 - h)))
            else:
                k = (p - 0.5) / 0.5
                h = max(1, int((tile_h // 2) * k))
                bottom_scaled = pygame.transform.smoothscale(bottom_new, (tile_w, h))
                canvas.blit(bottom_scaled, (x, y0 + tile_h // 2))

            if p >= 1.0:
                tile["anim_start"] = None
                tile["old"] = new_tile

        # Draw colon between tiles
        if i < n - 1:
            cx = x + tile_w + (colon_w // 2)
            _draw_colon(canvas, cx, y0, tile_h)


def run(cfg: dict):
    """
    Legacy compatibility: draw to active display surface once.
    The launcher should call run_frame() instead.
    """
    setup_logging()
    if not pygame.get_init():
        pygame.init()

    display = pygame.display.get_surface()
    if display is None:
        display = pygame.display.set_mode((0, 0), pygame.FULLSCREEN)

    run_frame(cfg, display)
    pygame.display.flip()


if __name__ == "__main__":
    from common import load_config
    setup_logging()
    run(load_config())
