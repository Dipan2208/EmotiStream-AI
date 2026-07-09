require('dotenv').config();
const express    = require('express');
const cors       = require('cors');
const axios      = require('axios');
const OpenAI     = require('openai');
const multer     = require('multer');
const path       = require('path');
const bcrypt     = require('bcryptjs');
const jwt        = require('jsonwebtoken');

const app    = express();
const upload = multer({ storage: multer.memoryStorage() });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const TMDB_KEY   = process.env.TMDB_API_KEY;
const TMDB_BASE  = 'https://api.themoviedb.org/3';
const PORT       = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'emotistream_secret_key';

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public'), { index: false }));

/* ─────────────────────────────────────────
   IN-MEMORY USER STORE
   (In production replace with a real DB like MongoDB/PostgreSQL)
───────────────────────────────────────── */
const USERS = new Map(); // email → { id, name, email, passwordHash, avatar, profiles, createdAt }
let userIdCounter = 1;

// Pre-seed a demo account so users can try without registering
(async () => {
  const hash = await bcrypt.hash('demo1234', 10);
  USERS.set('demo@emotistream.com', {
    id: userIdCounter++,
    name: 'Demo User',
    email: 'demo@emotistream.com',
    passwordHash: hash,
    avatar: '😎',
    profiles: [
      { id: 1, name: 'Demo User',  avatar: '😎', pin: null },
      { id: 2, name: 'Kids',       avatar: '🧒', pin: null },
    ],
    createdAt: new Date().toISOString(),
  });
})();

/* ─────────────────────────────────────────
   AUTH MIDDLEWARE
───────────────────────────────────────── */
function authMiddleware(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Not authenticated. Please log in.' });
  }
  try {
    const token = header.slice(7);
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Session expired. Please log in again.' });
  }
}

/* ─────────────────────────────────────────
   AUTH ROUTES
───────────────────────────────────────── */

// POST /api/auth/register
app.post('/api/auth/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password)
      return res.status(400).json({ error: 'Name, email and password are required.' });
    if (password.length < 6)
      return res.status(400).json({ error: 'Password must be at least 6 characters.' });
    if (USERS.has(email.toLowerCase()))
      return res.status(409).json({ error: 'An account with this email already exists.' });

    const passwordHash = await bcrypt.hash(password, 10);
    const avatars = ['😊','🎬','🎭','🌟','🎵','🦁','🐯','🌸'];
    const user = {
      id: userIdCounter++,
      name: name.trim(),
      email: email.toLowerCase(),
      passwordHash,
      avatar: avatars[Math.floor(Math.random() * avatars.length)],
      profiles: [
        { id: 1, name: name.trim(), avatar: avatars[Math.floor(Math.random() * avatars.length)], pin: null }
      ],
      createdAt: new Date().toISOString(),
    };
    USERS.set(email.toLowerCase(), user);

    const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: safeUser(user) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/auth/login
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password)
      return res.status(400).json({ error: 'Email and password are required.' });

    const user = USERS.get(email.toLowerCase());
    if (!user) return res.status(401).json({ error: 'No account found with this email.' });

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) return res.status(401).json({ error: 'Incorrect password. Please try again.' });

    const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: safeUser(user) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/auth/me  (verify token & get current user)
