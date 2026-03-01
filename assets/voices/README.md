# Voices

## Piper TTS (`piper/`)

Voice models (`.onnx` + `.onnx.json`) are not in git. Add them locally:

1. Download from [Hugging Face / rhasspy/piper-voices](https://huggingface.co/rhasspy/piper-voices).
2. Extract each voice into `piper/<voice-name>/` (e.g. `piper/en_US-ryan-high/en_US-ryan-high.onnx` and `.onnx.json`).

The API and reels generator use voices from `piper/`.
