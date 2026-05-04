# Vocab Study MVP

A simple, ready-to-use web app for studying vocabulary in the browser.

## Features

- Add, edit, and delete vocabulary entries
- Automatic word definition lookup via online dictionary API
- If multiple definitions exist, pick the most appropriate one before saving
- Manually edit any selected definition and reset back to default with one click
- Manual fallback input allows saving a typed definition when lookup is unavailable
- Voice assistant flow:
  - Speak a word
  - Speak a phrase using that word
  - Auto-add with an AI-assisted definition choice based on phrase context
- Explicit browser capability handling for speech input:
  - browser not supported
  - speech recognition API unavailable (common on Firefox)
  - microphone permission denied
  - listening in progress / no speech detected
- Text-to-speech pronunciation for vocabulary words (list + flashcards)
- Manual word/definition selection flow remains available as fallback
- Local persistence using `localStorage` (no backend required)
- Three study modes:
  - Flashcards (flip, next/previous, shuffle)
  - Multiple-choice quiz
  - Matching game
- Clean, responsive UI
- No authentication

## Run

Open `index.html` in your browser.

> Notes:
> - Definition lookup uses an online API, so an internet connection is required when adding/editing words.
> - Voice input and pronunciation require browser support for Web Speech APIs.
> - Voice capture requests real microphone permission (`getUserMedia`) before recording.
> - Firefox may allow microphone access but still not support in-browser speech recognition; typing remains the fallback.

For local static serving (optional):

```bash
python3 -m http.server 8080
```

Then visit `http://localhost:8080`.
