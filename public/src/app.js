const API = '';

/* ════ AUTH GUARD ════ */
(function(){
  const token = localStorage.getItem('emoti_token');
  if(!token){ window.location.href='/'; return; }
  const profile = JSON.parse(localStorage.getItem('emoti_profile')||'null');
  const user    = JSON.parse(localStorage.getItem('emoti_user')||'null');
  if(profile || user){
    const name   = (profile?.name || user?.name || 'You');
    const avatar = (profile?.avatar || user?.avatar || '🎬');
    const el = document.getElementById('profile-name-display');
    const av = document.getElementById('profile-avatar-display');
    if(el) el.textContent = name;
    if(av) av.textContent = avatar;
  }
})();

function switchProfile(){ window.location.href='/'; }
function signOut(){ localStorage.removeItem('emoti_token'); localStorage.removeItem('emoti_user'); localStorage.removeItem('emoti_profile'); window.location.href='/'; }
const myList = JSON.parse(localStorage.getItem('emoti_mylist') || '[]');
const watchHistory = JSON.parse(localStorage.getItem('emoti_history') || '[]');
let currentModalMovie = null;
let camStream = null;
let faceApiLoaded = false;
let heroMovies = [];
let currentSlide = 0;
let autoSlideTimer;
const rowOffsets = {};
const DATASETS = {};

/* ════ SPLASH ════ */
(function(){
  const splash = document.getElementById('splash');
  const bar = document.getElementById('splashBar');
  requestAnimationFrame(()=>requestAnimationFrame(()=>{ bar.style.width='100%'; }));
  setTimeout(()=>{
    splash.style.opacity='0'; splash.style.pointerEvents='none';
    setTimeout(()=>{ splash.style.display='none'; }, 620);
  }, 2600);
})();

/* ════ PARTICLES ════ */
(function(){
  const pc = document.getElementById('particles');
  for(let i=0;i<22;i++){
    const d=document.createElement('div'); d.className='particle';
    const s=Math.random()*4+2;
    d.style.cssText=`width:${s}px;height:${s}px;left:${Math.random()*100}%;top:${Math.random()*100}%;background:${Math.random()>.5?'var(--pink)':'var(--purple)'};--dur:${7+Math.random()*10}s;--delay:${Math.random()*8}s`;
    pc.appendChild(d);
  }
})();

/* ════ PAGE NAVIGATION ════ */
function showPage(name, btn) {
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n=>n.classList.remove('active'));
  document.getElementById('page-'+name).classList.add('active');
  if(btn) btn.classList.add('active');

  if(name==='trending')  loadTrendingPage();
  if(name==='movies')    loadMoviesPage();
  if(name==='tvshows')   loadTVPage();
  if(name==='mylist')    renderMyList();
  if(name==='history')   renderHistory();
}

/* ════ API ════ */
async function apiFetch(path) {
  const r = await fetch(API+path);
  if(!r.ok) throw new Error('Server error '+r.status);
  return r.json();
}

/* ════ SKELETON ════ */
function skelRow(n=8){
  return Array(n).fill(0).map(()=>`<div class="skel-card"><div class="skel skel-thumb"></div><div class="skel skel-text"></div></div>`).join('');
}

/* ════ MAKE CARD ════ */
function makeCard(m, rowId) {
  const inList = myList.some(x=>x.id===m.id);
  return `<div class="movie-card">
    <div class="card-thumb" onclick="openMovieModal(${m.id})">
      <img src="${m.poster}" alt="${m.title}" loading="lazy" onerror="this.src='https://placehold.co/155x232/1a1a26/888?text=No+Poster'"/>
      <div class="card-badge"><span class="star">★</span> ${m.rating}</div>
      <div class="card-ov">
        <div class="card-play-btn" onclick="event.stopPropagation();playMovie(${m.id},'${escQ(m.title)}')">▶</div>
        <div class="card-wishlist ${inList?'added':''}" onclick="event.stopPropagation();toggleWishlist(${m.id},'${escQ(m.title)}','${m.poster}','${m.year}',this)" title="${inList?'Remove from list':'Add to list'}">${inList?'✓':'+'}</div>
      </div>
    </div>
    <div class="card-name" onclick="openMovieModal(${m.id})">${m.title}</div>
  </div>`;
}

function escQ(s){ return String(s).replace(/'/g,"\\'").replace(/"/g,'&quot;'); }

