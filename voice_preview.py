#!/usr/bin/env python3
"""
Generate a short Edge TTS preview for a voice.
Usage: python voice_preview.py <voice_name> <text_file_path> <output_path>
Reads text from text_file_path, synthesizes with Edge TTS, writes MP3 to output_path.
Exit 0 on success, non-zero on failure.
"""
import asyncio
import sys
from pathlib import Path


async def main() -> int:
    if len(sys.argv) != 4:
        print("Usage: voice_preview.py <voice_name> <text_file_path> <output_path>", file=sys.stderr)
        return 1
    voice_name = sys.argv[1].strip()
    text_path = Path(sys.argv[2])
    output_path = Path(sys.argv[3])
    if not voice_name:
        print("voice_name is required", file=sys.stderr)
        return 1
    if not text_path.exists():
        print(f"Text file not found: {text_path}", file=sys.stderr)
        return 1
    text = text_path.read_text(encoding="utf-8").strip()
    if not text:
        print("Text file is empty", file=sys.stderr)
        return 1
    try:
        import edge_tts
    except ImportError:
        print("edge_tts not installed", file=sys.stderr)
        return 1
    try:
        communicate = edge_tts.Communicate(
            text=text,
            voice=voice_name,
            rate="+0%",
        )
        await communicate.save(str(output_path))
        if not output_path.exists() or output_path.stat().st_size == 0:
            print("Edge TTS produced no output", file=sys.stderr)
            return 1
        return 0
    except Exception as e:
        print(str(e), file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
