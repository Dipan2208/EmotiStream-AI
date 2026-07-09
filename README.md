# 🎬 EmotiStream AI

> Streaming that understands you — powered by GPT-4 Vision + TMDB

## Project Structure

```
emotistream/
├── server.js          ← Node.js Express backend
├── package.json       ← dependencies
├── .env               ← API keys (never share this)
├── .gitignore         ← keeps .env out of git
└── public/
    └── index.html     ← full frontend
```

## Quick Start (3 steps)

### Step 1 — Install Node.js
Download from https://nodejs.org (choose LTS version)

### Step 2 — Install dependencies
Open a terminal in the `emotistream` folder and run:
```bash
npm install
```

### Step 3 — Start the server
```bash
npm start
```

Then open your browser at:
```
http://localhost:3000
```

That's it! 🎉

---

## Features

| Feature | Tech |
|---|---|
| Real movie data & posters | TMDB API |
| Hero carousel (Now Playing) | TMDB /now_playing |
| Trending / Top Rated rows | TMDB /trending + /top_rated |
| Movie detail modal with cast | TMDB /movie/:id + /credits |
| Live search | TMDB /search/movie |
| Mood-based suggestions | TMDB /discover by genre |
| AI emotion detection | GPT-4o Vision |
| Webcam capture | Browser MediaDevices API |

---

## How the AI Works

```
1. Click "Scan My Emotion"
2. Allow camera access in browser
3. Click "Capture & Detect"
4. Screenshot → sent to Node.js backend
5. Backend sends image to GPT-4o Vision
6. GPT-4o returns: emotion, confidence, description
7. Backend maps emotion → TMDB genre IDs
8. Fetches matching movies from TMDB
9. Frontend shows results instantly
```

### Emotion → Genre Mapping

| Emotion | Genres |
|---|---|
| 😊 Happy | Comedy, Family, Animation |
| 😢 Sad | Drama, Romance |
| 😠 Angry | Action, Thriller, Crime |
| 🤩 Excited | Action, Adventure, Sci-Fi |
| 😌 Relaxed | Documentary, History, Music |
| 😐 Bored | Mystery, Sci-Fi, Fantasy |
| 😨 Fearful | Horror, Thriller |
| 😮 Surprised | Mystery, Sci-Fi, Action |

---

## API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| GET | /api/nowplaying | Hero carousel movies |
| GET | /api/trending | Trending this week |
| GET | /api/toprated | All-time top rated |
| GET | /api/movies/mood?emotion=happy | Mood-based movies |
| GET | /api/search?q=inception | Search movies |
| GET | /api/movie/:id | Full movie detail + cast |
| POST | /api/detect-emotion | GPT-4 Vision face scan |

---

## Development Mode (auto-restart on save)
```bash
npm run dev
```

## Deploying to the Web (later)
1. Push to GitHub
2. Deploy to Railway.app or Render.com (free tier)
3. Add environment variables in their dashboard
4. Connect your custom domain

---

## Environment Variables (.env)
```
OPENAI_API_KEY=sk-...
TMDB_API_KEY=...
PORT=3000
```

⚠️ Never commit .env to GitHub. It's already in .gitignore.
