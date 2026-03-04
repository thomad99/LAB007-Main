#!/usr/bin/env python3
import math
import time
import pygame
from common import setup_logging

def run(cfg: dict):
    setup_logging()
    pygame.init()

    info = pygame.display.Info()
    W, H = info.current_w, info.current_h
    screen = pygame.display.set_mode((W, H), pygame.FULLSCREEN)

    # Config
    acfg = cfg.get("analog_clock", {})
    show_numbers = bool(acfg.get("show_numbers", True))
    show_ticks = bool(acfg.get("show_ticks", True))
    smooth_seconds = bool(acfg.get("smooth_seconds", True))  # smooth sweep second hand

    # Geometry
    cx, cy = W // 2, H // 2
    radius = int(min(W, H) * 0.45)
    face_r = radius
    tick_outer = face_r
    tick_inner = int(face_r * 0.92)
    tick_inner_hour = int(face_r * 0.85)

    # Fonts
    num_font = pygame.font.SysFont("Arial", int(face_r * 0.12), bold=True)

    clock = pygame.time.Clock()

    def polar(angle_rad, r):
        # 0 rad points up (12 o'clock), clockwise positive
        x = cx + int(math.sin(angle_rad) * r)
        y = cy - int(math.cos(angle_rad) * r)
        return x, y

    while True:
        for event in pygame.event.get():
            if event.type == pygame.KEYDOWN and event.key == pygame.K_ESCAPE:
                pygame.quit()
                return

        # Time
        t = time.time()
        lt = time.localtime(t)

        if smooth_seconds:
            sec = (t % 60.0)
        else:
            sec = float(lt.tm_sec)

        minute = lt.tm_min + (sec / 60.0)
        hour = (lt.tm_hour % 12) + (minute / 60.0)

        # Angles
        a_sec = 2 * math.pi * (sec / 60.0)
        a_min = 2 * math.pi * (minute / 60.0)
        a_hr  = 2 * math.pi * (hour / 12.0)

        # Draw background
        screen.fill((0, 0, 0))

        # Clock face (ring)
        pygame.draw.circle(screen, (25, 25, 25), (cx, cy), face_r)
        pygame.draw.circle(screen, (5, 5, 5), (cx, cy), face_r, 6)

        # Ticks
        if show_ticks:
            for i in range(60):
                ang = 2 * math.pi * (i / 60.0)
                is_hour = (i % 5 == 0)
                p1 = polar(ang, tick_inner_hour if is_hour else tick_inner)
                p2 = polar(ang, tick_outer)
                width = 5 if is_hour else 2
                col = (200, 200, 200) if is_hour else (120, 120, 120)
                pygame.draw.line(screen, col, p1, p2, width)

        # Numbers
        if show_numbers:
            for n in range(1, 13):
                ang = 2 * math.pi * (n / 12.0)
                px, py = polar(ang, int(face_r * 0.72))
                txt = num_font.render(str(n), True, (235, 235, 235))
                rct = txt.get_rect(center=(px, py))
                screen.blit(txt, rct)

        # Hands (hour/minute)
        # hour hand
        hr_end = polar(a_hr, int(face_r * 0.50))
        pygame.draw.line(screen, (235, 235, 235), (cx, cy), hr_end, 10)

        # minute hand
        min_end = polar(a_min, int(face_r * 0.75))
        pygame.draw.line(screen, (235, 235, 235), (cx, cy), min_end, 6)

        # second hand (red-ish)
        sec_end = polar(a_sec, int(face_r * 0.82))
        pygame.draw.line(screen, (255, 80, 80), (cx, cy), sec_end, 3)

        # Center cap
        pygame.draw.circle(screen, (0, 0, 0), (cx, cy), 14)
        pygame.draw.circle(screen, (255, 80, 80), (cx, cy), 7)

        pygame.display.flip()
        clock.tick(60)

if __name__ == "__main__":
    from common import load_config
    run(load_config())