function renderRow(id, movies) {
  const el = document.getElementById('row-'+id);
  if(!el) return;
  DATASETS[id] = movies;
  el.innerHTML = movies.map(m=>makeCard(m,id)).join('');
}

function renderGrid(id, movies) {
  const el = document.getElementById(id);
  if(!el) return;
  const emptyEl = el.querySelector('.empty-state');
  const cards = movies.map(m=>makeCard(m,id)).join('');
  if(emptyEl) el.innerHTML = cards + (cards?'':'<div class="empty-state" style="grid-column:1/-1"><div class="big-icon">🎬</div><h3>Nothing here yet</h3></div>');
  else el.innerHTML = cards;
}

/* ════ ROW SCROLL ════ */
function scrollRow(id, dir) {
  const el = document.getElementById('row-'+id); if(!el) return;
  rowOffsets[id] = (rowOffsets[id]||0) + dir*166*2;
  const max = -(el.scrollWidth - el.parentElement.offsetWidth);
  rowOffsets[id] = Math.min(0, Math.max(max, rowOffsets[id]));
  el.style.transform = `translateX(${rowOffsets[id]}px)`;
}

/* ════ HERO ════ */
function buildHero(movies) {
  heroMovies = movies;
  const track = document.getElementById('heroSlides');
  const dots  = document.getElementById('heroDots');
  track.innerHTML = movies.map((m,i)=>`
    <div class="hero-slide${i===0?' active':''}">
      <div class="hero-bg" style="background-image:url('${m.backdrop||m.poster}')"></div>
      <div class="hero-ov"></div>
      <div class="hero-content">
        <div class="hero-genre">${m.year} &bull; Movie</div>
        <div class="hero-title">${m.title}</div>
        <div class="hero-desc">${m.desc}</div>
        <div class="hero-actions">
          <button class="btn-play" onclick="playMovie(${m.id},'${escQ(m.title)}')">▶ Play Now</button>
          <button class="btn-info" onclick="openMovieModal(${m.id})">ⓘ More Info</button>
        </div>
      </div>
      <div class="hero-rating"><span class="star">★</span> ${m.rating}</div>
    </div>`).join('');
  dots.innerHTML = movies.map((_,i)=>`<div class="dot${i===0?' active':''}" onclick="goSlide(${i})"></div>`).join('');
  document.querySelector('.hero-loading').style.display='none';
  track.style.display='flex'; dots.style.display='flex';
  clearInterval(autoSlideTimer);
  autoSlideTimer = setInterval(()=>goSlide(currentSlide+1), 6000);
}

function goSlide(n) {
  const slides = document.querySelectorAll('.hero-slide');
  const dots   = document.querySelectorAll('.dot');
  if(!slides.length) return;
  slides[currentSlide].classList.remove('active');
  dots[currentSlide] && dots[currentSlide].classList.remove('active');
  currentSlide = ((n%slides.length)+slides.length)%slides.length;
  slides[currentSlide].classList.add('active');
  dots[currentSlide] && dots[currentSlide].classList.add('active');
  document.getElementById('heroSlides').style.transform = `translateX(-${currentSlide*100}%)`;
}

/* ════ LOAD HOME DATA ════ */
async function loadHome() {
  document.getElementById('row-trending').innerHTML = skelRow();
  document.getElementById('row-toprated').innerHTML = skelRow();
  document.getElementById('row-mood').innerHTML     = skelRow();
  try {
    const [nowplaying, trending, toprated, mood] = await Promise.all([
      apiFetch('/api/nowplaying'),
      apiFetch('/api/trending'),
      apiFetch('/api/toprated'),
      apiFetch('/api/movies/mood?emotion=happy'),
    ]);
    buildHero(nowplaying);
    renderRow('trending', trending);
    renderRow('toprated', toprated);
    renderRow('mood', mood.movies);
  } catch(e) {
    showToast('Cannot reach server. Run: npm start in your emotistream folder.');
    console.error(e);
  }
}

/* ════ TRENDING PAGE ════ */
async function loadTrendingPage() {
  const grid = document.getElementById('grid-trending');
  if(grid.dataset.loaded) return;
  grid.innerHTML = Array(12).fill('<div class="skel-card"><div class="skel skel-thumb"></div><div class="skel skel-text"></div></div>').join('');
  try {
    const data = await apiFetch('/api/trending');
    grid.innerHTML = data.map(m=>makeCard(m,'trending')).join('');
    grid.dataset.loaded = '1';
    document.getElementById('trending-count').textContent = data.length+' titles';
  } catch(e) { showToast('Failed to load trending.'); }
}

