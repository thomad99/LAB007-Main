import os
import time
import datetime
import requests
import xml.etree.ElementTree as ET

import pygame
from common import setup_logging


FINNHUB_API_KEY = os.getenv("FINNHUB_API_KEY", "").strip()


def fetch_rss_headlines(url: str, max_items: int = 10, timeout: int = 8):
    r = requests.get(url, timeout=timeout, headers={"User-Agent": "tomopi/1.0"})
    r.raise_for_status()
    root = ET.fromstring(r.content)

    items = []
    for item in root.findall("./channel/item"):
        title = item.findtext("title") or ""
        title = title.strip()
        if title:
            t = " ".join(title.split())
            if t and t not in items:
                items.append(t)
        if len(items) >= max_items:
            break

    return items


def fetch_finnhub_quote(symbol: str, timeout: int = 8):
    """
    Finnhub quote:
      c  = current price
      d  = change
      dp = percent change
      pc = previous close
      t  = unix timestamp (seconds)
    """
    if not FINNHUB_API_KEY:
        raise RuntimeError("FINNHUB_API_KEY is not set")

    sym = symbol.strip().upper()
    if not sym:
        raise ValueError("Empty symbol")

    url = "https://finnhub.io/api/v1/quote"
    params = {"symbol": sym, "token": FINNHUB_API_KEY}
    r = requests.get(url, params=params, timeout=timeout, headers={"User-Agent": "tomopi/1.0"})
    r.raise_for_status()

    data = r.json() or {}
    price = data.get("c", None)
    dp = data.get("dp", None)
    ts = data.get("t", None)

    if price in (None, 0, 0.0):
        # Finnhub returns 0 sometimes when it has no data
        raise ValueError(f"No Finnhub price for {sym}: {data}")

    # Convert timestamp to HH:MM (local time on Pi)
    time_str = None
    try:
        if ts:
            dt = datetime.datetime.fromtimestamp(int(ts))
            time_str = dt.strftime("%H:%M")
    except Exception:
        time_str = None

    return {
        "symbol": sym,
        "price": float(price),
        "dp": float(dp) if dp is not None else None,
        "t": int(ts) if ts is not None else None,
        "time_str": time_str,
    }


def fetch_stooq_price(symbol: str, timeout: int = 8):
    """
    Stooq CSV endpoint. Often returns close/last and may be delayed.
    Kept as a fallback.
    """
    s = symbol.lower().strip()
    if not s:
        raise ValueError("Empty symbol")

    # Stooq uses e.g. tsla.us
    if not s.endswith(".us") and "-" not in s:
        s = f"{s}.us"

    url = f"https://stooq.com/q/l/?s={s}&f=sd2t2l&h&e=csv"
    r = requests.get(url, timeout=timeout, headers={"User-Agent": "tomopi/1.0"})
    r.raise_for_status()

    lines = [ln.strip() for ln in r.text.splitlines() if ln.strip()]
    if len(lines) < 2:
        raise ValueError("No CSV rows")

    row = lines[1].split(",")
    if len(row) < 4:
        raise ValueError("Bad CSV row")

    close = row[3]
    if close in ("", "N/A"):
        raise ValueError("No price")

    return float(close)


def fetch_coingecko_btc_usd(timeout: int = 8) -> float:
    """
    CoinGecko simple price for BTC in USD. No key required.
    """
    url = "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd"
    r = requests.get(url, timeout=timeout, headers={"User-Agent": "tomopi/1.0"})
    r.raise_for_status()
    data = r.json()
    return float(data["bitcoin"]["usd"])


def wrap_lines(font, text: str, max_width: int, max_lines: int = 3):
    words = text.split()
    lines, line = [], []
    for w in words:
        test = " ".join(line + [w])
        if font.size(test)[0] <= max_width:
            line.append(w)
        else:
            if line:
                lines.append(" ".join(line))
            line = [w]
        if len(lines) >= max_lines:
            break
    if line and len(lines) < max_lines:
        lines.append(" ".join(line))
    return lines[:max_lines]


def ease_out_cubic(p: float) -> float:
    return 1 - (1 - p) ** 3


