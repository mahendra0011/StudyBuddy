# NotesGPT

NotesGPT is a clean AI notes generator for students. The home page works like a simple AI prompt interface: enter a topic, choose category/language/depth, and generate structured study notes with Gemini. A second page provides curated lecture playlists with thumbnails and search filters.

## Features

- ChatGPT-style AI prompt box on the home page
- Category shortcuts for DBMS, OS, DSA, AI, Java, and Web topics
- Gemini-powered note generation
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
python -m http.server 4173 --bind 127.0.0.1
```

Then open:

```text
http://127.0.0.1:4173/index.html
```

## Gemini Model

The app currently uses:

```text
gemini-flash-lite-latest
```

The Gemini API key and model endpoint are configured in `script.js`.

## Important Security Note

This is a static frontend project, so any API key placed in `script.js` is visible in the browser. For a real public deployment, move Gemini API calls to a backend/serverless function and keep the API key on the server.

## Project Files

```text
notesGPT/
  index.html
  lectures.html
  search-notes.html
  script.js
  styles.css
  README.md
```

## Tech Used

- HTML
- CSS
- JavaScript
- Gemini API
- Font Awesome icons
- html2pdf.js