/* ════ MOVIES PAGE ════ */
const MOVIE_GENRES = [
  {id:28,name:'Action'},{id:35,name:'Comedy'},{id:18,name:'Drama'},
  {id:27,name:'Horror'},{id:878,name:'Sci-Fi'},{id:10749,name:'Romance'},
  {id:12,name:'Adventure'},{id:16,name:'Animation'},{id:9648,name:'Mystery'},
];
let movieGenreFilter = null;

async function loadMoviesPage() {
  const grid = document.getElementById('grid-movies');
  const fbar = document.getElementById('movie-filters');
  if(!fbar.innerHTML) {
    fbar.innerHTML = `<button class="filter-btn active" onclick="filterMovies(null,this)">All</button>` +
      MOVIE_GENRES.map(g=>`<button class="filter-btn" onclick="filterMovies(${g.id},this)">${g.name}</button>`).join('');
  }
  if(grid.dataset.loaded) return;
  grid.innerHTML = Array(12).fill('<div class="skel-card"><div class="skel skel-thumb"></div><div class="skel skel-text"></div></div>').join('');
  try {
    const data = await apiFetch('/api/toprated');
    grid.innerHTML = data.map(m=>makeCard(m,'movies')).join('');
    grid.dataset.loaded = '1';
    grid._all = data;
  } catch(e) { showToast('Failed to load movies.'); }
}

async function filterMovies(genreId, btn) {
  document.querySelectorAll('#movie-filters .filter-btn').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  const grid = document.getElementById('grid-movies');
  grid.innerHTML = Array(12).fill('<div class="skel-card"><div class="skel skel-thumb"></div><div class="skel skel-text"></div></div>').join('');
  try {
    const url = genreId ? `/api/movies/mood?emotion=neutral&genre=${genreId}` : '/api/toprated';
    let data;
    if(genreId) {
      const r = await apiFetch(`/api/discover?genre=${genreId}`);
      data = r.movies || r;
    } else {
      data = await apiFetch('/api/toprated');
    }
    grid.innerHTML = data.map(m=>makeCard(m,'movies')).join('');
    delete grid.dataset.loaded;
  } catch(e) { showToast('Failed to filter.'); }
}

/* ════ TV SHOWS PAGE ════ */
const TV_GENRES = [
  {id:10759,name:'Action & Adventure'},{id:35,name:'Comedy'},{id:18,name:'Drama'},
  {id:10765,name:'Sci-Fi & Fantasy'},{id:9648,name:'Mystery'},{id:10768,name:'Documentary'},
];

async function loadTVPage() {
  const grid = document.getElementById('grid-tvshows');
  const fbar = document.getElementById('tv-filters');
  if(!fbar.innerHTML) {
    fbar.innerHTML = `<button class="filter-btn active" onclick="filterTV(null,this)">All</button>` +
      TV_GENRES.map(g=>`<button class="filter-btn" onclick="filterTV(${g.id},this)">${g.name}</button>`).join('');
  }
  if(grid.dataset.loaded) return;
  grid.innerHTML = Array(12).fill('<div class="skel-card"><div class="skel skel-thumb"></div><div class="skel skel-text"></div></div>').join('');
  try {
    const data = await apiFetch('/api/tvshows');
    grid.innerHTML = data.map(m=>makeCard(m,'tvshows')).join('');
    grid.dataset.loaded = '1';
  } catch(e) { showToast('Failed to load TV shows.'); }
}

async function filterTV(genreId, btn) {
  document.querySelectorAll('#tv-filters .filter-btn').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  const grid = document.getElementById('grid-tvshows');
  grid.innerHTML = Array(12).fill('<div class="skel-card"><div class="skel skel-thumb"></div><div class="skel skel-text"></div></div>').join('');
  try {
    const url = genreId ? `/api/tvshows?genre=${genreId}` : '/api/tvshows';
    const data = await apiFetch(url);
    grid.innerHTML = data.map(m=>makeCard(m,'tvshows')).join('');
  } catch(e) { showToast('Failed to filter TV shows.'); }
}

