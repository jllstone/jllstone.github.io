/* 成器 · audio.js — 全程序化的声音：编钟、磬、古琴（拨弦合成，带滑音）、箫、埙、笙、堂鼓，以及材质化的音效。
 * 所有音乐与音效都在五声调式内。同一套合成函数既用于实时播放，也用于离线渲染（宣传片配乐）。
 */
(function (root) {
  'use strict';
  var MODES = { gong: [0, 2, 4, 7, 9], shang: [0, 2, 5, 7, 10], zhi: [0, 2, 5, 7, 9], yu: [0, 3, 5, 7, 10], jue: [0, 3, 5, 8, 10] };
  var mtof = function (m) { return 440 * Math.pow(2, (m - 69) / 12); };
  function deg(mode, root, d) { var m = MODES[mode], o = Math.floor(d / 5), i = ((d % 5) + 5) % 5; return root + m[i] + 12 * o; }
  function seeded(s) { return function () { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; }

  // ───────── 合成上下文 ─────────
  function Bus(ctx, dest) {
    var b = { ctx: ctx, cache: {} };
    b.master = ctx.createGain(); b.master.gain.value = 0.8;
    var comp = ctx.createDynamicsCompressor(); comp.threshold.value = -16; comp.knee.value = 10; comp.ratio.value = 3.5; comp.attack.value = 0.006; comp.release.value = 0.25;
    b.master.connect(comp); comp.connect(dest || ctx.destination);
    b.dry = ctx.createGain(); b.dry.connect(b.master);
    b.rev = ctx.createConvolver(); b.revIn = ctx.createGain(); b.revIn.gain.value = 0.55; b.revIn.connect(b.rev); b.rev.connect(b.master);
    var sr = ctx.sampleRate, len = Math.floor(sr * 3.4), ir = ctx.createBuffer(2, len, sr), r = seeded(11);
    for (var c = 0; c < 2; c++) { var d = ir.getChannelData(c); for (var i = 0; i < len; i++) { var t = i / sr; d[i] = (r() * 2 - 1) * Math.pow(1 - i / len, 2.2) * Math.exp(-t * 1.3) * (t < 0.012 ? t / 0.012 : 1); } }
    b.rev.buffer = ir;
    b.mus = ctx.createGain(); b.mus.gain.value = 0.9; b.mus.connect(b.dry); b.musRev = ctx.createGain(); b.musRev.gain.value = 1; b.musRev.connect(b.revIn);
    b.sfx = ctx.createGain(); b.sfx.gain.value = 1; b.sfx.connect(b.dry); b.sfxRev = ctx.createGain(); b.sfxRev.gain.value = 1; b.sfxRev.connect(b.revIn);
    var nl = sr * 2, nb = ctx.createBuffer(1, nl, sr), nd = nb.getChannelData(0); for (i = 0; i < nl; i++) nd[i] = r() * 2 - 1; b.noise = nb;
    return b;
  }
  function out(b, g, wet, music) { var o = b.ctx.createGain(); o.gain.value = g; o.connect(music ? b.mus : b.sfx); if (wet) { var w = b.ctx.createGain(); w.gain.value = wet; o.connect(w); w.connect(music ? b.musRev : b.sfxRev); } return o; }
  function env(g, t, a, peak, dec, sus) { g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(Math.max(0.0001, sus || 0.0001), t + a + dec); }
  function osc(b, type, f, t, dur, dest, gain, a, detune) {
    var o = b.ctx.createOscillator(), g = b.ctx.createGain(); o.type = type; o.frequency.setValueAtTime(f, t); if (detune) o.detune.value = detune;
    env(g, t, a || 0.004, gain, dur); o.connect(g); g.connect(dest); o.start(t); o.stop(t + (a || 0.004) + dur + 0.05); return o;
  }
  function noiseSrc(b, t, dur, dest, gain, ftype, f, q, a) {
    var s = b.ctx.createBufferSource(), fl = b.ctx.createBiquadFilter(), g = b.ctx.createGain();
    s.buffer = b.noise; s.loop = true; fl.type = ftype || 'bandpass'; fl.frequency.setValueAtTime(f || 1000, t); fl.Q.value = q || 1;
    env(g, t, a || 0.003, gain, dur); s.connect(fl); fl.connect(g); g.connect(dest); s.start(t, Math.random() * 1.5); s.stop(t + (a || 0.003) + dur + 0.05);
    return { s: s, f: fl, g: g };
  }
  // 古琴：Karplus-Strong 拨弦；slide 为滑音（半音）
  function ksBuf(b, f, dur, bright) {
    var k = Math.round(f * 4) + '|' + bright; if (b.cache[k]) return b.cache[k];
    var sr = b.ctx.sampleRate, n = Math.floor(sr * dur), buf = b.ctx.createBuffer(1, n, sr), d = buf.getChannelData(0), N = Math.max(2, Math.round(sr / f)), r = seeded(Math.round(f * 13));
    var y = new Float32Array(N); for (var i = 0; i < N; i++) y[i] = (r() * 2 - 1) * (i < N * 0.5 ? 1 : 0.6);
    var p = 0, prev = 0, dk = 0.996 + bright * 0.0025;
    for (i = 0; i < n; i++) { var v = y[p]; var nv = (v + prev) * 0.5 * dk; prev = v; y[p] = nv; d[i] = v; p = (p + 1) % N; }
    b.cache[k] = buf; return buf;
  }
  function qin(b, m, t, dur, dest, gain, slide) {
    var f = mtof(m), s = b.ctx.createBufferSource(), g = b.ctx.createGain(), lp = b.ctx.createBiquadFilter();
    s.buffer = ksBuf(b, f, 3.2, 0.3); lp.type = 'lowpass'; lp.frequency.setValueAtTime(f * 9, t); lp.frequency.exponentialRampToValueAtTime(f * 2.2, t + 1.4);
    if (slide) { s.playbackRate.setValueAtTime(1, t + 0.12); s.playbackRate.exponentialRampToValueAtTime(Math.pow(2, slide / 12), t + 0.42); }
    g.gain.setValueAtTime(gain, t); g.gain.setTargetAtTime(0.0001, t + Math.max(0.3, dur), 0.5);
    s.connect(lp); lp.connect(g); g.connect(dest); s.start(t); s.stop(t + dur + 2.4);
    osc(b, 'sine', f * 2, t, 0.6, dest, gain * 0.12); // 泛音
  }
  function bell(b, m, t, dest, gain, len) { // 编钟：非谐分音
    var f = mtof(m), P = [[1, 1, 1], [2.76, 0.55, 0.62], [5.4, 0.28, 0.4], [8.93, 0.14, 0.26], [0.5, 0.3, 1.2]]; len = len || 3.2;
    P.forEach(function (p) { osc(b, 'sine', f * p[0], t, len * p[2], dest, gain * p[1], 0.002); });
    noiseSrc(b, t, 0.05, dest, gain * 0.25, 'bandpass', f * 3, 2);
  }
  function qing(b, m, t, dest, gain) { // 磬：石的清越
    var f = mtof(m); [[1, 1, 1.6], [2.32, 0.5, 1.1], [4.25, 0.3, 0.7], [6.63, 0.16, 0.4]].forEach(function (p) { osc(b, 'sine', f * p[0], t, p[2], dest, gain * p[1], 0.001); });
    noiseSrc(b, t, 0.025, dest, gain * 0.4, 'highpass', 3000, 0.7);
  }
  function wind(b, m, t, dur, dest, gain, kind) { // 箫 / 埙：气声 + 揉音
    var f = mtof(m), o = b.ctx.createOscillator(), g = b.ctx.createGain(), vib = b.ctx.createOscillator(), vg = b.ctx.createGain(), lp = b.ctx.createBiquadFilter();
    o.type = kind === 'xiao' ? 'triangle' : 'sine'; o.frequency.setValueAtTime(f * (kind === 'xiao' ? 0.985 : 0.97), t); o.frequency.exponentialRampToValueAtTime(f, t + 0.09);
    vib.frequency.value = kind === 'xiao' ? 5.2 : 4.4; vg.gain.setValueAtTime(0, t); vg.gain.linearRampToValueAtTime(f * 0.007, t + Math.min(dur, 0.6)); vib.connect(vg); vg.connect(o.frequency);
    lp.type = 'lowpass'; lp.frequency.value = kind === 'xiao' ? f * 5 : f * 2.6;
    var a = kind === 'xiao' ? 0.08 : 0.12;
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(gain, t + a); g.gain.setValueAtTime(gain * 0.85, t + Math.max(a, dur - 0.15)); g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.35);
    o.connect(lp); lp.connect(g); g.connect(dest); o.start(t); o.stop(t + dur + 0.5); vib.start(t); vib.stop(t + dur + 0.5);
    if (kind === 'xun') osc(b, 'sine', f * 3, t + 0.05, dur, dest, gain * 0.05, 0.1);
    var br = noiseSrc(b, t, dur * 0.8, dest, gain * (kind === 'xiao' ? 0.12 : 0.16), 'bandpass', f * 2, 3, 0.05); void br;
  }
  function pad(b, ms, t, dur, dest, gain) { // 笙：簧片的和声长音
    ms.forEach(function (m, i) {
      var f = mtof(m), lp = b.ctx.createBiquadFilter(), g = b.ctx.createGain(); lp.type = 'lowpass'; lp.frequency.value = Math.min(2400, f * 4); lp.Q.value = 0.5;
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(gain, t + dur * 0.35); g.gain.linearRampToValueAtTime(gain * 0.8, t + dur * 0.75); g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.6);
      [-6, 5].forEach(function (dt) { var o = b.ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = dt + i; o.connect(lp); o.start(t); o.stop(t + dur + 0.7); });
      lp.connect(g); g.connect(dest);
    });
  }
  function drum(b, t, dest, gain, f0) { // 堂鼓
    var o = b.ctx.createOscillator(), g = b.ctx.createGain(); o.type = 'sine'; o.frequency.setValueAtTime(f0 || 110, t); o.frequency.exponentialRampToValueAtTime((f0 || 110) * 0.42, t + 0.25);
    env(g, t, 0.003, gain, 0.6); o.connect(g); g.connect(dest); o.start(t); o.stop(t + 0.7);
    noiseSrc(b, t, 0.08, dest, gain * 0.3, 'lowpass', 900, 0.8);
  }
  function hammer(b, t, dest, gain, f) { // 錾铜：金属叮当
    f = f || 1180; [1, 1.47, 2.09, 2.83].forEach(function (k, i) { osc(b, 'sine', f * k, t, 0.5 - i * 0.08, dest, gain * [1, 0.6, 0.4, 0.25][i], 0.001); });
    noiseSrc(b, t, 0.03, dest, gain * 0.8, 'bandpass', 2500, 1.2);
  }

  // ───────── 曲谱：每一幕一段五声小曲 ─────────
  // motif: [级数, 拍数, 滑音?]；null 为休止。乐句 A A B A'。
  var SONGS = [
    { mode: 'yu', root: 57, bpm: 54, lead: 'xun', drone: [45, 52], wind: 1, beatsPerBar: 4,
      A: [[5, 3], [4, 1], [3, 2], [2, 2], [3, 4], [null, 2], [2, 1], [1, 1], [0, 2], [1, 2], [0, 6]],
      B: [[2, 2], [3, 2], [5, 3], [6, 1], [5, 4], [3, 2], [4, 2], [3, 2], [2, 2], [1, 4], [null, 4]] },
    { mode: 'gong', root: 50, bpm: 60, lead: 'bell', drone: [38, 45], perc: 'hammer', beatsPerBar: 4,
      A: [[5, 2], [7, 2], [8, 4], [7, 2], [5, 2], [6, 4], [5, 2], [3, 2], [4, 4], [null, 4]],
      B: [[8, 2], [9, 2], [10, 4], [8, 2], [7, 2], [5, 4], [7, 2], [6, 2], [5, 6], [null, 2]] },
    { mode: 'zhi', root: 55, bpm: 64, lead: 'qin', drone: [43, 50], beatsPerBar: 4, arp: 'qin',
      A: [[5, 1], [6, 1], [7, 2, 2], [6, 2], [5, 1], [4, 1], [5, 4], [7, 1], [8, 1], [9, 2, -2], [7, 2], [6, 4], [null, 2]],
      B: [[9, 2], [8, 1], [7, 1], [8, 2, 2], [7, 2], [5, 2], [6, 2], [7, 4], [5, 2], [4, 2], [5, 4], [null, 2]] },
    { mode: 'gong', root: 55, bpm: 72, lead: 'qin', drone: [43, 50], beatsPerBar: 4, arp: 'qinUp',
      A: [[5, 1], [7, 1], [8, 1], [9, 1], [10, 2], [9, 2], [8, 2], [7, 1], [8, 1], [9, 4], [null, 2], [7, 1], [8, 1], [10, 2], [9, 2], [7, 4]],
      B: [[10, 2], [11, 2], [12, 3], [11, 1], [10, 2], [9, 2], [8, 4], [9, 2], [7, 2], [8, 6], [null, 2]] },
    { mode: 'yu', root: 52, bpm: 58, lead: 'xun', drone: [40, 47, 52], perc: 'heart', beatsPerBar: 4, tense: 1,
      A: [[5, 4], [6, 2], [5, 2], [3, 4], [4, 4], [3, 2], [2, 2], [0, 6], [null, 2]],
      B: [[7, 4], [8, 2], [7, 2], [6, 3], [5, 1], [3, 4], [2, 2], [3, 2], [5, 6], [null, 2]] },
    { mode: 'shang', root: 50, bpm: 50, lead: 'qin', drone: [38, 45], beatsPerBar: 4,
      A: [[5, 2], [null, 1], [7, 1], [8, 3, -2], [7, 1], [5, 4], [null, 2], [6, 2], [5, 1], [4, 1], [3, 4, 2], [null, 4]],
      B: [[8, 2], [9, 2], [10, 4, -2], [8, 2], [7, 2], [8, 4], [null, 2], [7, 1], [6, 1], [5, 6], [null, 2]] },
    { mode: 'yu', root: 57, bpm: 60, lead: 'duo', drone: [45, 52], beatsPerBar: 4, bells: 1,
      A: [[5, 2], [7, 2], [8, 4], [null, 4], [7, 2], [8, 2], [10, 4], [null, 4]],
      B: [[10, 2], [8, 2], [7, 4], [null, 4], [8, 2], [7, 2], [5, 6], [null, 2]] },
    { mode: 'gong', root: 55, bpm: 76, lead: 'xiao', drone: [43, 50, 55], perc: 'warm', beatsPerBar: 4, arp: 'qinUp', bells: 1,
      A: [[7, 2], [8, 1], [9, 1], [10, 2], [9, 1], [8, 1], [7, 2], [5, 2], [7, 4], [8, 2], [10, 2], [12, 4], [11, 2], [10, 2], [9, 4], [null, 4]],
      B: [[12, 2], [11, 1], [10, 1], [9, 2], [10, 2], [12, 4], [10, 2], [9, 2], [8, 2], [7, 2], [8, 2], [9, 2], [10, 8]] }
  ];
  function notesFor(ch, b0, b1) { // 返回 [beat, kind, midi, durBeats, vel, extra]
    var S = SONGS[ch], out = [], form = [S.A, S.A, S.B, S.A], seq = [], at = 0;
    form.forEach(function (ph, pi) { ph.forEach(function (n) { seq.push([at, n, pi]); at += n[1]; }); });
    var loop = at, k0 = Math.floor(b0 / loop), k1 = Math.floor(b1 / loop);
    for (var k = k0; k <= k1; k++) {
      var off = k * loop;
      seq.forEach(function (s, idx) {
        var bt = off + s[0]; if (bt < b0 || bt >= b1 || s[1][0] === null) return;
        var d = s[1][0] + (s[2] === 3 && idx % 3 === 1 ? 1 : 0), m = deg(S.mode, S.root, d);
        if (S.lead === 'duo') out.push([bt, (Math.floor(s[0] / 8) % 2) ? 'xun' : 'xiao', (Math.floor(s[0] / 8) % 2) ? m - 12 : m, s[1][1], 0.9]);
        else out.push([bt, S.lead, m, s[1][1], 0.9, s[1][2] || 0]);
      });
      // 和声长音（每 8 拍换）
      for (var bb = 0; bb < loop; bb += 8) {
        var bt2 = off + bb; if (bt2 < b0 || bt2 >= b1) continue;
        var sh = [0, 3, 1, 0][(bb / 8) % 4], ds = S.drone.map(function (m, i) { return i === 0 ? m : m + MODES[S.mode][sh] * (i === 1 ? 1 : 0); });
        out.push([bt2, 'pad', ds, 8, 0.6]);
      }
      // 伴奏
      for (var b = 0; b < loop; b++) {
        var bt3 = off + b; if (bt3 < b0 || bt3 >= b1) continue;
        var bar = Math.floor(b / S.beatsPerBar), inb = b % S.beatsPerBar, r = seeded(ch * 1000 + b + 7)();
        if (S.perc === 'hammer' && (inb === 0 || (inb === 2 && r < 0.5))) out.push([bt3 + (inb === 2 ? 0.5 : 0), 'hammer', 1100 + (bar % 3) * 140, 0.5, inb === 0 ? 0.5 : 0.3]);
        if (S.perc === 'heart' && inb === 0) { out.push([bt3, 'drum', 70, 1, 0.42]); out.push([bt3 + 0.36, 'drum', 64, 1, 0.26]); }
        if (S.perc === 'warm' && (inb === 0 || inb === 2)) out.push([bt3, 'drum', inb ? 120 : 95, 1, inb ? 0.25 : 0.4]);
        if (S.arp && b % 2 === 0) { var steps = S.arp === 'qinUp' ? [0, 2, 3, 4] : [0, 3, 2, 4]; out.push([bt3, 'arp', deg(S.mode, S.root - 12, steps[(b / 2) % 4] + (bar % 2 ? 1 : 0)), 2, 0.4]); }
        if (S.bells && b % 8 === 6 && r < 0.7) out.push([bt3 + 0.5, 'bellhi', deg(S.mode, S.root + 12, Math.floor(r * 5)), 2, 0.35]);
        if (S.wind && b % 16 === 0) out.push([bt3, 'wind', 0, 16, 0.5]);
      }
    }
    return out;
  }
  function playNote(b, n, t, spb, gain) {
    var mus = out(b, gain, 0.6, true), k = n[1], v = n[4];
    if (k === 'qin') qin(b, n[2], t, n[3] * spb, mus, 0.72 * v, n[5]);
    else if (k === 'arp') qin(b, n[2], t, n[3] * spb, mus, 0.32 * v);
    else if (k === 'bell') bell(b, n[2] - 12, t, mus, 0.24 * v, 3.6);
    else if (k === 'bellhi') bell(b, n[2], t, mus, 0.07 * v, 2.2);
    else if (k === 'xun' || k === 'xiao') wind(b, n[2], t, n[3] * spb * 0.92, mus, (k === 'xun' ? 0.085 : 0.1) * v, k);
    else if (k === 'pad') pad(b, n[2], t, n[3] * spb, mus, (n[2].length > 2 ? 0.009 : 0.014) * v);
    else if (k === 'hammer') hammer(b, t, mus, 0.05 * v, n[2]);
    else if (k === 'drum') drum(b, t, mus, 0.2 * v, n[2]);
    else if (k === 'wind') { var w = noiseSrc(b, t, n[3] * spb, mus, 0.03, 'bandpass', 500, 0.6, n[3] * spb * 0.4); w.f.frequency.linearRampToValueAtTime(900, t + n[3] * spb * 0.5); w.f.frequency.linearRampToValueAtTime(420, t + n[3] * spb); }
  }

  // ───────── 音效 ─────────
  var FX = {
    step: function (b, t, mat, who, n) {
      var S = SONGS[cur.ch] || SONGS[0], m = deg(S.mode, S.root + 12, [0, 2, 1, 3, 2, 4][n % 6]) - (who ? 12 : 0), o = out(b, 1, 0.25);
      if (mat === 'glaze') { osc(b, 'sine', mtof(m + 12), t, 0.25, o, 0.05); osc(b, 'sine', mtof(m + 24) * 1.003, t, 0.12, o, 0.02); }
      else if (mat === 'gold') { osc(b, 'sine', mtof(m + 24), t, 0.5, o, 0.035); osc(b, 'sine', mtof(m + 31), t, 0.3, o, 0.015); }
      else if (mat === 'copper') { osc(b, 'sine', mtof(m), t, 0.18, o, 0.05); noiseSrc(b, t, 0.04, o, 0.05, 'bandpass', 1600, 2); }
      else if (mat === 'wood') { osc(b, 'triangle', mtof(m - 12), t, 0.08, o, 0.06); noiseSrc(b, t, 0.03, o, 0.05, 'lowpass', 900); }
      else { noiseSrc(b, t, 0.05, o, 0.07, 'lowpass', 700); osc(b, 'sine', mtof(m - 12), t, 0.1, o, 0.03); }
    },
    tick: function (b, t, k, type) { var o = out(b, 1, 0.3), S = SONGS[cur.ch]; if (type === 'wire') { osc(b, 'sine', mtof(deg(S.mode, S.root + 24, k % 6)), t, 0.15, o, 0.04); } else noiseSrc(b, t, 0.02, o, 0.06, 'bandpass', 2200, 3); },
    snap: function (b, t, type) { var o = out(b, 1, 0.5); if (type === 'wire') { var x = b.ctx.createOscillator(), g = b.ctx.createGain(); x.type = 'sine'; x.frequency.setValueAtTime(1400, t); x.frequency.exponentialRampToValueAtTime(3200, t + 0.12); env(g, t, 0.003, 0.05, 0.35); x.connect(g); g.connect(o); x.start(t); x.stop(t + 0.5); } else { osc(b, 'sine', 130, t, 0.2, o, 0.14); noiseSrc(b, t, 0.05, o, 0.08, 'lowpass', 600); } },
    settle: function (b, t, type) { var S = SONGS[cur.ch], o = out(b, 1, 0.7); qing(b, deg(S.mode, S.root + 12, type === 'wire' ? 4 : 2), t, o, 0.08); },
    closed: function (b, t) { var S = SONGS[cur.ch], o = out(b, 1, 0.8); [0, 2, 4].forEach(function (d, i) { qing(b, deg(S.mode, S.root + 12, d + 5), t + 0.12 + i * 0.11, o, 0.06); }); },
    deny: function (b, t) { var o = out(b, 1, 0.3); osc(b, 'triangle', 98, t, 0.18, o, 0.12); osc(b, 'triangle', 92, t + 0.09, 0.2, o, 0.08); },
    plate: function (b, t) { var S = SONGS[cur.ch], o = out(b, 1, 0.8); bell(b, deg(S.mode, S.root, 0), t, o, 0.14); qing(b, deg(S.mode, S.root + 24, 2), t + 0.05, o, 0.06); },
    rise: function (b, t, dur) { var o = out(b, 1, 0.5); var w = noiseSrc(b, t, dur, o, 0.035, 'lowpass', 180, 0.7, dur * 0.3); w.f.frequency.linearRampToValueAtTime(420, t + dur); pad(b, [43, 50], t, dur, o, 0.008); },
    pour: function (b, t, dur) {
      var S = SONGS[cur.ch], o = out(b, 1, 0.6), r = seeded(Math.floor(t * 100) + 3);
      for (var i = 0; i < 26; i++) { var tt = t + i / 26 * dur + r() * 0.03, f = 500 + r() * 900 + i * 40; var x = b.ctx.createOscillator(), g = b.ctx.createGain(); x.type = 'sine'; x.frequency.setValueAtTime(f, tt); x.frequency.exponentialRampToValueAtTime(f * 1.9, tt + 0.05); env(g, tt, 0.002, 0.02, 0.06); x.connect(g); g.connect(o); x.start(tt); x.stop(tt + 0.1); }
      noiseSrc(b, t, dur, o, 0.025, 'bandpass', 900, 0.9, dur * 0.4);
      for (i = 0; i < 6; i++) qin(b, deg(S.mode, S.root, 3 + i), t + i * dur / 6, 1, o, 0.12);
    },
    filled: function (b, t) { var S = SONGS[cur.ch], o = out(b, 1, 0.8); bell(b, deg(S.mode, S.root, 5), t, o, 0.1); bell(b, deg(S.mode, S.root, 7), t + 0.02, o, 0.06); qing(b, deg(S.mode, S.root + 12, 7), t + 0.1, o, 0.05); },
    spill: function (b, t) { var o = out(b, 1, 0.5); for (var i = 0; i < 7; i++) { var tt = t + i * 0.09, f = 1300 - i * 150; var x = b.ctx.createOscillator(), g = b.ctx.createGain(); x.type = 'sine'; x.frequency.setValueAtTime(f, tt); x.frequency.exponentialRampToValueAtTime(f * 0.6, tt + 0.08); env(g, tt, 0.002, 0.035, 0.1); x.connect(g); g.connect(o); x.start(tt); x.stop(tt + 0.15); } FX.deny(b, t + 0.15); },
    polished: function (b, t) { var S = SONGS[cur.ch], o = out(b, 1, 0.9); for (var i = 0; i < 7; i++) qing(b, deg(S.mode, S.root + 12, i + 2), t + i * 0.07, o, 0.04 + i * 0.005); },
    hold: function (b, t, on) { var o = out(b, 1, 0.6); if (on) { drum(b, t, o, 0.2, 80); var x = b.ctx.createOscillator(), g = b.ctx.createGain(); x.type = 'triangle'; x.frequency.setValueAtTime(220, t); x.frequency.exponentialRampToValueAtTime(330, t + 0.6); env(g, t, 0.01, 0.04, 1.2); x.connect(g); g.connect(o); x.start(t); x.stop(t + 1.4); } else osc(b, 'sine', 110, t, 0.4, o, 0.08); },
    collapse: function (b, t) { var o = out(b, 1, 0.7); drum(b, t, o, 0.3, 60); var w = noiseSrc(b, t, 1.8, o, 0.07, 'lowpass', 700, 0.6, 0.2); w.f.frequency.exponentialRampToValueAtTime(140, t + 1.8); },
    select: function (b, t, i) { var S = SONGS[cur.ch], o = out(b, 1, 0.6); qing(b, deg(S.mode, S.root + (i ? 0 : 12), i ? 0 : 4), t, o, 0.06); },
    gild: function (b, t) { var S = SONGS[cur.ch], o = out(b, 1, 0.9); [7, 9, 11].forEach(function (d, i) { bell(b, deg(S.mode, S.root + 12, d), t + i * 0.06, o, 0.03, 1.6); }); },
    gather: function (b, t) { var o = out(b, 1, 0.8); for (var i = 0; i < 4; i++) osc(b, 'sine', 1800 + i * 420, t + i * 0.04, 0.3, o, 0.012); },
    goal: function (b, t) { var S = SONGS[cur.ch], o = out(b, 1, 0.9); [0, 2, 4, 5].forEach(function (d, i) { qin(b, deg(S.mode, S.root, d + 5), t + i * 0.16, 1.4, o, 0.22); }); bell(b, deg(S.mode, S.root, 0), t + 0.66, o, 0.14, 4); },
    door: function (b, t) { var S = SONGS[cur.ch], o = out(b, 1, 1); bell(b, deg(S.mode, S.root + 12, 0), t, o, 0.08, 3); bell(b, deg(S.mode, S.root + 12, 2), t + 0.3, o, 0.06, 3); },
    vase: function (b, t) { var S = SONGS[cur.ch], o = out(b, 1, 1); [0, 1, 2, 3, 4, 5, 7].forEach(function (d, i) { qing(b, deg(S.mode, S.root + 12, d), t + i * 0.09, o, 0.05); }); bell(b, deg(S.mode, S.root - 12, 0), t + 0.7, o, 0.2, 5); },
    farewell: function (b, t) { var o = out(b, 1, 1); [[64, 1.4], [62, 0.8], [59, 2.4], [57, 3]].reduce(function (tt, n) { wind(b, n[0], tt, n[1], o, 0.12, 'xun'); return tt + n[1]; }, t); },
    reignite: function (b, t) { var o = out(b, 1, 0.8); drum(b, t, o, 0.32, 70); drum(b, t + 0.5, o, 0.26, 80); var w = noiseSrc(b, t, 2.6, o, 0.06, 'lowpass', 300, 0.6, 1); w.f.frequency.linearRampToValueAtTime(1400, t + 2.4); pad(b, [43, 50, 55, 59, 62], t + 0.3, 3, o, 0.012); },
    card: function (b, t, ch) { var S = SONGS[ch], o = out(b, 1, 1); qing(b, deg(S.mode, S.root, 5), t, o, 0.1); bell(b, deg(S.mode, S.root - 12, 0), t + 0.05, o, 0.12, 4); },
    finale: function (b, t) { var o = out(b, 1, 1); [0, 2, 4, 5, 7, 9, 10].forEach(function (d, i) { bell(b, deg('gong', 55, d), t + i * 0.42, o, 0.12, 4); qin(b, deg('gong', 43, d), t + i * 0.42, 2, o, 0.16); }); pad(b, [43, 50, 55, 59], t, 6, o, 0.012); },
    ui: function (b, t) { var o = out(b, 1, 0.4); osc(b, 'sine', 1320, t, 0.12, o, 0.03); },
    titleForm: function (b, t) { var o = out(b, 1, 0.9); for (var i = 0; i < 12; i++) { var x = b.ctx.createOscillator(), g = b.ctx.createGain(), tt = t + 0.4 + i * 0.13; x.type = 'sine'; x.frequency.setValueAtTime(1600 + i * 90, tt); x.frequency.exponentialRampToValueAtTime(3400 + i * 120, tt + 0.16); env(g, tt, 0.004, 0.022, 0.3); x.connect(g); g.connect(o); x.start(tt); x.stop(tt + 0.4); }
      [0, 2, 4, 7, 9].forEach(function (d, i) { qing(b, deg('gong', 67, d), t + 1.9 + i * 0.16, o, 0.05); }); var w = noiseSrc(b, t + 2.7, 1.0, o, 0.05, 'lowpass', 300, 0.6, 0.4); w.f.frequency.linearRampToValueAtTime(1200, t + 3.5); bell(b, 43, t + 3.7, o, 0.2, 5); bell(b, deg('gong', 67, 4), t + 4.0, o, 0.06, 3); },
    emblem: function (b, t, k) { var S2 = SONGS[cur.ch], o = out(b, 1, 1); for (var i = 0; i < 8; i++) bell(b, deg(S2.mode, S2.root + 12, i + (k % 3)), t + 0.7 + i * 0.2, o, 0.05, 2.6); pad(b, [S2.root - 12, S2.root - 5, S2.root], t + 0.5, 3.2, o, 0.008); qing(b, deg(S2.mode, S2.root + 24, 0), t + 2.9, o, 0.07); },
    iris: function (b, t) { var o = out(b, 1, 0.8); var w = noiseSrc(b, t + 2.9, 1.0, o, 0.05, 'bandpass', 500, 1, 0.5); w.f.frequency.exponentialRampToValueAtTime(2400, t + 3.8); [0, 4, 7].forEach(function (d, i) { bell(b, 55 + d, t + 2.95 + i * 0.14, o, 0.06, 2.4); }); },
    assemble: function (b, t) { var S2 = SONGS[cur.ch], o = out(b, 1, 0.7); for (var i = 0; i < 6; i++) qin(b, deg(S2.mode, S2.root, i + 3), t + i * 0.12, 1.2, o, 0.1); },
    finaleRise: function (b, t) { var o = out(b, 1, 1); pad(b, [43, 50, 55], t, 9, o, 0.01); [0, 2, 4, 5, 7, 9, 10].forEach(function (d, i) { bell(b, deg('gong', 55, d), t + 1.4 + i * 1.15, o, 0.08, 4); qin(b, deg('gong', 43, d + 2), t + 1.4 + i * 1.15, 2, o, 0.12); }); drum(b, t + 5.2, o, 0.2, 70); },
    drain: function (b, t) { var o = out(b, 1, 0.5); for (var i = 0; i < 5; i++) { var tt = t + i * 0.07, f = 900 - i * 110; var x = b.ctx.createOscillator(), g = b.ctx.createGain(); x.type = 'sine'; x.frequency.setValueAtTime(f, tt); x.frequency.exponentialRampToValueAtTime(f * 0.55, tt + 0.12); env(g, tt, 0.002, 0.03, 0.14); x.connect(g); g.connect(o); x.start(tt); x.stop(tt + 0.2); } noiseSrc(b, t, 0.5, o, 0.02, 'lowpass', 700, 0.7, 0.05); },
    dive: function (b, t) { var o = out(b, 1, 0.9); pad(b, [38, 45, 50], t, 3.2, o, 0.01); var w = noiseSrc(b, t + 0.6, 2.2, o, 0.05, 'bandpass', 300, 0.8, 1.6); w.f.frequency.exponentialRampToValueAtTime(120, t + 2.8); bell(b, 50, t + 2.7, o, 0.14, 4.5); qing(b, 74, t + 2.75, o, 0.05); },
    turn: function (b, t) { var o = out(b, 1, 0.8); var w = noiseSrc(b, t, 2.4, o, 0.04, 'bandpass', 400, 1.2, 1.1); w.f.frequency.exponentialRampToValueAtTime(1600, t + 2.2); pad(b, [40, 47, 52, 59], t + 0.2, 2.4, o, 0.008); bell(b, 52, t + 2.3, o, 0.12, 4); },
    negVase: function (b, t) { var o = out(b, 1, 1); [0, 2, 4, 7].forEach(function (d, i) { bell(b, deg('yu', 64, d), t + i * 0.12, o, 0.05, 2.6); }); },
    slice: function (b, t, k) { var o = out(b, 1, 0.9); bell(b, deg('gong', 43, k), t, o, 0.16, 3.6); qing(b, deg('gong', 67, k), t + 0.02, o, 0.04); drum(b, t, o, 0.12, 70 + k * 6); }
  };

  // ───────── 实时 ─────────
  var ctx = null, bus = null, cur = { ch: 0, t0: 0, nextBeat: 0, gain: null }, timer = null, scrubN = null;
  var AU = { muted: false, rec: [], recording: false, clock: null };
  function rec(name, args) { if (AU.recording) AU.rec.push({ t: AU.clock ? AU.clock() : 0, name: name, args: args }); }
  AU.init = function () {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    var AC = window.AudioContext || window.webkitAudioContext; if (!AC || root.__CAPTURE) return;
    try { ctx = new AC(); } catch (e) { return; }
    bus = Bus(ctx); bus.master.gain.value = AU.muted ? 0 : 0.8;
    timer = setInterval(sched, 40);
    if (cur.pending !== undefined) AU.music(cur.pending);
  };
  function sched() {
    if (!ctx || !cur.gain) return;
    var S = SONGS[cur.ch], spb = 60 / S.bpm, now = ctx.currentTime, until = now + 0.3;
    var b0 = cur.nextBeat, b1 = Math.max(b0, (until - cur.t0) / spb);
    if (b1 <= b0) return;
    notesFor(cur.ch, b0, b1).forEach(function (n) { playNoteTo(n, cur.t0 + n[0] * spb, spb); });
    cur.nextBeat = b1;
  }
  function playNoteTo(n, t, spb) { var b2 = { ctx: bus.ctx, cache: bus.cache, noise: bus.noise, mus: cur.gain, musRev: cur.rev, sfx: bus.sfx, sfxRev: bus.sfxRev, revIn: bus.revIn }; playNote(b2, n, t, spb, 1); }
  AU.music = function (ch) {
    rec('music', [ch]);
    cur.pending = ch; if (!ctx) { cur.ch = ch; return; }
    var now = ctx.currentTime;
    if (cur.gain) { var og = cur.gain, orv = cur.rev; og.gain.setTargetAtTime(0.0001, now, 0.6); orv.gain.setTargetAtTime(0.0001, now, 0.6); setTimeout(function () { og.disconnect(); orv.disconnect(); }, 4000); }
    cur.ch = ch; cur.gain = ctx.createGain(); cur.gain.gain.setValueAtTime(0.0001, now); cur.gain.gain.linearRampToValueAtTime(1, now + 2.5); cur.gain.connect(bus.mus);
    cur.rev = ctx.createGain(); cur.rev.gain.setValueAtTime(0.0001, now); cur.rev.gain.linearRampToValueAtTime(1, now + 2.5); cur.rev.connect(bus.musRev);
    cur.t0 = now + 0.8; cur.nextBeat = 0;
  };
  Object.keys(FX).forEach(function (k) {
    if (k === 'step') AU.step = function (mat, who, n) { rec('step', [mat, who, n]); if (bus) FX.step(bus, ctx.currentTime + 0.01, mat, who, n); };
    else AU[k] = function () { var a = Array.prototype.slice.call(arguments); rec(k, a); if (bus) FX[k].apply(null, [bus, ctx.currentTime + 0.01].concat(a)); };
  });
  AU.scrub = function (e, prog) { // 持续的打磨声：越磨越亮
    rec('scrub', [e, prog]);
    if (!bus) return;
    var t = ctx.currentTime;
    if (!scrubN && e > 0) { scrubN = noiseSrc(bus, t, 3600, out(bus, 1, 0.3), 0.0001, 'bandpass', 500, 1.4, 0.01); }
    if (scrubN) { scrubN.g.gain.cancelScheduledValues(t); scrubN.g.gain.setTargetAtTime(e > 0 ? 0.05 + e * 0.08 : 0.0001, t, 0.03); scrubN.f.frequency.setTargetAtTime(420 + prog * prog * 4200, t, 0.05); if (e <= 0) { var s = scrubN; setTimeout(function () { try { s.s.stop(); } catch (er) { } }, 400); scrubN = null; } }
  };
  AU.setMute = function (m) { AU.muted = m; if (bus) bus.master.gain.setTargetAtTime(m ? 0 : 0.8, ctx.currentTime, 0.1); };
  AU.pause = function (h) { if (!ctx) return; if (h) ctx.suspend(); else ctx.resume(); };

  // ───────── 离线渲染（宣传片）─────────
  // events: [{t, name, args}]；extra: 额外的乐谱提示 {music:[[t,ch]...], fadeOut}
  AU.renderOffline = function (events, dur, opts) {
    opts = opts || {};
    var sr = 48000, oc = new OfflineAudioContext(2, Math.ceil(sr * dur), sr), b = Bus(oc, oc.destination);
    var mus = events.filter(function (e) { return e.name === 'music'; }).map(function (e) { return [e.t, e.args[0]]; });
    if (opts.music) mus = opts.music;
    mus.forEach(function (m, i) {
      var t0 = m[0] + 0.2, t1 = i + 1 < mus.length ? mus[i + 1][0] + 2.5 : dur, S = SONGS[m[1]], spb = 60 / S.bpm;
      var g = oc.createGain(), rv = oc.createGain(); g.connect(b.mus); rv.connect(b.musRev);
      [g, rv].forEach(function (x) { x.gain.setValueAtTime(0.0001, Math.max(0, m[0])); x.gain.linearRampToValueAtTime(1, m[0] + 1.2); if (i + 1 < mus.length) { x.gain.setValueAtTime(1, mus[i + 1][0]); x.gain.linearRampToValueAtTime(0.0001, mus[i + 1][0] + 2.2); } });
      var bb = { ctx: oc, cache: b.cache, noise: b.noise, mus: g, musRev: rv, sfx: b.sfx, sfxRev: b.sfxRev, revIn: b.revIn };
      notesFor(m[1], 0, (t1 - t0) / spb).forEach(function (n) { var t = t0 + n[0] * spb; if (t < dur) playNote(bb, n, t, spb, 1); });
    });
    if (opts.notes) { // 宣传片专用总谱：[秒, 乐器, 音高, 时值(秒), 力度, 附加]
      var pg = oc.createGain(), pr = oc.createGain(); pg.connect(b.mus); pr.connect(b.musRev);
      (opts.musAuto || [[0, 1]]).forEach(function (a, i) { [pg, pr].forEach(function (x) { if (i === 0) x.gain.setValueAtTime(a[1], a[0]); else x.gain.linearRampToValueAtTime(a[1], a[0]); }); });
      var pb = { ctx: oc, cache: b.cache, noise: b.noise, mus: pg, musRev: pr, sfx: b.sfx, sfxRev: b.sfxRev, revIn: b.revIn };
      opts.notes.forEach(function (n) { if (n[0] < dur) playNote(pb, n, n[0], 1, 1); });
    }
    if (opts.sfxAuto) opts.sfxAuto.forEach(function (a, i) { [b.sfx, b.sfxRev].forEach(function (x) { if (i === 0) x.gain.setValueAtTime(a[1], a[0]); else x.gain.linearRampToValueAtTime(a[1], a[0]); }); });
    var chList = opts.fxCh || mus;
    var chAt = function (t) { var c = 0; chList.forEach(function (m) { if (m[0] <= t) c = m[1]; }); return c; };
    var sc = null;
    events.forEach(function (e) {
      if (e.name === 'music' || e.t >= dur) return;
      cur.ch = chAt(e.t);
      var t = Math.max(0, e.t + 0.01);
      if (e.name === 'scrub') {
        if (!sc && e.args[0] > 0) sc = noiseSrc(b, t, dur - t, out(b, 1, 0.3), 0.0001, 'bandpass', 500, 1.4, 0.01);
        if (sc) { sc.g.gain.setTargetAtTime(e.args[0] > 0 ? 0.05 + e.args[0] * 0.08 : 0.0001, t, 0.03); sc.f.frequency.setTargetAtTime(420 + e.args[1] * e.args[1] * 4200, t, 0.05); if (e.args[0] <= 0) sc = null; }
        return;
      }
      var f = FX[e.name]; if (f) f.apply(null, [b, t].concat(e.args || []));
    });
    if (opts.fadeOut) { b.master.gain.setValueAtTime(0.8, dur - opts.fadeOut); b.master.gain.linearRampToValueAtTime(0.0001, dur); }
    return oc.startRendering();
  };
  AU.SONGS = SONGS; AU.FX = FX;
  root.SY_AUDIO = AU;
})(window);
