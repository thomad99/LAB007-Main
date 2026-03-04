#!/usr/bin/env python3
import time
import importlib
import pygame

from common import load_config, setup_logging
from scheduler import should_be_on
from dimmer import apply_sleep_mode, apply_brightness_overlay


MODE_MODULES = {
    "clock_basic": "clock_basic",
    "slideshow": "slideshow",
    "nixie_clock": "nixie_clock",
    "flip_clock": "flip_clock",
    "analog_clock": "analog_clock",
    "video_player": "video_player",
    "web_images": "web_images",
    "news_feed": "news_feed",
}


def _normalize_rotate(val: str) -> str:
    v = (val or "normal").strip().lower()
    if v in ("0", "none"):
        return "normal"
    if v in ("180", "invert", "inverted"):
        return "invert"
    if v in ("normal", "left", "right", "invert"):
        return v
    return "normal"


def apply_rotation(surface: pygame.Surface, rotate: str) -> pygame.Surface:
    # rotozoom is usually smoother than rotate for 90-degree turns
    rotate = _normalize_rotate(rotate)
    if rotate == "left":
        return pygame.transform.rotozoom(surface, 90, 1.0)
    if rotate == "right":
        return pygame.transform.rotozoom(surface, -90, 1.0)
    if rotate == "invert":
        return pygame.transform.rotozoom(surface, 180, 1.0)
    return surface


def present(canvas: pygame.Surface, display: pygame.Surface, rotate: str):
    """
    Rotate logical canvas if needed, then scale to display size and present.
    """
    frame = apply_rotation(canvas, rotate)

    dw, dh = display.get_width(), display.get_height()
    fw, fh = frame.get_width(), frame.get_height()

    if (fw, fh) != (dw, dh):
        frame = pygame.transform.smoothscale(frame, (dw, dh))

    display.blit(frame, (0, 0))
    pygame.display.flip()


def blank(canvas: pygame.Surface, display: pygame.Surface, rotate: str):
    canvas.fill((0, 0, 0))
    present(canvas, display, rotate)


def _get_logical_resolution(cfg: dict, display: pygame.Surface) -> tuple[int, int]:
    """
    Optional: cfg["logical_resolution"] = [W, H]
    If not set, default to the real display resolution.
    """
    lr = cfg.get("logical_resolution")
    if isinstance(lr, (list, tuple)) and len(lr) == 2:
        try:
            lw = int(lr[0])
            lh = int(lr[1])
            if lw > 0 and lh > 0:
                return lw, lh
        except Exception:
            pass
    return display.get_width(), display.get_height()


def _get_dimmer_target(cfg: dict) -> tuple[bool, float, bool, float]:
    """
    Returns: (enabled, target_brightness_0_to_1, immediate, fade_seconds)

    brightness is a software overlay (not hardware backlight).
    """
    dim = cfg.get("dimmer", {}) or {}
    enabled = bool(dim.get("enabled", True))

    # Support either "brightness" or legacy "brightness_on"
    if "brightness" in dim:
        target = dim.get("brightness", 1.0)
    else:
        target = dim.get("brightness_on", 1.0)

    try:
        target = float(target)
    except Exception:
        target = 1.0

    # Clamp
    if target < 0.0:
        target = 0.0
    if target > 1.0:
        target = 1.0

    immediate = bool(dim.get("immediate", False))
    fade_seconds = float(dim.get("fade_seconds", 0.5))
    return enabled, target, immediate, fade_seconds


