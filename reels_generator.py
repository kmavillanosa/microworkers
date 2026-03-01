import argparse
import asyncio
import datetime as dt
import json
import os
import re
import random
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Optional

def _emit_stage (stage: str) -> None:
	"""Print a stage line so the API can update job progress (e.g. avoid stuck on 'Preparing assets')."""
	sys.stdout.write(f'[REEL] {stage}\n')
	sys.stdout.flush()


def _volume_scale (clip, factor: float):
	"""Scale audio volume by factor. Tries several APIs so it works across MoviePy versions."""
	try:
		return clip.volumex(factor)
	except AttributeError:
		pass
	try:
		return clip.with_volume_scaled(factor)
	except AttributeError:
		pass
	try:
		from moviepy.audio.fx.volumex import volumex
		return clip.fx(volumex, factor)
	except (ImportError, AttributeError):
		pass
	try:
		from moviepy.audio.fx.all import volumex
		return clip.fx(volumex, factor)
	except (ImportError, AttributeError):
		pass
	# Fallback: multiply each audio frame by factor (works without volumex module).
	def scaled_frame(get_frame, t):
		arr = get_frame(t)
		if arr is None:
			return None
		out = arr.astype(np.float64) * factor
		out = np.clip(out, -1.0, 1.0)
		return out.astype(np.float32) if arr.dtype != np.float64 else out
	return clip.fl(scaled_frame)

import imageio_ffmpeg
import numpy as np
from moviepy import AudioFileClip
from moviepy.audio.AudioClip import CompositeAudioClip
from moviepy import CompositeVideoClip
from moviepy import ImageClip
from moviepy import VideoFileClip
from moviepy import VideoClip
from moviepy import concatenate_videoclips


def ensure_ffmpeg () -> None:
	# Use bundled ffmpeg from imageio-ffmpeg when system ffmpeg is missing.
	ffmpeg_exe = imageio_ffmpeg.get_ffmpeg_exe()
	os.environ['IMAGEIO_FFMPEG_EXE'] = ffmpeg_exe


def _ones (n: int) -> str:
	words = [
		'', 'one', 'two', 'three', 'four', 'five',
		'six', 'seven', 'eight', 'nine', 'ten',
		'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen',
		'sixteen', 'seventeen', 'eighteen', 'nineteen',
	]
	return words[n]


def _tens (n: int) -> str:
	words = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety']
	return words[n]


