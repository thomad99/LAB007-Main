import os, sys, time, json, subprocess, logging
from pathlib import Path

APP_DIR = Path(__file__).resolve().parent
LOG_PATH = APP_DIR / "display.log"

def setup_logging():
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(message)s",
        handlers=[logging.FileHandler(LOG_PATH), logging.StreamHandler(sys.stdout)]
    )

def load_config():
    '''
    Load config from:
      1) --config <path>
      2) CONFIG_URL (http/https) or CONFIG_PATH (file path)
      3) ./config.json
    '''
    cfg_path = None
    if "--config" in sys.argv:
        i = sys.argv.index("--config")
        if i + 1 < len(sys.argv):
            cfg_path = sys.argv[i + 1]

    url = os.environ.get("CONFIG_URL")
    env_path = os.environ.get("CONFIG_PATH")

    if cfg_path:
        return json.loads(Path(cfg_path).read_text())

    if url:
        try:
            import requests
            headers = {"User-Agent": "tomopi/1.0"}
            r = requests.get(url, timeout=6, headers=headers)
            r.raise_for_status()
            etag = r.headers.get("ETag", "")
            lm = r.headers.get("Last-Modified", "")
            cc = r.headers.get("Cache-Control", "")
            logging.info(f"CONFIG_URL fetch OK url={url} status={r.status_code} etag={etag} last_modified={lm} cache_control={cc}")

            return r.json()



            r.raise_for_status()
            return r.json()
        except Exception as e:
            logging.warning(f"Failed to fetch CONFIG_URL={url}: {e}. Falling back to local config.json")

    if env_path:
        try:
            return json.loads(Path(env_path).read_text())
        except Exception as e:
            logging.warning(f"Failed to read CONFIG_PATH={env_path}: {e}. Falling back to local config.json")

    return json.loads((APP_DIR / "config.json").read_text())

def xrandr_set_orientation(rotate="normal"):
    '''
    Force display orientation using xrandr inside X.
    Autodetects primary output; falls back to first connected output.
    rotate: normal | left | right | inverted
    '''
    if not os.environ.get("DISPLAY"):
        return

    try:
        out = subprocess.check_output(["xrandr", "--query"], text=True, stderr=subprocess.STDOUT)
    except Exception as e:
        logging.warning(f"xrandr not available: {e}")
        return

    primary = None
    connected = []
    for line in out.splitlines():
        if " connected" in line:
            name = line.split()[0]
            connected.append(name)
            if " primary " in line:
                primary = name

    target = primary or (connected[0] if connected else None)
    if not target:
        logging.warning("No connected X outputs found in xrandr.")
        return

    try:
        subprocess.run(["xrandr", "--output", target, "--rotate", rotate, "--auto"], check=False)
        logging.info(f"xrandr set {target} rotate={rotate}")
    except Exception as e:
        logging.warning(f"Failed to set xrandr orientation: {e}")

def resolve_path(p: str) -> Path:
    return (APP_DIR / p).resolve
()
