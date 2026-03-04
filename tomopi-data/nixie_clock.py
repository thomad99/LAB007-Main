#!/usr/bin/env python3
import time
from pathlib import Path
import pygame

from common import setup_logging, resolve_path


# Module-level cache to avoid reloading images every frame
_CACHE = {
    "folder": None,
    "scale": None,
    "digits": None,      # dict[str, Surface]
    "colon": None,       # Surface | None
    "missing": None,     # list[int] | None
    "font": None,        # pygame.font.Font
}


def _load_assets(folder: Path, scale: float):
    def load_png(p: Path):
        return pygame.image.load(str(p)).convert_alpha()

    missing = [d for d in range(10) if not (folder / f"{d}.png").exists()]
    if missing:
        return {"missing": missing, "digits": None, "colon": None}

    digits = {str(d): load_png(folder / f"{d}.png") for d in range(10)}
    colon_path = folder / "colon.png"
    colon = load_png(colon_path) if colon_path.exists() else None

    def scale_surf(s: pygame.Surface):
        if s is None or scale == 1.0:
            return s
        w = max(1, int(s.get_width() * scale))
        h = max(1, int(s.get_height() * scale))
        return pygame.transform.smoothscale(s, (w, h))

    digits = {k: scale_surf(v) for k, v in digits.items()}
    colon = scale_surf(colon)

    return {"missing": None, "digits": digits, "colon": colon}


def _ensure_cache(cfg: dict):
    ncfg = cfg.get("nixie_clock", {}) or {}
    folder = resolve_path(ncfg.get("folder", "nixie"))
    folder.mkdir(parents=True, exist_ok=True)
    scale = float(ncfg.get("scale", 1.0))

    if _CACHE["folder"] != str(folder) or _CACHE["scale"] != scale or _CACHE["digits"] is None:
        assets = _load_assets(folder, scale)
        _CACHE["folder"] = str(folder)
        _CACHE["scale"] = scale
        _CACHE["digits"] = assets["digits"]
        _CACHE["colon"] = assets["colon"]
        _CACHE["missing"] = assets["missing"]
        _CACHE["font"] = pygame.font.SysFont("Arial", 34, bold=True)


def run_frame(cfg: dict, canvas: pygame.Surface):
    """
    Draw one frame of the nixie clock to the provided canvas.
    """
    if not pygame.get_init():
        pygame.init()

    _ensure_cache(cfg)

    ncfg = cfg.get("nixie_clock", {}) or {}
    show_seconds = bool(ncfg.get("show_seconds", False))
    fmt = ncfg.get("format", ("%H:%M:%S" if show_seconds else "%H:%M"))

    W, H = canvas.get_size()
    canvas.fill((0, 0, 0))

    # If missing assets, show a static warning on the canvas (no internal loop)
    if _CACHE["missing"]:
        font = _CACHE["font"]
        missing = _CACHE["missing"]
        lines = [
            "Missing nixie digits:",
            ", ".join(str(x) for x in missing),
            f"Put 0.png..9.png into: {_CACHE['folder']}",
        ]
        y = max(10, H // 6)
        for i, line in enumerate(lines):
            color = (255, 255, 255) if i == 0 else ((255, 170, 90) if i == 1 else (200, 200, 200))
            surf = font.render(line, True, color)
            canvas.blit(surf, (max(10, (W - surf.get_width()) // 2), y))
            y += surf.get_height() + 12
        return

    digits = _CACHE["digits"]
    colon = _CACHE["colon"]
    scale = float(_CACHE["scale"] or 1.0)

    # Build parts for current time string
    t = time.strftime(fmt)
    parts = []
    for ch in t:
        if ch.isdigit():
            parts.append(("img", digits.get(ch)))
        elif ch == ":":
            parts.append(("colon", colon))

    # Spacing tuned for wide ribbon
    pad = max(6, int(18 * scale))
    colon_pad = max(4, int(10 * scale))

    # Measure total width/height
    total_w = 0
    max_h = 0
    for typ, surf in parts:
        if typ == "img" and surf is not None:
            total_w += surf.get_width() + pad
            max_h = max(max_h, surf.get_height())
        else:
            if surf is not None:
                total_w += surf.get_width() + colon_pad
                max_h = max(max_h, surf.get_height())
            else:
                # fallback colon as dots
                total_w += int(40 * scale) + colon_pad
                max_h = max(max_h, int(120 * scale))

    if parts:
        total_w -= pad  # remove last pad

    x = (W - total_w) // 2 if total_w > 0 else 0
    y = (H - max_h) // 2 if max_h > 0 else 0

    # Draw parts
    for typ, surf in parts:
        if typ == "img" and surf is not None:
            canvas.blit(surf, (x, y))
            x += surf.get_width() + pad
        else:
            if surf is not None:
                canvas.blit(surf, (x, y))
                x += surf.get_width() + colon_pad
            else:
                # Draw simple colon (two dots)
                r = max(2, int(10 * scale))
                cx = x + r * 2
                cy = y + max_h // 2
                for dy in (-int(30 * scale), int(30 * scale)):
                    pygame.draw.circle(canvas, (255, 120, 40), (cx, cy + dy), r)
                x += int(40 * scale) + colon_pad


def run(cfg: dict):
    """
    Legacy compatibility: draw to the active display surface once.
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
