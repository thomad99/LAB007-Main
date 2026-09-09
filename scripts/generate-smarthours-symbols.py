#!/usr/bin/env python3
"""Generate clean 512px outline symbols for the SmartHours design canvas."""
from __future__ import annotations

import math
import os

from PIL import Image, ImageDraw

DESIGN = 512
SCALE = 4
SIZE = DESIGN * SCALE
OUT = 512
W = 20
OUT_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "public",
    "smarthours-assets",
    "symbols",
)


def s(v: float) -> int:
    return int(round(v * SCALE))


def xy(x: float, y: float) -> tuple[int, int]:
    return (s(x), s(y))


def new_mask() -> Image.Image:
    return Image.new("L", (SIZE, SIZE), 0)


def oval(d: ImageDraw.ImageDraw, cx: float, cy: float, rx: float, ry: float, width: float = W) -> None:
    d.ellipse([s(cx - rx), s(cy - ry), s(cx + rx), s(cy + ry)], outline=255, width=s(width))


def circ(d: ImageDraw.ImageDraw, cx: float, cy: float, r: float, width: float = W) -> None:
    oval(d, cx, cy, r, r, width)


def box(d: ImageDraw.ImageDraw, x: float, y: float, w: float, h: float, rad: float = 0, width: float = W) -> None:
    bb = [s(x), s(y), s(x + w), s(y + h)]
    if rad:
        d.rounded_rectangle(bb, radius=s(rad), outline=255, width=s(width))
    else:
        d.rectangle(bb, outline=255, width=s(width))


def dot(d: ImageDraw.ImageDraw, cx: float, cy: float, r: float = 8) -> None:
    d.ellipse([s(cx - r), s(cy - r), s(cx + r), s(cy + r)], fill=255)