/* ════ MY LIST ════ */
function toggleWishlist(id, title, poster, year, el) {
  const idx = myList.findIndex(x=>x.id===id);
  if(idx>=0) {
    myList.splice(idx,1);
    el.textContent='+'; el.classList.remove('added');
    showToast('Removed from My List');
  } else {
    myList.push({id,title,poster,year,rating:'N/A',desc:''});
    el.textContent='✓'; el.classList.add('added');
    showToast('Added to My List ✓');
  }
  localStorage.setItem('emoti_mylist', JSON.stringify(myList));
  if(document.getElementById('modal-wishlist-btn') && currentModalMovie?.id===id) {
    updateModalWishlistBtn(id);
  }
}

function toggleWishlistFromModal() {
  if(!currentModalMovie) return;
  const m = currentModalMovie;
  const idx = myList.findIndex(x=>x.id===m.id);
  if(idx>=0) {
    myList.splice(idx,1);
    showToast('Removed from My List');
  } else {
    myList.push({id:m.id,title:m.title,poster:m.poster||m.img,year:m.year,rating:m.rating,desc:m.desc});
    showToast('Added to My List ✓');
  }
  localStorage.setItem('emoti_mylist', JSON.stringify(myList));
  updateModalWishlistBtn(m.id);
}

function updateModalWishlistBtn(id) {
  const btn = document.getElementById('modal-wishlist-btn');
  if(!btn) return;
  const inList = myList.some(x=>x.id===id);
  btn.textContent = inList ? '✓ In My List' : '➕ My List';
  btn.classList.toggle('added', inList);
}