def _number_to_words (n: int) -> str:
	"""Convert an integer to its English spoken form."""
	if n < 0:
		return 'negative ' + _number_to_words(-n)
	if n == 0:
		return 'zero'
	if n < 20:
		return _ones(n)
	if n < 100:
		t = _tens(n // 10)
		o = _ones(n % 10)
		return t + ('-' + o if o else '')
	if n < 1000:
		h = _ones(n // 100) + ' hundred'
		rest = n % 100
		return h + (' ' + _number_to_words(rest) if rest else '')
	if n < 1_000_000:
		th = _number_to_words(n // 1000) + ' thousand'
		rest = n % 1000
		return th + (' ' + _number_to_words(rest) if rest else '')
	return str(n)


def _year_to_words (year: int) -> str:
	"""Speak a year the natural way: 2026 → 'twenty twenty-six', 1900 → 'nineteen hundred'."""
	if year < 1000 or year > 2099:
		return _number_to_words(year)
	century = year // 100
	remainder = year % 100
	if remainder == 0:
		return _number_to_words(century) + ' hundred'
	if remainder < 10:
		return _number_to_words(century) + ' oh ' + _ones(remainder)
	return _number_to_words(century) + ' ' + _number_to_words(remainder)


def normalize_tts_text (text: str) -> str:
	"""
	Expand numbers and years so TTS engines speak them naturally.
	  2026       → twenty twenty-six
	  1986       → nineteen eighty-six
	  3,500      → three thousand five hundred
	  $50        → fifty dollars
	  50%        → fifty percent
	  #5         → number five
	"""
	# Currency: $50 → fifty dollars
	text = re.sub(
		r'\$(\d[\d,]*)',
		lambda m: _number_to_words(int(m.group(1).replace(',', ''))) + ' dollars',
		text,
	)
	# Percent: 50% → fifty percent
	text = re.sub(
		r'(\d[\d,]*)%',
		lambda m: _number_to_words(int(m.group(1).replace(',', ''))) + ' percent',
		text,
	)
	# Hashtag number: #5 → number five  (social hashtags stripped, numeric ones spoken)
	text = re.sub(
		r'#(\d+)',
		lambda m: 'number ' + _number_to_words(int(m.group(1))),
		text,
	)
	# Strip remaining hashtags (e.g. #gaming → gaming)
	text = re.sub(r'#(\w+)', r'\1', text)
	# Years (4-digit numbers between 1000-2099 standing alone)
	text = re.sub(
		r'\b(1[0-9]{3}|20[0-9]{2})\b',
		lambda m: _year_to_words(int(m.group(1))),
		text,
	)
	# Remaining numbers with optional commas
	text = re.sub(
		r'\b(\d[\d,]*)\b',
		lambda m: _number_to_words(int(m.group(1).replace(',', ''))),
		text,
	)
	return text


def read_script (script_path: Path) -> str:
	content = script_path.read_text(encoding='utf-8').strip()
	if not content:
		raise ValueError('Script file is empty.')
	return ' '.join(content.split())


def split_caption_chunks (
	text: str,
	max_words_per_chunk: int = 6,
) -> list[str]:
	words = text.split()
	if not words:
		return []
	chunks = []
	buffer = []
	for word in words:
		buffer.append(word)
		if len(buffer) >= max_words_per_chunk:
			chunks.append(' '.join(buffer))
			buffer = []
	if buffer:
		chunks.append(' '.join(buffer))
	return chunks


def estimate_duration_from_text (text: str) -> float:
	words = len(text.split())
	return max(4.0, words * 0.45 + 0.3)


def compute_chunk_timings (
	chunks: list[str],
	total_duration: float,
) -> list[tuple[float, float]]:
	if not chunks:
		return []
	weights = [max(1, len(chunk.replace(' ', ''))) for chunk in chunks]
	total_weight = sum(weights)
	current = 0.0
	timings = []
	for i, weight in enumerate(weights):
		if i == len(weights) - 1:
			start = current
			end = total_duration
		else:
			duration = total_duration * (weight / total_weight)
			start = current
			end = current + duration
		timings.append((start, end))
		current = end
	return timings


def compute_chunk_timings_from_segments (
	segments: list[dict],
	max_words_per_chunk: int,
) -> tuple[list[str], list[tuple[float, float]]]:
	chunks: list[str] = []
	timings: list[tuple[float, float]] = []
	for segment in segments:
		text = str(segment.get('text', '')).strip()
		if not text:
			continue
		words = text.split()
		if not words:
			continue
		seg_chunks = [
			' '.join(words[i:i + max_words_per_chunk])
			for i in range(0, len(words), max_words_per_chunk)
		]
		seg_start = float(segment.get('start', 0))
		seg_end = float(segment.get('end', seg_start))
		seg_duration = max(0.05, seg_end - seg_start)
		weights = [max(1, len(chunk.replace(' ', ''))) for chunk in seg_chunks]
		total_weight = sum(weights)
		current = seg_start
		for idx, chunk in enumerate(seg_chunks):
			if idx == len(seg_chunks) - 1:
				end = seg_end if seg_end > seg_start else (current + seg_duration)
			else:
				duration = seg_duration * (weights[idx] / total_weight) if total_weight else (seg_duration / len(seg_chunks))
				end = current + duration
			chunks.append(chunk)
			timings.append((current, end))
			current = end
	return chunks, timings


def get_video_duration (video_path: Path) -> float:
	clip = VideoFileClip(str(video_path))
	try:
		return float(clip.duration)
	finally:
		clip.close()


def compute_chunk_timings_from_segments (
	segments: list[dict],
	max_words_per_chunk: int,
) -> tuple[list[str], list[tuple[float, float]]]:
	chunks: list[str] = []
	timings: list[tuple[float, float]] = []
	for segment in segments:
		text = str(segment.get('text', '')).strip()
		if not text:
			continue
		words = text.split()
		if not words:
			continue
		seg_chunks = [
			' '.join(words[i:i + max_words_per_chunk])
			for i in range(0, len(words), max_words_per_chunk)
		]
		seg_start = float(segment.get('start', 0))
		seg_end = float(segment.get('end', seg_start))
		seg_duration = max(0.05, seg_end - seg_start)
		weights = [max(1, len(chunk.replace(' ', ''))) for chunk in seg_chunks]
		total_weight = sum(weights)
		current = seg_start
		for idx, chunk in enumerate(seg_chunks):
			if idx == len(seg_chunks) - 1:
				end = seg_end if seg_end > seg_start else (current + seg_duration)
			else:
				duration = seg_duration * (weights[idx] / total_weight) if total_weight else (seg_duration / len(seg_chunks))
				end = current + duration
			chunks.append(chunk)
			timings.append((current, end))
			current = end
	return chunks, timings


def get_video_duration (video_path: Path) -> float:
	clip = VideoFileClip(str(video_path))
	try:
		return float(clip.duration)
	finally:
		clip.close()


def format_srt_timestamp (value: float) -> str:
	total_ms = max(0, int(round(value * 1000)))
	hours = total_ms // 3600000
	minutes = (total_ms % 3600000) // 60000
	seconds = (total_ms % 60000) // 1000
	milliseconds = total_ms % 1000
	return f'{hours:02}:{minutes:02}:{seconds:02},{milliseconds:03}'


def export_transcription_files (
	output_path: Path,
	script_text: str,
	chunks: list[str],
	timings: list[tuple[float, float]],
) -> tuple[Path, Path]:
	srt_path = output_path.with_suffix('.srt')
	txt_path = output_path.with_suffix('.txt')

	lines = []
	for idx, (chunk, (start, end)) in enumerate(zip(chunks, timings), start=1):
		lines.append(str(idx))
		lines.append(
			f'{format_srt_timestamp(start)} --> {format_srt_timestamp(end)}',
		)
		lines.append(chunk)
		lines.append('')

	srt_path.write_text('\n'.join(lines), encoding='utf-8')
	txt_path.write_text(script_text + '\n', encoding='utf-8')
	return srt_path, txt_path


def parse_size (value: str) -> tuple[int, int]:
	parts = value.lower().split('x')
	if len(parts) != 2:
		raise ValueError('Size must be formatted like 1080x1920')
	width = int(parts[0])
	height = int(parts[1])
	if width <= 0 or height <= 0:
		raise ValueError('Size values must be positive integers')
	return width, height


_FONT_CACHE: dict[str, Optional[str]] = {}


def _measure_text (
	draw,
	text: str,
	font,
	stroke_width: int = 2,
) -> tuple[int, int]:
	if not text:
		return 0, 0
	bbox = draw.textbbox(
		(0, 0),
		text,
		font=font,
		stroke_width=stroke_width,
	)
	return int(round(bbox[2] - bbox[0])), int(round(bbox[3] - bbox[1]))


def wrap_words_to_pixel_width (
	words: list[str],
	draw,
	font,
	max_width: int,
	stroke_width: int = 2,
) -> list[list[str]]:
	if not words:
		return []

	lines: list[list[str]] = []
	current: list[str] = []
	for word in words:
		candidate = current + [word]
		candidate_text = ' '.join(candidate)
		candidate_w, _ = _measure_text(
			draw=draw,
			text=candidate_text,
			font=font,
			stroke_width=stroke_width,
		)
		if current and candidate_w > max_width:
			lines.append(current)
			current = [word]
		else:
			current = candidate
	if current:
		lines.append(current)
	return lines


def compute_word_timings_for_chunk (
	chunk: str,
	start: float,
	end: float,
) -> list[tuple[float, float]]:
	words = chunk.split()
	if not words:
		return []
	if end <= start:
		return [(start, start + 0.05) for _ in words]

	window = end - start
	weights = []
	for word in words:
		alnum_len = sum(1 for char in word if char.isalnum())
		weights.append(max(1, alnum_len))

	total_weight = sum(weights)
	cursor = start
	word_timings: list[tuple[float, float]] = []
	for index, weight in enumerate(weights):
		if index == len(weights) - 1:
			word_end = end
		else:
			word_end = cursor + window * (weight / total_weight)
		word_timings.append((cursor, word_end))
		cursor = word_end
	return word_timings


def resolve_font_path (font_name: str, bold: bool) -> Optional[str]:
	cache_key = f'{font_name.lower().strip()}::{"bold" if bold else "regular"}'
	if cache_key in _FONT_CACHE:
		return _FONT_CACHE[cache_key]

	script_root = Path(__file__).resolve().parent
	fonts_dir = script_root / 'assets' / 'fonts'
	fonts_dir.mkdir(parents=True, exist_ok=True)

	requested = font_name.lower().strip()
	custom_fonts = sorted(
		[
			path for path in fonts_dir.iterdir()
			if path.is_file() and path.suffix.lower() in {'.ttf', '.otf'}
		],
	)

	candidates: list[Path] = []
	if requested and requested != 'default':
		for path in custom_fonts:
			if path.name.lower() == requested or path.stem.lower() == requested:
				candidates.append(path)
		for path in custom_fonts:
			stem_lower = path.stem.lower()
			if requested in stem_lower:
				candidates.append(path)

	if not candidates and requested in {'', 'ubuntu'}:
		ubuntu_name = 'Ubuntu-Bold.ttf' if bold else 'Ubuntu-Regular.ttf'
		candidates.append(fonts_dir / ubuntu_name)
		candidates.append(
			Path('C:/Windows/Fonts/Ubuntu-B.ttf' if bold else 'C:/Windows/Fonts/Ubuntu-R.ttf'),
		)

	for candidate in candidates:
		if candidate.exists() and candidate.is_file():
			_FONT_CACHE[cache_key] = str(candidate)
			return _FONT_CACHE[cache_key]

	_FONT_CACHE[cache_key] = None
	return None


def load_preferred_font (
	font_size: int,
	font_name: str,
	bold: bool = True,
):
	from PIL import ImageFont

	font_path = resolve_font_path(font_name=font_name, bold=bold)
	if font_path:
		try:
			return ImageFont.truetype(font_path, font_size)
		except OSError:
			pass

	fallback_fonts = ['arialbd.ttf', 'arial.ttf'] if bold else ['arial.ttf', 'segoeui.ttf']
	for fallback in fallback_fonts:
		try:
			return ImageFont.truetype(fallback, font_size)
		except OSError:
			continue
	return ImageFont.load_default()


def create_caption_image (
	text: str,
	width: int,
	height: int,
	font_name: str,
	highlight_words: Optional[int] = None,
	font_size: Optional[int] = None,
) -> tuple[np.ndarray, tuple[int, int]]:
	from PIL import Image
	from PIL import ImageDraw

	# Scale font size to ~5.5% of video width so it fits any resolution.
	if font_size is None:
		font_size = max(24, int(width * 0.055))

	font = load_preferred_font(
		font_size=font_size,
		font_name=font_name,
		bold=True,
	)

	measure_img = Image.new('RGBA', (8, 8), (0, 0, 0, 0))
	measure_draw = ImageDraw.Draw(measure_img)
	words = text.split()
	max_text_width = max(120, int(width * 0.80))
	lines_words = wrap_words_to_pixel_width(
		words=words,
		draw=measure_draw,
		font=font,
		max_width=max_text_width,
		stroke_width=2,
	)
	if not lines_words:
		lines_words = [[text]]

	line_texts = [' '.join(line) for line in lines_words]
	line_sizes = [
		_measure_text(
			draw=measure_draw,
			text=line_text,
			font=font,
			stroke_width=2,
		)
		for line_text in line_texts
	]
	text_w = max((size[0] for size in line_sizes), default=0)
	line_height = max(
		_measure_text(draw=measure_draw, text='Ag', font=font, stroke_width=2)[1],
		int(font_size * 0.95),
	)
	line_gap = max(4, int(font_size * 0.18))
	text_h = (
		len(line_texts) * line_height
		+ max(0, len(line_texts) - 1) * line_gap
	)

	padding_x = max(16, int(width * 0.04))
	padding_y = max(10, int(height * 0.015))
	box_w = max(1, int(round(text_w + padding_x * 2)))
	box_h = max(1, int(round(text_h + padding_y * 2)))
	box_x = int((width - box_w) // 2)
	box_y = int(int(height * 0.72) - (box_h // 2))

	img = Image.new('RGBA', (box_w, box_h), (0, 0, 0, 0))
	draw = ImageDraw.Draw(img)
	radius = max(12, int(width * 0.025))
	draw.rounded_rectangle(
		[0, 0, box_w, box_h],
		radius=radius,
		fill=(0, 0, 0, 180),
	)

	total_words = len(words)
	highlight_count = total_words if highlight_words is None else highlight_words
	highlight_count = max(0, min(total_words, highlight_count))
	word_cursor = 0
	for line_idx, line_words in enumerate(lines_words):
		line_text = line_texts[line_idx]
		line_w, _ = line_sizes[line_idx]
		line_y = padding_y + line_idx * (line_height + line_gap)
		cursor_x = (box_w - line_w) // 2

		for word_idx, word in enumerate(line_words):
			token = word if word_idx == len(line_words) - 1 else f'{word} '
			token_w, _ = _measure_text(
				draw=draw,
				text=token,
				font=font,
				stroke_width=2,
			)
			is_highlighted = word_cursor < highlight_count
			draw.text(
				(cursor_x, line_y),
				token,
				font=font,
				fill=(255, 230, 90, 255) if is_highlighted else (255, 255, 255, 255),
				stroke_width=2,
				stroke_fill=(0, 0, 0, 220),
			)
			cursor_x += token_w
			word_cursor += 1

	return np.array(img), (box_x, box_y)


def create_title_image (
	title: str,
	width: int,
	height: int,
	font_name: str,
) -> tuple[np.ndarray, tuple[int, int]]:
	from PIL import Image
	from PIL import ImageDraw

	# Scale title font to ~7% of video width.
	title_font_size = max(24, int(width * 0.07))
	words = title.split()
	measure_img = Image.new('RGBA', (8, 8), (0, 0, 0, 0))
	measure_draw = ImageDraw.Draw(measure_img)
	max_text_width = max(140, int(width * 0.84))
	max_title_lines = 3

	lines_words: list[list[str]] = []
	line_texts: list[str] = []
	line_sizes: list[tuple[int, int]] = []
	line_height = 0
	line_gap = 0
	font = None

	for size in range(title_font_size, 19, -2):
		font = load_preferred_font(
			font_size=size,
			font_name=font_name,
			bold=True,
		)
		lines_words = wrap_words_to_pixel_width(
			words=words if words else [title],
			draw=measure_draw,
			font=font,
			max_width=max_text_width,
			stroke_width=2,
		)
		if not lines_words:
			lines_words = [[title]]
		if len(lines_words) <= max_title_lines:
			line_texts = [' '.join(line).strip() for line in lines_words]
			line_sizes = [
				_measure_text(
					draw=measure_draw,
					text=line_text,
					font=font,
					stroke_width=2,
				)
				for line_text in line_texts
			]
			line_height = max(
				_measure_text(draw=measure_draw, text='Ag', font=font, stroke_width=2)[1],
				int(size * 0.95),
			)
			line_gap = max(4, int(size * 0.2))
			break

	if font is None:
		font = load_preferred_font(
			font_size=title_font_size,
			font_name=font_name,
			bold=True,
		)
		lines_words = [[title]]
		line_texts = [title]
		line_sizes = [
			_measure_text(
				draw=measure_draw,
				text=title,
				font=font,
				stroke_width=2,
			),
		]
		line_height = _measure_text(draw=measure_draw, text='Ag', font=font, stroke_width=2)[1]
		line_gap = 4

	text_w = max((size[0] for size in line_sizes), default=0)
	text_h = (
		len(line_texts) * line_height
		+ max(0, len(line_texts) - 1) * line_gap
	)
	pad_x = int(width * 0.06)
	pad_y = int(height * 0.025)
	box_w = max(1, int(round(text_w + pad_x * 2)))
	box_h = max(1, int(round(text_h + pad_y * 2)))
	box_x = int((width - box_w) // 2)
	box_y = int(height * 0.18)

	img = Image.new('RGBA', (box_w, box_h), (0, 0, 0, 0))
	draw = ImageDraw.Draw(img)
	draw.rounded_rectangle(
		[0, 0, box_w, box_h],
		radius=max(12, int(width * 0.02)),
		fill=(0, 0, 0, 160),
	)

	for line_idx, line_text in enumerate(line_texts):
		line_w, _ = line_sizes[line_idx]
		line_y = pad_y + line_idx * (line_height + line_gap)
		line_x = (box_w - line_w) // 2
		draw.text(
			(line_x, line_y),
			line_text,
			font=font,
			fill=(255, 255, 255, 255),
			stroke_width=2,
			stroke_fill=(0, 0, 0, 220),
		)
	return np.array(img), (box_x, box_y)


def create_background_clip (
	duration: float,
	size: tuple[int, int],
) -> VideoClip:
	width, height = size

	def make_frame (t: float) -> np.ndarray:
		x = np.linspace(0, 1, width)
		y = np.linspace(0, 1, height)
		xx, yy = np.meshgrid(x, y)

		r = 80 + 70 * np.sin(2 * np.pi * (xx + t * 0.07))
		g = 70 + 80 * np.sin(2 * np.pi * (yy + t * 0.09))
		b = 120 + 70 * np.sin(2 * np.pi * (xx + yy + t * 0.05))

		frame = np.zeros((height, width, 3), dtype=np.uint8)
		frame[:, :, 0] = np.clip(r, 0, 255).astype(np.uint8)
		frame[:, :, 1] = np.clip(g, 0, 255).astype(np.uint8)
		frame[:, :, 2] = np.clip(b, 0, 255).astype(np.uint8)
		return frame

	return VideoClip(frame_function=make_frame, duration=duration)


def _derive_palette_from_text (text: str) -> list[tuple[int, int, int]]:
	"""Derive a 3-colour palette from the script text using a simple hash.

	Different scripts produce visually distinct colour schemes so each
	caption-mode video looks unique.
	"""
	import hashlib
	digest = hashlib.md5(text.encode()).hexdigest()
	# Pull three 24-bit colours from the digest
	def hex_to_rgb (h: str) -> tuple[int, int, int]:
		v = int(h, 16)
		return ((v >> 16) & 0xFF, (v >> 8) & 0xFF, v & 0xFF)

	c1 = hex_to_rgb(digest[0:6])
	c2 = hex_to_rgb(digest[6:12])
	c3 = hex_to_rgb(digest[12:18])

	# Ensure colours are not too dark — lift each channel to at least 40
	def lift (c: tuple[int, int, int]) -> tuple[int, int, int]:
		return (max(c[0], 40), max(c[1], 40), max(c[2], 40))

	return [lift(c1), lift(c2), lift(c3)]


def create_caption_background_clip (
	duration: float,
	size: tuple[int, int],
	script_text: str,
) -> VideoClip:
	"""Generate a fully procedural animated background driven by the script text.

	Uses only NumPy — no external services, no downloaded assets.
	The background features:
	  - A smoothly animated dual-gradient derived from the script's colour palette
	  - Floating translucent circles (particles) that drift upward
	  - A subtle vignette to keep text readable
	"""
	width, height = size
	palette = _derive_palette_from_text(script_text)
	c1 = np.array(palette[0], dtype=np.float32)
	c2 = np.array(palette[1], dtype=np.float32)
	c3 = np.array(palette[2], dtype=np.float32)

	# Pre-compute normalised coordinate grids once
	xs = np.linspace(0.0, 1.0, width, dtype=np.float32)
	ys = np.linspace(0.0, 1.0, height, dtype=np.float32)
	xx, yy = np.meshgrid(xs, ys)  # shape (H, W)

	# Vignette mask — darkens edges, keeps centre bright
	cx, cy = 0.5, 0.5
	dist = np.sqrt((xx - cx) ** 2 + (yy - cy) ** 2)
	vignette = np.clip(1.0 - dist * 1.2, 0.2, 1.0).astype(np.float32)  # (H, W)

	# Particle positions (seeded from script hash for reproducibility)
	rng = np.random.default_rng(abs(hash(script_text[:32])) % (2 ** 31))
	n_particles = 18
	px = rng.uniform(0.05, 0.95, n_particles).astype(np.float32)
	py_start = rng.uniform(0.1, 1.0, n_particles).astype(np.float32)
	p_speed = rng.uniform(0.03, 0.10, n_particles).astype(np.float32)
	p_radius = rng.uniform(0.03, 0.10, n_particles).astype(np.float32)
	p_alpha = rng.uniform(0.08, 0.22, n_particles).astype(np.float32)

	def make_frame (t: float) -> np.ndarray:
		# ---- animated gradient ----
		wave1 = 0.5 + 0.5 * np.sin(2 * np.pi * (xx * 1.2 + yy * 0.8 + t * 0.12))
		wave2 = 0.5 + 0.5 * np.sin(2 * np.pi * (xx * 0.7 - yy * 1.1 + t * 0.09))

		w1 = wave1[:, :, np.newaxis]  # (H, W, 1)
		w2 = wave2[:, :, np.newaxis]

		# Blend three palette colours
		base = c1 * (1 - w1) * (1 - w2) + c2 * w1 * (1 - w2) + c3 * w2
		base = np.clip(base, 0, 255)

		# Apply vignette
		frame = (base * vignette[:, :, np.newaxis]).astype(np.float32)

		# ---- floating particles ----
		for i in range(n_particles):
			# Particle drifts upward, wraps around
			py_now = (py_start[i] - p_speed[i] * t) % 1.1
			# Pixel coords
			pcx = int(px[i] * width)
			pcy = int(py_now * height)
			r_px = max(4, int(p_radius[i] * min(width, height)))

			# Draw a soft circle by computing distance from centre
			y0 = max(0, pcy - r_px)
			y1 = min(height, pcy + r_px + 1)
			x0 = max(0, pcx - r_px)
			x1 = min(width, pcx + r_px + 1)
			if y1 <= y0 or x1 <= x0:
				continue

			patch_y = np.arange(y0, y1, dtype=np.float32)
			patch_x = np.arange(x0, x1, dtype=np.float32)
			pxx, pyy = np.meshgrid(patch_x, patch_y)
			d = np.sqrt((pxx - pcx) ** 2 + (pyy - pcy) ** 2)
			soft = np.clip(1.0 - d / r_px, 0.0, 1.0) * p_alpha[i]
			soft = soft[:, :, np.newaxis]  # (ph, pw, 1)

			# Blend white particle over background
			frame[y0:y1, x0:x1] = frame[y0:y1, x0:x1] * (1 - soft) + 255 * soft

		return np.clip(frame, 0, 255).astype(np.uint8)

	return VideoClip(frame_function=make_frame, duration=duration)


def find_video_files (bg_dir: Path) -> list[Path]:
	video_extensions = {'.mp4', '.mov', '.mkv', '.webm', '.avi'}
	return [
		path for path in bg_dir.glob('*')
		if path.is_file() and path.suffix.lower() in video_extensions
	]


def fit_clip_to_vertical (
	clip: VideoFileClip,
	size: tuple[int, int],
) -> VideoFileClip:
	target_w, target_h = size
	scale_factor = max(target_w / clip.w, target_h / clip.h)
	resized = clip.resized(scale_factor)
	return resized.cropped(
		x_center=resized.w / 2,
		y_center=resized.h / 2,
		width=target_w,
		height=target_h,
	)


def create_background_from_video_dir (
	bg_dir: Path,
	duration: float,
	size: tuple[int, int],
) -> Optional[VideoClip]:
	video_files = find_video_files(bg_dir)
	if not video_files:
		return None

	selected = random.choice(video_files)
	base_clip = VideoFileClip(str(selected)).without_audio()
	clip = fit_clip_to_vertical(base_clip, size=size)

	if clip.duration >= duration:
		max_start = max(0.0, clip.duration - duration)
		start = random.uniform(0.0, max_start) if max_start > 0 else 0.0
		return clip.subclipped(start, start + duration).with_duration(duration)

	if clip.duration <= 0:
		return None

	repeats = int(duration // clip.duration) + 2
	looped = concatenate_videoclips(
		[clip.subclipped(0, clip.duration) for _ in range(repeats)],
		method='chain',
	)
	return looped.subclipped(0, duration).with_duration(duration)


def create_background_from_video_file (
	video_path: Path,
	duration: float,
	size: tuple[int, int],
) -> Optional[VideoClip]:
	if not video_path.exists() or not video_path.is_file():
		return None

	base_clip = VideoFileClip(str(video_path)).without_audio()
	clip = fit_clip_to_vertical(base_clip, size=size)

	if clip.duration >= duration:
		max_start = max(0.0, clip.duration - duration)
		start = random.uniform(0.0, max_start) if max_start > 0 else 0.0
		return clip.subclipped(start, start + duration).with_duration(duration)

	if clip.duration <= 0:
		return None

	repeats = int(duration // clip.duration) + 2
	looped = concatenate_videoclips(
		[clip.subclipped(0, clip.duration) for _ in range(repeats)],
		method='chain',
	)
	return looped.subclipped(0, duration).with_duration(duration)


async def save_edge_tts_audio (
	text: str,
	audio_path: Path,
	voice_name: str,
	edge_rate: int,
) -> bool:
	import edge_tts

	rate_value = f'{edge_rate:+d}%'
	communicate = edge_tts.Communicate(
		text=text,
		voice=voice_name,
		rate=rate_value,
	)
	await communicate.save(str(audio_path))
	return audio_path.exists() and audio_path.stat().st_size > 0


def generate_voiceover_edge (
	text: str,
	audio_path: Path,
	voice_name: str,
	edge_rate: int,
) -> bool:
	try:
		return asyncio.run(
			save_edge_tts_audio(
				text=text,
				audio_path=audio_path,
				voice_name=voice_name,
				edge_rate=edge_rate,
			),
		)
	except Exception:
		return False


def generate_voiceover (
	text: str,
	audio_path: Path,
	voice_rate: int,
	voice_name: str,
) -> bool:
	try:
		import pyttsx3
	except Exception:
		return False

	try:
		engine = pyttsx3.init()
		voices = engine.getProperty('voices') or []
		selected_voice_id = ''
		voice_name_lower = voice_name.lower().strip()

		if voices and voice_name_lower:
			for voice in voices:
				voice_id = str(getattr(voice, 'id', ''))
				name = str(getattr(voice, 'name', ''))
				if voice_name_lower in voice_id.lower() or voice_name_lower in name.lower():
					selected_voice_id = voice_id
					break

		# Favor natural-sounding local voices when no explicit voice is selected.
		if voices and not selected_voice_id:
			preferred_keywords = ['zira', 'hazel', 'david', 'susan', 'mark']
			for keyword in preferred_keywords:
				match = next(
					(
						voice for voice in voices
						if keyword in str(getattr(voice, 'name', '')).lower()
						or keyword in str(getattr(voice, 'id', '')).lower()
					),
					None,
				)
				if match is not None:
					selected_voice_id = str(getattr(match, 'id', ''))
					break

		if selected_voice_id:
			engine.setProperty('voice', selected_voice_id)
		engine.setProperty('rate', voice_rate)
		engine.save_to_file(text, str(audio_path))
		engine.runAndWait()
		engine.stop()
		return audio_path.exists() and audio_path.stat().st_size > 0
	except Exception:
		return False


def generate_voiceover_piper (
	text: str,
	audio_path: Path,
	model_path: str,
) -> bool:
	if not model_path:
		return False
	piper_bin = shutil.which('piper') or shutil.which('piper.exe')
	if not piper_bin:
		return False

	try:
		result = subprocess.run(
			[
				piper_bin,
				'--model',
				model_path,
				'--output_file',
				str(audio_path),
			],
			input=text,
			text=True,
			capture_output=True,
			check=False,
		)
		if result.returncode != 0:
			return False
		return audio_path.exists() and audio_path.stat().st_size > 0
	except Exception:
		return False


def get_audio_duration (audio_path: Path) -> float:
	clip = AudioFileClip(str(audio_path))
	try:
		return float(clip.duration)
	finally:
		clip.close()


def build_reel (
	script_text: str,
	output_path: Path,
	title: Optional[str],
	size: tuple[int, int],
	fps: int,
	render_preset: str,
	voice_engine: str,
	voice_name: str,
	edge_rate: int,
	voice_rate: int,
	bg_dir: Optional[Path],
	bg_clip_path: Optional[Path],
	max_words_per_chunk: int,
	narrate_title: bool,
	font_name: str,
	caption_bg: bool = False,
	transcript_data: Optional[dict] = None,
	use_clip_audio: bool = False,
	use_clip_audio_plus_narrator: bool = False,
) -> tuple[Path, Path]:
	temp_dir = output_path.parent / '.tmp'
	temp_dir.mkdir(parents=True, exist_ok=True)
	audio_path = temp_dir / 'voice.wav'

	narration_text = script_text
	if title and narrate_title and not use_clip_audio and not use_clip_audio_plus_narrator:
		narration_text = f'{title.strip().rstrip(".!?")}. {script_text}'
	if transcript_data and transcript_data.get('text'):
		narration_text = str(transcript_data.get('text')).strip() or narration_text

	narration_text = normalize_tts_text(narration_text)

	has_audio = False
	if voice_engine == 'edge':
		_emit_stage('Generating voiceover')
		has_audio = generate_voiceover_edge(
			text=narration_text,
			audio_path=audio_path,
			voice_name=voice_name,
			edge_rate=edge_rate,
		)
		if not has_audio:
			raise RuntimeError(
				f'Edge TTS failed for voice "{voice_name}". '
				'Check internet connectivity or choose a different voice engine.',
			)
	elif voice_engine == 'pyttsx3':
		_emit_stage('Generating voiceover')
		has_audio = generate_voiceover(
			narration_text,
			audio_path,
			voice_rate,
			voice_name,
		)
	elif voice_engine == 'piper':
		_emit_stage('Generating voiceover')
		has_audio = generate_voiceover_piper(
			text=narration_text,
			audio_path=audio_path,
			model_path=voice_name,
		)
		if not has_audio:
			has_audio = generate_voiceover(
				narration_text,
				audio_path,
				voice_rate,
				voice_name='',
			)
	elif voice_engine == 'none':
		has_audio = False
	if has_audio:
		duration = get_audio_duration(audio_path)
		if use_clip_audio_plus_narrator and bg_clip_path is not None:
			clip_dur = get_video_duration(bg_clip_path)
			duration = max(duration, clip_dur)
	else:
		if use_clip_audio and bg_clip_path is not None:
			duration = get_video_duration(bg_clip_path)
		else:
			duration = estimate_duration_from_text(narration_text)

	_emit_stage('Preparing timeline')
	if transcript_data and transcript_data.get('segments'):
		chunks, timings = compute_chunk_timings_from_segments(
			transcript_data.get('segments') or [],
			max_words_per_chunk=max_words_per_chunk,
		)
	else:
		chunks = split_caption_chunks(
			narration_text,
			max_words_per_chunk=max_words_per_chunk,
		)
		timings = compute_chunk_timings(chunks, duration)
	srt_path, txt_path = export_transcription_files(
		output_path=output_path,
		script_text=narration_text,
		chunks=chunks,
		timings=timings,
	)

	_emit_stage('Loading background')
	background_clip = None
	if caption_bg:
		# Caption-driven procedural background — no video assets needed
		background_clip = create_caption_background_clip(
			duration=duration,
			size=size,
			script_text=script_text,
		)
	else:
		if bg_clip_path is not None:
			background_clip = create_background_from_video_file(
				video_path=bg_clip_path,
				duration=duration,
				size=size,
			)
		if background_clip is None and bg_dir is not None:
			background_clip = create_background_from_video_dir(
				bg_dir=bg_dir,
				duration=duration,
				size=size,
			)
		if background_clip is None:
			background_clip = create_background_clip(duration=duration, size=size)

	layers = [background_clip]
	caption_cache: dict[tuple[str, int], tuple[np.ndarray, tuple[int, int]]] = {}

	for chunk, (start, end) in zip(chunks, timings):
		word_timings = compute_word_timings_for_chunk(
			chunk=chunk,
			start=start,
			end=end,
		)
		if not word_timings:
			continue
		for highlight_count, (word_start, word_end) in enumerate(word_timings, start=1):
			cache_key = (chunk, highlight_count)
			if cache_key not in caption_cache:
				caption_cache[cache_key] = create_caption_image(
					text=chunk,
					width=size[0],
					height=size[1],
					font_name=font_name,
					highlight_words=highlight_count,
				)
			image, position = caption_cache[cache_key]
			caption_clip = (
				ImageClip(image)
				.with_start(word_start)
				.with_duration(max(0.05, word_end - word_start))
				.with_position(position)
			)
			layers.append(caption_clip)

	if title:
		title_image, title_position = create_title_image(
			title=title,
			width=size[0],
			height=size[1],
			font_name=font_name,
		)
		title_clip = (
			ImageClip(title_image)
			.with_start(0)
			.with_duration(min(2.4, duration * 0.35))
			.with_position(title_position)
		)
		layers.append(title_clip)

	final_clip = CompositeVideoClip(layers, size=size).with_duration(duration)

	audio_clip = None
	narrator_acl = None
	clip_acl = None
	narrator_raw = None
	clip_raw = None
	if use_clip_audio_plus_narrator and has_audio and bg_clip_path is not None:
		narrator_raw = AudioFileClip(str(audio_path))
		narrator_dur = float(narrator_raw.duration)
		narrator_end = min(duration, narrator_dur)
		narrator_acl = narrator_raw.subclipped(0, narrator_end)
		clip_raw = AudioFileClip(str(bg_clip_path))
		clip_dur = float(clip_raw.duration)
		clip_end = min(duration, clip_dur)  # never exceed this clip's length
		clip_sub = clip_raw.subclipped(0, clip_end)
		clip_acl = _volume_scale(clip_sub, 0.35)
		audio_clip = CompositeAudioClip([narrator_acl, clip_acl])
		final_clip = final_clip.with_audio(audio_clip)
	elif has_audio:
		audio_clip = AudioFileClip(str(audio_path))
		final_clip = final_clip.with_audio(audio_clip)
	elif use_clip_audio and bg_clip_path is not None:
		clip_raw = AudioFileClip(str(bg_clip_path))
		clip_dur = float(clip_raw.duration)
		clip_end = min(duration, clip_dur)
		audio_clip = clip_raw.subclipped(0, clip_end)
		final_clip = final_clip.with_audio(audio_clip)

	try:
		final_clip.write_videofile(
			str(output_path),
			fps=fps,
			codec='libx264',
			audio_codec='aac',
			preset=render_preset,
			threads=4,
		)
	finally:
		final_clip.close()
		if audio_clip is not None:
			audio_clip.close()
		if narrator_acl is not None:
			narrator_acl.close()
		if clip_acl is not None:
			clip_acl.close()
		if narrator_raw is not None:
			narrator_raw.close()
		if clip_raw is not None:
			clip_raw.close()

	# Save narration audio for customer download (receipt) when we generated voiceover
	if has_audio and audio_path.exists():
		reel_audio_path = output_path.parent / 'reel-audio.wav'
		shutil.copy2(audio_path, reel_audio_path)

	return srt_path, txt_path


def create_arg_parser () -> argparse.ArgumentParser:
	parser = argparse.ArgumentParser(
		description='Generate a 9:16 reel from a script file.',
	)
	parser.add_argument(
		'--script',
		required=True,
		type=str,
		help='Path to .txt script file.',
	)
	parser.add_argument(
		'--title',
		type=str,
		default='',
		help='Optional title shown at the start.',
	)
	parser.add_argument(
		'--output',
		type=str,
		default='',
		help='Optional output .mp4 path.',
	)
	parser.add_argument(
		'--voice-engine',
		type=str,
		default='pyttsx3',
		choices=['edge', 'pyttsx3', 'piper', 'none'],
		help='TTS engine: edge for neural voice, pyttsx3 for local voice, piper for offline neural voice, none for silent.',
	)
	parser.add_argument(
		'--voice-name',
		type=str,
		default='en-US-AriaNeural',
		help='Voice name for edge TTS.',
	)
	parser.add_argument(
		'--edge-rate',
		type=int,
		default=0,
		help='Speech speed percent for edge voice, e.g. -10 or 15.',
	)
	parser.add_argument(
		'--voice-rate',
		type=int,
		default=180,
		help='Voice speed for offline TTS.',
	)
	parser.add_argument(
		'--bg-dir',
		type=str,
		default='',
		help='Optional folder containing gameplay clips for the background.',
	)
	parser.add_argument(
		'--bg-clip',
		type=str,
		default='',
		help='Optional explicit clip path for background video.',
	)
	parser.add_argument(
		'--size',
		type=str,
		default='1080x1920',
		help='Output size, e.g. 1080x1920 or 720x1280.',
	)
	parser.add_argument(
		'--fps',
		type=int,
		default=30,
		help='Output video frame rate.',
	)
	parser.add_argument(
		'--render-preset',
		type=str,
		default='veryfast',
		choices=['ultrafast', 'superfast', 'veryfast', 'faster', 'fast', 'medium'],
		help='FFmpeg encoding preset. Faster presets render quicker with larger files.',
	)
	parser.add_argument(
		'--max-words-per-chunk',
		type=int,
		default=6,
		help='Caption chunk size. Higher values reduce caption count and speed up long renders.',
	)
	parser.add_argument(
		'--transcript-json',
		type=str,
		default='',
		help='Optional JSON transcript with segments for timed captions.',
	)
	parser.add_argument(
		'--use-clip-audio',
		dest='use_clip_audio',
		action='store_true',
		default=False,
		help='Use the background clip audio instead of generating narration.',
	)
	parser.add_argument(
		'--clip-audio-plus-narrator',
		dest='use_clip_audio_plus_narrator',
		action='store_true',
		default=False,
		help='Use clip audio and add TTS narrator on top (mixed). Implies generating voiceover.',
	)
	parser.add_argument(
		'--font-name',
		type=str,
		default='default',
		help='Font name or filename in assets/fonts, or "default" for system fallback.',
	)
	parser.add_argument(
		'--narrate-title',
		dest='narrate_title',
		action='store_true',
		help='Include title in voiceover and transcription when a title is provided.',
	)
	parser.add_argument(
		'--no-narrate-title',
		dest='narrate_title',
		action='store_false',
		help='Do not include title in voiceover/transcription.',
	)
	parser.set_defaults(narrate_title=True)
	parser.add_argument(
		'--caption-bg',
		dest='caption_bg',
		action='store_true',
		default=False,
		help=(
			'Generate a fully procedural animated background from the caption/script text. '
			'No video clip required. Ignores --bg-dir and --bg-clip.'
		),
	)
	return parser


def main () -> None:
	ensure_ffmpeg()
	args = create_arg_parser().parse_args()

	script_path = Path(args.script).resolve()
	if not script_path.exists():
		raise FileNotFoundError(f'Script file not found: {script_path}')

	output_dir = Path.cwd() / 'output'
	output_dir.mkdir(parents=True, exist_ok=True)

	if args.output:
		output_path = Path(args.output).resolve()
		output_path.parent.mkdir(parents=True, exist_ok=True)
	else:
		stamp = dt.datetime.now().strftime('%Y%m%d-%H%M%S')
		reel_dir = output_dir / f'reel-{stamp}'
		reel_dir.mkdir(parents=True, exist_ok=True)
		output_path = reel_dir / 'reel.mp4'

	text = read_script(script_path)
	title = args.title.strip() or None
	size = parse_size(args.size)
	bg_dir = Path(args.bg_dir).resolve() if args.bg_dir else None
	bg_clip_path = Path(args.bg_clip).resolve() if args.bg_clip else None
	if bg_dir is not None and not bg_dir.exists():
		raise FileNotFoundError(f'Background directory not found: {bg_dir}')
	if bg_dir is not None and not bg_dir.is_dir():
		raise NotADirectoryError(f'Background path is not a directory: {bg_dir}')
	if bg_clip_path is not None and not bg_clip_path.exists():
		raise FileNotFoundError(f'Background clip not found: {bg_clip_path}')
	if bg_clip_path is not None and not bg_clip_path.is_file():
		raise FileNotFoundError(f'Background clip is not a file: {bg_clip_path}')

	transcript_data = None
	if args.transcript_json:
		transcript_path = Path(args.transcript_json).resolve()
		if not transcript_path.exists():
			raise FileNotFoundError(f'Transcript file not found: {transcript_path}')
		transcript_data = json.loads(transcript_path.read_text(encoding='utf-8'))

	srt_path, txt_path = build_reel(
		script_text=text,
		output_path=output_path,
		title=title,
		size=size,
		fps=args.fps,
		render_preset=args.render_preset,
		voice_engine=args.voice_engine,
		voice_name=args.voice_name,
		edge_rate=args.edge_rate,
		voice_rate=args.voice_rate,
		bg_dir=bg_dir,
		bg_clip_path=bg_clip_path,
		max_words_per_chunk=max(3, args.max_words_per_chunk),
		narrate_title=args.narrate_title,
		font_name=args.font_name,
		caption_bg=args.caption_bg,
		transcript_data=transcript_data,
		use_clip_audio=args.use_clip_audio,
		use_clip_audio_plus_narrator=args.use_clip_audio_plus_narrator,
	)
	print(f'\nOutput folder : {output_path.parent}')
	print(f'  reel        : {output_path.name}')
	print(f'  subtitles   : {srt_path.name}')
	print(f'  transcript  : {txt_path.name}')


if __name__ == '__main__':
	main()
