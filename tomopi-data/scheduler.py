from __future__ import annotations
from datetime import datetime, time as dtime

DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]

def _parse_hhmm(s: str) -> dtime:
    hh, mm = s.strip().split(":")
    return dtime(int(hh), int(mm))

def _in_window(now_t: dtime, on_t: dtime, off_t: dtime) -> bool:
    # normal: on <= now < off
    if on_t <= off_t:
        return on_t <= now_t < off_t
    # wraps midnight
    return now_t >= on_t or now_t < off_t

def _get_day_cfg(cfg: dict, now: datetime) -> dict:
    sch = (cfg or {}).get("schedule", {}) or {}
    day_key = DAYS[now.weekday()]
    days = sch.get("days", {}) or {}
    return days.get(day_key) or sch.get("default") or {}

def should_be_on(cfg: dict, now: datetime | None = None) -> bool:
    sch = (cfg or {}).get("schedule", {}) or {}
    if not sch.get("enabled", False):
        return True

    now = now or datetime.now()
    day_cfg = _get_day_cfg(cfg, now)

    on_s = day_cfg.get("on", "00:00")
    off_s = day_cfg.get("off", "23:59")

    try:
        on_t = _parse_hhmm(on_s)
        off_t = _parse_hhmm(off_s)
    except Exception:
        return True  # fail-open

    return _in_window(now.time(), on_t, off_t)

def current_brightness(cfg: dict, now: datetime | None = None) -> float:
    """
    Returns brightness 0.0..1.0 based on schedule and dimmer config.
    - If schedule is OFF => returns 0.0
    - Else returns dimmer.brightness_on (or day override)
    """
    now = now or datetime.now()
    if not should_be_on(cfg, now):
        return 0.0

    dim = (cfg or {}).get("dimmer", {}) or {}
    br = dim.get("brightness_on", 1.0)

    # Optional per-day brightness override
    day_cfg = _get_day_cfg(cfg, now)
    if "brightness_on" in day_cfg:
        br = day_cfg["brightness_on"]

    try:
        br = float(br)
    except Exception:
        br = 1.0

    return max(0.0, min(1.0, br))
