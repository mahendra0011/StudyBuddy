# NotesGPT

NotesGPT is a clean AI notes generator for students. The home page works like a simple AI prompt interface: enter a topic, choose category/language/depth, and generate structured study notes with Gemini. A second page provides curated lecture playlists with thumbnails and search filters.

The Gemini API is called through a small Node/Express backend so the API key can stay in server environment variables instead of frontend JavaScript.

## Features

- ChatGPT-style AI prompt box on the home page
- Category shortcuts for DBMS, OS, DSA, AI, Java, and Web topics
- Gemini-powered note generation through `/api/generate`
- Animated "NotesGPT is writing" loading state
- Markdown-style AI output rendered as clean notes
- PDF download for generated notes
- Lecture page with thumbnails, filters, and playlist links
- Responsive light AI/SaaS-style UI

## Pages

- `index.html` - main AI notes generator
- `lectures.html` - lecture library with thumbnails
- `search-notes.html` - redirect page kept for old links

## Run Locally

From the project folder:

```bash
npm install
```

Create a local `.env` file or set environment variables before starting:

```text
GEMINI_API_KEY=your_new_gemini_api_key_here
GEMINI_MODEL=gemini-flash-lite-latest
```

Start the app:

```bash
npm start
```

Then open:

```text
http://localhost:4173
```

## Gemini Model

The app currently uses:

```text
gemini-flash-lite-latest
```

The Gemini model is configured on the server through:

```text
GEMINI_MODEL=gemini-flash-lite-latest
```

The API key must be configured as:

```text
GEMINI_API_KEY=your_new_gemini_api_key_here
```

## Deploy on Render

Use a **Web Service**, not a Static Site.

```text
Build Command: npm install
Start Command: npm start
```

Add these Render environment variables:

```text
GEMINI_API_KEY=your_new_gemini_api_key_here
GEMINI_MODEL=gemini-flash-lite-latest
```

## Important Security Note

Do not put your Gemini API key in `script.js`. Keep it in Render environment variables. If Google reports a key as leaked, revoke it and create a new one.

## Project Files

```text
notesGPT/
  index.html
  lectures.html
  search-notes.html
  server.js
  package.json
  .env.example
  script.js
  styles.css
  README.md
```

## Tech Used

- HTML
- CSS
- JavaScript
- Node.js / Express
- Gemini API
- Font Awesome icons
- html2pdf.js