def fit_text_to_box(font_name, bold, text, max_w, max_h, max_lines, size_min, size_max, line_spacing):
    best = None
    lo, hi = size_min, size_max
    while lo <= hi:
        mid = (lo + hi) // 2
        f = pygame.font.SysFont(font_name, mid, bold=bold)
        lines = wrap_lines(f, text, max_width=max_w, max_lines=max_lines)
        if not lines:
            hi = mid - 1
            continue
        total_h = sum(f.size(ln)[1] for ln in lines) + line_spacing * (len(lines) - 1)
        widest = max(f.size(ln)[0] for ln in lines)
        if widest <= max_w and total_h <= max_h:
            best = (mid, f, lines, total_h)
            lo = mid + 1
        else:
            hi = mid - 1
    return best


def rect_inset(r: pygame.Rect, pad: int) -> pygame.Rect:
    return pygame.Rect(r.x + pad, r.y + pad, max(1, r.w - 2 * pad), max(1, r.h - 2 * pad))


_STATE = {
    "headlines": [],
    "headline_index": 0,
    "last_news_fetch": 0.0,

    "stock_lines": [],
    "last_stock_fetch": 0.0,

    "mode": "clock",
    "last_switch": 0.0,
    "transition_start": 0.0,
    "transition_from": "clock",
    "transition_to": "headline",
    "transition_active": False,
}


def _refresh_news(ncfg: dict):
    rss_feeds = ncfg.get("rss_feeds", ["https://feeds.bbci.co.uk/news/rss.xml"])
    max_headlines = int(ncfg.get("max_headlines", 10))

    seen = set()
    dedup = []
    for url in rss_feeds:
        try:
            for h in fetch_rss_headlines(url, max_items=max_headlines):
                if h in seen:
                    continue
                dedup.append(h)
                seen.add(h)
                if len(dedup) >= max_headlines:
                    break
        except Exception:
            continue
        if len(dedup) >= max_headlines:
            break

    _STATE["headlines"] = dedup
    _STATE["last_news_fetch"] = time.time()
    _STATE["headline_index"] = (_STATE["headline_index"] % len(dedup)) if dedup else 0


def _format_stock_line(sym: str, price: float, change_pct=None, time_str: str | None = None) -> str:
    sym = sym.upper()
    label = "BTC" if sym in ("BTC-USD", "BTCUSD", "BTC") else sym

    # price formatting
    if label == "BTC":
        price_str = f"${price:,.0f}" if price >= 1000 else f"${price:,.2f}"
    else:
        price_str = f"${price:,.2f}"

    # change formatting
    chg = ""
    if change_pct is not None:
        try:
            chg = f" ({change_pct:+.2f}%)"
        except Exception:
            chg = ""

    # time formatting
    ts = f" {time_str}" if time_str else ""

    return f"{label}: {price_str}{chg}"


def _refresh_stocks(ncfg: dict):
    tickers = ncfg.get("tickers", ["TSLA", "IBRX", "BTC-USD"])

    # BTC once if requested
    btc_price = None
    want_btc = any(str(t).strip().upper() in ("BTC-USD", "BTCUSD", "BTC") for t in (tickers or []))
    if want_btc:
        try:
            btc_price = fetch_coingecko_btc_usd()
        except Exception:
            btc_price = None

    lines = []
    for t in (tickers or []):
        sym = str(t).strip().upper()
        if not sym:
            continue

        # BTC via CoinGecko
        if sym in ("BTC-USD", "BTCUSD", "BTC"):
            if btc_price is None:
                lines.append("BTC: (price unavailable)")
            else:
                lines.append(_format_stock_line(sym, btc_price))
            continue

        # Stocks via Finnhub (preferred)
        try:
            q = fetch_finnhub_quote(sym)
            lines.append(_format_stock_line(sym, q["price"], q.get("dp"), q.get("time_str")))
            continue
        except Exception:
            pass

        # Fallback to Stooq if Finnhub fails
        try:
            px = fetch_stooq_price(sym)
            lines.append(_format_stock_line(sym, px))
        except Exception:
            lines.append(f"{sym}: (price unavailable)")

    _STATE["stock_lines"] = lines or ["(no tickers)"]
    _STATE["last_stock_fetch"] = time.time()


def _current_headline():
    hs = _STATE["headlines"]
    if not hs:
        return "(no headlines yet)"
    return hs[_STATE["headline_index"] % len(hs)]


