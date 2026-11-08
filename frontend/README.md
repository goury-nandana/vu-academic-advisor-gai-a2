# VU Academic Advisor — Next.js frontend

The current web application is a Next.js 15 / React 19 app. Vercel serves the frontend and its backend API routes from the same project.

## Run locally

```bash
npm ci
npm run dev
```

The app runs at `http://localhost:3000`.

## Backend and environment

The browser uses the same-origin API routes:

- `POST /api/chat` — authenticated academic chat, source retrieval and supported file uploads.
- `POST /api/transcribe` — authenticated voice transcription.
- `POST /api/auth/login`, `POST /api/auth/signup`, `GET /api/auth/session`, and `POST /api/auth/logout` — synthetic demo-account sessions.
- `GET /api/marksheet` — PDF for the currently authenticated synthetic profile.

Set `GROQ_API_KEY` as a server-only environment variable. In production, also set `SESSION_SECRET` to a dedicated random secret of at least 32 characters. Do not use a `NEXT_PUBLIC_*` variable for either secret.

Chat and transcription use the signed HttpOnly session cookie. Student identity is derived by the server; client-supplied profile details are not an authority.

## Deploy on Vercel

Connect this GitHub repository and set **Root Directory** to `frontend`. Use the Next.js framework preset and `npm ci` for dependency installation. The root repository README documents the assignment architecture, data exports, test commands, limitations and privacy boundary.

The ten demo profiles and their shared classroom password are fictional test data only. Do not enter actual VU student records or credentials.
