# Vocab Study MVP

A simple, ready-to-use web app for studying vocabulary in the browser.

## Features

- Add, edit, and delete vocabulary entries
- Automatic word definition lookup via online dictionary API
- If multiple definitions exist, pick the most appropriate one before saving
- Local persistence using `localStorage` (no backend required)
- Three study modes:
  - Flashcards (flip, next/previous, shuffle)
  - Multiple-choice quiz
  - Matching game
- Clean, responsive UI
- No authentication

## Run

Open `index.html` in your browser.

> Note: definition lookup uses an online API, so an internet connection is required when adding/editing words.

For local static serving (optional):

```bash
python3 -m http.server 8080
```

Then visit `http://localhost:8080`.