def _active_rects(W: int, H: int, ncfg: dict, typ: str):
    layout = (ncfg.get("layout", "cycle_full") or "cycle_full").lower()
    pad = int(ncfg.get("padding_px", 28))
    full = rect_inset(pygame.Rect(0, 0, W, H), pad)

    if layout == "three_column":
        left_w = int(full.w * 0.36)
        mid_w = int(full.w * 0.28)
        right_w = full.w - left_w - mid_w

        left = pygame.Rect(full.x, full.y, left_w, full.h)
        mid = pygame.Rect(full.x + left_w, full.y, mid_w, full.h)
        right = pygame.Rect(full.x + left_w + mid_w, full.y, right_w, full.h)

        if typ == "clock":
            return left
        if typ == "headline":
            return mid
        if typ == "stocks":
            return right
        return full

    return full


def _draw_clock(surface: pygame.Surface, rect: pygame.Rect, ncfg: dict):
    font_name = ncfg.get("clock_font_name", "dejavusans")
    size = int(ncfg.get("clock_font_size", 270))
    color = tuple(ncfg.get("clock_color_rgb", [255, 128, 0]))

    t = time.strftime("%H:%M")
    font = pygame.font.SysFont(font_name, size, bold=True)
    txt = font.render(t, True, color)

    x = rect.x + (rect.w - txt.get_width()) // 2
    y = rect.y + (rect.h - txt.get_height()) // 2
    surface.blit(txt, (x, y))


def _draw_headline(surface: pygame.Surface, rect: pygame.Rect, ncfg: dict):
    font_name = ncfg.get("text_font_name", "dejavusans")
    bold = True
    color = tuple(ncfg.get("text_color_rgb", [255, 128, 0]))

    headline = _current_headline()

    max_w = int(rect.w * float(ncfg.get("headline_fit_width_pct", 0.92)))
    max_h = int(rect.h * float(ncfg.get("headline_fit_height_pct", 0.45)))
    max_lines = int(ncfg.get("headline_max_lines", 3))
    size_min = int(ncfg.get("headline_font_min", 26))
    size_max = int(ncfg.get("headline_font_max", 110))
    line_spacing = int(ncfg.get("headline_line_spacing", 10))

    best = fit_text_to_box(font_name, bold, headline, max_w, max_h, max_lines, size_min, size_max, line_spacing)
    if not best:
        f = pygame.font.SysFont(font_name, size_min, bold=bold)
        lines = wrap_lines(f, headline, max_width=max_w, max_lines=max_lines)
        total_h = sum(f.size(ln)[1] for ln in lines) + line_spacing * (len(lines) - 1)
        font = f
    else:
        _, font, lines, total_h = best

    y = rect.y + (rect.h - total_h) // 2
    for ln in lines:
        txt = font.render(ln, True, color)
        x = rect.x + (rect.w - txt.get_width()) // 2
        surface.blit(txt, (x, y))
        y += txt.get_height() + line_spacing


def _draw_stocks(surface: pygame.Surface, rect: pygame.Rect, ncfg: dict):
    font_name = ncfg.get("stock_font_name", ncfg.get("text_font_name", "dejavusans"))
    bold = True

    base_color = tuple(ncfg.get("text_color_rgb", [255, 128, 0]))

    lines = _STATE["stock_lines"] or ["(no tickers)"]

    max_w = int(rect.w * float(ncfg.get("stock_fit_width_pct", 0.85)))
    max_h = int(rect.h * float(ncfg.get("stock_fit_height_pct", 0.55)))
    max_lines = int(ncfg.get("stock_max_lines", 8))
    size_min = int(ncfg.get("stock_font_min", 30))
    size_max = int(ncfg.get("stock_font_max", 160))
    line_spacing = int(ncfg.get("stock_line_spacing", 14))

    # Fit main font size using full text block
    text_block = " ".join(lines[:max_lines])
    best = fit_text_to_box(font_name, bold, text_block, max_w, max_h, max_lines, size_min, size_max, line_spacing)

    if best:
        main_size, _, _, _ = best
    else:
        main_size = size_min

    main_font = pygame.font.SysFont(font_name, main_size, bold=bold)
    # Make percentage text larger (80% of main font size, minimum 10px)
    pct_font = pygame.font.SysFont(font_name, max(10, int(main_size * 0.8)), bold=bold)

    rendered_lines = []
    total_h = 0

    for ln in lines[:max_lines]:
        # Expect format like: "TSLA: $398.56 (+1.23%)"
        if "(" in ln and "%" in ln:
            left_part = ln.split("(")[0].rstrip()
            pct_part = "(" + ln.split("(")[1]

            # Color green/red based on sign (duller tones for small 8\" screen)
            pct_color = (0, 150, 0) if "+" in pct_part else (180, 40, 40)

            main_surface = main_font.render(left_part, True, base_color)
            pct_surface = pct_font.render(pct_part, True, pct_color)

            combined = pygame.Surface(
                (main_surface.get_width() + pct_surface.get_width() + 8,
                 max(main_surface.get_height(), pct_surface.get_height())),
                pygame.SRCALPHA
            )

            combined.blit(main_surface, (0, 0))
            combined.blit(pct_surface, (main_surface.get_width() + 8,
                                        main_surface.get_height() - pct_surface.get_height()))

        else:
            combined = main_font.render(ln, True, base_color)

        rendered_lines.append(combined)
        total_h += combined.get_height()

    total_h += line_spacing * (len(rendered_lines) - 1)

    y = rect.y + (rect.h - total_h) // 2

    for r in rendered_lines:
        x = rect.x + (rect.w - r.get_width()) // 2
        surface.blit(r, (x, y))
        y += r.get_height() + line_spacing

