#!/usr/bin/env python3
import os
import subprocess
from pathlib import Path
import pygame

from common import setup_logging, resolve_path

VIDEO_EXTS = {".mp4", ".mkv", ".mov", ".avi", ".webm"}

def show_message(msg: str, seconds: int = 10):
    # Simple fullscreen message (no keyboard needed)
    pygame.init()
    info = pygame.display.Info()
    screen = pygame.display.set_mode((info.current_w, info.current_h), pygame.FULLSCREEN)
    font = pygame.font.SysFont("Arial", 34, bold=True)

    start = pygame.time.get_ticks()
    while (pygame.time.get_ticks() - start) < seconds * 1000:
        for _ in pygame.event.get():
            pass
        screen.fill((0, 0, 0))
        y = 40
        for line in msg.splitlines():
            screen.blit(font.render(line, True, (255, 170, 90)), (30, y))
            y += 44
        pygame.display.flip()
        pygame.time.wait(50)

    pygame.quit()

def list_videos(folder: Path):
    vids = [p for p in folder.iterdir() if p.is_file() and p.suffix.lower() in VIDEO_EXTS]
    return sorted(vids, key=lambda p: p.name.lower())

def run(cfg: dict):
    setup_logging()

    vcfg = cfg.get("video_player", {})
    folder = resolve_path(vcfg.get("folder", "video"))
    folder.mkdir(parents=True, exist_ok=True)

    loop_first = bool(vcfg.get("loop_first", False))
    audio = vcfg.get("audio", "on")  # "on" or "off"
    volume = int(vcfg.get("volume", 70))  # 0-100
    shuffle = bool(vcfg.get("shuffle", False))

    # Check mpv exists
    if subprocess.call(["bash", "-lc", "command -v mpv >/dev/null 2>&1"]) != 0:
        show_message("mpv not installed.\nRun:\n  sudo apt install -y mpv", seconds=12)
        return

    videos = list_videos(folder)
    if not videos:
        show_message(f"No videos found in:\n{folder}\n\nAdd .mp4 files there.", seconds=12)
        return

    if shuffle:
        import random
        random.shuffle(videos)

    base_cmd = [
        "mpv",
        "--fs",
        "--no-osd-bar",
        "--really-quiet",
        "--keep-open=no",
        "--hwdec=auto",
    ]

    if audio == "off":
        base_cmd += ["--mute=yes"]
    else:
        base_cmd += [f"--volume={volume}"]

    if loop_first:
        # Loop the first video forever
        cmd = base_cmd + ["--loop-file=inf", str(videos[0])]
        subprocess.run(cmd)
        return

    # Play all videos in order once (no looping)
    # Use a playlist file so mpv handles transitions cleanly
    playlist_path = folder / "_playlist.m3u"
    playlist_path.write_text("\n".join(str(p) for p in videos) + "\n")
    cmd = base_cmd + ["--playlist", str(playlist_path)]
    subprocess.run(cmd)

if __name__ == "__main__":
    from common import load_config
    run(load_config())
