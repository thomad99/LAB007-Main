"""Generate a ~15s SmartHours advert voiceover with word timings."""
import asyncio
import json
import os

import edge_tts
import imageio_ffmpeg

OUT_DIR = os.path.join(os.path.dirname(__file__), '..', 'public', 'smarthours-assets', 'about')
MP3 = os.path.abspath(os.path.join(OUT_DIR, 'smarthours-advert.mp3'))
JSON = os.path.abspath(os.path.join(OUT_DIR, 'smarthours-advert-vo.json'))

# Conversational UK voice, slightly brisk so the full script fits ~15s.
VOICE = 'en-GB-SoniaNeural'
RATE = '+8%'

TEXT = (
    'SmartHours. Opening hours that work for you. '
    'Three month battery, Wi-Fi, and Google sync. '
    'Use our templates. '
    'Update from your phone. '
    'Easy to mount. '
    'Seven or thirteen inch. '
    'Explore SmartHours.'
)


async def main():
    communicate = edge_tts.Communicate(TEXT, VOICE, rate=RATE, boundary='WordBoundary')
    audio = bytearray()
    words = []
    async for chunk in communicate.stream():
        if chunk['type'] == 'audio':
            audio.extend(chunk['data'])
        elif chunk['type'] in ('WordBoundary', 'SentenceBoundary'):
            words.append({
                'type': chunk['type'],
                'text': chunk.get('text') or '',
                'offset_ms': int(chunk['offset'] / 10000),
                'duration_ms': int(chunk.get('duration', 0) / 10000),
            })
    os.makedirs(OUT_DIR, exist_ok=True)
    with open(MP3, 'wb') as f:
        f.write(audio)

    ffprobe = imageio_ffmpeg.get_ffmpeg_exe().replace('ffmpeg.exe', 'ffprobe.exe')
    duration_ms = words[-1]['offset_ms'] + words[-1]['duration_ms'] if words else 0
    payload = {'voice': VOICE, 'rate': RATE, 'text': TEXT, 'duration_ms': duration_ms, 'words': words}
    with open(JSON, 'w', encoding='utf-8') as f:
        json.dump(payload, f, indent=2)
    print('Wrote', MP3)
    print('duration_ms', duration_ms)
    for w in words:
        print(f"{w['offset_ms']:5d}  {w['text']}")


if __name__ == '__main__':
    asyncio.run(main())