function renderMyList() {
  const grid = document.getElementById('grid-mylist');
  const empty = document.getElementById('mylist-empty');
  const count = document.getElementById('mylist-count');
  if(!myList.length) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1">
      <div class="big-icon">📋</div><h3>Your list is empty</h3>
      <p>Browse movies and tap the + button on any card to save them here.</p></div>`;
    count.textContent = '';
    return;
  }
  count.textContent = myList.length+' titles';
  grid.innerHTML = myList.map(m=>makeCard(m,'mylist')).join('');
}

/* ════ HISTORY ════ */
function addToHistory(id, title, poster, year) {
  const existing = watchHistory.findIndex(x=>x.id===id);
  if(existing>=0) watchHistory.splice(existing,1);
  watchHistory.unshift({id,title,poster,year,watchedAt:new Date().toISOString()});
  if(watchHistory.length>50) watchHistory.pop();
  localStorage.setItem('emoti_history', JSON.stringify(watchHistory));
}

function renderHistory() {
  const el = document.getElementById('history-list');
  if(!watchHistory.length) {
    el.innerHTML = `<div class="empty-state"><div class="big-icon">🕐</div><h3>No history yet</h3><p>Movies you watch will appear here.</p></div>`;
    return;
  }
  el.innerHTML = watchHistory.map(m=>`
    <div class="history-item" onclick="openMovieModal(${m.id})">
      <img class="history-thumb" src="${m.poster}" onerror="this.src='https://placehold.co/56x80/1a1a26/888?text=?'"/>
      <div class="history-info"><strong>${m.title}</strong><span>${m.year}</span></div>
      <span class="history-time">${timeAgo(m.watchedAt)}</span>
    </div>`).join('');
}

function timeAgo(iso) {
  const diff = Date.now() - new Date(iso);
  const m = Math.floor(diff/60000);
  if(m<1) return 'Just now';
  if(m<60) return m+'m ago';
  const h = Math.floor(m/60);
  if(h<24) return h+'h ago';
  return Math.floor(h/24)+'d ago';
}

/* ════ MOVIE MODAL ════ */
/* ════ SCROLL LOCK (prevents page shift when modals open) ════ */
let modalOpenCount = 0;
function lockScroll(){ modalOpenCount++; document.body.classList.add('modal-open'); }
function unlockScroll(){ modalOpenCount=Math.max(0,modalOpenCount-1); if(modalOpenCount===0) document.body.classList.remove('modal-open'); }

async function openMovieModal(id) {
  lockScroll();
  document.getElementById('modal-bg').classList.add('open');
  document.getElementById('modal-title').textContent = 'Loading...';
  document.getElementById('modal-desc').textContent  = '';
  document.getElementById('modal-meta').innerHTML    = '';
  document.getElementById('modal-tagline').textContent = '';
  document.getElementById('modal-cast-wrap').style.display = 'none';
  document.getElementById('modal-img').src = '';
  currentModalMovie = null;
  try {
    const m = await apiFetch(`/api/movie/${id}`);
    currentModalMovie = m;
    document.getElementById('modal-img').src = m.backdrop || m.poster;
    document.getElementById('modal-title').textContent = m.title;
    document.getElementById('modal-tagline').textContent = m.tagline||'';
    document.getElementById('modal-meta').innerHTML =
      `<span class="modal-tag">★ ${m.rating}</span>` +
      `<span class="modal-tag">${m.year}</span>` +
      (m.runtime?`<span class="modal-tag">${m.runtime} min</span>`:'') +
      (m.genres||[]).map(g=>`<span class="modal-tag">${g.name}</span>`).join('');
    document.getElementById('modal-desc').textContent = m.desc;
    if(m.cast&&m.cast.length) {
      document.getElementById('modal-cast-wrap').style.display='block';
      document.getElementById('cast-list').innerHTML = m.cast.map(c=>`
        <div class="cast-item">
          <img src="${c.photo||'https://placehold.co/52x52/1a1a26/888?text=?'}" onerror="this.src='https://placehold.co/52x52/1a1a26/888?text=?'"/>
          <span>${c.name}</span>
        </div>`).join('');
    }
    document.getElementById('modal-play-btn').onclick = ()=>{ closeModalDirect(); playMovie(m.id, m.title); };
    updateModalWishlistBtn(m.id);
  } catch(e) {
    document.getElementById('modal-title').textContent = 'Could not load details.';
  }
}
function closeModal(e){ if(e.target===document.getElementById('modal-bg')) closeModalDirect(); }
function closeModalDirect(){ document.getElementById('modal-bg').classList.remove('open'); unlockScroll(); }

/* ════ PLAYER ════ */
async function playMovie(id, title) {
  lockScroll();
  // Save to history
  const m = DATASETS['trending']?.find(x=>x.id===id) ||
            DATASETS['toprated']?.find(x=>x.id===id) ||
            DATASETS['mood']?.find(x=>x.id===id) ||
            myList.find(x=>x.id===id) ||
            {id,title,poster:'',year:''};
  addToHistory(id, title, m.poster||'', m.year||'');

  document.getElementById('player-title').textContent = title;
  document.getElementById('player-wrap').innerHTML = '<div class="no-trailer"><div class="spinner"></div><span>Loading trailer...</span></div>';
  document.getElementById('player-bg').classList.add('open');

  try {
    const data = await apiFetch(`/api/trailer/${id}`);
    if(data.key) {
      document.getElementById('player-wrap').innerHTML =
        `<iframe src="https://www.youtube.com/embed/${data.key}?autoplay=1&rel=0" allow="autoplay;fullscreen" allowfullscreen></iframe>`;
    } else {
      document.getElementById('player-wrap').innerHTML =
        `<div class="no-trailer">🎬<br>No trailer available for this title.<br><span style="font-size:12px;color:var(--muted)">Check YouTube manually for "${title}"</span></div>`;
    }
  } catch(e) {
    document.getElementById('player-wrap').innerHTML =
      `<div class="no-trailer">❌<br>Could not load trailer.<br><span style="font-size:12px;color:var(--muted)">${e.message}</span></div>`;
  }
}
function closePlayer(e){ if(e.target===document.getElementById('player-bg')) closePlayerDirect(); }
function closePlayerDirect(){
  document.getElementById('player-bg').classList.remove('open');
  document.getElementById('player-wrap').innerHTML='';
  unlockScroll();
}

/* ════ SEARCH ════ */
let searchTimer;
document.getElementById('searchInput').addEventListener('input', e=>{
  clearTimeout(searchTimer);
  const q = e.target.value.trim();
  const sr = document.getElementById('search-results');
  if(!q){ sr.style.display='none'; return; }
  searchTimer = setTimeout(async()=>{
    try {
      const movies = await apiFetch(`/api/search?q=${encodeURIComponent(q)}`);
      if(!movies.length){ sr.style.display='none'; return; }
      sr.innerHTML = movies.slice(0,6).map(m=>`
        <div class="search-item" onclick="openMovieModal(${m.id});document.getElementById('search-results').style.display='none';document.getElementById('searchInput').value=''">
          <img src="${m.poster}" onerror="this.src='https://placehold.co/34x50/1a1a26/888?text=?'"/>
          <div class="si-info"><strong>${m.title}</strong><span>${m.year} &bull; ★ ${m.rating}</span></div>
        </div>`).join('');
      sr.style.display='block';
    }catch(e){}
  }, 380);
});
document.addEventListener('click', e=>{ if(!e.target.closest('.search-wrap')) document.getElementById('search-results').style.display='none'; });

/* ════ MOOD ════ */
async function fetchMoodMovies(emotion) {
  document.querySelectorAll('.mood-card').forEach(c=>c.classList.remove('selected'));
  const card = document.querySelector(`.mood-card[data-mood="${emotion}"]`);
  if(card) card.classList.add('selected');

  // Show on home page mood row
  showPage('home', document.querySelector('.nav-item.active'));
  document.getElementById('row-mood').innerHTML = skelRow();
  try {
    const data = await apiFetch(`/api/movies/mood?emotion=${emotion}`);
    renderRow('mood', data.movies);
    document.getElementById('mood-row-title').textContent = `${data.emoji} ${data.suggestion}`;
    showToast(`${data.emoji} ${data.label} mood — showing ${data.suggestion}`);
    // scroll to mood row
    setTimeout(()=>{
      document.getElementById('row-mood').closest('.row-section').scrollIntoView({behavior:'smooth',block:'start'});
    }, 300);
  } catch(e) { showToast('Failed to load mood movies.'); }
}

function toggleMoodPicker() {
  const el = document.getElementById('mood-picker');
  el.style.display = el.style.display==='none' ? 'block' : 'none';
}

/* ════ FACE-API FALLBACK ════ */
// Multiple CDN sources tried in order — if one is down/blocked, the next is used automatically
const FACEAPI_URLS = [
  'https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model',
  'https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js@master/weights',
  'https://unpkg.com/@vladmandic/face-api/model',
];
const EXPR_MAP = {
  happy:{emotion:'happy',emoji:'😊',label:'Happy'},
  sad:{emotion:'sad',emoji:'😢',label:'Sad'},
  angry:{emotion:'angry',emoji:'😠',label:'Angry'},
  disgusted:{emotion:'angry',emoji:'😠',label:'Angry'},
  fearful:{emotion:'fearful',emoji:'😨',label:'Fearful'},
  surprised:{emotion:'surprised',emoji:'😮',label:'Surprised'},
  neutral:{emotion:'relaxed',emoji:'😌',label:'Relaxed'},
};

async function loadFaceApi() {
  if(faceApiLoaded) return;
  let lastErr = null;
  for (let i = 0; i < FACEAPI_URLS.length; i++) {
    const url = FACEAPI_URLS[i];
    try {
      document.getElementById('cam-status').textContent =
        `⏳ Loading free AI models${i>0?' (trying backup source '+(i+1)+')':''}...`;
      await faceapi.nets.tinyFaceDetector.loadFromUri(url);
      await faceapi.nets.faceExpressionNet.loadFromUri(url);
      faceApiLoaded = true;
      console.log('face-api models loaded from:', url);
      return;
    } catch (err) {
      console.warn('Model source failed:', url, err.message);
      lastErr = err;
    }
  }
  throw new Error('All model sources failed to load: ' + (lastErr?.message || 'unknown error'));
}

async function detectWithFaceApi(canvas) {
  await loadFaceApi();
  document.getElementById('cam-status').textContent='🔍 Free AI scanning your face...';
  const det = await faceapi.detectSingleFace(canvas, new faceapi.TinyFaceDetectorOptions()).withFaceExpressions();
  if(!det) return {emotion:'neutral',emoji:'😐',label:'Neutral',confidence:.5,description:'No face detected clearly — try better lighting!',mood_note:'Showing popular picks.'};
  const best = Object.entries(det.expressions).sort((a,b)=>b[1]-a[1])[0];
  const mapped = EXPR_MAP[best[0]] || EXPR_MAP.neutral;
  return { ...mapped, confidence:parseFloat(best[1].toFixed(2)),
    description:`Detected ${best[0]} expression (${Math.round(best[1]*100)}% confidence) via free on-device AI`,
    mood_note:'Movies matched to your mood using free AI — no OpenAI needed!' };
}

/* ════ CAMERA & CAPTURE ════ */
async function openFaceModal() {
  lockScroll();
  document.getElementById('face-bg').classList.add('open');
  document.getElementById('cam-status').textContent='📷 Starting camera...';
  document.getElementById('captureBtn').disabled=true;
  document.getElementById('scanLine').style.display='none';
  const video  = document.getElementById('camVideo');
  const canvas = document.getElementById('camCanvas');
  canvas.style.display='none'; video.style.display='block';
  try {
    camStream = await navigator.mediaDevices.getUserMedia({video:{facingMode:'user'},audio:false});
    video.srcObject = camStream;
    video.onloadedmetadata = ()=>{
      document.getElementById('cam-status').textContent='✅ Camera ready — look at the screen!';
      document.getElementById('captureBtn').disabled=false;
      document.getElementById('scanLine').style.display='block';
    };
  } catch(err) {
    document.getElementById('cam-status').textContent='❌ Camera blocked — allow access in browser.';
  }
}

async function captureAndDetect() {
  const video  = document.getElementById('camVideo');
  const canvas = document.getElementById('camCanvas');
  const btn    = document.getElementById('captureBtn');

  canvas.width  = video.videoWidth  || 640;
  canvas.height = video.videoHeight || 480;
  canvas.getContext('2d').drawImage(video,0,0);
  const imageData = canvas.toDataURL('image/jpeg',.75);

  video.style.display='none'; canvas.style.display='block';
  document.getElementById('scanLine').style.display='block';
  document.getElementById('cam-status').textContent='🤖 GPT-4 Vision analyzing...';
  btn.disabled=true; btn.textContent='Analyzing...';

  let emotionData=null, usedFallback=false;

  // Try GPT-4 Vision first
  try {
    const res  = await fetch(API+'/api/detect-emotion',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({image:imageData})});
    const data = await res.json();
    if(data.error) throw new Error(data.error);
    emotionData = data;
  } catch(gptErr) {
    console.warn('GPT-4 failed, using free fallback:', gptErr.message);
    usedFallback=true;
    document.getElementById('cam-status').textContent='🔄 Using free AI fallback...';
    try {
      const local = await detectWithFaceApi(canvas);
      const mood  = await apiFetch(`/api/movies/mood?emotion=${local.emotion}`);
      emotionData = {...local, ...mood, movies:mood.movies};
    } catch(faceErr) {
      console.error('face-api.js failed:', faceErr);
      document.getElementById('cam-status').textContent='❌ '+(faceErr.message||'Detection failed');
      btn.disabled=false; btn.textContent='📸 Capture & Detect';
      video.style.display='block'; canvas.style.display='none';
      showToast('Free AI failed: '+(faceErr.message||'unknown error')+'. Open browser console (F12) for details.');
      return;
    }
  }

  stopCamera(); closeFaceModalDirect();
  showEmotionResult(emotionData, usedFallback);

  // Update mood row with FILTERED movies
  renderRow('mood', emotionData.movies);
  document.getElementById('mood-row-title').textContent = `${emotionData.emoji} ${emotionData.suggestion||emotionData.mood_note}`;

  // Highlight matching mood card
  document.querySelectorAll('.mood-card').forEach(c=>c.classList.remove('selected'));
  const card = document.querySelector(`.mood-card[data-mood="${emotionData.emotion}"]`);
  if(card) card.classList.add('selected');

  const method = usedFallback ? 'Free AI' : 'GPT-4 Vision';
  showToast(`${emotionData.emoji} ${method}: ${emotionData.label}! Scroll down for your picks.`);

  // Scroll to mood row
  setTimeout(()=>{
    document.getElementById('row-mood').closest('.row-section').scrollIntoView({behavior:'smooth',block:'start'});
  },400);
}

function stopCamera() {
  if(camStream){ camStream.getTracks().forEach(t=>t.stop()); camStream=null; }
}
function closeFaceModal(e){ if(e.target===document.getElementById('face-bg')) closeFaceModalDirect(); }
function closeFaceModalDirect(){
  stopCamera();
  document.getElementById('face-bg').classList.remove('open');
  document.getElementById('captureBtn').textContent='📸 Capture & Detect';
  document.getElementById('captureBtn').disabled=true;
  document.getElementById('camVideo').style.display='block';
  document.getElementById('camCanvas').style.display='none';
  document.getElementById('scanLine').style.display='none';
  unlockScroll();
}

function showEmotionResult(data, usedFallback=false) {
  const el = document.getElementById('emotion-result');
  document.getElementById('er-emoji').textContent  = data.emoji||'😐';
  const method = usedFallback ? ' • Free On-Device AI' : ' • GPT-4 Vision';
  document.getElementById('er-title').textContent  = `Detected: ${data.label} (${Math.round((data.confidence||.8)*100)}% confidence)${method}`;
  document.getElementById('er-desc').textContent   = data.description||data.mood_note||'';
  el.classList.add('show');
  setTimeout(()=>el.classList.remove('show'), 10000);
}

/* ════ TOAST ════ */
let toastTimer;
function showToast(msg){
  const t=document.getElementById('toast');
  t.textContent=msg; t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer=setTimeout(()=>t.classList.remove('show'),4000);
}

/* ════ PREMIUM MODAL ════ */
let selectedPlan = 'yearly';

function openPremiumModal() {
  lockScroll();
  document.getElementById('premium-bg').classList.add('open');
  // Default-select yearly plan
  document.querySelectorAll('.plan-card').forEach(c=>{
    c.classList.toggle('selected', c.dataset.plan === selectedPlan);
  });
}
function closePremiumModal(e){ if(e.target===document.getElementById('premium-bg')) closePremiumModalDirect(); }
function closePremiumModalDirect(){
  document.getElementById('premium-bg').classList.remove('open');
  unlockScroll();
}
function selectPlan(el) {
  document.querySelectorAll('.plan-card').forEach(c=>c.classList.remove('selected'));
  el.classList.add('selected');
  selectedPlan = el.dataset.plan;
}
function confirmSubscribe() {
  const planNames = {monthly:'Monthly (₹199/mo)', yearly:'Yearly (₹1,499/yr)', family:'Family (₹349/mo)'};
  closePremiumModalDirect();
  showToast(`🎉 Subscribed to ${planNames[selectedPlan]}! Welcome to Premium.`);
  addNotification('👑', 'Welcome to Premium!', `Your ${planNames[selectedPlan]} plan is now active. Enjoy unlimited AI scans & 4K streaming.`);
}

/* ════ NOTIFICATIONS ════ */
let notifications = JSON.parse(localStorage.getItem('emoti_notifs') || 'null') || [
  { icon:'🎬', title:'New release added', body:'Dune: Part Two is now streaming in 4K.', time:Date.now()-1000*60*12, unread:true },
  { icon:'🤖', title:'AI Tip', body:'Try the emotion scanner — it picks movies based on your mood!', time:Date.now()-1000*60*60*3, unread:true },
  { icon:'⭐', title:'Recommended for you', body:'Based on your watch history, you might like Inception.', time:Date.now()-1000*60*60*26, unread:true },
];

function saveNotifs(){ localStorage.setItem('emoti_notifs', JSON.stringify(notifications)); }

function addNotification(icon, title, body) {
  notifications.unshift({ icon, title, body, time: Date.now(), unread: true });
  saveNotifs();
  updateNotifBadge();
  if (document.getElementById('notif-panel').classList.contains('open')) renderNotifPanel();
}

function updateNotifBadge() {
  const unreadCount = notifications.filter(n=>n.unread).length;
  const badge = document.getElementById('notif-badge');
  if (unreadCount > 0) {
    badge.textContent = unreadCount > 9 ? '9+' : unreadCount;
    badge.style.display = 'flex';
  } else {
    badge.style.display = 'none';
  }
}

function renderNotifPanel() {
  const panel = document.getElementById('notif-panel');
  if (!notifications.length) {
    panel.innerHTML = `<div class="notif-header"><strong>Notifications</strong></div><div class="notif-empty">No notifications yet</div>`;
    return;
  }
  panel.innerHTML = `
    <div class="notif-header">
      <strong>Notifications</strong>
      <button class="notif-clear" onclick="clearAllNotifs()">Clear all</button>
    </div>
    ${notifications.map((n,i)=>`
      <div class="notif-item ${n.unread?'unread':''}" onclick="readNotif(${i})">
        <div class="notif-icon">${n.icon}</div>
        <div class="notif-text"><strong>${n.title}</strong><span>${n.body}</span><span style="display:block;margin-top:3px;opacity:.7">${timeAgo(new Date(n.time).toISOString())}</span></div>
      </div>`).join('')}
  `;
}

function toggleNotifications() {
  const panel = document.getElementById('notif-panel');
  const isOpen = panel.classList.contains('open');
  if (isOpen) {
    panel.classList.remove('open');
  } else {
    renderNotifPanel();
    panel.classList.add('open');
  }
}

function readNotif(i) {
  notifications[i].unread = false;
  saveNotifs();
  updateNotifBadge();
  renderNotifPanel();
}

function clearAllNotifs() {
  notifications = [];
  saveNotifs();
  updateNotifBadge();
  renderNotifPanel();
  showToast('All notifications cleared');
}

document.addEventListener('click', e=>{
  if (!e.target.closest('.notif-wrap')) {
    document.getElementById('notif-panel')?.classList.remove('open');
  }
});

/* ════ BOOT ════ */
loadHome();
updateNotifBadge();