def line(d: ImageDraw.ImageDraw, pts: list[tuple[float, float]], width: float = W, closed: bool = False) -> None:
    scaled = [xy(*p) for p in pts]
    if closed and scaled[0] != scaled[-1]:
        scaled.append(scaled[0])
    d.line(scaled, fill=255, width=s(width), joint="curve")
    r = max(1, s(width) // 2)
    caps = scaled if closed else (scaled[0], scaled[-1])
    for x, y in caps:
        d.ellipse([x - r, y - r, x + r, y + r], fill=255)


def arc(d: ImageDraw.ImageDraw, cx: float, cy: float, rx: float, ry: float, start: float, end: float, width: float = W) -> None:
    d.arc([s(cx - rx), s(cy - ry), s(cx + rx), s(cy + ry)], start, end, fill=255, width=s(width))


def save(name: str, mask: Image.Image) -> str:
    # White silhouette, fully transparent elsewhere (RGB 0 where alpha is 0)
    # so CSS masks work in both alpha and luminance modes.
    alpha = mask.resize((OUT, OUT), Image.Resampling.LANCZOS)
    white = Image.new("RGBA", (OUT, OUT), (255, 255, 255, 255))
    clear = Image.new("RGBA", (OUT, OUT), (0, 0, 0, 0))
    img = Image.composite(white, clear, alpha)
    os.makedirs(OUT_DIR, exist_ok=True)
    path = os.path.join(OUT_DIR, f"{name}.png")
    img.save(path, "PNG", optimize=True)
    return path


def draw_hanger(d: ImageDraw.ImageDraw) -> None:
    arc(d, 256, 92, 34, 34, 40, 310)
    line(d, [(256, 124), (256, 176)])
    line(d, [(256, 176), (86, 268)])
    line(d, [(256, 176), (426, 268)])
    line(d, [(86, 268), (86, 312), (426, 312), (426, 268)])


def draw_shoe(d: ImageDraw.ImageDraw) -> None:
    line(
        d,
        [
            (90, 340),
            (78, 300),
            (96, 250),
            (150, 214),
            (196, 228),
            (236, 196),
            (300, 224),
            (390, 248),
            (446, 280),
            (452, 340),
            (90, 340),
        ],
    )
    line(d, [(90, 318), (452, 318)], 14)
    for x in (188, 222, 256):
        circ(d, x, 248, 8, 8)


def draw_airplane(d: ImageDraw.ImageDraw) -> None:
    line(d, [(256, 70), (276, 210), (256, 250), (236, 210), (256, 70)])
    line(d, [(256, 168), (470, 278), (430, 304), (256, 244), (82, 304), (42, 278), (256, 168)])
    line(d, [(240, 250), (272, 250), (292, 430), (256, 458), (220, 430), (240, 250)])
    line(d, [(256, 348), (338, 418), (318, 436), (256, 390), (194, 436), (174, 418), (256, 348)])
    for y in (268, 308, 348):
        circ(d, 256, y, 9, 8)


def draw_cloud(d: ImageDraw.ImageDraw) -> None:
    arc(d, 170, 280, 78, 70, 40, 220)
    arc(d, 256, 228, 102, 88, 200, 340)
    arc(d, 348, 274, 82, 72, 320, 140)
    line(d, [(112, 300), (400, 300)])


def draw_glasses(d: ImageDraw.ImageDraw) -> None:
    circ(d, 156, 270, 90)
    circ(d, 356, 270, 90)
    line(d, [(246, 262), (266, 262)], 16)
    line(d, [(68, 248), (32, 210)], 16)
    line(d, [(444, 248), (480, 210)], 16)


def draw_house(d: ImageDraw.ImageDraw) -> None:
    line(d, [(256, 72), (64, 232), (64, 444), (448, 444), (448, 232), (256, 72)])
    box(d, 218, 300, 76, 144, 8)
    box(d, 112, 268, 70, 56, 8)
    box(d, 330, 268, 70, 56, 8)
    line(d, [(147, 296), (147, 268)], 8)
    line(d, [(365, 296), (365, 268)], 8)
    box(d, 340, 98, 48, 100, 4)


def draw_tooth(d: ImageDraw.ImageDraw) -> None:
    line(
        d,
        [
            (156, 96),
            (206, 78),
            (256, 102),
            (306, 78),
            (356, 96),
            (378, 160),
            (360, 230),
            (340, 290),
            (332, 370),
            (312, 450),
            (276, 450),
            (256, 360),
            (236, 450),
            (200, 450),
            (180, 370),
            (172, 290),
            (152, 230),
            (134, 160),
            (156, 96),
        ],
    )
    oval(d, 200, 150, 22, 12, 10)
    oval(d, 312, 150, 22, 12, 10)


def draw_pin(d: ImageDraw.ImageDraw) -> None:
    circ(d, 256, 186, 118)
    circ(d, 256, 186, 44)
    line(d, [(154, 268), (256, 456), (358, 268)])


def draw_tooth_2(d: ImageDraw.ImageDraw) -> None:
    line(
        d,
        [
            (176, 86),
            (256, 64),
            (336, 86),
            (364, 150),
            (348, 220),
            (320, 268),
            (310, 350),
            (292, 448),
            (256, 468),
            (220, 448),
            (202, 350),
            (192, 268),
            (164, 220),
            (148, 150),
            (176, 86),
        ],
    )
    oval(d, 256, 168, 64, 32, 12)
    line(d, [(248, 92), (286, 126)], 12)


def draw_brain(d: ImageDraw.ImageDraw) -> None:
    oval(d, 198, 256, 118, 140)
    oval(d, 314, 256, 118, 140)
    line(d, [(256, 132), (256, 380)], 12)
    arc(d, 198, 210, 70, 50, 200, 340, 12)
    arc(d, 198, 300, 70, 50, 20, 160, 12)
    arc(d, 314, 210, 70, 50, 200, 340, 12)
    arc(d, 314, 300, 70, 50, 20, 160, 12)
    arc(d, 256, 150, 80, 40, 200, 340, 12)


def draw_diamond(d: ImageDraw.ImageDraw) -> None:
    line(d, [(256, 64), (430, 186), (256, 456), (82, 186), (256, 64)])
    line(d, [(82, 186), (430, 186)], 12)
    line(d, [(160, 86), (200, 186), (256, 456)], 12)
    line(d, [(352, 86), (312, 186), (256, 456)], 12)
    line(d, [(256, 64), (256, 186)], 12)


def draw_books(d: ImageDraw.ImageDraw) -> None:
    for i, y in enumerate((110, 214, 318)):
        x = 92 + i * 18
        box(d, x, y, 300, 88, 10)
        line(d, [(x + 28, y + 14), (x + 28, y + 74)], 12)


def draw_coffee_cup(d: ImageDraw.ImageDraw) -> None:
    box(d, 118, 176, 248, 220, 28)
    arc(d, 366, 278, 62, 78, 270, 90)
    oval(d, 242, 430, 150, 26)
    for x in (186, 242, 298):
        line(d, [(x, 86), (x - 10, 122), (x + 10, 150), (x, 176)], 10)


def draw_clock(d: ImageDraw.ImageDraw) -> None:
    circ(d, 256, 256, 188)
    for i in range(12):
        ang = math.radians(i * 30 - 90)
        inner, outer = (148, 172) if i % 3 else (140, 178)
        line(
            d,
            [
                (256 + inner * math.cos(ang), 256 + inner * math.sin(ang)),
                (256 + outer * math.cos(ang), 256 + outer * math.sin(ang)),
            ],
            12 if i % 3 else 16,
        )
    line(d, [(256, 256), (210, 156)], 18)
    line(d, [(256, 256), (338, 176)], 16)
    dot(d, 256, 256, 12)


def draw_bag(d: ImageDraw.ImageDraw) -> None:
    box(d, 108, 176, 296, 268, 28)
    arc(d, 186, 176, 54, 78, 180, 0)
    arc(d, 326, 176, 54, 78, 180, 0)
    circ(d, 256, 318, 26, 14)


def draw_ice_cream(d: ImageDraw.ImageDraw) -> None:
    circ(d, 256, 168, 86)
    circ(d, 196, 214, 58)
    circ(d, 316, 214, 58)
    line(d, [(176, 250), (336, 250), (268, 456), (244, 456), (176, 250)])
    line(d, [(214, 292), (256, 424)], 10)
    line(d, [(298, 292), (256, 424)], 10)


def draw_dog(d: ImageDraw.ImageDraw) -> None:
    line(
        d,
        [
            (448, 248),
            (404, 220),
            (360, 168),
            (332, 92),
            (356, 196),
            (250, 214),
            (128, 236),
            (72, 168),
            (96, 260),
            (88, 330),
            (132, 368),
            (132, 444),
            (176, 444),
            (176, 372),
            (236, 372),
            (236, 444),
            (280, 444),
            (280, 356),
            (348, 318),
            (408, 268),
            (448, 248),
        ],
    )
    circ(d, 368, 216, 8, 8)
    dot(d, 452, 248, 8)


def draw_cat(d: ImageDraw.ImageDraw) -> None:
    line(
        d,
        [
            (256, 112),
            (188, 72),
            (176, 168),
            (148, 250),
            (148, 400),
            (186, 456),
            (256, 456),
            (326, 456),
            (364, 400),
            (364, 250),
            (336, 168),
            (324, 72),
            (256, 112),
        ],
    )
    oval(d, 226, 198, 16, 20, 10)
    oval(d, 286, 198, 16, 20, 10)
    line(d, [(244, 230), (268, 230), (256, 246), (244, 230)], 10)
    arc(d, 128, 380, 78, 86, 40, 230)


def draw_scissors(d: ImageDraw.ImageDraw) -> None:
    circ(d, 150, 380, 66)
    circ(d, 300, 380, 66)
    line(d, [(186, 328), (372, 86)])
    line(d, [(264, 328), (140, 86)])
    line(d, [(186, 328), (160, 300)], 14)
    line(d, [(264, 328), (290, 300)], 14)
    circ(d, 224, 336, 16, 12)


def draw_knife(d: ImageDraw.ImageDraw) -> None:
    line(d, [(118, 248), (360, 160), (428, 186), (360, 270), (118, 270), (118, 248)])
    line(d, [(160, 248), (340, 196)], 10)
    box(d, 48, 236, 86, 44, 12)
    dot(d, 70, 258, 6)
    dot(d, 96, 258, 6)


def draw_fork(d: ImageDraw.ImageDraw) -> None:
    box(d, 234, 250, 44, 206, 16)
    for x in (168, 214, 260, 306):
        box(d, x, 64, 26, 160, 10)
    box(d, 168, 198, 166, 58, 16)


def draw_spoon(d: ImageDraw.ImageDraw) -> None:
    oval(d, 256, 168, 108, 128)
    oval(d, 256, 168, 68, 88, 14)
    box(d, 234, 250, 44, 206, 16)


def draw_pizza(d: ImageDraw.ImageDraw) -> None:
    line(d, [(256, 72), (456, 430), (56, 430), (256, 72)])
    arc(d, 256, 430, 200, 70, 200, 340)
    circ(d, 230, 250, 26, 14)
    circ(d, 300, 330, 22, 12)
    circ(d, 196, 348, 20, 12)


def draw_flower(d: ImageDraw.ImageDraw) -> None:
    for i in range(5):
        ang = math.radians(i * 72 - 90)
        circ(d, 256 + 90 * math.cos(ang), 230 + 90 * math.sin(ang), 56)
    circ(d, 256, 230, 40)
    line(d, [(256, 268), (256, 450)], 16)
    oval(d, 214, 420, 36, 16, 12)
    oval(d, 298, 432, 36, 16, 12)


def draw_bicycle(d: ImageDraw.ImageDraw) -> None:
    circ(d, 140, 340, 86)
    circ(d, 372, 340, 86)
    line(d, [(140, 340), (236, 198), (348, 198), (372, 340)])
    line(d, [(236, 198), (210, 340), (348, 198)])
    line(d, [(236, 198), (214, 148)])
    line(d, [(184, 148), (250, 148)], 16)
    line(d, [(348, 198), (394, 138), (434, 138)])


def draw_gift(d: ImageDraw.ImageDraw) -> None:
    box(d, 96, 196, 320, 252, 16)
    box(d, 80, 156, 352, 62, 14)
    line(d, [(256, 156), (256, 448)])
    line(d, [(96, 292), (416, 292)])
    oval(d, 220, 128, 46, 32)
    oval(d, 292, 128, 46, 32)


def draw_bread(d: ImageDraw.ImageDraw) -> None:
    oval(d, 256, 276, 196, 128)
    oval(d, 256, 228, 168, 86)
    line(d, [(176, 180), (218, 236)], 12)
    line(d, [(236, 164), (278, 226)], 12)
    line(d, [(300, 180), (342, 236)], 12)


def draw_camera(d: ImageDraw.ImageDraw) -> None:
    box(d, 64, 176, 384, 236, 28)
    box(d, 168, 128, 112, 52, 12)
    circ(d, 256, 292, 82)
    circ(d, 256, 292, 40)
    circ(d, 118, 220, 12, 10)
    box(d, 360, 210, 52, 22, 8)


def draw_phone(d: ImageDraw.ImageDraw) -> None:
    box(d, 148, 48, 216, 416, 36)
    box(d, 172, 92, 168, 292, 16)
    circ(d, 256, 422, 16, 10)
    line(d, [(228, 70), (284, 70)], 10)


def draw_wine_glass(d: ImageDraw.ImageDraw) -> None:
    line(d, [(150, 86), (362, 86), (300, 248), (256, 278), (212, 248), (150, 86)])
    line(d, [(176, 110), (336, 110)], 10)
    line(d, [(256, 278), (256, 400)])
    oval(d, 256, 430, 90, 22)


def draw_key(d: ImageDraw.ImageDraw) -> None:
    circ(d, 156, 256, 88)
    circ(d, 156, 256, 36)
    line(d, [(240, 256), (454, 256)], 28)
    line(d, [(372, 256), (372, 330)], 16)
    line(d, [(412, 256), (412, 352)], 16)
    line(d, [(448, 256), (448, 314)], 16)


def draw_chef_hat(d: ImageDraw.ImageDraw) -> None:
    oval(d, 176, 190, 86, 86)
    oval(d, 256, 150, 112, 96)
    oval(d, 336, 190, 86, 86)
    box(d, 120, 248, 272, 86, 16)
    line(d, [(148, 248), (364, 248)])
    for x in (196, 256, 316):
        line(d, [(x, 118), (x - 8, 168), (x + 6, 214)], 10)


SYMBOLS = [
    ("hanger", draw_hanger),
    ("shoe", draw_shoe),
    ("airplane", draw_airplane),
    ("cloud", draw_cloud),
    ("glasses", draw_glasses),
    ("house", draw_house),
    ("tooth", draw_tooth),
    ("pin", draw_pin),
    ("tooth-2", draw_tooth_2),
    ("brain", draw_brain),
    ("diamond", draw_diamond),
    ("books", draw_books),
    ("coffee-cup", draw_coffee_cup),
    ("clock", draw_clock),
    ("bag", draw_bag),
    ("ice-cream", draw_ice_cream),
    ("dog", draw_dog),
    ("cat", draw_cat),
    ("scissors", draw_scissors),
    ("knife", draw_knife),
    ("fork", draw_fork),
    ("spoon", draw_spoon),
    ("pizza", draw_pizza),
    ("flower", draw_flower),
    ("bicycle", draw_bicycle),
    ("gift", draw_gift),
    ("bread", draw_bread),
    ("camera", draw_camera),
    ("phone", draw_phone),
    ("wine-glass", draw_wine_glass),
    ("key", draw_key),
    ("chef-hat", draw_chef_hat),
]


def write_preview(paths: list[str]) -> None:
    cols = 8
    rows = math.ceil(len(paths) / cols)
    cell = 140
    sheet = Image.new("RGB", (cols * cell, rows * cell), (255, 255, 255))
    for i, path in enumerate(paths):
        icon = Image.open(path).convert("RGBA").resize((112, 112), Image.Resampling.LANCZOS)
        x = (i % cols) * cell + 14
        y = (i // cols) * cell + 14
        bg = Image.new("RGBA", (112, 112), (255, 255, 255, 255))
        sheet.paste(Image.alpha_composite(bg, icon).convert("RGB"), (x, y))
    preview = os.path.join(OUT_DIR, "_preview-sheet.png")
    sheet.save(preview, "PNG")
    print(preview)


def main() -> None:
    os.makedirs(OUT_DIR, exist_ok=True)
    paths = []
    for name, fn in SYMBOLS:
        mask = new_mask()
        fn(ImageDraw.Draw(mask))
        paths.append(save(name, mask))
        print(paths[-1])
    # Keep the symbols folder picker-only; no preview sheet.


if __name__ == "__main__":
    main()
