import os
import pygame

def apply_sleep_mode(sleep_mode: str, sleeping: bool):
    """
    sleeping=True => turn display off / blank
    sleeping=False => wake display
    """
    sleep_mode = (sleep_mode or "blank").lower()

    if sleep_mode == "dpms":
        # Requires X11 + xset
        os.system("DISPLAY=:0 xset dpms force off" if sleeping else "DISPLAY=:0 xset dpms force on")
    elif sleep_mode == "hdmi":
        # Works on many Raspberry Pi HDMI setups
        os.system("vcgencmd display_power 1" if sleeping else "vcgencmd display_power 0")
    # "blank" is handled by the launcher (draw black)

def apply_brightness_overlay(screen: pygame.Surface, brightness: float):
    """
    Software dimmer: overlays translucent black.
    brightness 1.0 => no overlay
    brightness 0.0 => fully black
    """
    brightness = max(0.0, min(1.0, float(brightness)))
    if brightness >= 0.999:
        return
    alpha = int(255 * (1.0 - brightness))
    overlay = pygame.Surface(screen.get_size(), pygame.SRCALPHA)
    overlay.fill((0, 0, 0, alpha))
    screen.blit(overlay, (0, 0))
