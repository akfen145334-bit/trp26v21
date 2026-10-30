/* Vize Kampı — tek sayfa çalışma uygulaması (vanilla JS, derleme gerektirmez) */
(function () {
  'use strict';
  window.COURSE_DATA = window.COURSE_DATA || {};
  const COURSES = window.COURSES || [];
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const app = $('#app');
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const stripHtml = h => {
    const d = document.createElement('div'); d.innerHTML = h; $$('figure,script,style,img', d).forEach(x => x.remove());
    // Liste, tablo hücresi ve başlıklardan sonra durak ekle; yoksa sesli okuma kelimeleri birbirine yapıştırır
    $$('li,td,th,p,h1,h2,h3,h4,div,br,.box > b:first-child,figcaption', d).forEach(x => x.insertAdjacentText('beforeend', '. '));
    return d.textContent.replace(/[→←]/g, ', ').replace(/\s*\.\s*(\.\s*)+/g, '. ').replace(/([:;!?])\s*\./g, '$1').replace(/\s+/g, ' ').trim();
  };

  /* ---------------- depolama ---------------- */
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { } }
  };
  let memProg = {};
  const user = {
    get name() { return store.get('vk_cur', null); },
    set name(v) { store.set('vk_cur', v); const l = this.list(); if (v && !l.includes(v)) { l.push(v); store.set('vk_users', l); } },
    list() { return store.get('vk_users', []); },
    key() { return 'vk_prog_' + (this.name || 'Misafir'); },
    prog() { const p = store.get(this.key(), null); if (p) return p; return memProg[this.key()] || (memProg[this.key()] = {}); },
    save(p) { memProg[this.key()] = p; store.set(this.key(), p); }
  };
  function cprog(cid) { const p = user.prog(); p[cid] = p[cid] || { q: {}, s: [] }; return p; }
  function record(cid, qid, ok) {
    const p = cprog(cid); const r = p[cid].q[qid] || { w: 0, r: 0 };
    ok ? r.r++ : r.w++; r.l = ok ? 1 : 0; r.t = Date.now(); p[cid].q[qid] = r; user.save(p);
  }
  function courseStats(cid, data) {
    const p = user.prog()[cid] || { q: {}, s: [] };
    const ids = Object.keys(p.q); let ok = 0, bad = 0;
    ids.forEach(id => p.q[id].l ? ok++ : bad++);
    const total = data ? (data.q.length + (data.pairs || []).length) : null;
    return { seen: ids.length, ok, bad, total, sessions: p.s || [], map: p.q };
  }
  function levelOf(pct) {
    if (pct >= 90) return 'Vizeye hazır 🎯'; if (pct >= 75) return 'Çok iyi'; if (pct >= 60) return 'İyi'; if (pct >= 40) return 'Orta — tekrar gerekli'; return 'Başlangıç — konuyu yeniden oku';
  }

  /* ---------------- ders verisi yükleme ---------------- */
  function loadCourse(id) {
    if (window.COURSE_DATA[id]) return Promise.resolve(window.COURSE_DATA[id]);
    const c = COURSES.find(x => x.id === id); if (!c) return Promise.reject(new Error('Ders bulunamadı'));
    return new Promise((res, rej) => {
      const s = document.createElement('script'); s.src = 'data/' + id + '.js?v=' + (window.DATA_VERSION || 1);
      s.onload = () => window.COURSE_DATA[id] ? res(prep(window.COURSE_DATA[id])) : rej(new Error('Veri okunamadı'));
      s.onerror = () => rej(new Error('Veri dosyası yüklenemedi'));
      document.head.appendChild(s);
    });
  }
  function prep(d) {
    if (d._prep) return d; d._prep = true;
    d.secMap = {}; d.sections.forEach(s => d.secMap[s.id] = s);
    d.qMap = {}; d.q.forEach(q => d.qMap[q.id] = q);
    (d.pairs || []).forEach(p => d.qMap[p.id] = Object.assign({ t: 'pair' }, p));
    return d;
  }

  /* ---------------- sesli okuma (Web Speech API) ---------------- */
  const tts = (function () {
    const synth = window.speechSynthesis;
    let queue = [], idx = 0, playing = false, paused = false, voice = null, title = '';
    let rate = parseFloat(store.get('vk_rate', 1)) || 1;
    let wakeLock = null, waiting = false, token = 0, lastTick = 0, retries = 0, unlocked = false, timer = null;
    const bar = $('#ttsbar');
    const MAXLEN = 160; // Chrome ~15 sn'den uzun cümlelerde sesi kesiyor; kısa parçalar güvenli

    function pickVoice() {
      if (!synth) return null; const vs = synth.getVoices() || [];
      const tr = vs.filter(v => /^tr([-_]|$)/i.test(v.lang));
      voice = tr.find(v => v.localService && /yelda|emel|cem|filiz|tolga/i.test(v.name)) || tr.find(v => v.localService) || tr.find(v => /google/i.test(v.name)) || tr[0] || null;
      return voice;
    }
    if (synth) { pickVoice(); if ('onvoiceschanged' in synth) synth.onvoiceschanged = pickVoice; else synth.addEventListener && synth.addEventListener('voiceschanged', pickVoice); }

    function hardSplit(p) { // noktası olmayan çok uzun parçaları virgül / boşluktan böl
      const out = []; let rest = p.trim();
      while (rest.length > MAXLEN) {
        let cut = Math.max(rest.lastIndexOf(', ', MAXLEN), rest.lastIndexOf(' – ', MAXLEN), rest.lastIndexOf(' - ', MAXLEN));
        if (cut < MAXLEN * 0.4) cut = rest.lastIndexOf(' ', MAXLEN);
        if (cut < 20) cut = MAXLEN;
        out.push(rest.slice(0, cut + 1).trim()); rest = rest.slice(cut + 1).trim();
      }
      if (rest) out.push(rest); return out;
    }
    function chunk(text) {
      const parts = text.replace(/\s+/g, ' ').match(/[^.!?…:;]+[.!?…:;]*\s*/g) || [text];
      const out = []; let cur = '';
      parts.forEach(p => {
        if (p.length > MAXLEN) { if (cur.trim()) out.push(cur.trim()); cur = ''; out.push(...hardSplit(p)); return; }
        if ((cur + p).length > MAXLEN) { if (cur.trim()) out.push(cur.trim()); cur = p; } else cur += p;
      });
      if (cur.trim()) out.push(cur.trim());
      return out.filter(x => /[\p{L}\p{N}]/u.test(x));
    }

    /* Okuma sürerken ekran açık kalsın (Screen Wake Lock) */
    async function lockScreen() {
      try { if ('wakeLock' in navigator && !wakeLock && document.visibilityState === 'visible') { wakeLock = await navigator.wakeLock.request('screen'); wakeLock.addEventListener('release', () => { wakeLock = null; updateBar(); }); } } catch (e) { wakeLock = null; }
      updateBar();
    }
    function unlockScreen() { try { if (wakeLock) wakeLock.release(); } catch (e) { } wakeLock = null; }

    function msg(t) { const el = $('#ttstitle'); if (el) el.textContent = t; }
    function updateBar() {
      const p = $('#ttsprog'); if (p) p.textContent = queue.length ? `${Math.min(idx + 1, queue.length)}/${queue.length}` : '';
      const l = $('#ttslock'); if (l) l.classList.toggle('hidden', !wakeLock);
      const b = $('#ttsPause'); if (b) b.textContent = paused ? '▶' : '⏸';
    }
    function later(fn, ms) { clearTimeout(timer); timer = setTimeout(fn, ms); }

    function speakCurrent() {
      clearTimeout(timer);
      if (!playing || paused) return;
      if (idx >= queue.length) { stop(); return; }
      const my = ++token;
      const u = new SpeechSynthesisUtterance(queue[idx]);
      u.lang = (voice && voice.lang) || 'tr-TR'; if (voice) u.voice = voice; u.rate = rate; u.pitch = 1; u.volume = 1;
      u.onstart = () => { if (my === token) { lastTick = Date.now(); retries = 0; } };
      u.onboundary = () => { if (my === token) lastTick = Date.now(); };
      u.onend = () => {
        if (my !== token || !playing || paused) return;
        lastTick = Date.now(); idx++; updateBar();
        // Ekran kilitliyken zamanlayıcılar yavaşlar: bir sonraki cümleyi hemen başlat
        if (document.visibilityState === 'hidden') speakCurrent(); else later(speakCurrent, 30);
      };
      u.onerror = e => {
        if (my !== token || !playing || paused) return;
        const er = (e && e.error) || '';
        if (er === 'not-allowed') { msg('Sesli okuma için önce ekrana dokun, sonra ▶'); paused = true; updateBar(); return; }
        if (er === 'interrupted' || er === 'canceled' || er === 'audio-busy') {
          // Sistem kesti (ekran kilidi, gelen bildirim vb.): aynı cümleyi tekrar dene
          if (document.visibilityState === 'hidden') { waiting = true; return; }
          if (++retries <= 3) { later(speakCurrent, 400); return; }
        }
        if ((er === 'voice-unavailable' || er === 'language-unavailable' || er === 'synthesis-failed') && voice) { voice = null; later(speakCurrent, 100); return; }
        retries = 0; idx++; later(speakCurrent, 100);
      };
      lastTick = Date.now(); updateBar();
      try { if (synth.paused) synth.resume(); synth.speak(u); } catch (e) { later(speakCurrent, 500); }
    }
    function play(t, text) {
      if (!synth || typeof SpeechSynthesisUtterance === 'undefined') { alert('Bu tarayıcı sesli okumayı desteklemiyor. Chrome, Edge veya Safari kullan.'); return; }
      const wasBusy = synth.speaking || synth.pending;
      token++; clearTimeout(timer); synth.cancel();
      title = t; queue = chunk(text); idx = 0; playing = true; paused = false; waiting = false; retries = 0;
      if (!queue.length) { stop(); return; }
      msg(t); bar.classList.remove('hidden');
      if (!voice) pickVoice();
      lockScreen();
      // iOS / Safari: ilk konuşma mutlaka dokunma anında başlamalı
      if (!unlocked) { try { const w = new SpeechSynthesisUtterance(' '); w.volume = 0; synth.speak(w); } catch (e) { } unlocked = true; }
      // Chrome: cancel() hemen ardından gelen speak() bazen sessiz kalıyor; kısa bekle
      if (wasBusy) later(speakCurrent, 150); else speakCurrent();
    }
    function stop() {
      playing = false; paused = false; waiting = false; queue = []; token++; clearTimeout(timer);
      try { synth && synth.cancel(); } catch (e) { }
      bar.classList.add('hidden'); unlockScreen();
    }
    function toggle() {
      if (!playing) return;
      if (!paused) { paused = true; token++; clearTimeout(timer); synth.cancel(); }
      else { paused = false; lockScreen(); msg(title); later(speakCurrent, 120); }
      updateBar();
    }
    function skip(d) { if (!playing) return; token++; synth.cancel(); idx = Math.max(0, Math.min(queue.length - 1, idx + d)); paused = false; retries = 0; later(speakCurrent, 150); }
    function resumeIfNeeded() {
      if (!playing || paused || document.visibilityState !== 'visible') return;
      lockScreen();
      if (waiting || (!synth.speaking && !synth.pending)) { waiting = false; token++; synth.cancel(); later(speakCurrent, 250); }
      else if (synth.paused) { try { synth.resume(); } catch (e) { } }
    }
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') resumeIfNeeded(); });
    window.addEventListener('pageshow', resumeIfNeeded);
    window.addEventListener('focus', resumeIfNeeded);
    // Bekçi: tarayıcı sessizce takılırsa (olay gelmezse) kaldığı cümleden sürdür
    setInterval(() => {
      if (!playing || paused || document.visibilityState !== 'visible') return;
      if (synth.paused && synth.speaking) { try { synth.resume(); } catch (e) { } }
      if (!synth.speaking && !synth.pending && Date.now() - lastTick > 5000) { token++; speakCurrent(); }
    }, 2500);

    $('#ttsStop').onclick = stop; $('#ttsPause').onclick = toggle;
    $('#ttsPrev').onclick = () => skip(-1); $('#ttsNext').onclick = () => skip(1);
    const rs = $('#ttsRate'); rs.value = String(rate); if (!rs.value) { rate = 1; rs.value = '1'; }
    rs.onchange = e => { rate = parseFloat(e.target.value) || 1; store.set('vk_rate', rate); if (playing && !paused) { token++; synth.cancel(); later(speakCurrent, 150); } };
    return { play, stop, get playing() { return playing; }, _chunk: chunk };
  })();
  window.__tts = tts; window.__strip = stripHtml;

  /* ---------------- kullanıcı girişi ---------------- */
  function renderUserChip() { $('#userchip').textContent = '👤 ' + (user.name || 'Giriş yap'); }
  function loginModal(force) {
    const m = $('#modal'); const list = user.list().filter(n => n !== 'Misafir');
    m.innerHTML = `<div class="card">
      <h2>Kimsin? 👋</h2>
      <p class="muted small">Adınla girersen eksiklerin <b>ders ders</b> bu cihazda adına kaydedilir. Misafir olarak da çalışabilirsin.</p>
      ${list.length ? `<div class="userlist">${list.map(n => `<button class="btn" data-u="${esc(n)}">👤 ${esc(n)}</button>`).join('')}</div>` : ''}
      <form id="lf" class="row" style="margin-top:8px"><input type="text" id="lname" placeholder="Adın Soyadın" maxlength="40" style="flex:1" autocomplete="name"><button class="btn primary">Giriş</button></form>
      <div class="row" style="margin-top:12px;justify-content:space-between">
        <button class="btn ghost" id="guest">Misafir olarak devam et</button>
        ${force ? '' : '<button class="btn ghost" id="mclose">Kapat</button>'}
      </div></div>`;
    m.classList.remove('hidden');
    const done = n => { user.name = n; m.classList.add('hidden'); renderUserChip(); route(); };
    $$('[data-u]', m).forEach(b => b.onclick = () => done(b.dataset.u));
    $('#lf', m).onsubmit = e => { e.preventDefault(); const v = $('#lname', m).value.trim(); if (v) done(v); };
    $('#guest', m).onclick = () => done('Misafir');
    const c = $('#mclose', m); if (c) c.onclick = () => m.classList.add('hidden');
    setTimeout(() => { const i = $('#lname', m); if (i) i.focus(); }, 50);
  }
  $('#userchip').onclick = () => loginModal(false);

  /* lightbox */
  const lb = $('#lightbox');
  document.addEventListener('click', e => {
    const im = e.target.closest('img[data-zoom]');
    if (im) { $('img', lb).src = im.src; $('p', lb).textContent = im.dataset.zoom || im.alt || ''; lb.classList.remove('hidden'); }
  });
  lb.onclick = () => lb.classList.add('hidden');

  /* ---------------- router ---------------- */
  function setNav(n) { $$('.topnav a').forEach(a => a.classList.toggle('on', a.dataset.nav === n)); }
  function route() {
    const h = location.hash.replace(/^#\/?/, ''); const [path, qs] = h.split('?'); const parts = path.split('/').filter(Boolean);
    const params = new URLSearchParams(qs || '');
    window.scrollTo(0, 0);
    if (!user.name) { loginModal(true); }
    renderUserChip();
    if (!parts.length) return viewHome();
    if (parts[0] === 'eksikler') return viewAllWeak();
    if (parts[0] === 'ders' && parts[1]) return viewCourse(parts[1], parts[2] || 'konu', params);
    if (parts[0] === 'yazdir' && parts[1]) return viewPrint(parts[1]);
    viewHome();
  }
  window.addEventListener('hashchange', route);
  document.addEventListener('click', e => { const a = e.target.closest('a[href^="#"]'); if (a && a.getAttribute('href') === location.hash && !a.dataset.jump) { e.preventDefault(); route(); } });

  /* ---------------- ana sayfa ---------------- */
  function viewHome() {
    setNav('home');
    const p = user.prog();
    app.innerHTML = `<section class="hero">
      <h1>Vizeye birlikte hazırlanalım</h1>
      <p>Her derste konu anlatımı tek bir akıcı notta toplandı. Dinle, test çöz, eşleştir, görselleri tanı — yanlışların <b>ders ders</b> kaydedilsin, sonra sadece eksiklerine çalış.</p>
    </section>
    <div class="courses">${COURSES.map(c => {
      const cp = p[c.id] || { q: {} }; const ids = Object.keys(cp.q); const ok = ids.filter(i => cp.q[i].l).length;
      const pct = ids.length ? Math.round(ok / ids.length * 100) : 0;
      return `<a class="ccard" href="#/ders/${c.id}" style="--c:${c.color}">
        <span class="emo">${c.emoji}</span><h3>${esc(c.title)}</h3>
        <span class="meta">${esc(c.desc)}</span>
        <div class="bar"><i style="width:${pct}%"></i></div>
        <span class="meta">${ids.length ? `${ids.length} soru çözüldü · %${pct} doğru · ${ids.length - ok} eksik` : 'Henüz başlanmadı'}</span>
      </a>`;
    }).join('')}</div>
    <p class="muted small" style="margin-top:22px">İlerlemen bu tarayıcıda saklanır. Başka cihaza taşımak için <a href="#/eksikler">Eksiklerim</a> sayfasındaki dışa/içe aktar düğmelerini kullan.</p>`;
  }

  /* ---------------- ders sayfası ---------------- */
  async function viewCourse(id, tab, params) {
    setNav('');
    const meta = COURSES.find(c => c.id === id);
    if (!meta) return viewHome();
    app.innerHTML = `<p class="muted">Yükleniyor…</p>`;
    let d; try { d = await loadCourse(id); } catch (e) { app.innerHTML = `<div class="card">Ders yüklenemedi: ${esc(e.message)}</div>`; return; }
    const st = courseStats(id, d);
    const tabs = [['konu', '📖 Konu Anlatımı'], ['test', '✍️ Test Çöz'], ['gorsel', '🖼️ Görseller'], ['eksik', `🎯 Eksiklerim${st.bad ? ' (' + st.bad + ')' : ''}`], ['kaynak', '📂 Kaynaklar']];
    app.style.setProperty('--c', meta.color);
    app.innerHTML = `<div class="chead"><span class="emo">${meta.emoji}</span><div><h1>${esc(meta.title)}</h1><p>${esc(meta.desc)}</p>
      <p class="small">${d.q.length} soru · ${(d.pairs || []).length} eşleştirme kartı · ${d.sections.length} konu${st.seen ? ` · Çözülen: ${st.seen} (%${Math.round(st.ok / st.seen * 100)} doğru)` : ''}</p></div></div>
      <nav class="tabs">${tabs.map(([k, l]) => `<a href="#/ders/${id}/${k}" class="${k === tab ? 'on' : ''}">${l}</a>`).join('')}</nav>
      <div id="tab"></div>`;
    const el = $('#tab');
    if (tab === 'konu') return tabNotes(el, d, meta, params);
    if (tab === 'test') return tabTest(el, d, meta, params);
    if (tab === 'gorsel') return tabGallery(el, d, meta);
    if (tab === 'eksik') return tabWeak(el, d, meta);
    if (tab === 'kaynak') return tabSources(el, d, meta);
  }

  function weakBySection(d, cid) {
    const st = courseStats(cid, d); const res = {};
    d.sections.forEach(s => res[s.id] = { ok: 0, bad: 0 });
    Object.keys(st.map).forEach(qid => { const q = d.qMap[qid]; if (!q) return; const s = res[q.s] || (res[q.s] = { ok: 0, bad: 0 }); st.map[qid].l ? s.ok++ : s.bad++; });
    return res;
  }

  function tabNotes(el, d, meta, params) {
    const ws = weakBySection(d, meta.id);
    el.innerHTML = `<div class="notes-layout">
      <div class="toc-wrap"><div class="card toc"><b>İçindekiler</b>
        ${d.sections.map((s, i) => `<a href="#/ders/${meta.id}/konu?s=${s.id}" data-jump="${s.id}">${i + 1}. ${esc(s.t)}${ws[s.id] && ws[s.id].bad ? `<span class="w" title="eksik soru">${ws[s.id].bad}</span>` : ''}</a>`).join('')}
        <div style="margin-top:10px" class="row"><button class="btn sm" id="readAll">🔊 Tümünü dinle</button></div></div></div>
      <div>${d.sections.map((s, i) => `<article class="card section" id="sec-${s.id}">
        <div class="shead"><h2>${i + 1}. ${esc(s.t)}</h2>
          <div class="row"><button class="btn sm" data-read="${s.id}">🔊 Dinle</button>
          <a class="btn sm" href="#/ders/${meta.id}/test?s=${s.id}">✍️ Bu konudan test</a></div></div>
        <div class="prose">${s.h}</div></article>`).join('')}</div></div>`;
    $$('[data-read]', el).forEach(b => b.onclick = () => { const s = d.secMap[b.dataset.read]; tts.play(s.t, s.t + '. ' + stripHtml(s.h)); });
    $('#readAll', el).onclick = () => tts.play(meta.title + ' — tüm konular', d.sections.map(s => s.t + '. ' + stripHtml(s.h)).join(' '));
    $$('[data-jump]', el).forEach(a => a.onclick = e => { e.preventDefault(); const t = $('#sec-' + a.dataset.jump); if (t) t.scrollIntoView({ behavior: 'smooth' }); });
    $$('.prose img', el).forEach(im => im.setAttribute('data-zoom', im.alt || ''));
    const s = params.get('s'); if (s) setTimeout(() => { const t = $('#sec-' + s); if (t) t.scrollIntoView(); }, 30);
  }

  function tabSources(el, d, meta) {
    el.innerHTML = `<div class="card"><h2>Bu dersin kaynakları</h2>
      <p class="muted small">Konu anlatımı ve sorular aşağıdaki dosyalardan derlendi. Asıl dosyalara Drive klasöründen ulaşabilirsin.</p>
      <ul class="sources">${(d.sources || []).map(s => `<li>${s.u ? `<a href="${esc(s.u)}" target="_blank" rel="noopener">${esc(s.t)}</a>` : esc(s.t)}</li>`).join('')}</ul>
      ${meta.drive ? `<p><a class="btn" href="${esc(meta.drive)}" target="_blank" rel="noopener">📂 Drive klasörünü aç</a></p>` : ''}</div>`;
  }

  function galleryItems(d) {
    const g = (d.gallery || []).slice(); const seen = new Set(g.map(x => x.img));
    d.q.forEach(q => { if (q.t !== 'img' || !q.info || seen.has(q.img)) return; seen.add(q.img); g.push({ img: q.img, title: q.title || q.o[q.a], info: q.info }); });
    return g;
  }
  function tabGallery(el, d, meta) {
    const g = galleryItems(d);
    if (!g.length) { el.innerHTML = `<div class="card">Bu derste görsel yok.</div>`; return; }
    el.innerHTML = `<p class="muted">Görsellere dokunarak büyüt. Görsel sorularını çözmek için <a href="#/ders/${meta.id}/test?m=img">Resim Soruları</a> modunu seç.</p>
      <div class="gallery">${g.map(x => `<div class="gitem"><img loading="lazy" src="${esc(x.img)}" alt="${esc(x.title)}" data-zoom="${esc(x.title + ' — ' + x.info)}"><div><b>${esc(x.title)}</b><br><span class="muted">${esc(x.info)}</span></div></div>`).join('')}</div>`;
  }

  /* ---------------- test motoru ---------------- */
  const MODES = [
    ['mix', 'Karışık Deneme', 'Her türden soru + eşleştirme'],
    ['mc', 'Çoktan Seçmeli', 'Klasik test'],
    ['tf', 'Doğru / Yanlış', 'Hızlı kontrol'],
    ['fill', 'Boşluk Doldurma', 'Cevabı kendin yaz'],
    ['match', 'Eşleştirme', 'Kavram ↔ tanım'],
    ['img', 'Resim Soruları', 'Ne anlatıyor, nerede, kimin eseri?'],
    ['weak', 'Yanlışlarımı Tekrar', 'Sadece eksik soruların']
  ];
  function tabTest(el, d, meta, params) {
    const st = courseStats(meta.id, d); const seen = id => !!st.map[id];
    const poolOf = t => t === 'match' ? (d.pairs || []) : t === 'mix' ? d.q : d.q.filter(q => q.t === t);
    const cnt = t => t === 'weak' ? st.bad : poolOf(t).length;
    const fresh = t => t === 'weak' ? st.bad : poolOf(t).filter(q => !seen(q.id)).length;
    let mode = params.get('m') || 'mix'; let sec = params.get('s') || '';
    const avail = MODES.filter(m => cnt(m[0]) > 0 || m[0] === 'weak');
    if (!avail.find(m => m[0] === mode)) mode = 'mix';
    const totalAll = d.q.length + (d.pairs || []).length; const seenAll = Object.keys(st.map).filter(id => d.qMap[id]).length;
    el.innerHTML = `<div class="card"><h2>Test ayarları</h2>
      <p class="muted small" style="margin-top:-4px">${esc(user.name || 'Misafir')}: bu dersteki ${totalAll} sorunun <b>${seenAll}</b> tanesini çözdün (${st.ok} doğru, ${st.bad} yanlış). Çözdüğün sorular tekrar sorulmaz; her testte <b>henüz sorulmamış</b> sorular gelir.</p>
      <div class="modes">${avail.map(([k, t, s]) => `<button class="mode ${k === mode ? 'on' : ''}" data-m="${k}"><b>${t}</b><span>${s} · ${k === 'weak' ? cnt(k) + ' soru' : fresh(k) + ' yeni / ' + cnt(k)}</span></button>`).join('')}</div>
      <div class="row" style="margin-top:14px">
        <label>Konu: <select id="sec"><option value="">Tüm konular</option>${d.sections.map(s => `<option value="${s.id}" ${s.id === sec ? 'selected' : ''}>${esc(s.t)}</option>`).join('')}</select></label>
        <label>Soru sayısı: <select id="n"><option>10</option><option selected>20</option><option>30</option><option>50</option><option value="9999">Tümü</option></select></label>
        <label class="small"><input type="checkbox" id="rep"> Çözdüklerimi de sor (tekrar)</label>
        <button class="btn primary" id="go">Başla ▶</button>
      </div></div>`;
    $$('.mode', el).forEach(b => b.onclick = () => { mode = b.dataset.m; $$('.mode', el).forEach(x => x.classList.toggle('on', x === b)); });
    $('#go', el).onclick = () => startQuiz(el, d, meta, mode, $('#sec', el).value, parseInt($('#n', el).value, 10), $('#rep', el).checked);
    if (params.get('auto')) startQuiz(el, d, meta, mode, sec, 20, params.get('rep') === '1');
  }

  function buildSet(d, meta, mode, sec, n, rep) {
    const st = courseStats(meta.id, d);
    const unseen = q => rep || !st.map[q.id];
    let pool = d.q.filter(q => (!sec || q.s === sec) && unseen(q));
    let pairs = (d.pairs || []).filter(p => (!sec || p.s === sec) && unseen(p));
    let items = [];
    const mkMatch = (src) => { const out = []; const sh = shuffle(src); for (let i = 0; i + 3 <= sh.length && out.length < Math.ceil(n / 1); i += 5) out.push({ t: 'match', pairs: sh.slice(i, i + 5) }); return out; };
    if (mode === 'weak') {
      const weakIds = Object.keys(st.map).filter(id => !st.map[id].l);
      const wq = weakIds.map(id => d.qMap[id]).filter(q => q && (!sec || q.s === sec));
      items = shuffle(wq.filter(q => q.t !== 'pair')).slice(0, n);
      const wp = wq.filter(q => q.t === 'pair'); if (wp.length) { const extra = shuffle(pairs.filter(p => !wp.includes(p))).slice(0, Math.max(0, 5 - wp.length)); items.push(...mkMatch(wp.concat(extra)).slice(0, 2)); }
      return items;
    }
    if (mode === 'match') return mkMatch(pairs).slice(0, Math.max(1, Math.ceil(n / 5)));
    if (mode === 'mix') {
      items = shuffle(pool).slice(0, n);
      const m = mkMatch(pairs).slice(0, Math.max(1, Math.floor(n / 10))); m.forEach((x, i) => items.splice(Math.min(items.length, (i + 1) * 8), 0, x));
      return items;
    }
    return shuffle(pool.filter(q => q.t === mode)).slice(0, n);
  }

  function startQuiz(el, d, meta, mode, sec, n, rep) {
    tts.stop();
    const items = buildSet(d, meta, mode, sec, n, rep);
    if (!items.length) {
      const back = new URLSearchParams('m=' + mode + (sec ? '&s=' + sec : ''));
      if (mode === 'weak') { el.innerHTML = `<div class="card"><h2>Eksiğin yok 🎉</h2><p class="muted">Bu seçimde yanlış yaptığın soru kalmadı.</p><a class="btn" href="#/ders/${meta.id}/test">Geri</a></div>`; return; }
      el.innerHTML = `<div class="card"><h2>Bu bölümdeki bütün soruları çözdün 🎉</h2>
        <p class="muted">Seçtiğin türde ve konuda sana henüz sorulmamış soru kalmadı. Doğruların ve yanlışların kayıtlı.</p>
        <div class="row"><a class="btn primary" href="#/ders/${meta.id}/test?m=weak&auto=1">🔁 Yanlışlarımı çöz</a><button class="btn" id="again2">Çözdüklerimle tekrar et</button><a class="btn ghost" href="#/ders/${meta.id}/test">Başka tür / konu seç</a></div></div>`;
      $('#again2', el).onclick = () => startQuiz(el, d, meta, mode, sec, n, true);
      return;
    }
    let i = 0, score = 0, max = 0; const secRes = {};
    const mark = (q, ok) => { record(meta.id, q.id, ok); max++; if (ok) score++; const s = secRes[q.s] = secRes[q.s] || { ok: 0, n: 0 }; s.n++; if (ok) s.ok++; };
    function head() { return `<div class="qtop"><span>Soru ${i + 1} / ${items.length}</span><span>✅ ${score} / ${max}</span><button class="btn sm ghost" id="quit">Bitir</button></div><div class="bar" style="margin-bottom:16px"><i style="width:${i / items.length * 100}%"></i></div>`; }
    function nextBtn() { return `<div class="row" style="margin-top:14px;justify-content:flex-end"><button class="btn primary" id="next">${i + 1 < items.length ? 'Sonraki →' : 'Sonuçları gör'}</button></div>`; }
    function wire() { const q = $('#quit', el); if (q) q.onclick = finish; }
    function bindNext() { const b = $('#next', el); if (b) { b.onclick = () => { i++; i < items.length ? show() : finish(); }; b.focus(); } }
    function fb(ok, q, extra) {
      const sec = d.secMap[q.s];
      return `<div class="fb ${ok ? 'ok' : 'bad'}"><b>${ok ? 'Doğru! 🎉' : 'Yanlış'}</b>${extra || ''}${q.e ? `<div class="exp">${esc(q.e)}</div>` : ''}${q.info ? `<div class="exp">ℹ️ ${esc(q.info)}</div>` : ''}${sec ? `<div class="exp small">Konu: <a href="#/ders/${meta.id}/konu?s=${sec.id}">${esc(sec.t)}</a></div>` : ''}</div>`;
    }
    function show() {
      const q = items[i];
      if (q.t === 'match') return showMatch(q);
      let body = '';
      const qimg = q.img ? `<img class="qimg" src="${esc(q.img)}" alt="Soru görseli" data-zoom="">` : '';
      if (q.t === 'mc' || q.t === 'img') {
        const order = shuffle(q.o.map((_, k) => k));
        body = `<div class="opts">${order.map((k, j) => `<button class="opt" data-k="${k}"><span class="k">${'ABCDE'[j]}</span><span>${esc(q.o[k])}</span></button>`).join('')}</div>`;
      } else if (q.t === 'tf') {
        body = `<div class="tfrow"><button class="opt" data-tf="1">✔ Doğru</button><button class="opt" data-tf="0">✘ Yanlış</button></div>`;
      } else if (q.t === 'fill') {
        body = `<form class="fillin" id="ff"><input type="text" id="fa" placeholder="Cevabını yaz…" autocomplete="off"><button class="btn primary">Kontrol et</button></form>
          <div class="row" style="margin-top:8px"><button class="btn sm ghost" id="hint">💡 İpucu</button><button class="btn sm ghost" id="choices">🔤 Şıkları göster</button><button class="btn sm ghost" id="giveup">Bilmiyorum</button></div><div id="hintbox" class="small muted"></div><div id="chbox"></div>`;
      }
      const label = q.t === 'img' ? '🖼️ Resim sorusu' : q.t === 'tf' ? 'Doğru mu, yanlış mı?' : q.t === 'fill' ? 'Boşluğu doldur' : '';
      el.innerHTML = `<div class="qwrap card">${head()}${label ? `<span class="pill">${label}</span>` : ''}${qimg}<div class="qtext">${esc(q.q).replace(/_{3,}/g, '<span style="border-bottom:2px solid currentColor;padding:0 30px"></span>')}</div>${body}<div id="fbx"></div></div>`;
      wire();
      if (q.t === 'mc' || q.t === 'img') {
        $$('.opt', el).forEach(b => b.onclick = () => {
          const k = +b.dataset.k; const ok = k === q.a; mark(q, ok);
          $$('.opt', el).forEach(x => { x.disabled = true; if (+x.dataset.k === q.a) x.classList.add('ok'); });
          if (!ok) b.classList.add('bad');
          $('#fbx', el).innerHTML = fb(ok, q, ok ? '' : ` — Doğru cevap: <b>${esc(q.o[q.a])}</b>`) + nextBtn(); bindNext();
        });
      } else if (q.t === 'tf') {
        $$('.opt', el).forEach(b => b.onclick = () => {
          const v = b.dataset.tf === '1'; const ok = v === !!q.a; mark(q, ok);
          $$('.opt', el).forEach(x => { x.disabled = true; if ((x.dataset.tf === '1') === !!q.a) x.classList.add('ok'); });
          if (!ok) b.classList.add('bad');
          $('#fbx', el).innerHTML = fb(ok, q, ` — Cevap: <b>${q.a ? 'Doğru' : 'Yanlış'}</b>`) + nextBtn(); bindNext();
        });
      } else if (q.t === 'fill') {
        const finishFill = (ok, given) => {
          mark(q, ok); $('#ff', el).querySelectorAll('input,button').forEach(x => x.disabled = true); $$('#hint,#choices,#giveup', el).forEach(x => x.disabled = true);
          $$('#chbox .opt', el).forEach(x => x.disabled = true);
          $('#fbx', el).innerHTML = fb(ok, q, ` — Cevap: <b>${esc(q.a)}</b>${given && !ok ? ` <span class="small">(senin cevabın: ${esc(given)})</span>` : ''}`) + nextBtn(); bindNext();
        };
        $('#ff', el).onsubmit = e => { e.preventDefault(); const v = $('#fa', el).value.trim(); if (!v) return; finishFill(fillOk(v, q.a), v); };
        $('#hint', el).onclick = () => { const a = q.a; $('#hintbox', el).textContent = `İlk harf: “${a.charAt(0).toLocaleUpperCase('tr')}” · ${a.replace(/[^\s]/g, '•').length} karakter`; };
        $('#giveup', el).onclick = () => finishFill(false, '');
        $('#choices', el).onclick = () => {
          const others = shuffle(d.q.filter(x => x.t === 'fill' && x.a !== q.a && x.s === q.s).map(x => x.a).concat(shuffle(d.q.filter(x => x.t === 'fill' && x.a !== q.a).map(x => x.a))));
          const opts = shuffle([q.a].concat([...new Set(others)].slice(0, 3)));
          $('#chbox', el).innerHTML = `<div class="opts" style="margin-top:10px">${opts.map(o => `<button class="opt" data-v="${esc(o)}"><span>${esc(o)}</span></button>`).join('')}</div>`;
          $$('#chbox .opt', el).forEach(b => b.onclick = () => { const ok = b.dataset.v === q.a; $$('#chbox .opt', el).forEach(x => { if (x.dataset.v === q.a) x.classList.add('ok'); }); if (!ok) b.classList.add('bad'); finishFill(ok, b.dataset.v); });
          $('#choices', el).disabled = true;
        };
        setTimeout(() => { const f = $('#fa', el); if (f) f.focus(); }, 30);
      }
    }
    function showMatch(m) {
      const left = shuffle(m.pairs), right = shuffle(m.pairs); let sel = null, done = 0; const tried = new Set();
      el.innerHTML = `<div class="qwrap card">${head()}<span class="pill">🔗 Eşleştirme</span><div class="qtext">Soldaki kavramı seç, sonra sağdaki doğru açıklamaya dokun.</div>
        <div class="match"><div class="col">${left.map(p => `<button class="mi" data-l="${p.id}">${esc(p.a)}</button>`).join('')}</div>
        <div class="col">${right.map(p => `<button class="mi" data-r="${p.id}">${esc(p.b)}</button>`).join('')}</div></div><div id="fbx"></div></div>`;
      wire();
      $$('[data-l]', el).forEach(b => b.onclick = () => { if (b.classList.contains('done')) return; $$('[data-l]', el).forEach(x => x.classList.remove('sel')); b.classList.add('sel'); sel = b.dataset.l; });
      $$('[data-r]', el).forEach(b => b.onclick = () => {
        if (!sel || b.classList.contains('done')) return;
        const p = m.pairs.find(x => x.id === sel);
        if (b.dataset.r === sel) {
          if (!tried.has(sel)) mark(Object.assign({ s: p.s }, p), true);
          $$(`[data-l="${sel}"],[data-r="${sel}"]`, el).forEach(x => { x.classList.remove('sel'); x.classList.add('done'); x.disabled = true; });
          sel = null; done++;
          if (done === m.pairs.length) { $('#fbx', el).innerHTML = `<div class="fb ok"><b>Tüm eşleşmeler tamam!</b></div>` + nextBtn(); bindNext(); }
        } else {
          if (!tried.has(sel)) { tried.add(sel); mark(Object.assign({ s: p.s }, p), false); }
          b.classList.add('err'); setTimeout(() => b.classList.remove('err'), 350);
        }
      });
    }
    function finish() {
      const pct = max ? Math.round(score / max * 100) : 0;
      const p = cprog(meta.id); p[meta.id].s.push({ d: Date.now(), m: mode, sc: score, n: max }); p[meta.id].s = p[meta.id].s.slice(-30); user.save(p);
      const rows = Object.keys(secRes).map(k => ({ s: d.secMap[k], ...secRes[k] })).filter(x => x.s).sort((a, b) => a.ok / a.n - b.ok / b.n);
      el.innerHTML = `<div class="card result qwrap"><p class="muted">Sonuç</p><p class="big">%${pct}</p><p>${score} / ${max} doğru · <span class="level">${levelOf(pct)}</span></p>
        ${rows.length ? `<div style="text-align:left;margin-top:14px"><h3>Konu bazında</h3>${rows.map(r => `<div class="topicrow"><a href="#/ders/${meta.id}/konu?s=${r.s.id}">${esc(r.s.t)}</a><div class="bar"><i style="width:${r.ok / r.n * 100}%;background:${r.ok / r.n < .6 ? 'var(--bad)' : 'var(--ok)'}"></i></div><span class="small">${r.ok}/${r.n}</span></div>`).join('')}</div>` : ''}
        <div class="row" style="justify-content:center;margin-top:18px"><button class="btn primary" id="again">Yeni test</button><a class="btn" href="#/ders/${meta.id}/eksik">🎯 Eksiklerime git</a></div></div>`;
      $('#again', el).onclick = () => tabTest(el, d, meta, new URLSearchParams('m=' + mode + (sec ? '&s=' + sec : '')));
    }
    show();
  }

  function norm(s) { return s.toLocaleLowerCase('tr').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ı/g, 'i').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim(); }
  function lev(a, b) { const m = a.length, n = b.length; if (!m) return n; if (!n) return m; let p = Array.from({ length: n + 1 }, (_, j) => j); for (let i = 1; i <= m; i++) { const c = [i]; for (let j = 1; j <= n; j++) c[j] = Math.min(p[j] + 1, c[j - 1] + 1, p[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); p = c; } return p[n]; }
  function fillOk(given, answer) {
    const g = norm(given); if (!g) return false;
    const cands = new Set([answer]);
    answer.split(/\s*[\/;]\s*|\s+veya\s+|\s*,\s*/).forEach(x => cands.add(x));
    const noPar = answer.replace(/\([^)]*\)/g, ''); cands.add(noPar); noPar.split(/\s*[\/;,]\s*/).forEach(x => cands.add(x));
    (answer.match(/\(([^)]*)\)/g) || []).forEach(x => cands.add(x.slice(1, -1)));
    for (const c of cands) { const n = norm(c); if (!n || n.length < 2) continue; if (g === n) return true; const dist = lev(g, n); if (dist / Math.max(n.length, 1) <= 0.2) return true; if (n.length >= 5 && (g.includes(n))) return true; }
    return false;
  }

  /* ---------------- eksikler ---------------- */
  function weakData(d, meta) {
    const st = courseStats(meta.id, d); const ws = weakBySection(d, meta.id);
    const wrong = Object.keys(st.map).filter(id => !st.map[id].l).map(id => d.qMap[id]).filter(Boolean);
    const secs = d.sections.map(s => ({ s, ...(ws[s.id] || { ok: 0, bad: 0 }) })).filter(x => x.ok + x.bad > 0).sort((a, b) => (b.bad / (b.ok + b.bad)) - (a.bad / (a.ok + a.bad)));
    const weakSecs = secs.filter(x => x.bad > 0);
    return { st, wrong, secs, weakSecs };
  }
  function ansText(q) { if (q.t === 'pair') return q.a + ' → ' + q.b; if (q.t === 'tf') return q.a ? 'Doğru' : 'Yanlış'; if (q.t === 'fill') return q.a; return q.o[q.a]; }
  function qText(q) { return q.t === 'pair' ? 'Eşleştirme: ' + q.b : q.q; }
  function tabWeak(el, d, meta) {
    const { st, wrong, secs, weakSecs } = weakData(d, meta);
    if (!st.seen) { el.innerHTML = `<div class="card"><h2>Henüz test çözmedin</h2><p class="muted">Test çözdükçe yanlış yaptığın sorular ve zayıf olduğun konular burada ${esc(user.name || 'Misafir')} adına kaydedilir.</p><a class="btn primary" href="#/ders/${meta.id}/test">Teste başla</a></div>`; return; }
    const pct = Math.round(st.ok / st.seen * 100);
    el.innerHTML = `<div class="grid">
      <div class="card"><div class="row" style="justify-content:space-between"><div><h2 style="margin:0">${esc(user.name || 'Misafir')} · ${esc(meta.title)}</h2>
        <p class="muted" style="margin:4px 0">Çözülen ${st.seen} sorunun %${pct}'i doğru · <span class="level">${levelOf(pct)}</span> · Eksik: <b>${wrong.length}</b> soru, <b>${weakSecs.length}</b> konu</p></div></div>
        <div class="row" style="margin-top:10px">
          ${wrong.length ? `<a class="btn primary" href="#/ders/${meta.id}/test?m=weak&auto=1">🔁 Eksiklerimi tekrar çöz</a>` : ''}
          ${wrong.length ? `<button class="btn" id="listenWeak">🔊 Eksiklerimi dinle</button>` : ''}
          ${wrong.length ? `<a class="btn" href="#/yazdir/${meta.id}">📄 PDF olarak al</a>` : ''}
          <button class="btn ghost" id="reset">Bu dersin kaydını sıfırla</button></div></div>
      ${st.ok ? `<details class="card"><summary><b>✔ Doğru yaptığın sorular (${st.ok})</b> <span class="muted small">— bunlar yeni testlerde tekrar sorulmaz</span></summary>
        ${d.sections.map(s => { const ok = Object.keys(st.map).filter(id => st.map[id].l && d.qMap[id] && d.qMap[id].s === s.id).map(id => d.qMap[id]); return ok.length ? `<h4 style="margin:12px 0 4px">${esc(s.t)} <span class="pill ok">${ok.length}</span></h4>${ok.map(q => `<div class="wq"><div>${esc(qText(q))}</div><div class="a">✔ ${esc(ansText(q))}</div></div>`).join('')}` : ''; }).join('')}</details>` : ''}
      <div class="card"><h3>Konu bazında durumun</h3>${secs.map(x => `<div class="topicrow"><a href="#/ders/${meta.id}/konu?s=${x.s.id}">${esc(x.s.t)}</a><div class="bar"><i style="width:${x.ok / (x.ok + x.bad) * 100}%;background:${x.ok / (x.ok + x.bad) < .6 ? 'var(--bad)' : 'var(--ok)'}"></i></div><span class="small">${x.ok}/${x.ok + x.bad}</span></div>`).join('')}</div>
      ${weakSecs.map(x => `<div class="card"><div class="row" style="justify-content:space-between"><h3 style="margin:0">❗ ${esc(x.s.t)} <span class="pill bad">${x.bad} eksik</span></h3>
          <div class="row"><button class="btn sm" data-ls="${x.s.id}">🔊 Konuyu dinle</button><a class="btn sm" href="#/ders/${meta.id}/konu?s=${x.s.id}">📖 Konuyu oku</a><a class="btn sm" href="#/ders/${meta.id}/test?m=weak&s=${x.s.id}&auto=1">🔁 Tekrar çöz</a></div></div>
        ${wrong.filter(q => q.s === x.s.id).map(q => `<div class="wq">${q.img ? `<img src="${esc(q.img)}" alt="" data-zoom="${esc(q.info || '')}">` : ''}<div>${esc(qText(q))}</div><div class="a">✔ ${esc(ansText(q))}</div>${q.e ? `<div class="small muted">${esc(q.e)}</div>` : ''}${q.info ? `<div class="small muted">${esc(q.info)}</div>` : ''}<div style="clear:both"></div></div>`).join('')}</div>`).join('')}
    </div>`;
    const lw = $('#listenWeak', el);
    if (lw) lw.onclick = () => tts.play('Eksiklerim — ' + meta.title, weakSpeech(d, meta, wrong, weakSecs));
    $$('[data-ls]', el).forEach(b => b.onclick = () => { const s = d.secMap[b.dataset.ls]; tts.play(s.t, s.t + '. ' + stripHtml(s.h)); });
    $('#reset', el).onclick = () => { if (confirm(meta.title + ' dersindeki tüm kayıtların silinsin mi?')) { const p = user.prog(); delete p[meta.id]; user.save(p); tabWeak(el, d, meta); } };
  }
  function weakSpeech(d, meta, wrong, weakSecs) {
    let t = `${meta.title} dersindeki eksiklerin. Toplam ${wrong.length} soru, ${weakSecs.length} konu. `;
    weakSecs.forEach(x => {
      t += `Konu: ${x.s.t}. Yanlış yaptığın sorular ve doğru cevapları: `;
      wrong.filter(q => q.s === x.s.id).forEach((q, i) => { t += `${i + 1}. ${qText(q).replace(/_{3,}/g, 'boşluk')} Doğru cevap: ${ansText(q)}. ${q.e ? q.e + '. ' : ''}`; });
      t += ` Şimdi konu özeti: ${stripHtml(x.s.h)} `;
    });
    return t;
  }

  function viewPrint(id) {
    setNav('eksik');
    loadCourse(id).then(d => {
      const meta = COURSES.find(c => c.id === id); const { st, wrong, weakSecs } = weakData(d, meta);
      app.innerHTML = `<div class="row" style="margin-bottom:14px"><button class="btn primary" onclick="window.print()">🖨️ Yazdır / PDF olarak kaydet</button><a class="btn" href="#/ders/${id}/eksik">← Geri</a>
        <span class="muted small">Açılan pencerede “Hedef: PDF olarak kaydet” seç.</span></div>
        <div class="card prose" id="printable"><h1>${esc(meta.title)} — Eksiklerim</h1>
        <p>${esc(user.name || 'Misafir')} · ${new Date().toLocaleDateString('tr-TR')} · Çözülen: ${st.seen} · Doğru: ${st.ok} · Eksik: ${wrong.length}</p>
        ${weakSecs.map(x => `<h2>${esc(x.s.t)}</h2><h3>Yanlış yaptığın sorular</h3><ol>${wrong.filter(q => q.s === x.s.id).map(q => `<li>${esc(qText(q))}<br><b>Cevap:</b> ${esc(ansText(q))}${q.e ? `<br><i>${esc(q.e)}</i>` : ''}${q.info ? `<br><i>${esc(q.info)}</i>` : ''}</li>`).join('')}</ol>
        <h3>Konu özeti</h3>${x.s.h}`).join('<hr>')}</div>`;
    });
  }

  function viewAllWeak() {
    setNav('eksik');
    const p = user.prog();
    app.innerHTML = `<h1>Eksiklerim</h1><p class="muted">${esc(user.name || 'Misafir')} için ders ders kayıtlar. Bir derse tıkla; eksik konuları, yanlış soruları gör, dinle veya PDF al.</p>
      <div class="courses">${COURSES.map(c => { const cp = p[c.id] || { q: {} }; const ids = Object.keys(cp.q); const bad = ids.filter(i => !cp.q[i].l).length; const pct = ids.length ? Math.round((ids.length - bad) / ids.length * 100) : 0;
        return `<a class="ccard" href="#/ders/${c.id}/eksik" style="--c:${c.color}"><span class="emo">${c.emoji}</span><h3>${esc(c.title)}</h3>
        ${ids.length ? `<span class="meta">${ids.length} çözüldü · %${pct} doğru</span><span class="pill ${bad ? 'bad' : 'ok'}">${bad ? bad + ' eksik soru' : 'Eksik yok 🎉'}</span>` : '<span class="meta">Henüz test çözülmedi</span>'}</a>`; }).join('')}</div>
      <div class="card" style="margin-top:20px"><h3>İlerlemeyi taşı</h3><p class="muted small">Kayıtlar bu tarayıcıda tutulur. Başka cihazda devam etmek için dışa aktar, diğer cihazda içe aktar.</p>
      <div class="row"><button class="btn" id="exp">⬇️ Dışa aktar (.json)</button><label class="btn">⬆️ İçe aktar<input type="file" id="imp" accept=".json,application/json" hidden></label><button class="btn ghost" id="sw">Kullanıcı değiştir</button></div></div>`;
    $('#exp').onclick = () => { const blob = new Blob([JSON.stringify({ user: user.name, prog: user.prog() })], { type: 'application/json' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'vize-kampi-' + (user.name || 'misafir').replace(/\s+/g, '_') + '.json'; a.click(); };
    $('#imp').onchange = e => { const f = e.target.files[0]; if (!f) return; f.text().then(t => { try { const o = JSON.parse(t); if (o.user) user.name = o.user; user.save(o.prog || {}); alert('İlerleme yüklendi.'); route(); } catch (err) { alert('Dosya okunamadı.'); } }); };
    $('#sw').onclick = () => loginModal(false);
  }

  route();
})();
