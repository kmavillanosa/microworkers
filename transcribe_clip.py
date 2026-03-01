import json
import os
import re
import sys
from pathlib import Path
from typing import Optional

import imageio_ffmpeg
from faster_whisper import WhisperModel


def _normalize_phrase (words: list[str]) -> str:
	"""Normalize for comparison: lower, collapse hyphens to space."""
	return ' '.join(w.lower().replace('-', ' ') for w in words).strip()


def _collapse_repeated_phrases (text: str, max_phrase_words: int = 3) -> str:
	"""
	Detect consecutive repeated 2- or 3-word phrases (common Whisper stutter/duplication)
	and collapse to a single occurrence. No hardcoded phrases — purely algorithmic.
	E.g. "to be to be videos" -> "to be videos", "business to business" -> "business to business" (one occurrence).
	"""
	if not text or not text.strip():
		return text
	words = text.split()
	if len(words) < 4:
		return text
	out = words
	changed = True
	while changed:
		changed = False
		for n in range(max_phrase_words, 0, -1):
			i = 0
			while i <= len(out) - 2 * n:
				chunk = out[i:i + n]
				next_chunk = out[i + n:i + 2 * n]
				if _normalize_phrase(chunk) == _normalize_phrase(next_chunk):
					out = out[:i + n] + out[i + 2 * n:]
					changed = True
					break
				i += 1
			if changed:
				break
	return ' '.join(out).strip()


def _load_optional_fixes () -> dict[str, str]:
	"""
	Load optional phrase -> replacement map from file (no hardcoded fixes in code).
	Lookup order: TRANSCRIPT_FIXES_PATH env, then transcript_fixes.json next to this script, then cwd.
	Copy transcript_fixes.example.json to transcript_fixes.json and edit as needed.
	"""
	paths = []
	if os.environ.get('TRANSCRIPT_FIXES_PATH'):
		paths.append(Path(os.environ['TRANSCRIPT_FIXES_PATH']))
	paths.append(Path(__file__).resolve().parent / 'transcript_fixes.json')
	paths.append(Path.cwd() / 'transcript_fixes.json')
	for p in paths:
		if p.exists() and p.is_file():
			try:
				data = json.loads(p.read_text(encoding='utf-8'))
				if isinstance(data, dict):
					return {k.strip().lower(): v for k, v in data.items() if k and isinstance(v, str)}
			except Exception:
				pass
	return {}


def _apply_optional_fixes (text: str, fixes: dict[str, str]) -> str:
	"""Apply user-defined phrase replacements from optional file. Case-insensitive phrase match."""
	if not text or not fixes:
		return text
	out = text
	for phrase, replacement in fixes.items():
		if not phrase or not phrase.strip():
			continue
		# Match phrase as whole words, flexible whitespace
		parts = phrase.strip().split()
		pattern = r'\b' + r'\s+'.join(re.escape(p) for p in parts) + r'\b'
		out = re.sub(pattern, replacement, out, flags=re.IGNORECASE)
	return out


# Cached so we only read the file once per process
_optional_fixes_cache: Optional[dict[str, str]] = None


def _get_optional_fixes () -> dict[str, str]:
	global _optional_fixes_cache
	if _optional_fixes_cache is None:
		_optional_fixes_cache = _load_optional_fixes()
	return _optional_fixes_cache


def _clean_transcript (text: str) -> str:
	"""Apply algorithmic cleanup (repetition collapse) then optional user-defined fixes from file."""
	if not text or not text.strip():
		return text
	out = _collapse_repeated_phrases(text)
	out = _apply_optional_fixes(out, _get_optional_fixes())
	return out


def ensure_ffmpeg () -> None:
	ffmpeg_exe = imageio_ffmpeg.get_ffmpeg_exe()
	os.environ['FFMPEG_BINARY'] = ffmpeg_exe
	os.environ['PATH'] = f'{Path(ffmpeg_exe).parent}{os.pathsep}{os.environ.get("PATH", "")}'


def _run_transcribe (
	model,
	input_path: Path,
	vad_filter: bool,
	vad_params: Optional[dict],
	no_speech_threshold: float,
) -> tuple[list, object]:
	segments, info = model.transcribe(
		str(input_path),
		vad_filter=vad_filter,
		vad_parameters=vad_params,
		no_speech_threshold=no_speech_threshold,
		repetition_penalty=1.15,
		condition_on_previous_text=True,
	)
	segment_list = [
		{
			'start': float(seg.start),
			'end': float(seg.end),
			'text': _clean_transcript(seg.text.strip()),
		}
		for seg in segments
		if seg.text and seg.text.strip()
	]
	return segment_list, info


def transcribe (input_path: Path, model_name: str) -> dict:
	ensure_ffmpeg()
	model = WhisperModel(model_name, device='cpu', compute_type='int8')
	vad_enabled = os.environ.get('TRANSCRIBE_VAD', '1').strip() in ('1', 'true', 'yes')
	no_speech_threshold = 0.65
	vad_params = {
		'threshold': 0.4,
		'min_speech_duration_ms': 200,
		'min_silence_duration_ms': 500,
		'speech_pad_ms': 150,
	} if vad_enabled else None

	segment_list, info = _run_transcribe(
		model, input_path, vad_filter=vad_enabled, vad_params=vad_params,
		no_speech_threshold=no_speech_threshold,
	)
	text = ' '.join(seg['text'] for seg in segment_list).strip()
	text = _clean_transcript(text)

	# If VAD found no speech, retry without VAD so we still get a transcript (quiet voice, accent, etc.)
	if vad_enabled and not text:
		segment_list, info = _run_transcribe(
			model, input_path, vad_filter=False, vad_params=None,
			no_speech_threshold=no_speech_threshold,
		)
		text = ' '.join(seg['text'] for seg in segment_list).strip()
		text = _clean_transcript(text)

	return {
		'text': text,
		'segments': segment_list,
		'language': getattr(info, 'language', None),
		'language_probability': getattr(info, 'language_probability', None),
	}


def main () -> int:
	if len(sys.argv) < 2:
		print(json.dumps({'error': 'Missing input path'}))
		return 2

	input_path = Path(sys.argv[1])
	if not input_path.exists():
		print(json.dumps({'error': f'File not found: {input_path}'}))
		return 3

	model_name = os.environ.get('WHISPER_MODEL', 'base').strip() or 'base'
	try:
		result = transcribe(input_path, model_name=model_name)
		print(json.dumps(result))
		return 0
	except Exception as exc:
		print(json.dumps({'error': str(exc)}))
		return 1


if __name__ == '__main__':
	raise SystemExit(main())
