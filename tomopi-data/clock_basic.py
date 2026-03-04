#!/usr/bin/env python3
import time
import pygame


def _get(cfg: dict, *keys, default=None):
    cur = cfg
    for k in keys:
        if not isinstance(cur, dict) or k not in cur:
            return default
        cur = cur[k]
    return cur


def _load_font(name: str | None, size: int, bold: bool):
    # pygame SysFont names depend on installed fonts. If name is None/invalid,
    # SysFont will fall back to a default.
    try:
        font = pygame.font.SysFont(name, size, bold=bold)
    except Exception:
        font = pygame.font.SysFont(None, size, bold=bold)
    return font


def run_frame(cfg: dict, canvas: pygame.Surface):
    """
    Draw a basic digital clock onto the provided canvas surface.
    This is the preferred mode interface for the launcher.
    """
    clock_cfg = cfg.get("clock_basic", {}) or {}

    fmt = clock_cfg.get("format", "%H:%M:%S")
    font_name = clock_cfg.get("font_name", None)
    font_size = int(clock_cfg.get("font_size", 220))
    bold = bool(clock_cfg.get("bold", True))

    color_rgb = tuple(clock_cfg.get("color_rgb", [255, 170, 90]))
    bg_rgb = tuple(clock_cfg.get("bg_rgb", [0, 0, 0]))

    # Clear background
    canvas.fill(bg_rgb)

    # Render time
    now_str = time.strftime(fmt)

    font = _load_font(font_name, font_size, bold)
    text_surf = font.render(now_str, True, color_rgb)

    # Center it
    cw, ch = canvas.get_width(), canvas.get_height()
    tw, th = text_surf.get_width(), text_surf.get_height()

    x = (cw - tw) // 2
    y = (ch - th) // 2

    canvas.blit(text_surf, (x, y))


def run(cfg: dict):
    """
    Legacy compatibility: draw directly to the active display surface.
    The launcher may still call this if run_frame isn't present, but now it is.
    """
    # Ensure pygame display is initialized
    if not pygame.get_init():
        pygame.init()

    display = pygame.display.get_surface()
    if display is None:
        # If not yet set, create a fullscreen display
        info = pygame.display.Info()
        display = pygame.display.set_mode((info.current_w, info.current_h), pygame.FULLSCREEN)

    run_frame(cfg, display)
    pygame.display.flip()
