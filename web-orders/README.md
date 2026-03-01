# Order requests — customer-facing site

Separate web app for customers to place reel orders. They choose fonts, clips, and voice from the API, enter their script and contact details, then complete payment (bank selection + reference code).

## Run

- Ensure the main API is running (e.g. `http://localhost:3000`).
- Set `VITE_API_BASE_URL` if the API is on another host/port (optional; default points to the usual API).
- From this folder:

  ```bash
  npm install
  npm run dev
  ```

- App runs at **http://localhost:5174** (different port from the back-office web app).

## Flow

1. **Landing** (`/`) — intro and “Place an order”.
2. **Order** (`/order`) — Step 1: pick font, clip, voice; enter script, title, name, email, delivery address → “Continue to payment”. Step 2: select bank, enter payment reference → “Confirm payment”. Transaction complete.

Orders are stored via the API and appear in the back-office **Orders** dashboard in the main web app.