def _transition_offsets(typ: str, W: int, H: int, ncfg: dict):
    """
    Compute x/y offsets for the current transition type.
    Supported transitions:
      - none           : instant switch
      - fade           : handled in run_frame using alpha
      - slide_left     : old slides left, new from right
      - slide_right    : old slides right, new from left
      - slide_up       : old slides up, new from bottom
      - slide_down     : old slides down, new from top
      - swipe          : faster horizontal slide using linear easing
      - flash          : no offset; screen flash handled in run_frame
      - zoom_in        : no offset; scale simulated via alpha/center
      - zoom_out       : no offset; scale simulated via alpha/center
      - wipe_horizontal: left-to-right wipe; offset handled here
      - wipe_vertical  : top-to-bottom wipe; offset handled here
    """
    trans = (ncfg.get("transition", "slide_left") or "slide_left").lower()
    ms = int(ncfg.get("transition_ms", 450))

    if not _STATE["transition_active"]:
        return (0, 0, ms, trans)

    elapsed = (pygame.time.get_ticks() - _STATE["transition_start"]) / max(1, ms)
    p_raw = min(1.0, max(0.0, elapsed))

    # Most transitions ease out; swipe uses linear for a snappier feel
    if trans == "swipe":
        p = p_raw
    else:
        p = ease_out_cubic(p_raw)

    # Slides
    if trans == "slide_left":
        if typ == _STATE["transition_from"]:
            return (-int(W * p), 0, ms, trans)
        if typ == _STATE["transition_to"]:
            return (int(W * (1.0 - p)), 0, ms, trans)
    elif trans == "slide_right":
        if typ == _STATE["transition_from"]:
            return (int(W * p), 0, ms, trans)
        if typ == _STATE["transition_to"]:
            return (-int(W * (1.0 - p)), 0, ms, trans)
    elif trans == "slide_up":
        if typ == _STATE["transition_from"]:
            return (0, -int(H * p), ms, trans)
        if typ == _STATE["transition_to"]:
            return (0, int(H * (1.0 - p)), ms, trans)
    elif trans == "slide_down":
        if typ == _STATE["transition_from"]:
            return (0, int(H * p), ms, trans)
        if typ == _STATE["transition_to"]:
            return (0, -int(H * (1.0 - p)), ms, trans)
    elif trans == "swipe":
        # faster horizontal swipe, symmetric
        if typ == _STATE["transition_from"]:
            return (-int(W * p), 0, ms, trans)
        if typ == _STATE["transition_to"]:
            return (int(W * (1.0 - p)), 0, ms, trans)
    elif trans in ("fade", "flash", "zoom_in", "zoom_out"):
        # No offset; handled via alpha/overlays in run_frame
        return (0, 0, ms, trans)
    elif trans == "wipe_horizontal":
        # treat as slide_left-ish for now
        if typ == _STATE["transition_from"]:
            return (-int(W * p), 0, ms, trans)
        if typ == _STATE["transition_to"]:
            return (0, 0, ms, trans)
    elif trans == "wipe_vertical":
        if typ == _STATE["transition_from"]:
            return (0, -int(H * p), ms, trans)
        if typ == _STATE["transition_to"]:
            return (0, 0, ms, trans)

    # default: no movement
    return (0, 0, ms, trans)


