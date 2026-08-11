(() => {
  'use strict';

  const $ = (s, r = document) => r.querySelector(s);
  const NEP = ['०', '१', '२', '३', '४', '५', '६', '७', '८', '९'];
  const toNep = (n) => String(n).replace(/[0-9]/g, (d) => NEP[d]);
  const pad2 = (n) => String(n).padStart(2, '0');
  const fmt = (t) => {
    if (!isFinite(t) || t < 0) t = 0;
    return toNep(pad2(Math.floor(t / 60))) + ':' + toNep(pad2(Math.floor(t % 60)));
  };

  const state = {
    index: 0, playing: false, ready: false,
    time: 0, dur: 0, vol: 80, muted: false,
    queueOpen: false, player: null
  };
  const errorIds = new Set();
  const VOL_KEY = 'samjhana:vol:v1';
  const RESUME_KEY = 'samjhana:resume:v1';
  let resume = null;
  let saveTimer = 0;

  function init() {
    buildFlags();
    splitTitle();
    renderTracks();
    updateControls();
    $('#eyebrow').textContent = toNep(TRACKS.length) + ' गीतहरू · नन-स्टप';
    $('#queue-count').textContent = toNep(TRACKS.length) + ' गीतहरू';

    state.vol = clamp(read(VOL_KEY, 80), 0, 100);
    $('#volume').value = state.vol;
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(RESUME_KEY) || 'null'); } catch (e) { saved = null; }
    if (saved && TRACKS.some((t) => t.id === saved.id)) resume = saved;

    startClock();
    spawnRocks();
    bindUI();
    loadYouTube();
  }

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const read = (k, d) => { try { const v = localStorage.getItem(k); return v === null ? d : Number(v); } catch (e) { return d; } };
  const write = (k, v) => { try { localStorage.setItem(k, String(v)); } catch (e) {} };

  function thumb(id) { return 'https://i.ytimg.com/vi/' + id + '/hqdefault.jpg'; }

  function buildFlags() {
    const colors = ['#2e6f8e', '#f7ece4', '#c8102e', '#2e9e5b', '#f2c14e'];
    const wrap = $('.flags');
    const count = Math.max(8, Math.floor(window.innerWidth / 90));
    let html = '';
    for (let i = 0; i < count; i++) html += '<span class="flag" style="background:' + colors[i % colors.length] + '"></span>';
    wrap.innerHTML = html;
  }

  function splitTitle() {
    const h = $('#hero-title');
    const text = h.textContent || 'सम्झनाको बस';
    let html = '', i = 0;
    for (const ch of text) {
      const isSpace = ch === ' ';
      html += '<span style="--fan:' + (i % 2 ? 1 : -1) + ';--d:' + (i * 0.022) + 's">' + (isSpace ? '\u00A0' : ch) + '</span>';
      i++;
    }
    h.innerHTML = html;
  }

  function startClock() {
    const el = $('#clock');
    const tick = () => {
      const d = new Date();
      const hh = toNep(pad2(d.getHours()));
      const mm = toNep(pad2(d.getMinutes()));
      const ss = toNep(pad2(d.getSeconds()));
      el.innerHTML = hh + '<b>:</b>' + mm + '<b>:</b>' + ss;
    };
    tick();
    setInterval(tick, 1000);
  }

  function spawnRocks() {
    const road = $('#road');
    if (!road || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const make = () => {
      if (road.querySelectorAll('.rock').length > 16) return;
      const r = document.createElement('i');
      r.className = 'rock';
      const big = Math.random() < 0.3;
      const size = big ? 12 + Math.random() * 18 : 5 + Math.random() * 9;
      r.style.width = size + 'px';
      r.style.height = size * (0.8 + Math.random() * 0.5) + 'px';
      r.style.bottom = (6 + Math.random() * 42) + '%';
      r.style.setProperty('--d', (2.6 + Math.random() * 4) + 's');
      r.style.opacity = (0.35 + Math.random() * 0.4).toFixed(2);
      r.addEventListener('animationend', () => r.remove());
      road.appendChild(r);
    };
    make(); make();
    setInterval(() => { if (document.hidden) return; make(); if (Math.random() < 0.4) make(); }, 750);
  }

  /* ---------------- youtube ---------------- */

  function loadYouTube() {
    if (window.YT && window.YT.Player) return initPlayer();
    if (!document.querySelector('script[src="https://www.youtube.com/iframe_api"]')) {
      const s = document.createElement('script');
      s.src = 'https://www.youtube.com/iframe_api';
      s.async = true;
      document.head.appendChild(s);
    }
    window.onYouTubeIframeAPIReady = initPlayer;
  }

  function initPlayer() {
    state.player = new YT.Player('yt-player', {
      videoId: TRACKS[state.index].id,
      playerVars: { controls: 0, disablekb: 1, playsinline: 1, rel: 0, modestbranding: 1, enablejsapi: 1 },
      events: {
        onReady: (e) => {
          state.ready = true;
          applyVolume();
          restoreResume();
        },
        onStateChange: (e) => {
          const d = e.data;
          if (d === 1) { setPlaying(true); }
          else if (d === 2) { setPlaying(false); saveResume(); }
          else if (d === 0) { setTimeout(next, 350); }
        },
        onError: (e) => {
          if ([2, 5, 100, 101, 150].includes(e.data)) {
            errorIds.add(TRACKS[state.index].id);
            skipErrored();
          }
        }
      }
    });
  }

  function playIndex(i) {
    i = clamp(i, 0, TRACKS.length - 1);
    state.index = i;
    updateControls();
    updateQueueActive();
    updateMediaSession();
    if (state.ready) {
      state.player.loadVideoById(TRACKS[i].id);
    }
  }

  function next() {
    playIndex((state.index + 1) % TRACKS.length);
  }

  function prev() {
    if (state.ready && state.time > 3) {
      state.player.seekTo(0, true);
      return;
    }
    playIndex((state.index - 1 + TRACKS.length) % TRACKS.length);
  }

  function toggle() {
    if (!state.ready) { toast('बस तयार हुँदैछ…'); return; }
    if (state.playing) state.player.pauseVideo();
    else state.player.playVideo();
  }

  function setPlaying(p) {
    state.playing = p;
    $('#player').classList.toggle('playing', p);
    $('#toggle').classList.toggle('on', p);
    navigator.mediaSession.playbackState = p ? 'playing' : 'paused';
    if (p) document.title = TRACKS[state.index].title + ' · सम्झनाको बस';
    else document.title = 'सम्झनाको बस — पुराना नेपाली गीतहरू';
  }

  function seekBy(s) {
    if (!state.ready) return;
    state.player.seekTo(clamp(state.time + s, 0, Math.max(0, state.dur)), true);
  }

  function seekToRatio(r) {
    if (!state.ready || !state.dur) return;
    state.player.seekTo(state.dur * clamp(r, 0, 1), true);
  }

  function skipErrored() {
    for (let step = 1; step <= TRACKS.length; step++) {
      const i = (state.index + step) % TRACKS.length;
      if (!errorIds.has(TRACKS[i].id)) { playIndex(i); return; }
    }
    toast('गीत बजाउन सकिएन');
  }

  function applyVolume() {
    if (!state.ready) return;
    if (state.muted) state.player.mute();
    else state.player.unMute();
    state.player.setVolume(state.muted ? 0 : state.vol);
  }

  function setVolume(v) {
    state.vol = clamp(v, 0, 100);
    if (state.vol > 0 && state.muted) { state.muted = false; }
    write(VOL_KEY, state.vol);
    $('#volume').value = state.vol;
    updateVolumeUI();
    if (state.ready) applyVolume();
  }

  function toggleMute() {
    state.muted = !state.muted;
    updateVolumeUI();
    if (state.ready) applyVolume();
  }

  function updateVolumeUI() {
    $('#volume').value = state.vol;
    $('#volume').style.setProperty('--fill', (state.muted ? 0 : state.vol) + '%');
    $('#mute').classList.toggle('muted', state.muted || state.vol === 0);
  }

  function saveResume() {
    try {
      localStorage.setItem(RESUME_KEY, JSON.stringify({
        id: TRACKS[state.index].id, t: Math.floor(state.time), wasPlaying: state.playing
      }));
    } catch (e) {}
  }

  function restoreResume() {
    if (!resume || !state.ready) return;
    const i = TRACKS.findIndex((t) => t.id === resume.id);
    if (i === -1) return;
    state.index = i;
    updateControls();
    updateQueueActive();
    state.player.cueVideoById(resume.id, resume.t > 5 ? resume.t : 0);
    if (resume.wasPlaying) state.player.playVideo();
    resume = null;
  }

  /* ---------------- poll / tick ---------------- */

  setInterval(() => {
    if (!state.ready || !state.player) return;
    const p = state.player;
    if (!p.getCurrentTime) return;
    const t = p.getCurrentTime() || 0;
    const d = p.getDuration() || 0;
    state.time = t;
    state.dur = d;
    updateSeek();
    updateMediaPosition(t, d);
    if (Date.now() - saveTimer > 4000) { saveTimer = Date.now(); saveResume(); }
  }, 250);

  /* ---------------- media session ---------------- */

  function updateMediaSession() {
    if (!('mediaSession' in navigator)) return;
    const t = TRACKS[state.index];
    navigator.mediaSession.metadata = new MediaMetadata({
      title: t.title, artist: t.artist, album: SITE.brand,
      artwork: [{ src: thumb(t.id), sizes: '480x360', type: 'image/jpeg' }]
    });
    navigator.mediaSession.setActionHandler('play', () => toggle());
    navigator.mediaSession.setActionHandler('pause', () => toggle());
    navigator.mediaSession.setActionHandler('previoustrack', () => prev());
    navigator.mediaSession.setActionHandler('nexttrack', () => next());
    navigator.mediaSession.setActionHandler('seekbackward', () => seekBy(-10));
    navigator.mediaSession.setActionHandler('seekforward', () => seekBy(10));
    navigator.mediaSession.setActionHandler('seekto', (d) => { if (state.ready) state.player.seekTo(d.seekTime, true); });
  }

  function updateMediaPosition(t, d) {
    if (!('mediaSession' in navigator)) return;
    try {
      navigator.mediaSession.setPositionState({ duration: d || 0, position: t, playbackRate: 1 });
    } catch (e) {}
  }

  /* ---------------- background playback ---------------- */

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) saveResume();
  });

  /* ---------------- horn ---------------- */

  let actx = null;
  let master = null;

  function getCtx() {
    if (!actx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      actx = new AC();
      master = actx.createGain();
      master.gain.value = 1;
      master.connect(actx.destination);
    }
    if (actx.state === 'suspended') actx.resume();
    return actx;
  }

  let hornTimer = 0;
  function honk() {
    const now = Date.now();
    if (now - hornTimer < 130) return;
    hornTimer = now;

    duck(true);

    const h = $('#hero-title');
    h.classList.remove('honk');
    void h.offsetWidth;
    h.classList.add('honk');
    setTimeout(() => h.classList.remove('honk'), 900);

    const btn = $('#horn');
    btn.classList.remove('honking');
    void btn.offsetWidth;
    btn.classList.add('honking');
    setTimeout(() => btn.classList.remove('honking'), 600);

    const ctx = getCtx();
    if (!ctx) return;

    const t = ctx.currentTime;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.5, t + 0.025);
    g.gain.setValueAtTime(0.5, t + 0.55);
    g.gain.linearRampToValueAtTime(0, t + 0.95);

    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(950, t);
    f.frequency.linearRampToValueAtTime(620, t + 0.6);

    const o1 = ctx.createOscillator();
    o1.type = 'sawtooth';
    o1.frequency.setValueAtTime(188, t);
    o1.frequency.exponentialRampToValueAtTime(148, t + 0.65);

    const o2 = ctx.createOscillator();
    o2.type = 'sawtooth';
    o2.frequency.setValueAtTime(283, t);
    o2.frequency.exponentialRampToValueAtTime(224, t + 0.65);

    const o3 = ctx.createOscillator();
    o3.type = 'square';
    o3.frequency.value = 94;

    const vib = ctx.createOscillator();
    vib.frequency.value = 7;
    const vibGain = ctx.createGain();
    vibGain.gain.value = 6;
    vib.connect(vibGain);
    vibGain.connect(o1.frequency);

    o1.connect(f); o2.connect(f); o3.connect(f);
    f.connect(g); g.connect(master);

    o1.start(t); o2.start(t); o3.start(t); vib.start(t);
    o1.stop(t + 1); o2.stop(t + 1); o3.stop(t + 1); vib.stop(t + 1);

    let dkTimer = 0;
    clearTimeout(dkTimer);
    dkTimer = setTimeout(() => duck(false), 1100);
  }

  function duck(on) {
    if (!state.ready) return;
    if (on) state.player.setVolume(Math.max(1, Math.round(state.vol * 0.22)));
    else state.player.setVolume(state.muted ? 0 : state.vol);
  }

  /* ---------------- toast ---------------- */

  let toastTimer = 0;
  function toast(msg) {
    const el = $('#toast');
    el.textContent = msg;
    el.classList.remove('show');
    void el.offsetWidth;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 900);
  }

  /* ---------------- queue ---------------- */

  function renderTracks() {
    const wrap = $('#tracks');
    wrap.innerHTML = '';
    TRACKS.forEach((t, i) => {
      const b = document.createElement('button');
      b.className = 'track';
      b.dataset.i = i;
      b.innerHTML =
        '<img class="track-art" src="' + thumb(t.id) + '" alt="" loading="lazy">' +
        '<span class="track-idx">' + toNep(pad2(i + 1)) + '</span>' +
        '<span class="track-meta"><span class="track-title"></span><span class="track-artist"></span></span>' +
        '<span class="track-eq" aria-hidden="true"><i></i><i></i><i></i></span>';
      b.querySelector('.track-title').textContent = t.title;
      b.querySelector('.track-artist').textContent = t.artist;
      b.addEventListener('click', () => { playIndex(i); });
      wrap.appendChild(b);
    });
  }

  function updateQueueActive() {
    const tracks = $('#tracks').children;
    for (let i = 0; i < tracks.length; i++) {
      const el = tracks[i];
      const active = i === state.index;
      el.classList.toggle('active', active);
      if (active) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }

  function setQueue(open) {
    state.queueOpen = open;
    $('#queue').classList.toggle('open', open);
    $('#queue').setAttribute('aria-hidden', String(!open));
    $('#queue-backdrop').classList.toggle('open', open);
  }

  /* ---------------- player ui ---------------- */

  function updateControls() {
    const t = TRACKS[state.index];
    $('#p-title').textContent = t.title;
    $('#p-artist').textContent = t.artist;
    $('#art-img').src = thumb(t.id);
    updateSeek();
    updateVolumeUI();
  }

  function updateSeek() {
    const pct = state.dur ? (state.time / state.dur) * 100 : 0;
    $('#seek').value = pct;
    $('#seek').style.setProperty('--fill', pct + '%');
    $('#t-cur').textContent = fmt(state.time);
    $('#t-dur').textContent = fmt(state.dur);
  }

  /* ---------------- ticket ---------------- */

  let ticketImg = null;

  async function openTicket() {
    const modal = $('#ticket-modal');
    modal.hidden = false;
    const canvas = $('#ticket-canvas');
    const t = TRACKS[state.index];
    if (!ticketImg || ticketImg.dataset.id !== t.id) {
      ticketImg = new Image();
      ticketImg.dataset.id = t.id;
      ticketImg.crossOrigin = 'anonymous';
      ticketImg.src = thumb(t.id);
      await new Promise((res) => { ticketImg.onload = res; ticketImg.onerror = res; setTimeout(res, 3000); });
    }
    try { await document.fonts.ready; } catch (e) {}
    drawTicket(canvas, t);
  }

  function closeTicket() { $('#ticket-modal').hidden = true; }

  function drawTicket(cv, t) {
    const ctx = cv.getContext('2d');
    const W = cv.width, H = cv.height;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#f4e4c4';
    ctx.fillRect(0, 0, W, H);

    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, 'rgba(178,70,40,.08)');
    grad.addColorStop(1, 'rgba(178,70,40,.16)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    ctx.strokeStyle = '#a1442f';
    ctx.lineWidth = 2.5;
    ctx.setLineDash([12, 9]);
    ctx.strokeRect(20, 20, W - 40, H - 40);
    ctx.setLineDash([]);

    const ink = '#5b2a1a';
    ctx.textAlign = 'center';
    ctx.fillStyle = ink;
    ctx.font = '800 34px "Noto Serif Devanagari", serif';
    ctx.fillText(SITE.brand, W / 2, 72);

    ctx.font = '600 15px "Noto Sans Devanagari", sans-serif';
    ctx.fillStyle = '#8a4a30';
    ctx.fillText(ROUTE.name + ' · ' + ROUTE.from + ' – ' + ROUTE.to, W / 2, 100);

    ctx.beginPath();
    ctx.moveTo(60, 122); ctx.lineTo(W - 60, 122);
    ctx.setLineDash([2, 6]);
    ctx.strokeStyle = 'rgba(90,42,26,.5)';
    ctx.stroke();
    ctx.setLineDash([]);

    if (ticketImg && ticketImg.naturalWidth) {
      const s = 118;
      ctx.save();
      roundRect(ctx, W - 200, 148, s, s, 10);
      ctx.clip();
      const srcS = Math.min(ticketImg.naturalWidth, ticketImg.naturalHeight);
      ctx.drawImage(ticketImg, (ticketImg.naturalWidth - srcS) / 2, (ticketImg.naturalHeight - srcS) / 2, srcS, srcS, W - 200, 148, s, s);
      ctx.restore();
      ctx.strokeStyle = 'rgba(90,42,26,.35)';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(W - 200, 148, s, s);
    }

    ctx.textAlign = 'left';
    ctx.fillStyle = '#7a3a22';
    ctx.font = '600 14px "Noto Sans Devanagari", sans-serif';
    ctx.fillText('गीत', 46, 170);
    ctx.fillStyle = ink;
    ctx.font = '700 24px "Noto Sans Devanagari", sans-serif';
    ctx.fillText(truncate(ctx, t.title, W - 320), 46, 198);

    ctx.fillStyle = '#7a3a22';
    ctx.font = '600 14px "Noto Sans Devanagari", sans-serif';
    ctx.fillText('कलाकार', 46, 234);
    ctx.fillStyle = ink;
    ctx.font = '600 18px "Noto Sans Devanagari", sans-serif';
    ctx.fillText(truncate(ctx, t.artist, W - 320), 46, 258);

    const now = new Date();
    const dateStr = toNep(now.getDate()) + ' ' + ['जनवरी', 'फेब्रुअरी', 'मार्च', 'अप्रिल', 'मे', 'जुन', 'जुलाई', 'अगस्ट', 'सेप्टेम्बर', 'अक्टोबर', 'नोभेम्बर', 'डिसेम्बर'][now.getMonth()] + ' ' + toNep(now.getFullYear());
    ctx.fillStyle = '#7a3a22';
    ctx.font = '600 14px "Noto Sans Devanagari", sans-serif';
    ctx.fillText('सिट ' + toNep(7 + (state.index % 20)) + '  ·  ' + dateStr, 46, 300);

    ctx.textAlign = 'center';
    ctx.fillStyle = '#a1442f';
    ctx.font = '800 22px "Noto Serif Devanagari", serif';
    ctx.fillText('यात्रा शुभ होस्', W / 2, 352);

    ctx.font = '500 13px "Noto Sans Devanagari", sans-serif';
    ctx.fillStyle = 'rgba(90,42,26,.65)';
    ctx.fillText(SITE.tagline, W / 2, 380);

    ctx.save();
    ctx.translate(W - 92, H - 60);
    ctx.rotate(-0.18);
    ctx.strokeStyle = 'rgba(179,32,58,.75)';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(0, 0, 26, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = 'rgba(179,32,58,.75)';
    ctx.font = '700 13px "Noto Sans Devanagari", sans-serif';
    ctx.fillText('टिकट', 0, 5);
    ctx.restore();
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function truncate(ctx, text, maxW) {
    if (ctx.measureText(text).width <= maxW) return text;
    let t = text;
    while (t.length > 1 && ctx.measureText(t + '…').width > maxW) t = t.slice(0, -1);
    return t + '…';
  }

  function downloadTicket() {
    const cv = $('#ticket-canvas');
    const a = document.createElement('a');
    a.href = cv.toDataURL('image/png');
    a.download = 'samjhana-ticket-' + TRACKS[state.index].id + '.png';
    a.click();
    toast('टिकट डाउनलोड भयो');
  }

  async function shareTicket() {
    const cv = $('#ticket-canvas');
    const blob = await new Promise((res) => cv.toBlob(res, 'image/png'));
    const file = new File([blob], 'samjhana-ticket.png', { type: 'image/png' });
    try {
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ title: SITE.brand, text: TRACKS[state.index].title, files: [file] });
      } else { downloadTicket(); }
    } catch (e) { if (e && e.name !== 'AbortError') downloadTicket(); }
  }

  /* ---------------- share ---------------- */

  async function shareSite() {
    const url = location.href;
    const data = {
      title: SITE.brand + ' — पुराना नेपाली गीतहरू',
      text: SITE.tagline + ' 🏔️',
      url: url
    };
    try {
      if (navigator.share) { await navigator.share(data); return; }
    } catch (e) { if (e && e.name === 'AbortError') return; }
    try { await navigator.clipboard.writeText(url); toast('लिङ्क कपी भयो'); } catch (e) { toast('सेयर गर्न सकिएन'); }
  }

  /* ---------------- keyboard ---------------- */

  function bindKeyboard() {
    window.addEventListener('keydown', (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const tag = (e.target.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || e.target.isContentEditable) return;

      switch (e.key) {
        case 'F8': case ' ': case 'k': case 'K':
          e.preventDefault();
          toggle();
          toast(state.playing ? 'रोकियो' : 'बज्दैछ');
          return;
        case 'F7': case 'p': case 'P': case '[':
          prev(); toast('अघिल्लो गीत'); return;
        case 'F9': case 'n': case 'N': case ']':
          next(); toast('अर्को गीत'); return;
        case 'ArrowLeft':
          e.preventDefault(); seekBy(-5); toast('−५ सेकेन्ड'); return;
        case 'ArrowRight':
          e.preventDefault(); seekBy(5); toast('+५ सेकेन्ड'); return;
        case 'j': case 'J':
          seekBy(-10); toast('−१० सेकेन्ड'); return;
        case 'l': case 'L':
          seekBy(10); toast('+१० सेकेन्ड'); return;
        case 'q': case 'Q':
          setQueue(!state.queueOpen);
          if (state.queueOpen) toast('गीतहरू');
          return;
        case 't': case 'T':
          openTicket(); return;
        case 'h': case 'H':
          if (e.repeat) return;
          honk(); toast('हर्न'); return;
        case '?':
          toggleHints(); return;
        case 'Escape':
          if ($('#ticket-modal').hidden === false) closeTicket();
          else if (state.queueOpen) setQueue(false);
          else if (!$('#hints').hidden) toggleHints();
          return;
        default:
          if (e.key >= '0' && e.key <= '9') {
            seekToRatio(Number(e.key) / 10);
            toast(toNep(e.key * 10) + '%');
          }
      }
    });
  }

  function toggleHints() {
    const h = $('#hints');
    h.hidden = !h.hidden;
  }

  /* ---------------- bindings ---------------- */

  function bindUI() {
    $('#horn').addEventListener('click', honk);

    $('#toggle').addEventListener('click', () => {
      toggle();
      toast(state.playing ? 'बज्दैछ' : 'रोकियो');
    });
    $('#prev').addEventListener('click', prev);
    $('#next').addEventListener('click', next);

    const seek = $('#seek');
    seek.addEventListener('input', () => {
      if (!state.ready || !state.dur) return;
      state.player.seekTo((Number(seek.value) / 100) * state.dur, true);
      $('#t-cur').textContent = fmt((Number(seek.value) / 100) * state.dur);
    });

    const vol = $('#volume');
    vol.addEventListener('input', () => setVolume(Number(vol.value)));
    $('#mute').addEventListener('click', toggleMute);

    $('#queue-close').addEventListener('click', () => setQueue(false));
    $('#queue-backdrop').addEventListener('click', () => setQueue(false));
    $('#share-btn').addEventListener('click', shareSite);
    $('#ticket-btn').addEventListener('click', openTicket);

    $('#ticket-close').addEventListener('click', closeTicket);
    $('#ticket-download').addEventListener('click', downloadTicket);
    $('#ticket-share').addEventListener('click', shareTicket);
    $('#hints-close').addEventListener('click', toggleHints);

    window.addEventListener('resize', buildFlags);
    window.addEventListener('beforeunload', saveResume);

    bindKeyboard();

    document.addEventListener('keydown', (e) => {
      if (e.key === ' ' && (e.target.tagName || '').toLowerCase() === 'button') e.preventDefault();
    });

    updateVolumeUI();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
