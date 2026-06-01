# StudyBuddy

StudyBuddy is a full-stack AI study app built with React, Tailwind CSS, Node.js, Express, and MongoDB.

Live app:

```text
https://studybuddy-86s2.onrender.com
```

## Features

- React single-page app with navbar-based views
- Tailwind CSS light AI/SaaS interface
- Gemini-powered streaming notes generation
- PDF text extraction and summarization
- YouTube lecture metadata and summarization
- Pomodoro timer, study task planner, and focus music
- MongoDB-backed signup/login with JWT and Google sign-in
- Account library for generated notes, PDF summaries, YouTube summaries, goals, and tasks
- User-created lecture playlists stored in MongoDB
- Express API with clean route/service/model structure

## Folder Structure

```text
StudyBuddy/
  client/
    index.html
    vite.config.js
    tailwind.config.cjs
    postcss.config.cjs
    src/
      App.jsx
      main.jsx
      index.css
      data/
      services/
      utils/
  server/
    app.js
    server.js
    config/
    middleware/
    models/
    routes/
    services/
  package.json
  .env.example
```

## Environment Variables

Create `.env` in the project root:

```text
PORT=4173
CLIENT_ORIGIN=http://localhost:5173

MONGODB_URI=your_mongodb_connection_string
JWT_SECRET=replace_with_a_long_random_secret
GOOGLE_CLIENT_ID=your_google_oauth_web_client_id
VITE_GOOGLE_CLIENT_ID=your_google_oauth_web_client_id

GEMINI_API_KEY=your_new_gemini_api_key_here
GEMINI_MODEL=gemini-2.5-flash-lite
YOUTUBE_API_KEY=your_youtube_data_api_key_here
```

Never put API keys in React code. Keep them in server environment variables.
For Google sign-in, use the same Google OAuth Web Client ID for `GOOGLE_CLIENT_ID` and `VITE_GOOGLE_CLIENT_ID`; the server validates the Google ID token before issuing the app JWT.
Do not commit `.env`, API keys, MongoDB passwords, OAuth client secrets, or JWT secrets to GitHub.

## Google Login Setup

Create a Google OAuth **Web application** client in Google Cloud / Google Auth Platform.

Add these Authorized JavaScript origins:

```text
http://localhost:5173
https://studybuddy-86s2.onrender.com
```

Authorized redirect URIs can stay empty for this app. StudyBuddy uses Google Identity Services to get a browser ID token, then sends it to `POST /api/auth/google`; it does not use a Google redirect callback route.

Add the OAuth client ID to both backend and frontend env vars:

```text
GOOGLE_CLIENT_ID=your_google_oauth_web_client_id
VITE_GOOGLE_CLIENT_ID=your_google_oauth_web_client_id
```

The OAuth client secret is not needed for the current Google login flow.

## Run Locally

Install dependencies:

```bash
npm install
```

Run React and Express together:

```bash
npm run dev
```

Open:

```text
http://localhost:5173
```

## Production Build

Build React:

```bash
npm run build
```

Start Express, which serves `client/dist`:

```bash
npm start
```

Open:

```text
http://localhost:4173
```

## Deploy on Render

Use a **Web Service**.

```text
Build Command: npm install && npm run build
Start Command: npm start
```

Add these Render environment variables:

```text
CLIENT_ORIGIN=https://studybuddy-86s2.onrender.com
MONGODB_URI=your_mongodb_connection_string
JWT_SECRET=replace_with_a_long_random_secret
GEMINI_API_KEY=your_new_gemini_api_key_here
GEMINI_MODEL=gemini-2.5-flash-lite
YOUTUBE_API_KEY=your_youtube_data_api_key_here
GOOGLE_CLIENT_ID=your_google_oauth_web_client_id
VITE_GOOGLE_CLIENT_ID=your_google_oauth_web_client_id
```

After changing `VITE_GOOGLE_CLIENT_ID`, redeploy Render so Vite rebuilds the frontend bundle with the new value.

## API Routes

- `POST /api/auth/signup`
- `POST /api/auth/login`
- `POST /api/auth/google`
- `GET /api/auth/me`
- `GET /api/playlists`
- `POST /api/playlists`
- `DELETE /api/playlists/:id`
- `GET /api/study-items`
- `POST /api/study-items`
- `PATCH /api/study-items/:id`
- `DELETE /api/study-items/:id`
- `POST /api/generate`
- `POST /api/generate/stream`
- `POST /api/pdf-text`
- `POST /api/youtube`

## Tech Stack

- React
- Tailwind CSS
- JavaScript
- Node.js
- Express
- MongoDB / Mongoose
- Gemini API
- YouTube Data API
