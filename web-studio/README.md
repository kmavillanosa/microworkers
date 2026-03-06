# web-studio

`web-studio` is a Vite + React + TypeScript frontend for timeline-based video editing using the Twick SDK, styled with Flowbite React, and wired to the existing Nest API in `../api`.

## Stack

- Vite + React 19 + TypeScript
- Twick SDK packages:
  - `@twick/media-utils`
  - `@twick/canvas`
  - `@twick/live-player`
  - `@twick/timeline`
  - `@twick/visualizer`
  - `@twick/video-editor`
  - `@twick/studio`
- Flowbite React + Tailwind CSS v4 (`@tailwindcss/vite`)

## API Integration

The app consumes endpoints from `../api/src/**/*.controller.ts`, including:

- `/api/clips`, `/api/order-clips`
- `/api/reels`, `/api/reels/jobs`, `/api/reels/voices`, `/api/reels/fonts`
- `/api/orders`, `/api/orders/pricing`
- `/api/accounts`, `/api/captions/niches`, `/api/pipeline`
- `/api/settings/payment-methods`, `/api/settings/voices`
- `/api/youtube/status`, `/api/facebook/status`

## Environment

Copy `.env.example` to `.env.local` and set your backend URL:

```bash
VITE_API_BASE_URL=https://reelagad.com/
```

## Development

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```
