// 阅读器：章节状态、HUD、翻页手势、机关交互、对话框、地图与印章、编辑模式
import { createStage } from './stage.js';
import { play, useFiles } from './sfx.js';
import { clamp, escapeHTML as esc } from './util.js';
import { createEditor } from './editor.js';

const $ = s => document.querySelector(s);
const two = n => String(n).padStart(2, '0');
const reduced = matchMedia('(prefers-reduced-motion: reduce)');

const UI_DEFAULT = {
  chapter: '第 {n} 章', of: '共 {total} 章', journey: '{hero}的旅程', read: '读这一页', map: '地图', reset: '回到座位', sound: '声音',
  turnHint: '拖动纸页翻页', turning: '翻页中 · {pct}%', dragTable: '拖书外的桌面可转动视角', mapTitle: '折页地图', stamps: '已收集 {n} / {total} 枚印章',
  start: '开始', again: '再玩一次', readStory: '重读故事', stampEarned: '获得印章：{stamp}', close: '关闭', loading: '正在展开这本书…',
  allDone: '整本书的印章都集齐啦！', note: '小贴士', choose: '选一选', wrong: '再想想？', edit: '摆位',
};

export async function boot({ bookUrl = 'book.json' } = {}) {
  const book = globalThis.__POPBOOK_BOOK__ || await (await fetch(bookUrl)).json();
  const ui = Object.assign({}, UI_DEFAULT, book.ui || {});
  const fmt = (s, o) => String(s).replace(/\{(\w+)\}/g, (_, k) => o[k] ?? '');
  const ids = book.chapters.map(c => c.id), N = ids.length;
  const heroName = book.characters?.[book.hero]?.name || '主角';
  const storeKey = 'popbook.' + (book.id || book.title);
  const saved = (() => { try { return JSON.parse(localStorage.getItem(storeKey)) || {}; } catch { return {}; } })();
  const stamps = new Set((saved.stamps || []).filter(s => ids.includes(s)));
  let sound = saved.sound === true;
  const save = () => { try { localStorage.setItem(storeKey, JSON.stringify({ stamps: [...stamps], sound })); } catch { } };
  if (book.sfx) useFiles(book.sfx);
  const sfx = k => { if (sound) play(k); };

  // 主题色
  const root = document.documentElement.style, th = book.theme || {};
  for (const [k, v] of Object.entries({ '--accent': th.accent, '--ink': th.uiInk, '--card': th.uiCard, '--sky': th.sky })) if (v) root.setProperty(k, v);
  document.title = book.title;
  $('#brandTitle').textContent = book.title; $('#brandSub').textContent = book.subtitle || '';
  $('#journey').textContent = fmt(ui.journey, { hero: heroName });
  $('#readBtn span').textContent = ui.read; $('#mapBtn span').textContent = ui.map; $('#lookBtn span').textContent = ui.reset;
  $('#loadingText').textContent = ui.loading; $('#editBtn span').textContent = ui.edit;
  $('#editBtn').hidden = !book.editor;
  const scrub = $('#scrub'); scrub.max = String(N - 1);
  $('#dots').innerHTML = ids.map(() => '<i></i>').join('');

  const world = $('#world');
  let stage = null;
  try {
    stage = await createStage(world, book, f => { $('#loadingBar').style.width = Math.round(f * 100) + '%'; });
  } catch (err) {
    console.error(err); world.hidden = true; $('#fallback').hidden = false; $('#lookBtn').hidden = true;
  }
  $('#loading').hidden = true;

  // ── 状态 ──
  let pos = Math.max(0, ids.indexOf(location.hash.slice(1))), idx = Math.round(pos), tween = 0, drag = null, reply = '', opening = 0;
  const ms = stage ? stage.mechState : book.chapters.map(() => ({ mode: 'story', progress: 0, taps: 0, angle: 0 }));
  ids.forEach((id, i) => { if (stamps.has(id)) ms[i].mode = 'solved'; });
  const ch = () => book.chapters[idx], ix = () => ch().interaction, st = () => ms[idx];

  function hint() {
    const c = ch(), x = c.interaction; if (!x) return c.hint || '';
    const m = st().mode;
    if (m === 'solved') return fmt(ui.stampEarned, { stamp: x.stamp || c.title });
    if (m === 'active' || m === 'question') return x.activeHint || x.hint || '';
    return x.hint || '';
  }
  function narration() {
    const c = ch(), x = c.interaction, m = st().mode;
    if (!x) return c.line || '';
    if (m === 'solved') return x.solved || c.line;
    if (m === 'question') return reply || x.question || x.task || '';
    if (m === 'active') return reply || x.task || c.line;
    return c.line || '';
  }
  function updateHUD() {
    const c = ch(), turning = !Number.isInteger(pos);
    document.body.classList.toggle('turning', turning);
    $('#folio').textContent = fmt(ui.chapter, { n: two(idx + 1) }) + ' / ' + two(N) + (c.tag ? ' · ' + c.tag : '');
    $('#heading').textContent = c.title; $('#place').textContent = c.place || '';
    const h = hint(); $('#hint').textContent = h; $('#hint').hidden = turning || !h;
    $('#line').textContent = narration(); $('#readBtn').disabled = turning;
    $('#prev').disabled = pos <= 0; $('#next').disabled = pos >= N - 1;
    $('#counter').textContent = turning ? two(Math.floor(pos) + 1) + ' → ' + two(Math.ceil(pos) + 1) : two(idx + 1) + ' / ' + two(N);
    $('#turnHint').textContent = turning ? fmt(ui.turning, { pct: Math.round((pos % 1) * 100) }) : ui.turnHint;
    scrub.value = String(pos); scrub.setAttribute('aria-valuetext', turning ? Math.round((pos % 1) * 100) + '%' : c.title);
    document.title = c.title + ' · ' + book.title;
    world.setAttribute('aria-label', (c.alt || c.title) + '。拖动纸页翻页，拖动桌面转动视角。键盘：← → 翻页，A/D/W/S 转动，R 复位。');
    [...$('#dots').children].forEach((d, i) => d.classList.toggle('done', stamps.has(ids[i])));
    stage?.setCue(c.interaction && st().mode !== 'solved' ? c.interaction.target : null);
    if (!stage) { const g = c.ground || {}; $('#fallback img').src = g.spread || g.right || g.left || ''; }
  }
  const announce = s => { $('#announce').textContent = s; };

  // ── 翻页 ──
  function write(v, history = true) {
    v = clamp(v, 0, N - 1); if (Math.abs(Math.round(v) - v) < 1e-5) v = Math.round(v);
    pos = v; const d = Math.round(pos);
    if (d !== idx) { idx = d; reply = ''; if (st().mode !== 'solved') resetChapter(); }
    stage?.setPosition(pos);
    if (Number.isInteger(pos)) {
      if (history && location.hash !== '#' + ids[idx]) history && window.history.replaceState(null, '', '#' + ids[idx]);
    }
    updateHUD();
  }
  function go(target, history = true) {
    target = clamp(target, 0, N - 1); cancelAnimationFrame(tween); closeDialogs();
    if (target === pos) return; sfx('turn');
    if (reduced.matches) { write(target, history); announce(ch().title); return; }
    const from = pos, dur = clamp(Math.abs(target - from) * 1100, 280, 2600), t0 = performance.now();
    const tick = t => { const u = clamp((t - t0) / dur), e = u * u * (3 - 2 * u); write(u === 1 ? target : from + (target - from) * e, history); if (u < 1) tween = requestAnimationFrame(tick); else { tween = 0; announce(ch().title); } };
    tween = requestAnimationFrame(tick);
  }

  // ── 机关 ──
  function resetChapter() { const s = st(); s.mode = 'story'; s.progress = 0; s.taps = 0; s.angle = 0; reply = ''; }
  function activate() { const s = st(); if (s.mode === 'story') { s.mode = 'active'; reply = ''; sfx('tap'); updateHUD(); announce(ix().task || ''); } }
  function setProgress(v) {
    const s = st(), x = ix(); s.progress = clamp(v);
    if (s.progress >= 0.985 && s.mode === 'active') complete();
    updateHUD();
  }
  function animateProgress(to, ms = 380) {
    const s = st(), from = s.progress, t0 = performance.now(), chapter = idx;
    const tick = t => { if (idx !== chapter) return; const u = clamp((t - t0) / ms); setProgress(from + (to - from) * (1 - (1 - u) ** 3)); if (u < 1 && st().mode === 'active') requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  }
  function complete() {
    const x = ix(), s = st();
    if (x.choices?.length) { s.mode = 'question'; s.progress = 1; reply = ''; updateHUD(); const at = idx; setTimeout(() => { if (idx === at && st().mode === 'question') openPage(); }, pageDlg.open ? 0 : 700); return; }
    solve();
  }
  function solve() {
    const x = ix(), s = st(), c = ch(); s.mode = 'solved'; s.progress = 1; reply = '';
    stamps.add(c.id); save(); sfx('success');
    const t = stage && c.interaction && stage.chapters[idx].byId[x.target];
    if (t) stage.burstAt(t, x.effect || 'sparkle', 18);
    toast(fmt(ui.stampEarned, { stamp: x.stamp || c.title }));
    announce((x.solved || '') + ' ' + fmt(ui.stampEarned, { stamp: x.stamp || c.title }));
    if (stamps.size === N) setTimeout(() => toast(ui.allDone, true), 1600);
    if (pageDlg.open) drawPage();
    updateHUD();
  }
  function answer(i) {
    const x = ix(), choice = x.choices[i];
    if (choice.correct) { if (pageDlg.open) pageDlg.close(); solve(); }
    else { reply = choice.reply || ui.wrong; sfx('wrong'); drawPage(); updateHUD(); }
  }
  // 点到交互目标
  function useTarget() {
    const x = ix(), s = st(); if (!x) return;
    if (s.mode === 'solved') { stage?.tapAt(idx); sfx('chime'); return; }
    activate();
    switch (x.type) {
      case 'tap': s.taps++; stage?.tapAt(idx); sfx('chime'); setProgress(s.taps / (x.count || 1)); break;
      case 'choice': stage?.tapAt(idx); sfx('chime'); if (s.mode === 'active') complete(); else openPage(); break;
      case 'flap': animateProgress(s.progress > 0.5 ? 0 : 1); sfx('creak'); break;
      case 'pull': animateProgress(1, 700); break;
      case 'rotate': { const turns = x.turns || 1, from = s.angle, t0 = performance.now(), chapter = idx; sfx('creak');
        const tick = t => { if (idx !== chapter) return; const u = clamp((t - t0) / 500); s.angle = from + Math.PI / 2 * (1 - (1 - u) ** 3); setProgress(Math.abs(s.angle) / (turns * Math.PI * 2)); if (u < 1 && st().mode === 'active') requestAnimationFrame(tick); };
        requestAnimationFrame(tick); break; }
    }
  }
  // 点到普通立牌或角色：彩蛋
  function curiosity(it) {
    const d = it.def;
    if (it.kind === 'puppet') { it.react = 0; sfx('pop'); }
    else { it.shake = 0.9; sfx('tap'); }
    if (d.tap) stage.burstAt(it, d.tap, d.tap === 'rain' ? 26 : 14);
    const lines = Array.isArray(d.say) ? d.say : d.say ? [d.say] : [];
    if (lines.length) { bubble(it, lines[(it.sayIndex = ((it.sayIndex ?? -1) + 1)) % lines.length]); }
  }

  // ── 对话框 ──
  const pageDlg = $('#pageDlg'), mapDlg = $('#mapDlg');
  function btn(act, label, cls = 'choice', extra = '') { return `<button class="${cls}" data-act="${act}" ${extra}>${esc(label)}</button>`; }
  function drawPage() {
    const c = ch(), x = c.interaction, s = st();
    $('#pgFolio').textContent = fmt(ui.chapter, { n: two(idx + 1) }) + (c.tag ? ' · ' + c.tag : '');
    $('#pgTitle').textContent = c.title;
    let html = (c.image ? `<img class="plate" src="${esc(c.image)}" alt="${esc(c.alt || '')}">` : '') + (c.story || '').split(/\n+/).map(p => `<p>${esc(p)}</p>`).join('');
    const note = c.note ? `<aside class="note"><b>${esc(ui.note)}</b><p>${esc(c.note)}</p></aside>` : '';
    if (c.voice) html += `<button class="ghost" data-act="voice">▶ 听故事</button>`;
    if (x) {
      if (s.mode === 'story') html += note + btn('start', x.button || ui.start, 'primary');
      else if (s.mode === 'active') {
        html += `<p class="task">${esc(x.task || '')}</p>`;
        if (x.type === 'pull') html += `<label class="slider">${esc(x.button || '')}<input id="pullRange" type="range" min="0" max="100" value="${Math.round(s.progress * 100)}"></label>`;
        else if (x.type === 'tap') html += btn('tap', (x.button || ui.start) + `（${s.taps}/${x.count || 1}）`, 'primary');
        else html += btn('tap', x.button || ui.start, 'primary');
        html += note;
      } else if (s.mode === 'question') {
        html += `<p class="task">${esc(x.question || x.task || '')}</p><div class="choices">` + x.choices.map((o, i) => btn('ans-' + i, o.text)).join('') + `</div><p class="reply" role="status">${esc(reply)}</p>` + note;
      } else {
        html += `<div class="stamp">${esc(x.stamp || c.title)}</div><p>${esc(x.solved || '')}</p>` + note + btn('again', ui.again) + btn('story', ui.readStory, 'ghost');
      }
    } else html += note;
    $('#pgBody').innerHTML = html;
  }
  function openPage() { if (!Number.isInteger(pos)) return; drawPage(); if (!pageDlg.open) pageDlg.showModal(); }
  function closeDialogs() { if (pageDlg.open) pageDlg.close(); if (mapDlg.open) mapDlg.close(); }
  let voice = null;
  $('#pgBody').addEventListener('click', e => {
    const b = e.target.closest('[data-act]'); if (!b) return; const a = b.dataset.act;
    if (a === 'start') { activate(); if (ix().type === 'choice') complete(); else drawPage(); }
    else if (a === 'tap') { useTarget(); if (pageDlg.open) drawPage(); }
    else if (a.startsWith('ans-')) answer(+a.slice(4));
    else if (a === 'again') { resetChapter(); stamps.delete(ch().id); save(); drawPage(); updateHUD(); }
    else if (a === 'story') { resetChapter(); drawPage(); updateHUD(); }
    else if (a === 'voice') { voice?.pause(); voice = new Audio(ch().voice); voice.play().catch(() => {}); }
  });
  $('#pgBody').addEventListener('input', e => { if (e.target.id === 'pullRange') { activate(); setProgress(e.target.value / 100); } });
  function openMap() {
    closeDialogs();
    const m = book.map || {};
    $('#mapTitle').textContent = m.title || ui.mapTitle;
    $('#chart').style.backgroundImage = m.image ? `url("${m.image}")` : '';
    $('#chart').innerHTML = book.chapters.map((c, i) => { const p = c.mapAt || [10 + 80 * i / Math.max(1, N - 1), 50 + 18 * Math.sin(i * 1.7)];
      return `<button class="pin ${stamps.has(c.id) ? 'got' : ''}" style="left:${+p[0]}%;top:${+p[1]}%" data-go="${i}" aria-current="${i === idx}"><i>${two(i + 1)}</i><b>${esc(c.place || c.title)}</b></button>`; }).join('');
    $('#stampLine').textContent = fmt(ui.stamps, { n: stamps.size, total: N });
    mapDlg.showModal();
  }
  $('#chart').addEventListener('click', e => { const b = e.target.closest('[data-go]'); if (b) go(+b.dataset.go); });
  for (const d of [pageDlg, mapDlg]) { d.querySelector('.close').onclick = () => d.close(); d.addEventListener('click', e => { if (e.target === d) d.close(); }); d.addEventListener('close', () => { voice?.pause(); updateHUD(); }); }

  // ── 气泡与提示 ──
  const bubbles = $('#bubbles');
  function bubble(it, text) {
    const el = document.createElement('div'); el.className = 'bubble'; el.textContent = text; bubbles.appendChild(el);
    const born = performance.now(); el._it = it; el._born = born; announce(text);
    setTimeout(() => el.remove(), 3200 + text.length * 60);
  }
  let toastTimer = 0;
  function toast(text, big = false) { const t = $('#toast'); t.textContent = text; t.className = 'toast show' + (big ? ' big' : ''); clearTimeout(toastTimer); toastTimer = setTimeout(() => t.className = 'toast', big ? 4200 : 2600); }
  stage?.onFrame(() => {
    for (const el of bubbles.children) { const p = stage.headOf(el._it); el.style.transform = `translate(${Math.round(p.x)}px,${Math.round(p.y)}px) translate(-50%,-100%)`; el.style.opacity = Number.isInteger(pos) ? 1 : 0; }
    editor?.frame();
  });

  // ── 指针手势 ──
  const span = () => clamp(innerWidth * 0.5, 170, 740);
  const SLIDE = ['pull', 'rotate', 'flap'];
  function onDown(e) {
    if (e.button !== 0 || drag || !stage) return;
    cancelAnimationFrame(tween); tween = 0;
    const h = stage.pick(e.clientX, e.clientY);
    if (editor?.on) { editor.down(e, h); world.setPointerCapture(e.pointerId); drag = { kind: 'editor', id: e.pointerId }; return; }
    const x = ix();
    // 机关目标通常不大：落在目标中心 40px 内也算点中它
    if (x && Number.isInteger(pos) && !(h.kind === 'item' && h.item.id === x.target)) {
      const t = stage.chapters[idx].byId[x.target];
      if (t && t.rise > 0.6) { const c = stage.screenOf(t.mech.getWorldPosition(new (t.mech.position.constructor)())); if (Math.hypot(c.x - e.clientX, c.y - e.clientY) < 40) { h.kind = 'item'; h.item = t; } }
    }
    const isTarget = h.kind === 'item' && x && h.item.id === x.target && Number.isInteger(pos);
    let kind = 'page';
    if (h.kind === 'table' || e.shiftKey) kind = 'orbit';
    else if (isTarget && SLIDE.includes(x.type) && st().mode !== 'solved') kind = 'prop';
    drag = { id: e.pointerId, kind, x: e.clientX, y: e.clientY, lx: e.clientX, ly: e.clientY, start: pos, item: h.kind === 'item' ? h.item : null, moved: false, startProg: st().progress };
    if (kind === 'prop') {
      activate();
      const t = h.item; t.mech.getWorldPosition(drag.c = new (t.mech.position.constructor)());
      const s0 = stage.screenOf(drag.c);
      drag.center = s0; drag.angle = Math.atan2(e.clientY - s0.y, e.clientX - s0.x);
      if (x.type === 'pull') { const d = x.dir || [1, 0], len = Math.hypot(d[0], d[1]) || 1, dist = x.distance ?? 1.5; const end = drag.c.clone(); end.x += d[0] / len * dist; end.z += d[1] / len * dist; const s1 = stage.screenOf(end); drag.axis = [s1.x - s0.x, s1.y - s0.y]; }
    }
    world.setPointerCapture(e.pointerId); world.style.cursor = 'grabbing';
  }
  function onMove(e) {
    if (!stage) return;
    if (!drag) {
      if (e.pointerType !== 'mouse') return;
      const h = stage.pick(e.clientX, e.clientY), it = h.kind === 'item' ? h.item : null;
      stage.attend(e.clientX, e.clientY, it);
      const x = ix(); world.style.cursor = editor?.on ? (it ? 'move' : 'default') : it ? (x && it.id === x.target && SLIDE.includes(x.type) ? 'grab' : 'pointer') : h.kind === 'table' ? 'all-scroll' : 'ew-resize';
      return;
    }
    if (drag.kind === 'editor') { editor.move(e); return; }
    if (e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (!drag.moved && Math.hypot(dx, dy) < 4) return;
    if (!drag.moved && drag.kind === 'page') sfx('turn');
    drag.moved = true;
    if (drag.kind === 'orbit') stage.orbit((drag.lx - e.clientX) * 0.006, (e.clientY - drag.ly) * 0.004);
    else if (drag.kind === 'page') write(drag.start - dx / span());
    else if (drag.kind === 'prop') {
      const x = ix(), s = st();
      if (x.type === 'pull') { const [ax, ay] = drag.axis, den = ax * ax + ay * ay; setProgress(drag.startProg + (den > 40 ? (dx * ax + dy * ay) / den : -dy / 120)); }
      else if (x.type === 'flap') setProgress(drag.startProg + (-dy) / 110);
      else if (x.type === 'rotate') { const a = Math.atan2(e.clientY - drag.center.y, e.clientX - drag.center.x); let d = a - drag.angle; d = Math.atan2(Math.sin(d), Math.cos(d)); drag.angle = a; s.angle -= d; setProgress(Math.abs(s.angle) / ((x.turns || 1) * Math.PI * 2)); }
    }
    drag.lx = e.clientX; drag.ly = e.clientY;
  }
  function onUp(e) {
    if (!drag || e.pointerId !== drag.id) return; const d = drag; drag = null; world.style.cursor = '';
    if (world.hasPointerCapture(e.pointerId)) world.releasePointerCapture(e.pointerId);
    if (d.kind === 'editor') { editor.up(e); return; }
    if (e.pointerType !== 'mouse') stage.attend(null);
    if (e.type !== 'pointerup') { if (d.kind === 'page') go(Math.round(pos)); return; }
    if (d.kind === 'page' && d.moved) { const base = Math.round(d.start), delta = pos - base; go(delta > 0.18 ? base + 1 : delta < -0.18 ? base - 1 : base); return; }
    if (!d.moved && d.item && Number.isInteger(pos)) {
      const x = ix(); if (x && d.item.id === x.target) useTarget(); else curiosity(d.item);
    }
  }
  world.addEventListener('pointerdown', onDown); world.addEventListener('pointermove', onMove);
  world.addEventListener('pointerup', onUp); world.addEventListener('pointercancel', onUp);
  world.addEventListener('pointerleave', () => { if (!drag) stage?.attend(null); });
  world.addEventListener('wheel', e => { if (!stage) return; e.preventDefault(); if (editor?.on && editor.wheel(e)) return; stage.zoomBy(e.deltaY > 0 ? 0.94 : 1.06); }, { passive: false });

  // ── 按钮与键盘 ──
  scrub.addEventListener('input', () => { cancelAnimationFrame(tween); write(+scrub.value); });
  scrub.addEventListener('change', () => go(Math.round(pos)));
  $('#prev').onclick = () => go(Math.ceil(pos) - 1); $('#next').onclick = () => go(Math.floor(pos) + 1);
  $('#readBtn').onclick = openPage; $('#mapBtn').onclick = openMap; $('#lookBtn').onclick = () => stage?.resetView();
  const reflectSound = () => { const b = $('#soundBtn'); b.setAttribute('aria-pressed', sound); b.classList.toggle('on', sound); b.title = sound ? '关闭声音' : '打开声音'; };
  $('#soundBtn').onclick = () => { sound = !sound; save(); reflectSound(); if (sound) play('chime'); }; reflectSound();
  document.addEventListener('keydown', e => {
    if (e.metaKey || e.ctrlKey || e.altKey || pageDlg.open || mapDlg.open || e.target.matches('input,textarea')) return;
    if (editor?.on && editor.key(e)) return;
    const k = e.key.toLowerCase();
    if (e.key === 'ArrowRight') { e.preventDefault(); go(Math.floor(pos) + 1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); go(Math.ceil(pos) - 1); }
    else if (e.key === 'Enter' && e.target === world) openPage();
    else if (['a', 'd', 'w', 's'].includes(k)) stage?.orbit(k === 'a' ? -0.12 : k === 'd' ? 0.12 : 0, k === 'w' ? 0.08 : k === 's' ? -0.08 : 0);
    else if (k === 'r') stage?.resetView();
    else if (k === 'e' && book.editor) editor?.toggle();
  });
  window.addEventListener('hashchange', () => { const i = ids.indexOf(location.hash.slice(1)); if (i >= 0 && i !== pos) go(i, false); });

  // ── 编辑模式 ──
  const editor = stage && book.editor ? createEditor(stage, book, () => idx, () => pos, toast) : null;
  $('#editBtn').onclick = () => editor?.toggle();

  // ── 开书动画 ──
  write(pos, false);
  if (stage) {
    if (reduced.matches) stage.setOpening(1);
    else { const t0 = performance.now(); const tick = t => { const u = clamp((t - t0) / 1300); stage.setOpening(1 - (1 - u) ** 3); if (u < 1) requestAnimationFrame(tick); }; stage.setOpening(0); requestAnimationFrame(tick); }
  }
  updateHUD();

  // 方便调试与自动化测试
  window.popbook = Object.freeze({
    state: () => ({ chapter: ids[idx], position: pos, mode: st().mode, progress: st().progress, stamps: [...stamps], webgl: !!stage }),
    go: id => go(typeof id === 'number' ? id : ids.indexOf(id)), seek: v => write(v), read: openPage, map: openMap, use: useTarget,
    tapItem: id => { const it = stage?.chapters[idx].byId[id]; if (!it) throw Error('本页没有 ' + id); const x = ix(); if (x && x.target === id) useTarget(); else curiosity(it); },
    setProgress: v => { activate(); setProgress(v); }, answer,
    where: id => { const it = stage?.chapters[idx].byId[id]; if (!it) return null; const v = it.mech.getWorldPosition(new (it.mech.position.constructor)()); return stage.screenOf(v); }, view: (a, b, z) => stage?.setView(a, b, z),
  });
}
