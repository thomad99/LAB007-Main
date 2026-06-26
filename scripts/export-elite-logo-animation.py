#!/usr/bin/env python3
"""Render the Elite Cleaning logo dot-glow animation to shareable files."""

from __future__ import annotations

import math
import os
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "public" / "elite-cleaning-assets" / "elite-cleaning-logo-dots-glow.png"
OUT_DIR = ROOT / "public" / "elite-cleaning-assets"

CYCLE_MS = 5200
SPREAD = 0.028
FPS = 15
SIZE = 700


def gold_score(r: int, g: int, b: int) -> float:
    if r < 130 or g < 80 or b > 130:
        return 0.0
    return r * 0.55 + g * 0.35 - b * 0.25


def fallback_dots(w: int, h: int) -> list[tuple[float, float]]:
    count = 34
    cx, cy = w / 2, h / 2
    radius = min(w, h) * 0.425
    dots = []
    for i in range(count):
        angle = (i / count) * math.tau - math.pi / 2
        dots.append((cx + math.cos(angle) * radius, cy + math.sin(angle) * radius))
    return dots


def detect_dots(img: Image.Image) -> list[tuple[float, float]]:
    w, h = img.size
    px = img.load()
    cx, cy = w / 2, h / 2
    found: list[tuple[float, float, int]] = []

    for s in range(80):
        angle = (s / 80) * math.tau - math.pi / 2
        best = 0.0
        bx = by = 0
        for radius in range(int(w * 0.33), int(w * 0.5) + 1):
            x = round(cx + math.cos(angle) * radius)
            y = round(cy + math.sin(angle) * radius)
            if x < 0 or x >= w or y < 0 or y >= h:
                continue
            r, g, b, a = px[x, y]
            if a == 0:
                continue
            score = gold_score(r, g, b)
            if score > best:
                best = score
                bx, by = x, y
        if best > 70:
            found.append((bx, by, s))

    merged: list[tuple[float, float, int]] = []
    for dot in found:
        if not any(math.hypot(m[0] - dot[0], m[1] - dot[1]) < w * 0.022 for m in merged):
            merged.append(dot)
    merged.sort(key=lambda d: d[2])
    dots = [(x, y) for x, y, _ in merged]
    return dots if len(dots) >= 12 else fallback_dots(w, h)


def circular_distance(a: float, b: float) -> float:
    d = abs(a - b)
    return min(d, 1 - d)


def draw_radial_glow(
    draw: ImageDraw.ImageDraw,
    x: float,
    y: float,
    halo: float,
    core: float,
    strength: float,
) -> None:
    steps = max(8, int(halo / 3))
    for step in range(steps, 0, -1):
        t = step / steps
        radius = halo * t
        alpha = int(255 * strength * (1 - t) * 0.55)
        if alpha <= 0:
            continue
        color = (242, 210, 123, alpha)
        draw.ellipse((x - radius, y - radius, x + radius, y + radius), fill=color)

    core_alpha = int(255 * min(1.0, 0.35 + strength * 0.65))
    draw.ellipse(
        (x - core, y - core, x + core, y + core),
        fill=(255, 248, 228, core_alpha),
    )


def render_frame(
    base: Image.Image,
    dots: list[tuple[float, float]],
    phase: float,
    size: int,
) -> Image.Image:
    frame = base.resize((size, size), Image.Resampling.LANCZOS).convert("RGBA")
    glow = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(glow)
    bw, bh = base.size
    count = len(dots)

    for index, (dx, dy) in enumerate(dots):
        glow_strength = math.exp(
            -(circular_distance(index / count, phase) ** 2) / (2 * SPREAD * SPREAD)
        )
        if glow_strength < 0.05:
            continue
        sx = dx / bw * size
        sy = dy / bh * size
        halo = size * 0.055 * (1 + glow_strength * 0.45)
        core = size * 0.011 * (1 + glow_strength * 0.35)
        draw_radial_glow(draw, sx, sy, halo, core, glow_strength)

    return Image.alpha_composite(frame, glow)


def export_animation() -> None:
    if not SRC.exists():
        raise SystemExit(f"Source logo not found: {SRC}")

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    source = Image.open(SRC).convert("RGBA")
    dots = detect_dots(source)

    frame_count = round(CYCLE_MS / 1000 * FPS)
    duration_ms = CYCLE_MS // frame_count
    frames: list[Image.Image] = []

    for i in range(frame_count):
        phase = i / frame_count
        frames.append(render_frame(source, dots, phase, SIZE))

    gif_path = OUT_DIR / "elite-cleaning-logo-animated.gif"
    webp_path = OUT_DIR / "elite-cleaning-logo-animated.webp"

    frames[0].save(
        gif_path,
        save_all=True,
        append_images=frames[1:],
        duration=duration_ms,
        loop=0,
        disposal=2,
        optimize=True,
    )

    frames[0].save(
        webp_path,
        save_all=True,
        append_images=frames[1:],
        duration=duration_ms,
        loop=0,
        lossless=False,
        quality=88,
        method=6,
    )

    print(f"Wrote {gif_path} ({gif_path.stat().st_size // 1024} KB)")
    print(f"Wrote {webp_path} ({webp_path.stat().st_size // 1024} KB)")
    print(f"Frames: {frame_count} @ {FPS} fps, {SIZE}x{SIZE}px")

    import zipfile

    pack_path = OUT_DIR / "elite-cleaning-logo-pack.zip"
    pack_files = [
        OUT_DIR / "elite-cleaning-logo-standalone.html",
        OUT_DIR / "elite-cleaning-logo-animation.js",
        SRC,
        gif_path,
        webp_path,
    ]
    with zipfile.ZipFile(pack_path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        for path in pack_files:
            if path.exists():
                zf.write(path, arcname=path.name)
    print(f"Wrote {pack_path} ({pack_path.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    export_animation()