def main():
    setup_logging()
    pygame.init()

    # IMPORTANT: Don't trust pygame.display.Info() on KMS/headless.
    # Create the real fullscreen display surface first.
    display = pygame.display.set_mode((0, 0), pygame.FULLSCREEN)

    cfg = load_config()
    cfg_refresh_seconds = int(cfg.get("refresh_seconds", 15))
    last_cfg_check = 0.0

    # Logical canvas (your design resolution)
    lw, lh = _get_logical_resolution(cfg, display)
    canvas = pygame.Surface((lw, lh))

    sleeping = False
    last_schedule_check = 0.0

    # Current brightness overlay (0..1)
    current_br = 1.0
    last_dim_step = time.time()

    while True:
        for event in pygame.event.get():
            if event.type == pygame.KEYDOWN and event.key == pygame.K_ESCAPE:
                pygame.quit()
                return

        now = time.time()

        # Reload config periodically
        if now - last_cfg_check >= cfg_refresh_seconds:
            last_cfg_check = now
            try:
                cfg = load_config()
            except Exception:
                pass

            cfg_refresh_seconds = int(cfg.get("refresh_seconds", 15))

            # Rebuild canvas if logical_resolution changed
            new_lw, new_lh = _get_logical_resolution(cfg, display)
            if (new_lw, new_lh) != (canvas.get_width(), canvas.get_height()):
                canvas = pygame.Surface((new_lw, new_lh))

        rotate = _normalize_rotate(cfg.get("rotate", "normal"))

        # Schedule: ON/OFF only
        sch = cfg.get("schedule", {}) or {}
        schedule_enabled = bool(sch.get("enabled", False))
        schedule_check_seconds = int(sch.get("check_seconds", 15))
        sleep_mode = sch.get("sleep_mode", "blank")

        if schedule_enabled and (now - last_schedule_check >= schedule_check_seconds):
            last_schedule_check = now
            on = should_be_on(cfg)

            if (not on) and (not sleeping):
                sleeping = True
                apply_sleep_mode(sleep_mode, True)

            if on and sleeping:
                sleeping = False
                apply_sleep_mode(sleep_mode, False)

        if schedule_enabled and sleeping:
            blank(canvas, display, rotate)
            time.sleep(0.5)
            continue

        # Dimmer: immediate (no timer) + optional fade
        dim_enabled, target_br, dim_immediate, dim_fade_seconds = _get_dimmer_target(cfg)

        if not dim_enabled:
            target_br = 1.0

        if dim_immediate:
            current_br = target_br
        else:
            # Smooth brightness changes
            if abs(target_br - current_br) > 0.001:
                dt = max(0.001, time.time() - last_dim_step)
                last_dim_step = time.time()
                step = dt / max(0.05, dim_fade_seconds)
                if target_br > current_br:
                    current_br = min(target_br, current_br + step)
                else:
                    current_br = max(target_br, current_br - step)
            else:
                current_br = target_br

        # Mode
        mode = (cfg.get("mode") or "clock_basic").strip()
        mod_name = MODE_MODULES.get(mode)

        if not mod_name:
            blank(canvas, display, rotate)
            time.sleep(0.25)
            continue

        try:
            mod = importlib.import_module(mod_name)

            canvas.fill((0, 0, 0))

            if hasattr(mod, "run_frame"):
                # Preferred: module draws to canvas once
                mod.run_frame(cfg, canvas)
            else:
                # Legacy: module draws to display; capture and scale into canvas
                display.fill((0, 0, 0))
                pygame.display.flip()

                mod.run(cfg)

                snapshot = pygame.display.get_surface()
                if snapshot is not None:
                    if (snapshot.get_width(), snapshot.get_height()) != (canvas.get_width(), canvas.get_height()):
                        snap2 = pygame.transform.smoothscale(snapshot, (canvas.get_width(), canvas.get_height()))
                        canvas.blit(snap2, (0, 0))
                    else:
                        canvas.blit(snapshot, (0, 0))

            # Apply dim overlay uniformly
            if dim_enabled and current_br < 0.999:
                apply_brightness_overlay(canvas, current_br)

            present(canvas, display, rotate)
            time.sleep(0.03)

        except Exception:
            blank(canvas, display, rotate)
            time.sleep(0.5)


if __name__ == "__main__":
    main()