app.get('/api/auth/me', authMiddleware, (req, res) => {
  const user = [...USERS.values()].find(u => u.id === req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found.' });
  res.json({ user: safeUser(user) });
});

// POST /api/auth/add-profile
app.post('/api/auth/add-profile', authMiddleware, (req, res) => {
  const { name, avatar } = req.body;
  if (!name) return res.status(400).json({ error: 'Profile name is required.' });
  const user = [...USERS.values()].find(u => u.id === req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found.' });
  if (user.profiles.length >= 5)
    return res.status(400).json({ error: 'Maximum 5 profiles per account.' });

  const newProfile = {
    id: Date.now(),
    name: name.trim(),
    avatar: avatar || '🎬',
    pin: null,
  };
  user.profiles.push(newProfile);
  res.json({ profiles: user.profiles });
});

// DELETE /api/auth/remove-profile/:profileId
app.delete('/api/auth/remove-profile/:profileId', authMiddleware, (req, res) => {
  const user = [...USERS.values()].find(u => u.id === req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found.' });
  if (user.profiles.length <= 1)
    return res.status(400).json({ error: 'Cannot delete the last profile.' });
  user.profiles = user.profiles.filter(p => String(p.id) !== String(req.params.profileId));
  res.json({ profiles: user.profiles });
});

// PUT /api/auth/change-password
app.put('/api/auth/change-password', authMiddleware, async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const user = [...USERS.values()].find(u => u.id === req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found.' });
  const valid = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!valid) return res.status(401).json({ error: 'Current password is incorrect.' });
  if (newPassword.length < 6) return res.status(400).json({ error: 'New password must be at least 6 characters.' });
  user.passwordHash = await bcrypt.hash(newPassword, 10);
  res.json({ message: 'Password changed successfully.' });
});

function safeUser(u) {
  return { id: u.id, name: u.name, email: u.email, avatar: u.avatar, profiles: u.profiles, createdAt: u.createdAt };
}

/* ─────────────────────────────────────────
   EMOTION → TMDB GENRE MAPPING
───────────────────────────────────────── */
const EMOTION_MAP = {
  happy:    { genres: [35, 10751, 16],       label: 'Happy',    emoji: '😊', suggestion: 'Feel-good comedies & family films' },
  sad:      { genres: [18, 10749],           label: 'Sad',      emoji: '😢', suggestion: 'Emotional dramas & heartfelt romances' },
  angry:    { genres: [28, 53, 80],          label: 'Angry',    emoji: '😠', suggestion: 'High-octane action & thrillers' },
  excited:  { genres: [28, 12, 878],         label: 'Excited',  emoji: '🤩', suggestion: 'Epic adventures & sci-fi blockbusters' },
  relaxed:  { genres: [99, 36, 10402],       label: 'Relaxed',  emoji: '😌', suggestion: 'Documentaries, history & music films' },
  bored:    { genres: [9648, 878, 14],       label: 'Bored',    emoji: '😐', suggestion: 'Mind-bending mysteries & fantasy' },
  fearful:  { genres: [27, 53],              label: 'Fearful',  emoji: '😨', suggestion: 'Horror & suspense thrillers' },
  surprised:{ genres: [9648, 878, 28],       label: 'Surprised',emoji: '😮', suggestion: 'Plot-twist thrillers & sci-fi' },
  neutral:  { genres: [35, 28, 18],          label: 'Neutral',  emoji: '😐', suggestion: 'Popular picks across all genres' },
};

function detectEmotion(text) {
  const t = text.toLowerCase();
  if (t.includes('happy') || t.includes('joy') || t.includes('smile') || t.includes('laugh'))   return 'happy';
  if (t.includes('sad')   || t.includes('cry')  || t.includes('tear') || t.includes('depress'))  return 'sad';
  if (t.includes('angry') || t.includes('anger')|| t.includes('furious')|| t.includes('rage'))   return 'angry';
  if (t.includes('excit') || t.includes('enthu')|| t.includes('energetic'))                      return 'excited';
  if (t.includes('relax') || t.includes('calm') || t.includes('peace') || t.includes('content')) return 'relaxed';
  if (t.includes('bored') || t.includes('unint')|| t.includes('neutral'))                        return 'bored';
  if (t.includes('fear')  || t.includes('scared')|| t.includes('anxious'))                       return 'fearful';
  if (t.includes('surpr') || t.includes('shock')|| t.includes('amaze'))                          return 'surprised';
  return 'neutral';
}

/* ─────────────────────────────────────────
   TMDB HELPERS
───────────────────────────────────────── */
async function tmdb(endpoint, params = {}) {
  const res = await axios.get(`${TMDB_BASE}${endpoint}`, {
    params: { api_key: TMDB_KEY, language: 'en-US', ...params }
  });
  return res.data;
}

function formatMovie(m) {
  return {
    id:          m.id,
    title:       m.title || m.name,
    rating:      m.vote_average ? parseFloat(m.vote_average.toFixed(1)) : 0,
    year:        (m.release_date || m.first_air_date || '').slice(0, 4),
    genre_ids:   m.genre_ids || [],
    desc:        m.overview || '',
    poster:      m.poster_path
                   ? `https://image.tmdb.org/t/p/w500${m.poster_path}`
                   : 'https://via.placeholder.com/500x750?text=No+Poster',
    backdrop:    m.backdrop_path
                   ? `https://image.tmdb.org/t/p/w1280${m.backdrop_path}`
                   : null,
  };
}

/* ─────────────────────────────────────────
   API ROUTES
───────────────────────────────────────── */

// GET /api/trending
app.get('/api/trending', async (req, res) => {
  try {
    const data = await tmdb('/trending/movie/week');
    res.json(data.results.slice(0, 12).map(formatMovie));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/toprated
app.get('/api/toprated', async (req, res) => {
  try {
    const data = await tmdb('/movie/top_rated');
    res.json(data.results.slice(0, 12).map(formatMovie));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/nowplaying  (hero carousel)
app.get('/api/nowplaying', async (req, res) => {
  try {
    const data = await tmdb('/movie/now_playing');
    const movies = data.results.filter(m => m.backdrop_path).slice(0, 5);
    res.json(movies.map(formatMovie));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/genres
app.get('/api/genres', async (req, res) => {
  try {
    const data = await tmdb('/genre/movie/list');
    res.json(data.genres);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/movies/mood?emotion=happy
app.get('/api/movies/mood', async (req, res) => {
  try {
    const emotion = req.query.emotion || 'neutral';
    const map     = EMOTION_MAP[emotion] || EMOTION_MAP.neutral;
    const genreStr = map.genres.join(',');
    const data    = await tmdb('/discover/movie', {
      with_genres:      genreStr,
      sort_by:          'popularity.desc',
      'vote_count.gte': 100,
    });
    res.json({
      emotion,
      label:      map.label,
      emoji:      map.emoji,
      suggestion: map.suggestion,
      movies:     data.results.slice(0, 12).map(formatMovie),
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/search?q=inception
app.get('/api/search', async (req, res) => {
  try {
    const q = req.query.q || '';
    if (!q) return res.json([]);
    const data = await tmdb('/search/movie', { query: q });
    res.json(data.results.slice(0, 12).map(formatMovie));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/movie/:id  (detail)
app.get('/api/movie/:id', async (req, res) => {
  try {
    const [detail, credits, similar] = await Promise.all([
      tmdb(`/movie/${req.params.id}`),
      tmdb(`/movie/${req.params.id}/credits`),
      tmdb(`/movie/${req.params.id}/similar`),
    ]);
    res.json({
      ...formatMovie(detail),
      runtime:  detail.runtime,
      tagline:  detail.tagline,
      genres:   detail.genres,
      cast:     credits.cast.slice(0, 8).map(c => ({ name: c.name, character: c.character, photo: c.profile_path ? `https://image.tmdb.org/t/p/w185${c.profile_path}` : null })),
      similar:  similar.results.slice(0, 6).map(formatMovie),
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/detect-emotion  (GPT-4 Vision)
// Body: { image: "data:image/jpeg;base64,..." }
app.post('/api/detect-emotion', async (req, res) => {
  try {
    const { image } = req.body;
    if (!image) return res.status(400).json({ error: 'No image provided' });

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      max_tokens: 200,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'text',
            text: `Analyze this person's facial expression and respond with ONLY a JSON object like this (no markdown, no extra text):
{"emotion":"happy","confidence":0.92,"description":"The person is smiling broadly and looks genuinely joyful","mood_note":"Perfect for a fun comedy night!"}

Emotion must be one of: happy, sad, angry, excited, relaxed, bored, fearful, surprised, neutral.`
          },
          {
            type: 'image_url',
            image_url: { url: image, detail: 'low' }
          }
        ]
      }]
    });

    const raw  = response.choices[0].message.content.trim();
    let result;
    try {
      result = JSON.parse(raw);
    } catch {
      // fallback: extract emotion keyword from text
      const emotion = detectEmotion(raw);
      result = { emotion, confidence: 0.7, description: raw, mood_note: EMOTION_MAP[emotion]?.suggestion };
    }

    // Fetch matching movies immediately
    const map      = EMOTION_MAP[result.emotion] || EMOTION_MAP.neutral;
    const movieData = await tmdb('/discover/movie', {
      with_genres:      map.genres.join(','),
      sort_by:          'popularity.desc',
      'vote_count.gte': 100,
    });

    res.json({
      ...result,
      label:      map.label,
      emoji:      map.emoji,
      suggestion: map.suggestion,
      movies:     movieData.results.slice(0, 12).map(formatMovie),
    });

  } catch (e) {
    console.error('Emotion detection error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// GET /api/trailer/:id  (YouTube trailer key)
app.get('/api/trailer/:id', async (req, res) => {
  try {
    const data = await tmdb(`/movie/${req.params.id}/videos`);
    const vids = data.results || [];
    const trailer =
      vids.find(v => v.site === 'YouTube' && v.type === 'Trailer' && v.official) ||
      vids.find(v => v.site === 'YouTube' && v.type === 'Trailer') ||
      vids.find(v => v.site === 'YouTube');
    res.json({ key: trailer ? trailer.key : null });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/tvshows?genre=18  (TV shows, optional genre filter)
app.get('/api/tvshows', async (req, res) => {
  try {
    const genre = req.query.genre;
    const params = { sort_by: 'popularity.desc', 'vote_count.gte': 50 };
    if (genre) params.with_genres = genre;
    const data = await tmdb('/discover/tv', params);
    res.json(data.results.slice(0, 20).map(formatMovie));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/discover?genre=28  (Movies filtered by genre)
app.get('/api/discover', async (req, res) => {
  try {
    const genre = req.query.genre;
    const params = { sort_by: 'popularity.desc', 'vote_count.gte': 100 };
    if (genre) params.with_genres = genre;
    const data = await tmdb('/discover/movie', params);
    res.json({ movies: data.results.slice(0, 20).map(formatMovie) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* ─────────────────────────────────────────
   CATCH-ALL → serve frontend
   / and /index.html → served normally (frontend handles auth guard)
   /auth → auth page
───────────────────────────────────────── */
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'auth.html'));
});
app.get('/app', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`\n🎬 EmotiStream running at http://localhost:${PORT}`);
  console.log(`🔐 Auth: http://localhost:${PORT}/`);
  console.log(`📺 App:  http://localhost:${PORT}/app`);
  console.log(`🤖 OpenAI GPT-4 Vision: ready`);
  console.log(`🎥 TMDB API: ready\n`);
  console.log(`Demo account: demo@emotistream.com / demo1234\n`);
});