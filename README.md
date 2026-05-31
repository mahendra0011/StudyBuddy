# StudyBuddy

StudyBuddy is a full-stack AI study app built with React, Tailwind CSS, Node.js, Express, and MongoDB.

## Features

- React single-page app with navbar-based views
- Tailwind CSS light AI/SaaS interface
- Gemini-powered streaming notes generation
- PDF text extraction and summarization
- YouTube lecture metadata and summarization
- Pomodoro timer, study task planner, and focus music
- MongoDB-backed signup/login with JWT
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

GEMINI_API_KEY=your_new_gemini_api_key_here
GEMINI_MODEL=gemini-2.5-flash-lite
YOUTUBE_API_KEY=your_youtube_data_api_key_here
```

Never put API keys in React code. Keep them in server environment variables.

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
MONGODB_URI=your_mongodb_connection_string
JWT_SECRET=replace_with_a_long_random_secret
GEMINI_API_KEY=your_new_gemini_api_key_here
GEMINI_MODEL=gemini-2.5-flash-lite
YOUTUBE_API_KEY=your_youtube_data_api_key_here
```

## API Routes

- `POST /api/auth/signup`
- `POST /api/auth/login`
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
