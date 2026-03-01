# Free Script-to-Reel Generator

Generate a vertical reel video from only a text script.

## What this does

- Takes your script from a `.txt` file
- Creates voiceover with offline local TTS (`pyttsx3`) by default
- Splits your script into timed caption chunks
- Renders a 1080x1920 MP4 reel with subtitles
- Uses your gameplay clips folder as background (or animated fallback)
- Exports transcription files (`.srt` and `.txt`) next to the video

## Requirements

- Python 3.10+
- Internet only for first dependency install

No system `ffmpeg` install is required.  
The script uses `imageio-ffmpeg` to download and use a local binary.

## Setup

```bash
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
```

## Usage

1. Put your script in `scripts\my-script.txt`
2. Run:

```bash
python reels_generator.py --script scripts\my-script.txt --bg-dir assets\game-clips
```

Output files are saved in one folder per run:
- `output\reel-<timestamp>\reel.mp4`
- `output\reel-<timestamp>\reel.srt`
- `output\reel-<timestamp>\reel.txt`

## Useful options

```bash
python reels_generator.py --script scripts\my-script.txt --title 'Daily Motivation' --bg-dir assets\game-clips
python reels_generator.py --script scripts\my-script.txt --voice-engine pyttsx3 --voice-rate 175 --bg-dir assets\game-clips
python reels_generator.py --script scripts\my-script.txt --voice-engine none --bg-dir assets\game-clips
python reels_generator.py --script scripts\my-script.txt --fps 30 --bg-dir assets\game-clips
python reels_generator.py --script scripts\my-script.txt --size 720x1280 --fps 24 --render-preset ultrafast --bg-dir assets\game-clips
```

## Faster rendering

Use this for faster generation (lower resolution + faster encoding):

```bash
python reels_generator.py --script scripts\my-script.txt --bg-dir assets\game-clips --size 720x1280 --fps 24 --render-preset ultrafast
```

## Notes

- Keep scripts around 30-120 words for short reels
- Captions are auto-timed from audio duration
- Put your game clips in `assets\game-clips` (`.mp4`, `.mov`, `.mkv`, `.webm`, `.avi`)
- Clips are auto-cropped to vertical and looped if needed
- `pyttsx3` is fully local/offline on Windows (on-prem friendly)

## Web App + API

This project now includes:
- `api` (NestJS + TypeScript)
- `web` (Vite + React + TypeScript)

### Start API

```bash
cd api
npm install
npm run start:dev
```

API runs on `http://localhost:3000` and exposes:
- `POST /api/clips/upload` (multipart `files`)
- `GET /api/clips`
- `POST /api/reels` (JSON: `script`, optional `title`, `clipName`, `voiceEngine`, `voiceName`)
- `GET /api/reels/voices`
- `POST /api/reels/piper/install` (JSON: `voiceId`)
- `GET /api/reels/jobs/:jobId`
- `GET /api/reels`
- `GET /api/youtube/status`
- `GET /api/youtube/auth-url`
- `GET /api/youtube/callback`
- `POST /api/youtube/upload`

Static media is served from:
- `/media/clips/...`
- `/media/output/...`
- `/media/fonts/...`

### YouTube Shorts upload setup

The app can upload generated reels to your own YouTube account via OAuth.

Set these environment variables before starting the API:

```bash
YOUTUBE_CLIENT_ID=your_google_oauth_client_id
YOUTUBE_CLIENT_SECRET=your_google_oauth_client_secret
YOUTUBE_REDIRECT_URI=http://localhost:3000/api/youtube/callback
YOUTUBE_WEB_REDIRECT_URL=http://localhost:5173
```

Google Console notes:
- Enable **YouTube Data API v3**
- Create OAuth client credentials
- Add `http://localhost:3000/api/youtube/callback` as an authorized redirect URI

### Start Web

```bash
cd web
npm install
npm run dev
```

Web runs on `http://localhost:5173` and lets you:
- Upload gameplay clips
- Select a specific gameplay clip before generation
- Download and install free Piper narrator voices
- Select voice engine (`piper` neural offline or `pyttsx3` system voice)
- Submit scripts to generate reels
- Monitor job status
- Watch/download generated video + transcript files