def run_frame(cfg: dict, surface: pygame.Surface):
    ncfg = cfg.get("news_feed", {}) or {}
    bg = tuple(ncfg.get("bg_rgb", [0, 0, 0]))

    W, H = surface.get_size()
    surface.fill(bg)

    now = time.time()

    if now - _STATE["last_news_fetch"] >= int(ncfg.get("refresh_news_seconds", 600)):
        try:
            _refresh_news(ncfg)
        except Exception:
            pass

    if now - _STATE["last_stock_fetch"] >= int(ncfg.get("refresh_stocks_seconds", 240)):
        try:
            _refresh_stocks(ncfg)
        except Exception:
            pass

    item_seconds = int(ncfg.get("item_seconds", 10))
    if _STATE["last_switch"] == 0.0:
        _STATE["last_switch"] = now

    if (now - _STATE["last_switch"]) >= item_seconds:
        _STATE["last_switch"] = now

        if _STATE["headlines"]:
            _STATE["headline_index"] = (_STATE["headline_index"] + 1) % len(_STATE["headlines"])

        order = ["clock", "headline", "stocks"]
        cur = _STATE["mode"]
        nxt = order[(order.index(cur) + 1) % len(order)] if cur in order else "headline"

        _STATE["transition_active"] = True
        _STATE["transition_start"] = pygame.time.get_ticks()
        _STATE["transition_from"] = cur
        _STATE["transition_to"] = nxt
        _STATE["mode"] = nxt

    trans_ms = int(ncfg.get("transition_ms", 450))
    if _STATE["transition_active"]:
        if (pygame.time.get_ticks() - _STATE["transition_start"]) >= trans_ms:
            _STATE["transition_active"] = False

    def draw_typ(typ: str, ox: int, oy: int, alpha: int = 255):
        rect = _active_rects(W, H, ncfg, typ)
        tmp = pygame.Surface((W, H), pygame.SRCALPHA)
        if typ == "clock":
            _draw_clock(tmp, rect, ncfg)
        elif typ == "headline":
            _draw_headline(tmp, rect, ncfg)
        elif typ == "stocks":
            _draw_stocks(tmp, rect, ncfg)
        if alpha != 255:
            tmp.set_alpha(alpha)
        surface.blit(tmp, (ox, oy))

    if not _STATE["transition_active"]:
        draw_typ(_STATE["mode"], 0, 0)
        return

    ox_from, oy_from, ms, trans = _transition_offsets(_STATE["transition_from"], W, H, ncfg)
    ox_to, oy_to, _, _ = _transition_offsets(_STATE["transition_to"], W, H, ncfg)

    elapsed = (pygame.time.get_ticks() - _STATE["transition_start"]) / max(1, ms)
    p = min(1.0, max(0.0, elapsed))

    if trans == "fade":
        # Crossfade
        a_from = int(255 * (1.0 - p))
        a_to = int(255 * p)
        draw_typ(_STATE["transition_from"], 0, 0, alpha=a_from)
        draw_typ(_STATE["transition_to"], 0, 0, alpha=a_to)
    elif trans == "flash":
        # Quick white flash in middle of transition
        if p < 0.3:
            draw_typ(_STATE["transition_from"], 0, 0)
        elif p < 0.6:
            flash = pygame.Surface((W, H))
            flash.fill((255, 255, 255))
            alpha = int(255 * (1.0 - (p - 0.3) / 0.3))
            flash.set_alpha(alpha)
            surface.blit(flash, (0, 0))
        else:
            draw_typ(_STATE["transition_to"], 0, 0)
    elif trans == "zoom_in":
        # New content zooms in from smaller scale (simulated via alpha / center emphasis)
        a_to = int(255 * p)
        draw_typ(_STATE["transition_from"], 0, 0, alpha=255)
        draw_typ(_STATE["transition_to"], 0, 0, alpha=a_to)
    elif trans == "zoom_out":
        # Old content fades out quickly, giving impression of zooming away
        a_from = int(255 * (1.0 - p))
        draw_typ(_STATE["transition_from"], 0, 0, alpha=a_from)
        draw_typ(_STATE["transition_to"], 0, 0, alpha=255)
    else:
        # Slides / wipes: use computed offsets
        draw_typ(_STATE["transition_from"], ox_from, oy_from)
        draw_typ(_STATE["transition_to"], ox_to, oy_to)


def run(cfg: dict):
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
