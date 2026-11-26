/* 一脉蓝 · game.js — 主循环、建模、交互、演出与界面。 */
(function () {
  'use strict';
  var L = window.SY_LOGIC, G = window.SY_GFX, AU = window.SY_AUDIO, LEVELS = window.SY_LEVELS, M = G.M;
  var CAP = !!window.__CAPTURE;
  var $ = function (id) { return document.getElementById(id); };
  var RX = [0.70710678, 0, -0.70710678], UY = [-0.40824829, 0.81649658, -0.40824829];
  var s2 = function (v) { return [v[0] * RX[0] + v[2] * RX[2], v[0] * UY[0] + v[1] * UY[1] + v[2] * UY[2]]; };
  var hex = function (h) { return [1, 3, 5].map(function (i) { return parseInt(h.substr(i, 2), 16) / 255; }); };
  var mulc = function (c, k) { return [Math.min(1, c[0] * k), Math.min(1, c[1] * k), Math.min(1, c[2] * k)]; };
  var mixc = function (a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; };
  var rgba = function (h, a) { var c = typeof h === 'string' ? hex(h) : h; return 'rgba(' + ((c[0] * 255) | 0) + ',' + ((c[1] * 255) | 0) + ',' + ((c[2] * 255) | 0) + ',' + a + ')'; };
  var clamp = function (v, a, b) { return Math.max(a, Math.min(b, v)); };
  var ease = function (t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
  var easeOut = function (t) { return 1 - Math.pow(1 - t, 3); };
  var MAT = { rk: 0, wd: 0, kl: 0, cu: 1, cuL: 1, au: 2, en: 3, en2: 3, rg: 4 };
  var GOLD = hex('#d9b45a'), GOLDL = hex('#ffe7a3');

  var bgc = $('bg'), glc = $('gl'), fxc = $('fx'), bg = bgc.getContext('2d'), fx = fxc.getContext('2d');
  var R;
  try { R = new G.Renderer(glc); } catch (e) { $('nogl').classList.add('on'); console.error(e); return; }

  var W = 1, H = 1, DPR = 1;
  var save = { done: 0, mute: false };
  try { var sv = JSON.parse(localStorage.getItem('yimailan.v1') || '{}'); if (sv && typeof sv === 'object') { save.done = sv.done | 0; save.mute = !!sv.mute; } } catch (e) { }
  var persist = function () { try { localStorage.setItem('yimailan.v1', JSON.stringify(save)); } catch (e) { } };
  AU.muted = save.mute;

  var S = { mode: 'title', idx: 0, t: 0, world: null, def: null, pal: null, pc: {}, seq: [], cam: { c: [0, 0, 0], ppu: 60, base: 0, intro: 0 }, ga: 1, ext: 14,
    ptr: null, drag: null, scrub: null, pendingTap: null, ripples: [], dust: [], parts: [], pulses: [], fills: [], spills: [], halos: [],
    hintI: 0, hintT: 0, did: {}, beat: 0, vase: { st: 0, anim: null }, orb: null, tokenTaken: false, sel: 0, duo: null, won: false, canContinue: false, flash: 0, fire: 0, kilnLit: 1, stepN: 0 };
  function mkChar(i) { return { i: i, node: null, pos: [0, 0, 0], path: [], step: null, face: 0.8, faceT: 0.8, ref: 0, idle: 0, hop: 0, cheer: 0, vis: 1, fade: null, on: false, prev: null, wave: 0 }; }
  var C = [mkChar(0), mkChar(1)];
  var CM = [{}, {}];

  // ───────────── 投影 ─────────────
  function proj(p) {
    var c = S.cam.c, d = [p[0] - c[0], p[1] - c[1], p[2] - c[2]], s = s2(d);
    return [W / 2 + s[0] * S.cam.ppu, H / 2 - s[1] * S.cam.ppu + S.cam.base + S.cam.intro];
  }
  function fitCamera() {
    var mn = [1e9, 1e9], mx = [-1e9, -1e9], lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
    var add = function (p) {
      var s = s2(p); mn[0] = Math.min(mn[0], s[0]); mn[1] = Math.min(mn[1], s[1]); mx[0] = Math.max(mx[0], s[0]); mx[1] = Math.max(mx[1], s[1]);
      for (var k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], p[k]); hi[k] = Math.max(hi[k], p[k]); }
    };
    S.world.parts.forEach(function (p) {
      var sts = p.kind === 'rot' ? [0, 1, 2, 3] : p.kind === 'slide' ? (p.handles.length ? [p.min, p.max] : [p.max]) : [0];
      if (p.def.wire) return;
      sts.forEach(function (st) {
        (p.def.boxes || []).forEach(function (b) {
          var y0 = Math.max(b[1], -1.6) - 0.5, y1 = b[4] + 0.5;
          if (y1 < y0) return;
          [b[0] - 0.5, b[3] + 0.5].forEach(function (x) { [y0, y1 + 1.2].forEach(function (y) { [b[2] - 0.5, b[5] + 0.5].forEach(function (z) { add(L.tPoint(p, st, [x, y, z])); }); }); });
        });
        p.nodes.forEach(function (n) { add(L.tPoint(p, st, [n.c[0], n.c[1] + 2.0, n.c[2]])); add(L.tPoint(p, st, [n.c[0], n.c[1] - 0.6, n.c[2]])); });
      });
    });
    var top = CAP ? 70 : 84, bot = CAP ? 250 : 100, side = 32, rr = vaseBox().res;
    var ppu = Math.max(6, Math.min((W - side * 2 - rr) / (mx[0] - mn[0]), (H - top - bot) / (mx[1] - mn[1]), 80 * Math.max(1, Math.min(W, H) / 720)));
    var cu = (mn[0] + mx[0]) / 2 + rr / 2 / ppu, cv = (mn[1] + mx[1]) / 2;
    S.cam.c = [RX[0] * cu + UY[0] * cv, UY[1] * cv, RX[2] * cu + UY[2] * cv];
    S.cam.ppu = ppu; S.cam.base = (top - bot) / 2;
    S.ext = Math.max(hi[0] - lo[0], hi[1] - lo[1] + 4, hi[2] - lo[2]) * 0.95 + 3;
  }

  // ───────────── 建模 ─────────────
  function colOf(k) { return S.pc[k] || S.pc.cu; }
  function deco(g, p, x) {
    var c = S.pc, t = x[0], X = x[1], Y = x[2], Z = x[3], by = Y + 0.5, i;
    var gold = function () { g.m = 2; }, plain = function () { g.m = 0; }, cop = function () { g.m = 1; }, ena = function () { g.m = 3; };
    if (t === 'door') { // 极简长方形金框门
      gold(); var w = 0.36, h = 1.18, zz = Z - 0.36;
      g.box(X - w, by + h / 2, zz, 0.035, h / 2, 0.035, c.au); g.box(X + w, by + h / 2, zz, 0.035, h / 2, 0.035, c.au);
      g.box(X, by + h, zz, w + 0.035, 0.035, 0.035, c.au); g.box(X, by + 0.012, zz, w + 0.06, 0.012, 0.07, c.au);
      g.box(X, by + h + 0.09, zz, w * 0.55, 0.012, 0.02, c.au);
      S.doorPanels.push([X, by, zz, w, h]);
      S.doors.push({ part: p, p: [X, by, zz], w: w, h: h });
    } else if (t === 'ore') { // 矿脉踏板：嵌在石中的釉色矿晶
      ena(); g.e = 0.35;
      for (i = 0; i < 5; i++) { var a = i * 1.26 + 0.3, rr = 0.18 + (i % 2) * 0.08; g.frustum(X + Math.cos(a) * rr, by - 0.06, Z + Math.sin(a) * rr, 0.07, 0.0, 0.2 + (i % 3) * 0.07, c[x[4]]); }
      g.e = 0; plain();
    } else if (t === 'crystal') {
      ena(); for (i = 0; i < 4; i++) g.frustum(X + (i - 1.5) * 0.11, by - 0.05, Z + (i % 2) * 0.1, 0.06, 0, 0.3 + i * 0.09, i % 2 ? c.en2 : c.en); plain();
    } else if (t === 'vein') { // 升起的矿脉：侧面的釉色纹
      ena(); g.e = 0.3; for (i = X; i <= x[4]; i++) { g.box(i, Y + 0.2, Z + 0.505, 0.38, 0.03, 0.004, c.en2); g.box(i - 0.12, Y - 0.1, Z + 0.505, 0.22, 0.025, 0.004, c.en); } g.e = 0; plain();
    } else if (t === 'scrap') { // 废铜料堆
      cop(); g.box(X + 0.1, by + 0.05, Z + 0.1, 0.28, 0.05, 0.14, c.cuL); g.box(X - 0.12, by + 0.13, Z - 0.05, 0.16, 0.035, 0.22, c.cu); g.cyl(X + 0.18, by + 0.1, Z - 0.2, 0.09, 0.09, 0.18, c.cuL, 10, 'x'); plain();
    } else if (t === 'anvil') {
      plain(); g.box(X, by + 0.1, Z, 0.13, 0.1, 0.1, [0.16, 0.16, 0.18]); g.box(X, by + 0.25, Z, 0.24, 0.05, 0.12, [0.22, 0.22, 0.24]);
      cop(); g.box(X + 0.05, by + 0.33, Z, 0.16, 0.025, 0.1, c.cuL); plain();
    } else if (t === 'vase') { // 半成的梅瓶铜胎
      cop(); g.lathe(X, by, Z, [[0.1, 0], [0.13, 0.08], [0.18, 0.3], [0.17, 0.42], [0.1, 0.52], [0.05, 0.56], [0.06, 0.62]], c.cuL, 18); plain();
    } else if (t === 'lattice') { // 墙面上的金丝冰裂格窗
      gold(); var ax = x[4];
      var q = function (u, v, du, dv) { if (ax === 'x') g.box(X + 0.505, Y + v, Z + u, 0.006, dv, du, c.au); else g.box(X + u, Y + v, Z + 0.505, du, dv, 0.006, c.au); };
      q(0, 0, 0.32, 0.02); q(0, 0.32, 0.32, 0.02); q(0, -0.32, 0.32, 0.02); q(-0.32, 0, 0.02, 0.34); q(0.32, 0, 0.02, 0.34); q(0, 0, 0.015, 0.32); q(-0.12, 0.16, 0.2, 0.012); q(0.14, -0.16, 0.18, 0.012);
      ena(); g.e = 0.15; if (ax === 'x') g.box(X + 0.502, Y, Z, 0.003, 0.3, 0.3, c.en); else g.box(X, Y, Z + 0.502, 0.3, 0.3, 0.003, c.en); g.e = 0; plain();
    } else if (t === 'hub') { // 转盘轴：铜鼓座 + 金箍
      cop(); g.cyl(X, Y - 0.5, Z, 0.32, 0.32, 0.6, c.cu, 18); gold(); g.cyl(X, Y + 0.08, Z, 0.335, 0.335, 0.03, c.au, 18); g.cyl(X, Y - 0.3, Z, 0.335, 0.335, 0.03, c.au, 18); plain();
    } else if (t === 'book') { // 旧纹样谱
      plain(); g.box(X, by + 0.05, Z, 0.2, 0.05, 0.15, [0.48, 0.18, 0.14]); g.box(X, by + 0.1, Z, 0.19, 0.006, 0.14, [0.9, 0.85, 0.72]);
      gold(); g.box(X - 0.05, by + 0.106, Z, 0.08, 0.002, 0.08, c.au); plain();
    } else if (t === 'spool') { // 铜丝线轴
      gold(); g.cyl(X, by, Z, 0.16, 0.16, 0.03, c.au, 14); g.cyl(X, by + 0.03, Z, 0.11, 0.11, 0.2, c.cuL, 14); g.cyl(X, by + 0.23, Z, 0.16, 0.16, 0.03, c.au, 14); plain();
    } else if (t === 'pots') { // 釉料碟
      var cs = [c.en, c.en2, [0.85, 0.3, 0.25], [0.95, 0.85, 0.55]];
      for (i = 0; i < 4; i++) { plain(); g.cyl(X + (i % 2) * 0.26, by, Z + (i >> 1) * 0.26, 0.11, 0.12, 0.05, [0.92, 0.9, 0.85], 12); ena(); g.cyl(X + (i % 2) * 0.26, by + 0.045, Z + (i >> 1) * 0.26, 0.085, 0.085, 0.01, cs[i], 12); }
      plain();
    } else if (t === 'stones') { // 磨石
      plain(); g.box(X - 0.1, by + 0.05, Z, 0.16, 0.05, 0.09, [0.5, 0.48, 0.44]); g.box(X + 0.16, by + 0.04, Z + 0.15, 0.1, 0.04, 0.07, [0.72, 0.62, 0.38]); g.box(X + 0.1, by + 0.03, Z - 0.18, 0.12, 0.03, 0.05, [0.12, 0.11, 0.11]);
    } else if (t === 'tongs') { gold(); g.bar([X - 0.2, by + 0.02, Z], [X + 0.25, by + 0.02, Z - 0.05], 0.015, c.au); g.bar([X - 0.2, by + 0.02, Z + 0.03], [X + 0.25, by + 0.02, Z + 0.1], 0.015, c.au); plain();
    } else if (t === 'kiln') { // 瓶形窑：砖砌窑身、金箍、方形窑口（不用圆拱）
      plain(); var kc = c.kl;
      g.lathe(X, by, Z, [[0.62, 0], [0.64, 0.12], [0.6, 0.5], [0.46, 0.86], [0.26, 1.12], [0.17, 1.3], [0.17, 1.75], [0.2, 1.8]], kc, 22);
      gold(); g.cyl(X, by + 0.5, Z, 0.605, 0.605, 0.035, c.au, 22); g.cyl(X, by + 1.3, Z, 0.18, 0.18, 0.03, c.au, 14);
      plain(); g.box(X, by + 0.26, Z + 0.5, 0.3, 0.27, 0.16, mulc(kc, 0.75));
      g.m = 6; g.e = 1; g.box(X, by + 0.25, Z + 0.661, 0.2, 0.19, 0.004, c.fire); g.e = 0;
      gold(); g.box(X - 0.22, by + 0.26, Z + 0.665, 0.022, 0.23, 0.01, c.au); g.box(X + 0.22, by + 0.26, Z + 0.665, 0.022, 0.23, 0.01, c.au); g.box(X, by + 0.49, Z + 0.665, 0.25, 0.022, 0.01, c.au);
      plain(); S.kiln = { p: [X, by + 0.3, Z + 0.85] };
    }
    g.m = 0;
  }
  // 可走砖的面：古铜面上嵌一圈细金丝（每块砖都是一个丝格）
  function tileTop(g, q, col, mat, glow) {
    g.m = mat; g.box(q[0], q[1] + 0.502, q[2], 0.44, 0.006, 0.44, col);
    g.m = 2; var y = q[1] + 0.511, r = 0.012, k = 0.44;
    g.box(q[0], y, q[2] - k, k, r, r, S.pc.au); g.box(q[0], y, q[2] + k, k, r, r, S.pc.au); g.box(q[0] - k, y, q[2], r, r, k, S.pc.au); g.box(q[0] + k, y, q[2], r, r, k, S.pc.au);
    g.m = 0; void glow;
  }
  // 珐琅丝格：灌满后的釉板（含表面金丝）；未灌时只有镂空金丝骨架
  function enamelCell(g, q, col, thick, motif) {
    var y1 = q[1] + 0.5, y0 = thick ? q[1] - 0.5 : q[1] + 0.12, cy = (y0 + y1) / 2, hy = (y1 - y0) / 2;
    g.m = 3; g.box(q[0], cy, q[2], 0.47, hy, 0.47, col);
    g.m = 2; var r = 0.022, y = y1 + 0.006;
    g.box(q[0], y, q[2] - 0.47, 0.49, r, r, S.pc.au); g.box(q[0], y, q[2] + 0.47, 0.49, r, r, S.pc.au); g.box(q[0] - 0.47, y, q[2], r, r, 0.49, S.pc.au); g.box(q[0] + 0.47, y, q[2], r, r, 0.49, S.pc.au);
    // 掐丝纹：如意云头的折线 + 小圆点
    var rr = 0.011;
    if (motif % 2 === 0) { g.bar([q[0] - 0.28, y, q[2] - 0.12], [q[0] + 0.05, y, q[2] - 0.12], rr, S.pc.au); g.bar([q[0] + 0.05, y, q[2] - 0.12], [q[0] + 0.05, y, q[2] + 0.2], rr, S.pc.au); g.bar([q[0] - 0.12, y, q[2] + 0.2], [q[0] + 0.28, y, q[2] + 0.2], rr, S.pc.au); }
    else { g.bar([q[0] - 0.2, y, q[2] - 0.24], [q[0] - 0.2, y, q[2] + 0.1], rr, S.pc.au); g.bar([q[0] - 0.2, y, q[2] + 0.1], [q[0] + 0.22, y, q[2] + 0.1], rr, S.pc.au); g.bar([q[0] + 0.22, y, q[2] - 0.2], [q[0] + 0.22, y, q[2] + 0.1], rr, S.pc.au); }
    g.sphere(q[0] + 0.26, y, q[2] - 0.28, 0.035, 0.012, 0.035, S.pc.au, 8);
    g.m = 0;
    return [y0, y1];
  }
  function skeleton(g, q, y0, y1) {
    g.m = 2; var r = 0.02, k = 0.47, ys = [y0, y1], i;
    for (i = 0; i < 2; i++) { var y = ys[i]; g.box(q[0], y, q[2] - k, k, r, r, S.pc.au); g.box(q[0], y, q[2] + k, k, r, r, S.pc.au); g.box(q[0] - k, y, q[2], r, r, k, S.pc.au); g.box(q[0] + k, y, q[2], r, r, k, S.pc.au); }
    for (i = 0; i < 4; i++) g.box(q[0] + (i & 1 ? k : -k), (y0 + y1) / 2, q[2] + (i & 2 ? k : -k), r, (y1 - y0) / 2, r, S.pc.au);
    g.bar([q[0] - k, y1, q[2]], [q[0] + k, y1, q[2]], 0.01, S.pc.au);
    g.m = 0;
  }
  function buildPart(p) {
    var d = p.def, c = S.pc, g = new G.Geo(), ge = new G.Geo(), gw = new G.Geo(), gr = new G.Geo(), mi = 0;
    var special = p.glaze || p.rough;
    (d.boxes || []).forEach(function (b) {
      if (special) return;
      var col = colOf(b[6]), hx = (b[3] - b[0] + 1) / 2, hz = (b[5] - b[2] + 1) / 2, cx = (b[0] + b[3]) / 2, cz = (b[2] + b[5]) / 2;
      g.m = MAT[b[6]] || 0;
      if (d.thin) g.box(cx, b[4] + 0.3, cz, hx, 0.2, hz, col);
      else {
        var y0 = Math.max(b[1], -7);
        g.box(cx, (y0 + b[4]) / 2, cz, hx, (b[4] - y0 + 1) / 2, hz, col);
        if (b[4] - y0 >= 1) { g.m = 2; g.box(cx, b[4] + 0.5 - 0.05, cz, hx + 0.012, 0.018, hz + 0.012, c.au); g.m = 0; } // 檐口金线
      }
    });
    p.nodes.forEach(function (n) {
      var q = n.c;
      if (n.stair) {
        var dr = n.stair;
        for (var i = 0; i < 4; i++) {
          var al = -0.375 + i * 0.25, h = (i + 1) * 0.25;
          g.m = 1; g.box(q[0] + dr[0] * al, q[1] - 0.5 + h / 2, q[2] + dr[2] * al, dr[0] ? 0.125 : 0.5, h / 2, dr[2] ? 0.125 : 0.5, i % 2 ? c.cuL : c.cu);
          g.m = 2; g.box(q[0] + dr[0] * (al + 0.125), q[1] - 0.5 + h, q[2] + dr[2] * (al + 0.125), dr[0] ? 0.012 : 0.5, 0.012, dr[2] ? 0.012 : 0.5, c.au);
        }
        g.m = 0; return;
      }
      if (n.halo) return;
      if (special) {
        var col = colOf((d.boxes && d.boxes[0] && d.boxes[0][6]) || 'en'), yy = enamelCell(ge, q, col, !d.thin && !p.glaze && !(p.kind === 'slide'), mi++);
        if (p.glaze) skeleton(gw, q, yy[0], yy[1]);
        if (p.rough) { gr.m = 4; gr.box(q[0], (yy[0] + yy[1]) / 2 + 0.02, q[2], 0.5, (yy[1] - yy[0]) / 2 + 0.03, 0.5, c.rg); for (var k = 0; k < 5; k++) gr.sphere(q[0] + Math.sin(k * 2.3 + q[0]) * 0.3, yy[1] + 0.03, q[2] + Math.cos(k * 1.7 + q[2]) * 0.3, 0.12, 0.05, 0.1, mulc(c.rg, 0.85 + k * 0.06), 8); }
        if (n.goal) goalMark(ge, q);
        return;
      }
      var nn = n.n;
      if (nn[1] === 1) tileTop(g, q, mixc(c.cuL, c.cu, 0.45), 1);
      if (n.goal || n.goal2) goalMark(g, q);
      if (n.plate) { g.m = 2; g.cyl(q[0], q[1] + 0.5, q[2], 0.3, 0.28, 0.04, c.au, 20); g.m = 3; g.e = 0.4; g.cyl(q[0], q[1] + 0.54, q[2], 0.2, 0.2, 0.008, c.en2, 16); g.e = 0; g.m = 0; }
      if (n.holdOf) { g.m = 2; g.box(q[0], q[1] + 0.52, q[2], 0.34, 0.02, 0.34, c.au); g.m = 6; g.e = 1; g.box(q[0], q[1] + 0.53, q[2], 0.22, 0.008, 0.22, c.fire); g.e = 0; g.m = 0; }
    });
    if (d.wire) { // 可转动的金丝：一根贴地的扁丝，末端一颗金珠
      g.m = 2; var pv = p.pivot, dv = d.wire.dir, ln = d.wire.len, y = pv[1] + 0.56;
      g.bar([pv[0], y, pv[2]], [pv[0] + dv[0] * ln, y, pv[2] + dv[2] * ln], 0.03, c.au);
      g.box(pv[0] + dv[0] * ln / 2, y - 0.04, pv[2] + dv[2] * ln / 2, Math.abs(dv[0]) * ln / 2 + 0.012, 0.05, Math.abs(dv[2]) * ln / 2 + 0.012, c.au);
      g.cyl(pv[0], y - 0.08, pv[2], 0.07, 0.07, 0.14, c.au, 12);
      g.sphere(pv[0] + dv[0] * ln, y + 0.04, pv[2] + dv[2] * ln, 0.1, c.auL, 12);
      g.m = 0;
    }
    (d.deco || []).forEach(function (x) { deco(g, p, x); });
    p.handles.forEach(function (h) {
      if (d.wire) return;
      g.m = 2;
      if (p.kind === 'rot' && p.axis === 'y') {
        var pv = p.pivot, dx = h[0] - pv[0], dz = h[2] - pv[2];
        g.box((h[0] + pv[0]) / 2, h[1] - 0.06, (h[2] + pv[2]) / 2, Math.abs(dx) / 2 + (dx ? 0 : 0.03), 0.03, Math.abs(dz) / 2 + (dz ? 0 : 0.03), c.au);
        g.cyl(h[0], h[1] - 0.12, h[2], 0.06, 0.06, 0.1, c.au, 10);
        g.sphere(h[0], h[1] + 0.02, h[2], 0.13, c.auL, 14);
      } else {
        var ax = Math.abs(h[0] - Math.round(h[0])) > 0.3 ? 'x' : 'z';
        if (ax === 'x') g.cyl(h[0] - 0.14, h[1], h[2], 0.1, 0.1, 0.1, c.au, 14, 'x'); else g.cyl(h[0], h[1], h[2] - 0.14, 0.1, 0.1, 0.1, c.au, 14, 'z');
        g.sphere(h[0], h[1], h[2], 0.14, c.auL, 14);
      }
      g.m = 0;
    });
    return { main: R.mesh(g), en: R.mesh(ge), wire: R.mesh(gw), rough: R.mesh(gr) };
  }
  function goalMark(g, q) { g.m = 2; g.cyl(q[0], q[1] + 0.505, q[2], 0.36, 0.36, 0.012, S.pc.au, 4); g.m = 3; g.e = 0.6; g.cyl(q[0], q[1] + 0.515, q[2], 0.26, 0.26, 0.008, S.pc.en, 4); g.e = 0; g.m = 0; }
  function buildHalo() {
    S.halos.forEach(function (h) { R.free(h.ghost); R.free(h.solid); }); S.halos = [];
    S.world.nodes.forEach(function (n) {
      if (!n.halo) return;
      var q = n.c, g = new G.Geo(), s = new G.Geo(), c = S.pc;
      g.m = 2; g.e = 0.6; var k = 0.44, r = 0.015, y = q[1] + 0.5;
      g.box(q[0], y, q[2] - k, k, r, r, c.auL); g.box(q[0], y, q[2] + k, k, r, r, c.auL); g.box(q[0] - k, y, q[2], r, r, k, c.auL); g.box(q[0] + k, y, q[2], r, r, k, c.auL);
      g.box(q[0], y, q[2], 0.2, r, r, c.auL); g.box(q[0], y, q[2], r, r, 0.2, c.auL);
      s.m = 2; s.box(q[0], q[1] + 0.32, q[2], 0.48, 0.18, 0.48, c.au); s.m = 2; s.e = 0.25; s.box(q[0], q[1] + 0.505, q[2], 0.4, 0.004, 0.4, c.auL);
      S.halos.push({ n: n, ghost: R.mesh(g), solid: R.mesh(s), v: 0 });
    });
  }
  function buildChars() {
    var g, k, lin = [0.94, 0.91, 0.84], robeA = hex('#4f6fa3'), skin = [0.96, 0.86, 0.76], hair = [0.16, 0.14, 0.18], indigo = hex('#e0786a');
    var au = GOLD, en = hex('#1f5fae');
    // 阿蓝：细长的素麻长衫，腰间一圈七格丝格（随章节一格格点上釉色）
    var band = function (filled) {
      var b = new G.Geo(), n = 7;
      b.m = 2; b.cyl(0, 0.235, 0, 0.176, 0.172, 0.014, au, 20); b.cyl(0, 0.33, 0, 0.165, 0.161, 0.014, au, 20);
      for (k = 0; k < n; k++) {
        var a0 = k / n * 6.2832, a1 = (k + 1) / n * 6.2832, am = (a0 + a1) / 2;
        b.m = 2; b.box(Math.cos(a0) * 0.172, 0.283, Math.sin(a0) * 0.172, 0.01, 0.05, 0.01, au);
        b.m = k < filled ? 3 : 5; b.e = k < filled ? 0.25 : 0;
        var col = k < filled ? hex(['#3fb6a8', '#e0786a', '#f0c24b', '#3a6fc4', '#6fae7e', '#f2a7a0', '#f3efe6'][k]) : mixc(robeA, [1, 1, 1], 0.25);
        for (var s = 0; s < 3; s++) {
          var aa = a0 + (a1 - a0) * (s + 0.5) / 3; b.box(Math.cos(aa) * 0.17, 0.283, Math.sin(aa) * 0.17, 0.026, 0.044, 0.026, col);
        }
        b.e = 0; void am;
      }
      return R.mesh(b);
    };
    g = new G.Geo(); g.m = 5;
    g.lathe(0, 0, 0, [[0.19, 0], [0.188, 0.05], [0.16, 0.24], [0.13, 0.42], [0.1, 0.52], [0.06, 0.575], [0, 0.585]], robeA, 20);
    g.m = 5; g.cyl(0, 0.52, 0, 0.085, 0.07, 0.07, lin, 14);
    g.m = 0; g.sphere(0, 0.685, 0, 0.11, 0.115, 0.105, skin, 16);
    g.sphere(0, 0.72, -0.012, 0.115, 0.09, 0.11, hair, 14); g.sphere(0, 0.82, -0.05, 0.045, hair, 10);
    g.m = 3; g.e = 0.6; g.sphere(0.035, 0.85, -0.06, 0.016, en, 8); g.e = 0;
    g.m = 0; g.sphere(-0.04, 0.68, 0.098, 0.012, 0.016, 0.006, [0.1, 0.1, 0.12], 6); g.sphere(0.04, 0.68, 0.098, 0.012, 0.016, 0.006, [0.1, 0.1, 0.12], 6);
    CM[0].body = R.mesh(g);
    CM[0].bandFn = band;
    g = new G.Geo(); g.m = 5; g.box(0, -0.12, 0, 0.018, 0.12, 0.004, indigo); g.box(0.012, -0.25, 0, 0.022, 0.015, 0.005, indigo); CM[0].sash = R.mesh(g);
    g = new G.Geo(); g.m = 2; g.bar([0, 0, 0], [0, -0.14, 0], 0.008, au); g.cyl(0, -0.15, 0, 0.035, 0.035, 0.012, au, 10); g.m = 3; g.e = 0.9; g.sphere(0, -0.2, 0, 0.05, 0.055, 0.05, [0.72, 0.86, 1], 12); g.e = 0; g.m = 2; g.cyl(0, -0.25, 0, 0.03, 0.02, 0.015, au, 10);
    CM[0].lamp = R.mesh(g);
    // 老师傅：编钟般外扩的深褐长袍，铜绿围裙，金丝圆镜，背着掐丝的长镊子
    var robe = [0.34, 0.22, 0.16], pat = hex('#3f7f74'), grey = [0.84, 0.82, 0.78];
    g = new G.Geo(); g.m = 5;
    g.lathe(0, 0, 0, [[0.235, 0], [0.232, 0.04], [0.2, 0.14], [0.165, 0.32], [0.14, 0.44], [0.09, 0.5], [0, 0.51]], robe, 20);
    g.m = 1; g.box(0, 0.24, 0.168, 0.1, 0.16, 0.022, pat);
    g.m = 2; g.cyl(0, 0.35, 0, 0.158, 0.155, 0.02, au, 20);
    g.m = 0; g.sphere(0, 0.59, 0.035, 0.1, 0.105, 0.095, skin, 16);
    g.sphere(0, 0.625, 0.015, 0.104, 0.07, 0.1, grey, 14); g.sphere(0, 0.63, -0.08, 0.05, 0.045, 0.045, grey, 10);
    g.cyl(0, 0.47, 0.085, 0, 0.055, 0.1, grey, 10);
    g.m = 2; g.cyl(-0.04, 0.6, 0.128, 0.026, 0.026, 0.006, au, 12, 'z'); g.cyl(0.04, 0.6, 0.128, 0.026, 0.026, 0.006, au, 12, 'z'); g.box(0, 0.6, 0.131, 0.016, 0.004, 0.003, au);
    g.m = 3; g.e = 0.3; g.cyl(-0.04, 0.6, 0.132, 0.019, 0.019, 0.002, [0.75, 0.85, 0.95], 10, 'z'); g.cyl(0.04, 0.6, 0.132, 0.019, 0.019, 0.002, [0.75, 0.85, 0.95], 10, 'z'); g.e = 0;
    g.m = 2; g.bar([-0.04, 0.12, -0.2], [-0.01, 0.62, -0.17], 0.01, au); g.bar([0.04, 0.12, -0.2], [0.01, 0.62, -0.17], 0.01, au);
    CM[1].body = R.mesh(g);
    g = new G.Geo(); g.e = 1; g.m = 6; g.cyl(0, 0, 0, 0.24, 0.24, 0.004, [0.03, 0.04, 0.09], 18); CM.blob = R.mesh(g);
  }


  function buildToken(i) {
    if (CM.token) R.free(CM.token);
    var g = new G.Geo(), c = S.pc, k;
    g.e = 0.5;
    if (i === 0) { g.m = 3; for (k = 0; k < 4; k++) g.frustum((k - 1.5) * 0.07, -0.12, (k % 2) * 0.06 - 0.03, 0.05, 0, 0.22 + (k % 3) * 0.06, k % 2 ? c.en2 : c.en); }
    else if (i === 1) { g.m = 1; g.lathe(0, -0.15, 0, [[0.05, 0], [0.07, 0.04], [0.1, 0.14], [0.08, 0.22], [0.035, 0.27], [0.04, 0.3]], c.cuL, 16); }
    else if (i === 2) { g.m = 2; for (k = 0; k < 4; k++) g.cyl(0, -0.08 + k * 0.045, 0, 0.11 - k * 0.005, 0.11 - k * 0.005, 0.016, c.auL, 18); }
    else if (i === 3) { g.m = 3; g.sphere(0, -0.04, 0, 0.09, 0.09, 0.09, c.en, 14); g.cyl(0, 0.03, 0, 0.078, 0, 0.14, c.en, 14); }
    else if (i === 4) { g.m = 6; g.e = 1; g.cyl(0, -0.12, 0, 0.09, 0, 0.3, c.fire, 10); g.cyl(0.05, -0.12, 0.03, 0.05, 0, 0.18, [1, 0.85, 0.5], 8); g.cyl(-0.05, -0.12, -0.02, 0.05, 0, 0.2, [1, 0.6, 0.2], 8); }
    else if (i === 5) { g.m = 3; g.e = 0.7; g.cyl(0, -0.02, 0, 0.13, 0.13, 0.03, [0.55, 0.78, 1], 20, 'z'); g.m = 2; g.e = 0.3; g.cyl(0, -0.02, -0.004, 0.15, 0.15, 0.038, c.au, 20, 'z'); }
    else if (i === 6) { g.m = 2; g.e = 0.4; g.box(0, 0, 0, 0.12, 0.004, 0.12, c.auL); g.box(0.03, 0.03, 0.02, 0.1, 0.004, 0.1, c.au); }
    else { g.m = 3; g.lathe(0, -0.16, 0, [[0.05, 0], [0.07, 0.04], [0.1, 0.14], [0.08, 0.22], [0.035, 0.27], [0.04, 0.3]], c.en, 16); g.m = 2; g.cyl(0, -0.02, 0, 0.102, 0.1, 0.012, c.au, 16); g.cyl(0, 0.08, 0, 0.083, 0.08, 0.01, c.au, 16); }
    g.e = 0; CM.token = R.mesh(g);
  }

  // ───────────── 关卡载入 ─────────────
  function loadLevel(i) {
    var def = LEVELS[i], k;
    S.idx = i; S.def = def; S.pal = def.pal; S.pc = {};
    for (k in def.pal) if (typeof def.pal[k] === 'string' && def.pal[k][0] === '#') S.pc[k] = hex(def.pal[k]);
    S.parts.forEach(function (m) { ['main', 'en', 'wire', 'rough'].forEach(function (q) { R.free(m[q]); }); }); S.parts = [];
    S.seq = []; S.doors = []; S.doorPanels = []; S.kiln = null;
    S.world = L.build(def);
    S.world.parts.forEach(function (p) { p.anim = null; p.shake = 0; p.polish = 0; p.fillK = p.filled ? 1 : 0; var ms = buildPart(p); ms.part = p; S.parts.push(ms); });
    if (CM.door) R.free(CM.door); var gd = new G.Geo(); gd.m = 6; gd.e = 1;
    S.doorPanels.forEach(function (d) { gd.box(d[0], d[1] + d[4] / 2, d[2], d[3] - 0.03, d[4] / 2 - 0.02, 0.006, [1, 0.86, 0.6]); gd.box(d[0], d[1] + d[4] * 0.4, d[2] + 0.005, d[3] * 0.6, d[4] * 0.36, 0.006, [1, 0.97, 0.88]); });
    CM.door = R.mesh(gd);
    buildHalo();
    if (CM[0].band) R.free(CM[0].band); CM[0].band = CM[0].bandFn(i);
    fitCamera();
    S.duo = def.duo || null;
    C.forEach(function (c) { c.on = false; c.path = []; c.step = null; c.fade = null; c.vis = 1; c.cheer = 0; c.wave = 0; c.prev = null; c.face = c.faceT = 0.8; });
    C[0].on = true; setNode(C[0], S.world.start);
    if (S.duo && S.world.start2) { C[1].on = true; setNode(C[1], S.world.start2); C[1].face = C[1].faceT = 0.8; }
    S.sel = 0; S.won = false; S.canContinue = false; S.drag = null; S.scrub = null; S.ptr = null; S.pendingTap = null; S.ripples = []; S.pulses = []; S.fills = []; S.spills = [];
    S.hintI = 0; S.hintT = 0; S.did = {}; S.beat = 0; S.flash = 0; S.vase = { st: i, anim: null }; S.orb = null; S.tokenTaken = false; buildToken(i); S.kilnLit = i === 7 ? 0.25 : 1;
    initDust(); drawBG();
    var rs = document.documentElement.style; rs.setProperty('--ink', def.pal.ink); rs.setProperty('--ink-soft', rgba(def.pal.ink, 0.45)); rs.setProperty('--ts', def.pal.stars ? '0 1px 10px rgba(0,0,0,.45)' : '0 0 12px rgba(255,250,240,.7)');
    $('chname').textContent = (def.no === '序' ? '序' : '第' + def.no + '道') + ' · ' + def.name;
    $('endline').classList.remove('on'); $('endgo').classList.remove('on'); setHint('');
    $('who').classList.toggle('on', S.duo === 'ctrl'); updWho();
    AU.music(def.music.ch);
  }
  function setNode(c, n) { c.node = n; c.pos = n.stand.slice(); c.ref = n.part.val; }
  function updWho() { $('w0').classList.toggle('sel', S.sel === 0); $('w1').classList.toggle('sel', S.sel === 1); }
  function after(sec, fn) { S.seq.push({ at: S.t + sec, fn: fn }); }
  function setHint(t) { var h = $('hint'); if (t) { h.textContent = t; h.classList.add('on'); } else h.classList.remove('on'); }
  function nextHint() {
    var hs = S.def.hints || []; while (hs[S.hintI] && S.did[hs[S.hintI][1]]) S.hintI++;
    if (S.hintI >= hs.length) { setHint(''); return; }
    setHint(hs[S.hintI][0]); S.hintT = 0;
  }
  function hintEvent(ev) {
    S.did[ev] = 1;
    var hs = S.def.hints || [], h = hs[S.hintI]; if (!h || S.mode !== 'play') return;
    if (h[1] === ev) { S.hintI++; setHint(''); after(0.9, nextHint); }
  }
  function veil(on, cb) { var v = $('veil'); v.classList.toggle('on', on); if (cb) { if (CAP) cb(); else setTimeout(cb, on ? 750 : 60); } }
  function showCard() {
    S.mode = 'card'; S.ga = 0; S.cam.intro = 90; var d = S.def;
    $('cno').textContent = d.no === '序' ? '序 章' : '第 ' + d.no + ' 道 工 序'; $('cname').textContent = d.name; $('ccraft').textContent = d.craft; $('cpoem').textContent = d.poem;
    $('card').classList.add('on'); AU.card(S.idx);
    after(3.6, beginIntro);
  }
  function beginIntro() {
    if (S.mode !== 'card' && S.mode !== 'load') return;
    $('card').classList.remove('on'); S.mode = 'intro'; S.introT = 0; S.seq = [];
  }
  function start(i, withCard) {
    S.mode = 'load';
    veil(true, function () {
      ['title', 'levels', 'finale'].forEach(function (id) { $(id).classList.remove('on'); });
      $('hud').classList.add('on'); $('chapter').classList.add('on');
      loadLevel(i);
      if (withCard) showCard(); else { S.ga = 0; S.cam.intro = 90; beginIntro(); }
      veil(false);
    });
  }

  // ───────────── 背景：深靛水彩 + 矿物颗粒 + 铜锈暖褐 + 哑金细线 ─────────────
  function rnd(seed) { var s = (seed * 9301 + 49297) % 233280; return function () { s = (s * 9301 + 49297) % 233280; return s / 233280; }; }
  var grain = null;
  function makeGrain() {
    var c = document.createElement('canvas'); c.width = c.height = 256; var x = c.getContext('2d'), d = x.createImageData(256, 256), r = rnd(7);
    for (var i = 0; i < d.data.length; i += 4) { var v = r(); var on = v > 0.86; d.data[i] = on ? 230 : 0; d.data[i + 1] = on ? 215 : 0; d.data[i + 2] = on ? 170 : 0; d.data[i + 3] = on ? (r() * 34) | 0 : (r() * 22) | 0; }
    x.putImageData(d, 0, 0); grain = c;
  }
  function drawBG() {
    var pal = S.pal, g, i, k, r = rnd(S.idx * 13 + 5);
    g = bg.createLinearGradient(0, 0, 0, H); g.addColorStop(0, pal.sky[0]); g.addColorStop(0.55, pal.sky[1]); g.addColorStop(1, pal.sky[2]);
    bg.fillStyle = g; bg.fillRect(0, 0, W, H);
    // 水彩晕染：大小不一的淡色水渍
    for (i = 0; i < 46; i++) {
      var x = r() * W, y = r() * H, rr = (0.08 + r() * 0.3) * Math.max(W, H), col = r() < 0.7 ? pal.mist : pal.sky[r() < 0.5 ? 0 : 2], a = 0.035 + r() * 0.07;
      bg.save(); bg.translate(x, y); bg.rotate(r() * 3.14); bg.scale(1, 0.45 + r() * 0.5);
      g = bg.createRadialGradient(0, 0, rr * 0.1, 0, 0, rr); g.addColorStop(0, rgba(col, a)); g.addColorStop(0.7, rgba(col, a * 0.6)); g.addColorStop(1, rgba(col, 0));
      bg.fillStyle = g; bg.beginPath(); bg.arc(0, 0, rr, 0, 6.2832); bg.fill(); bg.restore();
    }
    // 铜锈暖褐：角落沉淀
    for (i = 0; i < 5; i++) { var cx = (r() < 0.5 ? 0.05 : 0.95) * W, cy = (0.75 + r() * 0.3) * H, cr = (0.2 + r() * 0.25) * W; g = bg.createRadialGradient(cx, cy, 0, cx, cy, cr); g.addColorStop(0, 'rgba(168,113,74,0.10)'); g.addColorStop(1, 'rgba(168,113,74,0)'); bg.fillStyle = g; bg.fillRect(0, 0, W, H); }
    if (pal.stars) { for (i = 0; i < 160 * pal.stars; i++) { var sx = r() * W, sy = r() * H * 0.75, sr = 0.4 + r() * 1.1; bg.fillStyle = 'rgba(255,244,214,' + (0.2 + r() * 0.6) + ')'; bg.beginPath(); bg.arc(sx, sy, sr, 0, 6.2832); bg.fill(); } }
    if (pal.skylight) { // 天窗冷光
      bg.save(); bg.globalCompositeOperation = 'lighter';
      for (i = 0; i < 3; i++) { var x0 = W * (0.12 + i * 0.13); g = bg.createLinearGradient(x0, 0, x0 + W * 0.35, H); g.addColorStop(0, 'rgba(255,250,235,0.3)'); g.addColorStop(1, 'rgba(255,250,235,0)'); bg.fillStyle = g; bg.beginPath(); bg.moveTo(x0, 0); bg.lineTo(x0 + W * 0.06, 0); bg.lineTo(x0 + W * 0.5, H); bg.lineTo(x0 + W * 0.36, H); bg.fill(); }
      bg.restore();
    }
    // 远山：墨色层叠，山脊勾一笔哑金细线
    for (k = 0; k < 3; k++) {
      var by = H * (0.56 + 0.13 * k), amp = H * (0.12 - 0.025 * k), sd = S.idx * 3.7 + k * 9.1, fr = 3.0 * (1 + k * 0.35), pts = [];
      for (var px = 0; px <= W + 8; px += 6) {
        var u = px / W * fr, rg = Math.sin(u * 1.3 + sd) * 0.5 + Math.sin(u * 2.9 + sd * 1.7) * 0.25 + Math.sin(u * 6.1 + sd * 2.3) * 0.12 + Math.sin(u * 13 + sd) * 0.03;
        pts.push([px, by - amp * (0.5 + rg)]);
      }
      bg.beginPath(); bg.moveTo(0, H); pts.forEach(function (p) { bg.lineTo(p[0], p[1]); }); bg.lineTo(W, H); bg.closePath();
      g = bg.createLinearGradient(0, by - amp * 1.4, 0, by + H * 0.3); g.addColorStop(0, rgba(pal.mist, 0.34 + 0.14 * k)); g.addColorStop(1, rgba(pal.mist, 0.04));
      bg.fillStyle = g; bg.fill();
      if (k < 2) { bg.strokeStyle = 'rgba(190,150,70,' + (0.3 + 0.15 * k) + ')'; bg.lineWidth = 0.9; bg.beginPath(); pts.forEach(function (p, j) { if (j) bg.lineTo(p[0], p[1] + 0.5); else bg.moveTo(p[0], p[1] + 0.5); }); bg.stroke(); }
    }
    if (pal.lamp) { var lx = W * 0.12, ly = H * 0.62; g = bg.createRadialGradient(lx, ly, 0, lx, ly, 40); g.addColorStop(0, 'rgba(255,190,110,0.8)'); g.addColorStop(0.15, 'rgba(255,170,90,0.35)'); g.addColorStop(1, 'rgba(255,170,90,0)'); bg.fillStyle = g; bg.fillRect(lx - 40, ly - 40, 80, 80); }
    // 雾
    g = bg.createLinearGradient(0, H * 0.7, 0, H); g.addColorStop(0, rgba(pal.fog, 0)); g.addColorStop(1, rgba(pal.fog, 0.8));
    bg.fillStyle = g; bg.fillRect(0, H * 0.7, W, H * 0.3);
    if (!grain) makeGrain();
    bg.fillStyle = bg.createPattern(grain, 'repeat'); bg.fillRect(0, 0, W, H);
    // 纸边暗角
    g = bg.createRadialGradient(W / 2, H * 0.45, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.75); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, pal.stars ? 'rgba(8,8,30,0.45)' : rgba(pal.ink, 0.16));
    bg.fillStyle = g; bg.fillRect(0, 0, W, H);
  }


  // ───────────── 天上的器：一件梅瓶，随每道工序成形 ─────────────
  function vaseBox() { var h = clamp(Math.min(H * 0.26, W * 0.2), 84, 220); var land = W > H * 1.05; return { h: h, x: land ? W - h * 0.42 - 34 : W - h * 0.32 - 18, y: land ? H * 0.42 : 70 + h * 0.5, res: land ? h * 0.84 + 40 : 0 }; }
  var VP = [[0, 0.3], [0.05, 0.33], [0.3, 0.46], [0.55, 0.56], [0.7, 0.57], [0.8, 0.46], [0.86, 0.28], [0.9, 0.15], [0.94, 0.13], [0.975, 0.16], [1, 0.17]];
  function vasePath(c, cx, cy, h) {
    var w = h * 0.5, y0 = cy + h / 2, pts = VP.map(function (p) { return [p[1] * w, y0 - p[0] * h]; }), i;
    c.beginPath(); c.moveTo(cx - pts[0][0], pts[0][1]);
    var side = function (sg, arr) { for (i = 1; i < arr.length; i++) { var a = arr[i - 1], b = arr[i]; var my = (a[1] + b[1]) / 2; c.bezierCurveTo(cx + sg * a[0], my, cx + sg * b[0], my, cx + sg * b[0], b[1]); } };
    c.lineTo(cx + pts[0][0], pts[0][1]); side(1, pts);
    c.lineTo(cx - pts[pts.length - 1][0], pts[pts.length - 1][1]); side(-1, pts.slice().reverse());
    c.closePath();
  }
  function vr(h, y) { // 高度 y(0..1) 处的半宽
    for (var i = 1; i < VP.length; i++) if (VP[i][0] >= y) { var a = VP[i - 1], b = VP[i], k = (y - a[0]) / (b[0] - a[0]), e = (1 - Math.cos(k * Math.PI)) / 2; return (a[1] + (b[1] - a[1]) * e) * h * 0.5; }
    return VP[VP.length - 1][1] * h * 0.5;
  }
  function drawVase(c, cx, cy, h, st, t) {
    var k = function (n) { return clamp(st - n + 1, 0, 1); }, y0 = cy + h / 2, Y = function (y) { return y0 - y * h; }, i;
    c.save();
    if (k(8) > 0) { var g0 = c.createRadialGradient(cx, cy, h * 0.1, cx, cy, h * 0.6); g0.addColorStop(0, 'rgba(255,226,160,' + 0.5 * k(8) + ')'); g0.addColorStop(1, 'rgba(255,226,160,0)'); c.fillStyle = g0; c.fillRect(cx - h * 0.6, cy - h * 0.6, h * 1.2, h * 1.2); }
    // 空器：虚线金轮廓
    vasePath(c, cx, cy, h); c.setLineDash([3, 5]); c.lineWidth = 1; c.strokeStyle = S.pal && S.pal.stars ? 'rgba(255,226,150,' + (0.6 * (1 - k(2)) + 0.05) + ')' : 'rgba(176,128,40,' + (0.7 * (1 - k(2)) + 0.05) + ')'; c.stroke(); c.setLineDash([]);
    // 一 色样：几粒蓝矿在器旁浮着
    if (k(1) > 0) for (i = 0; i < 5; i++) { var a = t * 0.4 + i * 1.26, rx = cx + Math.cos(a) * h * 0.38, ry = cy + Math.sin(a * 1.3) * h * 0.12 + h * 0.05; var gg = c.createRadialGradient(rx, ry, 0, rx, ry, 7); gg.addColorStop(0, 'rgba(110,190,255,' + 0.9 * k(1) * (1 - k(4)) + ')'); gg.addColorStop(1, 'rgba(110,190,255,0)'); c.fillStyle = gg; c.fillRect(rx - 7, ry - 7, 14, 14); }
    c.save(); vasePath(c, cx, cy, h); c.clip();
    // 二 铜胎
    if (k(2) > 0) { var gc = c.createLinearGradient(cx - h * 0.3, 0, cx + h * 0.3, 0); gc.addColorStop(0, 'rgba(70,42,26,' + k(2) + ')'); gc.addColorStop(0.42, 'rgba(178,112,64,' + k(2) + ')'); gc.addColorStop(1, 'rgba(60,36,24,' + k(2) + ')'); c.fillStyle = gc; c.fillRect(cx - h, cy - h, h * 2, h * 2); }
    // 四 点蓝 / 五 烧蓝：釉色由哑变亮
    if (k(4) > 0) {
      var sat = k(5), al = k(4);
      var gb = c.createLinearGradient(cx - h * 0.3, 0, cx + h * 0.3, 0); gb.addColorStop(0, 'rgba(' + (40 - 10 * sat) + ',' + (120 + 10 * sat) + ',' + (118 + 8 * sat) + ',' + al + ')'); gb.addColorStop(0.45, 'rgba(' + (100 - 30 * sat) + ',' + (190 + 15 * sat) + ',' + (176 + 10 * sat) + ',' + al + ')'); gb.addColorStop(1, 'rgba(30,96,96,' + al + ')');
      c.fillStyle = gb; c.fillRect(cx - h, Y(0.74), h * 2, Y(0.2) - Y(0.74));
      c.fillStyle = 'rgba(' + (50 + 8 * sat) + ',' + (90 + 20 * sat) + ',' + (170 + 30 * sat) + ',' + al + ')'; c.fillRect(cx - h, Y(0.9), h * 2, Y(0.74) - Y(0.9));
      c.fillStyle = 'rgba(224,120,106,' + al + ')'; c.fillRect(cx - h, Y(0.2), h * 2, Y(0) - Y(0.2));
      var fc = ['rgba(224,120,106,', 'rgba(240,194,75,', 'rgba(242,167,160,', 'rgba(58,111,196,', 'rgba(240,194,75,']; for (i = 0; i < 5; i++) { var px = cx + (i - 2) * h * 0.11; c.fillStyle = fc[i] + al + ')'; c.beginPath(); c.arc(px, Y(0.47) + Math.sin(i * 2) * h * 0.04, h * 0.036, 0, 6.28); c.fill(); }
      c.fillStyle = 'rgba(230,200,90,' + al * 0.8 + ')'; c.fillRect(cx - h, Y(0.98), h * 2, Y(0.9) - Y(0.98));
    }
    // 六 磨光：一道竖向高光
    if (k(6) > 0) { var gh = c.createLinearGradient(cx - h * 0.22, 0, cx - h * 0.05, 0); gh.addColorStop(0, 'rgba(255,255,255,0)'); gh.addColorStop(0.5, 'rgba(255,255,255,' + 0.38 * k(6) + ')'); gh.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = gh; c.fillRect(cx - h * 0.25, Y(0.95), h * 0.22, h * 0.9); }
    c.restore();
    // 三 掐丝：金丝纹样（七 镀金后更亮、更粗）
    if (k(3) > 0) {
      var gl = k(7), lw = 0.9 + 0.7 * gl; c.strokeStyle = 'rgba(' + (220 + 35 * gl) + ',' + (176 + 50 * gl) + ',' + (90 + 50 * gl) + ',' + k(3) + ')'; c.lineWidth = lw;
      if (gl > 0) { c.shadowColor = 'rgba(255,220,140,' + 0.8 * gl + ')'; c.shadowBlur = 6 * gl; }
      [0.2, 0.74, 0.9].forEach(function (y) { var w = vr(h, y); c.beginPath(); c.moveTo(cx - w, Y(y)); c.lineTo(cx + w, Y(y)); c.stroke(); });
      // 肩部如意云头
      var wn = 5; for (i = 0; i < wn; i++) { var u0 = -1 + i * 2 / wn, u1 = u0 + 2 / wn, w2 = vr(h, 0.72); var xa = cx + u0 * w2 * 0.92, xb = cx + u1 * w2 * 0.92, xm = (xa + xb) / 2; c.beginPath(); c.moveTo(xa, Y(0.74)); c.quadraticCurveTo(xa, Y(0.62), xm - h * 0.02, Y(0.63)); c.arc(xm, Y(0.64), h * 0.022, Math.PI, 0); c.quadraticCurveTo(xb, Y(0.62), xb, Y(0.74)); c.stroke(); }
      // 腹部缠枝
      c.beginPath(); for (i = 0; i <= 40; i++) { var u = -1 + i / 20, yy = 0.46 + Math.sin(u * 7) * 0.05, w3 = vr(h, yy) * 0.9; if (i) c.lineTo(cx + u * w3, Y(yy)); else c.moveTo(cx + u * w3, Y(yy)); } c.stroke();
      for (i = 0; i < 5; i++) { var sx = cx + (i - 2) * h * 0.11, sy = Y(0.47) + Math.sin(i * 2) * h * 0.04; c.beginPath(); c.arc(sx, sy, h * 0.04, 0, 6.28); c.stroke(); }
      // 足部莲瓣
      var w4 = vr(h, 0.1); for (i = 0; i < 6; i++) { var xa2 = cx - w4 + i * w4 * 2 / 6, xb2 = xa2 + w4 * 2 / 6; c.beginPath(); c.moveTo(xa2, Y(0.02)); c.quadraticCurveTo((xa2 + xb2) / 2, Y(0.32), xb2, Y(0.02)); c.stroke(); }
      c.shadowBlur = 0;
    }
    if (k(2) > 0) { vasePath(c, cx, cy, h); c.lineWidth = 1.2 + k(7); c.strokeStyle = 'rgba(255,226,150,' + (0.35 + 0.5 * k(7)) * k(2) + ')'; c.stroke(); }
    c.restore();
  }

  // ───────────── 粒子 / 特效 ─────────────
  function initDust() {
    var t = S.pal.fx, n = t === 'ember' ? 46 : t === 'star' ? 40 : t === 'grit' ? 30 : 40; S.dust = [];
    for (var i = 0; i < n; i++) S.dust.push({ x: Math.random(), y: Math.random(), r: 0.5 + Math.random(), ph: Math.random() * 6.28, sp: 0.5 + Math.random() });
  }
  function glowDot(x, y, r, col, a) {
    if (!(r > 0.5) || !(a > 0.002)) return;
    var g = fx.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, rgba(col, a)); g.addColorStop(1, rgba(col, 0));
    fx.fillStyle = g; fx.beginPath(); fx.arc(x, y, r, 0, 6.2832); fx.fill();
  }
  var parts = [];
  function burst(p, n, col, sp, life, grav) { for (var i = 0; i < n; i++) parts.push({ p: p.slice(), v: [(Math.random() - 0.5) * sp, Math.random() * sp * 0.8, (Math.random() - 0.5) * sp], t: 0, life: life * (0.6 + Math.random() * 0.6), col: col, g: grav || 0, r: 1 + Math.random() * 2 }); }
  function lampPos(c) {
    var f = faceOf(c), cs = Math.cos(f), sn = Math.sin(f), x = 0.2, z = 0.06, y = 0.42 + c.hop;
    return [c.pos[0] + x * cs + z * sn, c.pos[1] + y - 0.2, c.pos[2] - x * sn + z * cs];
  }
  function drawFX(dt) {
    var pal = S.pal, t = S.t, i, d, s, ppu = S.cam.ppu;
    fx.clearRect(0, 0, W, H);
    if (S.mode === 'title' || S.mode === 'load' || !S.world) { if (S.mode === 'title') { var tb = vaseBox(); drawVase(fx, tb.x, tb.y, tb.h, 0, S.t); } return; }
    fx.globalAlpha = 1;
    var vb = vaseBox(); if (S.vase.anim) { var va = S.vase.anim; va.t += dt / 1.8; S.vase.st = va.from + (va.to - va.from) * ease(clamp(va.t, 0, 1)); if (va.t >= 1) S.vase.anim = null; }
    drawVase(fx, vb.x, vb.y, vb.h, S.vase.st, t);
    if (S.orb) {
      var o = S.orb; o.t += dt / o.dur; var u = ease(clamp(o.t, 0, 1)), a0 = o.a, b0 = [vb.x, vb.y], qx0 = (a0[0] + b0[0]) / 2, qy0 = Math.min(a0[1], b0[1]) - 80;
      var ox = (1 - u) * (1 - u) * a0[0] + 2 * u * (1 - u) * qx0 + u * u * b0[0], oy = (1 - u) * (1 - u) * a0[1] + 2 * u * (1 - u) * qy0 + u * u * b0[1];
      fx.globalCompositeOperation = 'lighter'; glowDot(ox, oy, 30, '#9cc8ff', 0.75); glowDot(ox, oy, 8, '#ffffff', 0.95); fx.globalCompositeOperation = 'source-over';
      if (o.t >= 1) { S.orb = null; S.vase.anim = { from: S.vase.st, to: S.idx + 1, t: 0 }; AU.vase(); }
    }
    fx.globalAlpha = S.ga;
    fx.globalCompositeOperation = 'lighter';
    // 双晕
    if (S.def.haloR && C[1].on) C.forEach(function (c, k) {
      s = proj([c.pos[0], c.pos[1] + 0.4, c.pos[2]]); var rr = S.def.haloR * ppu * 1.02;
      var g = fx.createRadialGradient(s[0], s[1], rr * 0.2, s[0], s[1], rr); g.addColorStop(0, 'rgba(255,214,130,0.0)'); g.addColorStop(0.8, 'rgba(255,214,130,' + (k === S.sel ? 0.06 : 0.04) + ')'); g.addColorStop(0.97, 'rgba(255,224,150,0.13)'); g.addColorStop(1, 'rgba(255,224,150,0)');
      fx.fillStyle = g; fx.beginPath(); fx.arc(s[0], s[1], rr, 0, 6.2832); fx.fill();
    });
    if (!S.tokenTaken) { var gn2 = S.world.nodes.filter(function (n) { return n.goal; })[0]; if (gn2 && gn2.active) { s = proj([gn2.stand[0], gn2.stand[1] + 0.95, gn2.stand[2]]); glowDot(s[0], s[1], ppu * 1.1, S.idx === 4 ? '#ff9a4a' : '#9cc8ff', 0.4); } }
    // 门的光
    S.doors.forEach(function (dr) { var p = L.tPoint(dr.part, dr.part.val, [dr.p[0], dr.p[1] + dr.h * 0.5, dr.p[2]]); s = proj(p); glowDot(s[0], s[1], ppu * 1.3, '#ffd98a', 0.25 + 0.05 * Math.sin(t * 1.7)); });
    // 窑火
    if (S.kiln) { s = proj(S.kiln.p); var fl = S.kilnLit * (0.8 + 0.2 * Math.sin(t * 7.3) * Math.sin(t * 3.1)) + S.fire; glowDot(s[0], s[1], ppu * (2.4 + S.fire * 2), '#ff7a30', 0.32 * fl); glowDot(s[0], s[1], ppu * 0.6, '#ffd08a', 0.5 * fl); }
    // 阿蓝的釉灯
    if (C[0].on) { var lp = lampPos(C[0]); s = proj(lp); glowDot(s[0], s[1], ppu * (0.9 + 0.05 * Math.sin(t * 2.3)), '#9cc8ff', 0.3); }
    // 踏板与托举
    S.world.nodes.forEach(function (n) {
      if (n.plate && !n.pressed && n.active) { s = proj(n.stand); glowDot(s[0], s[1], ppu * (0.6 + 0.08 * Math.sin(t * 2)), '#6fd0e0', 0.32); }
      if (n.holdOf && n.active) { s = proj(n.stand); glowDot(s[0], s[1], ppu * (0.7 + 0.1 * Math.sin(t * 3)), '#ff8a3c', L.occupied(S.world, n) ? 0.45 : 0.22); }
    });
    // 光的节拍：机关落定后的一闪
    for (i = S.pulses.length - 1; i >= 0; i--) { var pu = S.pulses[i]; pu.t += dt / pu.dur; if (pu.t >= 1) { S.pulses.splice(i, 1); continue; } s = proj(pu.p); glowDot(s[0], s[1], ppu * (1 + 2.2 * easeOut(Math.max(0, pu.t))), pu.col, 0.3 * (1 - Math.max(0, pu.t))); }
    fx.globalCompositeOperation = 'source-over';
    // 托举的金丝：师傅手里绷紧的线
    S.world.parts.forEach(function (p) {
      if (!p.hold || p.state !== p.hold.on) return;
      var holder = null; S.world.nodes.forEach(function (n) { if (n.holdOf === p.id && L.occupied(S.world, n)) holder = n; });
      if (!holder) return;
      var c = C[S.world.chars.indexOf(holder)] || C[1], hs = proj([c.pos[0], c.pos[1] + 0.42, c.pos[2]]);
      p.nodes.forEach(function (n, j) { if (j % 2) return; var e = proj(L.tPoint(p, p.val, [n.c[0], n.c[1] + 0.5, n.c[2]])); fx.strokeStyle = 'rgba(255,220,140,' + (0.35 + 0.15 * Math.sin(t * 5 + j)) + ')'; fx.lineWidth = 1; fx.beginPath(); fx.moveTo(hs[0], hs[1]); fx.quadraticCurveTo((hs[0] + e[0]) / 2, Math.min(hs[1], e[1]) - ppu * 0.3, e[0], e[1]); fx.stroke(); });
    });
    // 把手呼吸环（金）
    if (S.mode === 'play') S.world.parts.forEach(function (p) {
      if (!p.handles.length || p.anim || L.locked(S.world, p)) return;
      p.handles.forEach(function (h) {
        var hw = handlePos(p, h); if (hw[1] < -0.8) return;
        s = proj(hw); var k = 0.5 + 0.5 * Math.sin(t * 2.2), rr = ppu * 0.3 * (1 + 0.16 * k);
        fx.strokeStyle = S.pal.stars ? 'rgba(255,226,150,' + (0.3 + 0.5 * (1 - k)) + ')' : 'rgba(176,128,40,' + (0.3 + 0.5 * (1 - k)) + ')'; fx.lineWidth = 1.5; fx.beginPath(); fx.arc(s[0], s[1], rr, 0, 6.2832); fx.stroke();
      });
    });
    // 选中人物的标记
    if (S.duo === 'ctrl' && S.mode === 'play' && C[1].on) { var cc = C[S.sel]; s = proj([cc.pos[0], cc.pos[1] + 1.05 + 0.04 * Math.sin(t * 3), cc.pos[2]]); fx.fillStyle = S.pal.stars ? 'rgba(255,226,150,0.95)' : 'rgba(176,128,40,0.95)'; fx.beginPath(); fx.moveTo(s[0], s[1] + 6); fx.lineTo(s[0] - 4.5, s[1] - 1); fx.lineTo(s[0] + 4.5, s[1] - 1); fx.closePath(); fx.fill(); }
    // 未灌釉丝格的提示：金丝闪烁表示可灌
    S.world.parts.forEach(function (p) {
      if (!p.glaze || p.filled || p.fillK > 0) return;
      var ok = L.canFill(S.world, p);
      if (!ok) return;
      p.nodes.forEach(function (n) { s = proj(L.tPoint(p, p.val, [n.c[0], n.c[1] + 0.5, n.c[2]])); fx.globalCompositeOperation = 'lighter'; glowDot(s[0], s[1], ppu * 0.55, '#5aa8ff', 0.2 + 0.12 * Math.sin(t * 3 + n.c[0])); fx.globalCompositeOperation = 'source-over'; });
    });
    // 粒子
    fx.globalCompositeOperation = 'lighter';
    for (i = parts.length - 1; i >= 0; i--) {
      d = parts[i]; d.t += dt; if (d.t >= d.life) { parts.splice(i, 1); continue; }
      d.v[1] -= d.g * dt; d.p[0] += d.v[0] * dt; d.p[1] += d.v[1] * dt; d.p[2] += d.v[2] * dt;
      s = proj(d.p); var al = 1 - d.t / d.life; glowDot(s[0], s[1], d.r * 3, d.col, 0.7 * al); fx.fillStyle = rgba(d.col, al); fx.fillRect(s[0] - d.r * 0.5, s[1] - d.r * 0.5, d.r, d.r);
    }
    // 飘尘
    for (i = 0; i < S.dust.length; i++) {
      d = S.dust[i]; var x, y;
      if (pal.fx === 'ember') { d.y -= dt * 0.03 * d.sp; d.x += Math.sin(t * 0.8 + d.ph) * 0.0006; x = d.x * W; y = d.y * H; glowDot(x, y, 3 + 2 * d.r, '#ff9a4a', 0.4 + 0.3 * Math.sin(t * 3 + d.ph)); }
      else if (pal.fx === 'star') { d.y -= dt * 0.006 * d.sp; x = d.x * W; y = d.y * H; glowDot(x, y, 2.5 + 2 * d.r, '#ffe3a0', 0.25 + 0.25 * Math.sin(t * 1.4 + d.ph)); }
      else if (pal.fx === 'grit') { d.y += dt * 0.01 * d.sp; d.x += Math.sin(t * 0.3 + d.ph) * 0.0004; fx.fillStyle = 'rgba(110,105,115,' + (0.18 + 0.1 * Math.sin(t + d.ph)) + ')'; fx.fillRect(d.x * W, d.y * H, 1.4 * d.r, 1.4 * d.r); }
      else if (pal.fx === 'dust') { d.y += dt * 0.008 * d.sp; d.x += dt * 0.004; fx.fillStyle = 'rgba(255,250,235,' + (0.45 + 0.3 * Math.sin(t * 0.7 + d.ph)) + ')'; fx.beginPath(); fx.arc(d.x * W, d.y * H, 0.8 + 0.9 * d.r, 0, 6.2832); fx.fill(); }
      else { d.y -= dt * 0.01 * d.sp; d.x += Math.sin(t * 0.4 + d.ph) * 0.0003; glowDot(d.x * W, d.y * H, 2.5 + 2 * d.r, '#fff6e0', 0.45 + 0.3 * Math.sin(t + d.ph)); }
      if (d.y > 1.03) { d.y = -0.03; d.x = Math.random(); } if (d.y < -0.04) { d.y = 1.02; d.x = Math.random(); } if (d.x > 1.03) d.x = -0.02; if (d.x < -0.03) d.x = 1.02;
    }
    fx.globalCompositeOperation = 'source-over';
    // 点击涟漪
    for (i = S.ripples.length - 1; i >= 0; i--) {
      var rp = S.ripples[i]; rp.t += dt * 2.2; if (rp.t >= 1) { S.ripples.splice(i, 1); continue; }
      var k2 = easeOut(rp.t); fx.strokeStyle = rp.ok ? (S.pal.stars ? 'rgba(255,226,150,' : 'rgba(176,128,40,') + (1 - rp.t) * 0.8 + ')' : 'rgba(230,110,80,' + (1 - rp.t) * 0.8 + ')'; fx.lineWidth = rp.ok ? 1.4 : 2;
      var rr2 = rp.ok ? 6 + 20 * k2 : 14 - 6 * k2;
      fx.beginPath(); fx.moveTo(rp.x, rp.y - rr2 * 0.58); fx.lineTo(rp.x + rr2, rp.y); fx.lineTo(rp.x, rp.y + rr2 * 0.58); fx.lineTo(rp.x - rr2, rp.y); fx.closePath(); fx.stroke();
    }
    if (S.flash > 0) { fx.fillStyle = 'rgba(255,240,210,' + S.flash * 0.5 + ')'; fx.fillRect(0, 0, W, H); }
    fx.globalAlpha = 1;
  }
  function handlePos(p, h) {
    if (p.def.wire) { var pv = p.pivot, dv = p.def.wire.dir, ln = p.def.wire.len; return L.tPoint(p, p.val, [pv[0] + dv[0] * ln, pv[1] + 0.6, pv[2] + dv[2] * ln]); }
    return L.tPoint(p, p.val, h);
  }

  // ───────────── 人物 ─────────────
  function standNow(n) {
    var p = n.part, loc = n.stair ? n.c : [n.c[0] + n.n[0] * 0.5, n.c[1] + n.n[1] * 0.5, n.c[2] + n.n[2] * 0.5];
    return L.tPoint(p, p.val, loc);
  }
  function faceOf(c) { var p = c.node.part; return c.face + (!c.step && p.kind === 'rot' && p.axis === 'y' ? (p.val - c.ref) * Math.PI / 2 : 0); }
  function anyAnim() { var ps = S.world.parts; for (var i = 0; i < ps.length; i++) if (ps[i].anim) return true; return S.fills.length > 0; }
  function canWalk() { return S.mode === 'play' && !anyAnim() && !(S.drag && S.drag.on) && S.beat <= 0; }
  function ctrlIdx(c) { return S.duo === 'ctrl' ? c.i : (c.i === 0 ? 0 : -1); }
  function blockedFor(i) {
    var b = []; if (S.duo === 'ctrl') { var o = C[1 - i]; if (o.on) b.push(o.step ? o.step.to : o.node); }
    if (i === 1) S.world.nodes.forEach(function (n) { if (n.part.onlyA) b.push(n); });
    return b;
  }
  function beginStep(c, nx) {
    var e = L.edge(c.node, nx);
    if (!e) { c.path = []; return; }
    var f = c.node.stand, t = nx.stand, p0 = f.slice(), p1 = t.slice(), dir;
    if (e.ill) {
      var sh = [t[0] - f[0] - e.step[0], t[1] - f[1], t[2] - f[2] - e.step[2]];
      if (sh[1] > 0) p0 = [f[0] + sh[0], f[1] + sh[1], f[2] + sh[2]]; else p1 = [t[0] - sh[0], t[1] - sh[1], t[2] - sh[2]];
      dir = e.step;
    } else dir = [t[0] - f[0], 0, t[2] - f[2]];
    c.faceT = Math.atan2(dir[0], dir[2]);
    var stair = !!(nx.stair || c.node.stair);
    c.step = { from: c.node, to: nx, p0: p0, p1: p1, t: 0, dur: (stair ? 0.32 : 0.28) * (c.i ? 1.12 : 1), stair: stair };
    if (c.i === 0) c.prev = c.node;
    var ci = ctrlIdx(c); if (ci >= 0) { S.world.chars[ci] = nx; L.settle(S.world); }
    AU.step(matOfNode(nx), c.i, S.stepN++);
  }
  function matOfNode(n) { var p = n.part; if (n.halo) return 'gold'; if (p.glaze || p.rough) return 'glaze'; var b = p.def.boxes && p.def.boxes[0]; return b && (b[6] === 'rk' || b[6] === 'kl') ? 'stone' : b && b[6] === 'wd' ? 'wood' : 'copper'; }
  function updChar(c, dt) {
    if (!c.on) return;
    c.hop = 0;
    if (c.fade) { // 师傅跟不上时化作金屑，在阿蓝身后重新聚形
      c.fade.t += dt;
      if (c.fade.t < 0.4) c.vis = 1 - c.fade.t / 0.4;
      else { if (!c.fade.done) { c.fade.done = 1; setNode(c, c.fade.to); c.path = []; burst([c.pos[0], c.pos[1] + 0.4, c.pos[2]], 14, '#ffd98a', 1.4, 0.8, -0.6); AU.gather(); } c.vis = clamp((c.fade.t - 0.4) / 0.45, 0, 1); }
      if (c.fade.t > 0.85) { c.fade = null; c.vis = 1; }
      c.pos = standNow(c.node); return;
    }
    if (c.step) {
      var st = c.step; st.t += dt / st.dur; c.idle = 0;
      if (st.t >= 1) { c.step = null; setNode(c, st.to); arrive(c, st.to); }
      else {
        var k = st.t, a = st.p0, b = st.p1;
        c.pos = [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
        c.hop = Math.sin(Math.PI * k) * (st.stair ? 0.05 : 0.08);
      }
    } else if (c.path.length && canWalk()) {
      beginStep(c, c.path.shift());
    } else {
      c.pos = standNow(c.node); c.idle += dt;
      if (c.idle > 1.6 && S.mode === 'play' && !c.path.length) c.faceT = 0.8;
      if (c.cheer > 0) { c.cheer -= dt; c.hop = Math.abs(Math.sin(c.cheer * 6)) * 0.14 * clamp(c.cheer, 0, 1); }
    }
    var df = c.faceT - c.face; while (df > Math.PI) df -= 6.2832; while (df < -Math.PI) df += 6.2832; c.face += df * Math.min(1, dt * 10);
  }
  function follower(dt) { // 跟随模式：师傅走在阿蓝身后一步
    var m = C[1], a = C[0]; if (!m.on || S.duo !== 'follow' || m.step || m.fade || S.mode !== 'play' && S.mode !== 'end') return;
    var target = a.step ? a.step.from : a.prev; if (!target || target === m.node || !target.active) return;
    if (!canWalk() && !(S.mode === 'end')) return;
    if (m.path.length) return;
    if (m.node.active) { var p = L.path(m.node, target); if (p && p.length <= 6) { m.path = p; return; } }
    if (!a.step && a.idle > 0.25) m.fade = { t: 0, to: target };
    void dt;
  }
  function arrive(c, n) {
    if (c.i === 0) hintEvent('walk');
    var ci = ctrlIdx(c);
    if (ci < 0) return; // 跟随中的师傅不触发机关
    L.settle(S.world);
    if (n.halo && !n.gilded) { n.gilded = 1; AU.gild(); S.pulses.push({ p: n.stand.slice(), t: 0, dur: 0.9, col: '#ffd98a' }); hintEvent('halo'); }
    if (n.plate && !n.pressed) {
      n.pressed = true; c.path = []; hintEvent('plate');
      var p = S.world.byId[n.plate.part], dur = clamp(1.3 + 0.2 * Math.abs(n.plate.to - p.val), 1.6, 3.6);
      AU.plate(); AU.rise(dur); animPart(p, n.plate.to, dur, ease); burst([n.stand[0], n.stand[1] + 0.2, n.stand[2]], 18, '#6fd0e0', 1.6, 1.2, 0.4);
      return;
    }
    if (n.holdOf) { hintEvent('hold'); }
    checkFollows();
    checkWin();
  }
  function checkWin() {
    if (S.won) return;
    var a = C[0].node, needs2 = S.world.nodes.some(function (n) { return n.goal2; });
    if (!a.goal || C[0].step) return;
    if (needs2 && (!C[1].node.goal2 || C[1].step)) return;
    win();
  }

  // ───────────── 机关 ─────────────
  function partModel(p) {
    var v = p.val + (p.shake > 0 ? Math.sin(p.shake * 46) * 0.035 * (p.shake / 0.35) : 0);
    if (p.kind === 'rot') { var pv = p.pivot; return M.chain(M.tr(pv[0], pv[1], pv[2]), M.rot(p.axis, v * Math.PI / 2), M.tr(-pv[0], -pv[1], -pv[2])); }
    if (p.kind === 'slide') { var a = L.AXV[p.axis]; return M.tr(a[0] * v, a[1] * v, a[2] * v); }
    return M.id();
  }
  function animPart(p, to, dur, ez) { p.anim = { from: p.val, to: to, t: 0, dur: dur, ez: ez || easeOut }; }
  function partCenter(p) { var s = [0, 0, 0], n = 0; p.nodes.forEach(function (q) { s[0] += q.c[0]; s[1] += q.c[1]; s[2] += q.c[2]; n++; }); if (!n) { var pv = p.pivot; return L.tPoint(p, p.val, [pv[0], pv[1] + 0.5, pv[2]]); } return L.tPoint(p, p.val, [s[0] / n, s[1] / n + 0.5, s[2] / n]); }
  function finishPart(p) {
    var to = p.anim.to, was = p.state; p.anim = null;
    if (p.kind === 'rot') {
      C.forEach(function (c) { if (c.on && c.node.part === p && p.axis === 'y') { c.face += (to - c.ref) * Math.PI / 2; c.faceT = c.face; } });
      p.state = ((to % 4) + 4) % 4; p.val = p.state; C.forEach(function (c) { if (c.on && c.node.part === p) c.ref = p.val; });
    } else { p.state = p.val = to; }
    L.settle(S.world);
    if (p.state !== was) {
      if (p.handles.length) hintEvent('part');
      // 半拍停顿：光先变，人后走
      S.beat = 0.34; S.pulses.push({ p: partCenter(p), t: 0, dur: 0.8, col: p.def.wire ? '#ffe3a0' : '#bcd6ff' }); AU.settle(p.def.wire ? 'wire' : 'stone');
      if (p.def.wire) S.world.parts.forEach(function (q) { if (q.glaze && !q.filled && L.canFill(S.world, q)) { AU.closed(); q.nodes.forEach(function (n) { S.pulses.push({ p: [n.c[0], n.c[1] + 0.5, n.c[2]], t: -0.2, dur: 1.0, col: '#5aa8ff' }); }); } });
    }
    checkFollows();
    if (!anyAnim() && S.pendingTap) { var q = S.pendingTap; S.pendingTap = null; tap(q[0], q[1]); }
  }
  function checkFollows() {
    S.world.parts.forEach(function (p) {
      if (!(p.follow || p.hold) || p.anim) return;
      var t = L.followTarget(S.world, p);
      if (p.state !== t && !L.anyOn(S.world, p) && !C.some(function (c) { return c.on && c.step && (c.step.to.part === p || c.step.from.part === p); })) {
        var d = p.hold ? 1.3 : 1.7; AU.rise(d);
        if (p.hold) { AU.hold(t === p.hold.on); if (t === p.hold.on) { S.fire = 0.6; } }
        if (p.follow && t < p.state) { AU.collapse(); burst(partCenter(p), 30, '#ff8a3c', 2, 1.4, 1); }
        animPart(p, t, d, ease);
      }
    });
  }
  function handleAt(x, y) {
    var best = null, bd = 1e9;
    S.world.parts.forEach(function (p) {
      if (!p.handles.length || p.anim) return;
      p.handles.forEach(function (h) {
        var hw = handlePos(p, h); if (hw[1] < -0.8) return;
        var s = proj(hw), d = Math.hypot(x - s[0], y - s[1]), r = Math.max(24, 0.45 * S.cam.ppu);
        if (d < r && d < bd) { bd = d; best = p; }
      });
    });
    return best;
  }
  function planeAngle(p, x, y) {
    var pv = proj(p.pivot), qx = (x - pv[0]) / S.cam.ppu, qy = -(y - pv[1]) / S.cam.ppu;
    var B = { y: [[0, 0, 1], [1, 0, 0]], z: [[1, 0, 0], [0, 1, 0]], x: [[0, 1, 0], [0, 0, 1]] }[p.axis], a = s2(B[0]), b = s2(B[1]);
    var det = a[0] * b[1] - a[1] * b[0];
    return Math.atan2((a[0] * qy - a[1] * qx) / det, (qx * b[1] - qy * b[0]) / det);
  }
  function nearPivot(p, x, y) { var pv = proj(p.pivot); return Math.hypot(x - pv[0], y - pv[1]) < 0.4 * S.cam.ppu; }
  function startDrag(p, x, y) {
    S.drag = { part: p, on: true, val0: p.val, x0: x, y0: y, acc: 0, last: p.kind === 'rot' ? planeAngle(p, x, y) : 0, dead: p.kind === 'rot' && nearPivot(p, x, y), k: Math.round(p.val * (p.kind === 'rot' ? 3 : 2)) };
    C.forEach(function (c) { c.path = []; });
  }
  function moveDrag(x, y) {
    var d = S.drag, p = d.part;
    if (p.kind === 'rot') {
      var a = planeAngle(p, x, y), da;
      if (nearPivot(p, x, y)) { d.dead = true; return; }
      if (d.dead) { d.dead = false; d.last = a; }
      da = a - d.last; while (da > Math.PI) da -= 6.2832; while (da < -Math.PI) da += 6.2832;
      d.acc += da; d.last = a; p.val = d.val0 + d.acc / (Math.PI / 2);
    } else {
      var sa = s2(L.AXV[p.axis]), qx = (x - d.x0) / S.cam.ppu, qy = -(y - d.y0) / S.cam.ppu;
      p.val = clamp(d.val0 + (qx * sa[0] + qy * sa[1]) / (sa[0] * sa[0] + sa[1] * sa[1]), p.min, p.max);
    }
    var k = Math.round(p.val * (p.kind === 'rot' ? 3 : 2)); if (k !== d.k) { d.k = k; AU.tick(k, p.def.wire ? 'wire' : 'stone'); }
  }
  function endDrag() {
    var d = S.drag, p = d.part; S.drag = null; if (!d.on) return;
    var to = Math.round(p.val); if (p.kind === 'slide') to = clamp(to, p.min, p.max);
    animPart(p, to, 0.16 + 0.3 * Math.abs(to - p.val)); if (Math.abs(to - d.val0) > 0.5) AU.snap(p.def.wire ? 'wire' : 'stone');
  }
  function stepOn(p) { return C.some(function (c) { return c.on && c.step && (c.step.to.part === p || c.node.part === p); }); }
  function denyPart(p) { p.shake = 0.35; AU.deny(); }

  // 灌釉
  function tryFill(p, at) {
    if (p.filled || p.fillK > 0) return;
    if (L.canFill(S.world, p)) {
      S.fills.push({ part: p, t: 0, dur: 1.5, o: at }); AU.pour(1.5); hintEvent('fill');
      C.forEach(function (c) { c.path = []; });
    } else { // 丝格没合拢：釉从缺口漏下去
      p.shake = 0.35; AU.spill();
      for (var i = 0; i < 26; i++) parts.push({ p: [at[0] + (Math.random() - 0.5) * 0.6, at[1] + 0.4, at[2] + (Math.random() - 0.5) * 0.6], v: [(Math.random() - 0.5) * 0.4, -0.3 - Math.random(), (Math.random() - 0.5) * 0.4], t: 0, life: 1.4, col: '#3d86e8', g: 3, r: 1.6 + Math.random() * 1.5 });
      if (!S.did.spillHint) { S.did.spillHint = 1; setHint('丝格还有缺口，釉会漏下去'); after(2.6, function () { if (S.mode === 'play') nextHint(); }); }
      p.wires = p.glaze.need.map(function (n) { return S.world.byId[n[0]]; }); p.wires.forEach(function (w) { if (w.state !== p.glaze.need[p.wires.indexOf(w)][1]) w.shake = 0.35; });
    }
  }
  function updFills(dt) {
    for (var i = S.fills.length - 1; i >= 0; i--) {
      var f = S.fills[i]; f.t += dt / f.dur; f.part.fillK = clamp(f.t, 0, 1);
      if (Math.random() < 0.5) burst([f.o[0], f.o[1] + 0.55, f.o[2]], 1, '#7fb8ff', 0.6, 0.6, -0.2);
      if (f.t >= 1) {
        S.fills.splice(i, 1); f.part.filled = true; f.part.fillK = 1; L.settle(S.world);
        S.beat = 0.36; S.pulses.push({ p: partCenter(f.part), t: 0, dur: 1, col: '#5aa8ff' }); AU.filled();
        checkFollows();
      }
    }
  }
  // 磨光
  function roughAt(x, y) {
    var best = null; S.world.parts.forEach(function (p) {
      if (!p.rough || p.polished) return;
      p.nodes.forEach(function (n) { var s = proj(L.tPoint(p, p.val, [n.c[0], n.c[1] + 0.5, n.c[2]])); if (Math.hypot(x - s[0], (y - s[1]) * 1.6) < S.cam.ppu * 0.8) best = p; });
    });
    return best;
  }
  function scrubMove(x, y) {
    var sc = S.scrub, p = sc.part, d = Math.hypot(x - sc.x, y - sc.y); sc.x = x; sc.y = y;
    if (p.polished) return;
    p.polish = clamp(p.polish + d / (S.cam.ppu * 9 * Math.max(1, p.nodes.length * 0.6)), 0, 1);
    sc.e = Math.min(1, sc.e + d / 40);
    AU.scrub(sc.e, p.polish);
    if (Math.random() < d / 30) { var n = p.nodes[(Math.random() * p.nodes.length) | 0]; burst(L.tPoint(p, p.val, [n.c[0] + (Math.random() - 0.5) * 0.7, n.c[1] + 0.55, n.c[2] + (Math.random() - 0.5) * 0.7]), 1, Math.random() < 0.5 ? '#9fd0ff' : '#bdb5a5', 1.2, 0.6, 1.5); }
    if (p.polish >= 1) { p.polished = true; L.settle(S.world); AU.polished(); S.beat = 0.36; hintEvent('polish'); S.pulses.push({ p: partCenter(p), t: 0, dur: 1, col: '#9fd0ff' }); p.nodes.forEach(function (n) { burst(L.tPoint(p, p.val, [n.c[0], n.c[1] + 0.6, n.c[2]]), 8, '#e8f4ff', 1.4, 0.9, 0.5); }); checkFollows(); }
  }

  // ───────────── 输入 ─────────────
  function pickNode(x, y, strict) {
    var best = null, bd = -1e9, near = null, nd = 0.95, ns = S.world.nodes;
    for (var i = 0; i < ns.length; i++) {
      var n = ns[i]; if (!n.active) continue;
      var s = proj(n.stand), du = (x - s[0]) / S.cam.ppu, dv = -(y - s[1]) / S.cam.ppu, a = du * 1.41421356, b = -dv * 2.44948974, dx = (a + b) / 2, dz = (b - a) / 2, m = Math.max(Math.abs(dx), Math.abs(dz));
      var depth = n.stand[0] + n.stand[1] + n.stand[2];
      if (m <= 0.5) { if (depth > bd) { bd = depth; best = n; } }
      else if (m < nd) { nd = m; near = n; }
    }
    return best || (strict ? null : near);
  }
  function pickGlaze(x, y) {
    var best = null; S.world.parts.forEach(function (p) {
      if (!p.glaze || p.filled) return;
      p.nodes.forEach(function (n) {
        var w = L.tPoint(p, p.val, [n.c[0], n.c[1] + 0.5, n.c[2]]), s = proj(w), du = (x - s[0]) / S.cam.ppu, dv = -(y - s[1]) / S.cam.ppu, a = du * 1.41421356, b = -dv * 2.44948974;
        if (Math.max(Math.abs((a + b) / 2), Math.abs((b - a) / 2)) <= 0.55) best = { p: p, at: w };
      });
    });
    return best;
  }
  function pickChar(x, y) {
    if (S.duo !== 'ctrl') return -1;
    var best = -1, bd = S.cam.ppu * 0.42;
    C.forEach(function (c, i) { if (!c.on) return; var s = proj([c.pos[0], c.pos[1] + 0.45, c.pos[2]]), d = Math.hypot(x - s[0], (y - s[1]) * 0.8); if (d < bd) { bd = d; best = i; } });
    return best;
  }
  function select(i) { if (S.sel === i) return; S.sel = i; updWho(); AU.select(i); hintEvent('select'); }
  function tap(x, y) {
    if (S.mode !== 'play') return;
    if (anyAnim()) { S.pendingTap = [x, y]; return; }
    var ch = pickChar(x, y); if (ch >= 0 && ch !== S.sel) { select(ch); return; }
    var gz = pickGlaze(x, y); if (gz) { tryFill(gz.p, gz.at); return; }
    var c = C[S.duo === 'ctrl' ? S.sel : 0];
    var n = pickNode(x, y), from = c.step ? c.step.to : c.node;
    if (!n) { var rp = roughAt(x, y); if (rp && !S.did.polishTip) { S.did.polishTip = 1; setHint('在残阶上来回划动，把它磨亮'); } return; }
    var s = proj(n.stand);
    if (n === from) { c.path = []; return; }
    var pth = L.path(from, n, blockedFor(c.i));
    if (pth) { c.path = pth; S.ripples.push({ x: s[0], y: s[1], t: 0, ok: true }); }
    else {
      S.ripples.push({ x: s[0], y: s[1], t: 0, ok: false }); AU.deny();
      if (c.i === 1 && n.part.onlyA) { setHint('这段路，师傅走不了'); after(2.4, function () { if (S.mode === 'play') nextHint(); }); }
    }
  }
  function onDown(e) {
    AU.init();
    var x = e.clientX, y = e.clientY;
    if (S.mode === 'card') { beginIntro(); return; }
    if (S.mode === 'end') { if (S.canContinue) nextLevel(); return; }
    if (S.mode !== 'play' || S.ptr) return;
    var hp = handleAt(x, y), rp = hp ? null : roughAt(x, y);
    S.ptr = { id: e.pointerId, x: x, y: y, x0: x, y0: y, part: hp, rough: rp, moved: false };
    try { fxc.setPointerCapture(e.pointerId); } catch (er) { }
  }
  function onMove(e) {
    var q = S.ptr; if (!q || q.id !== e.pointerId) return;
    q.x = e.clientX; q.y = e.clientY;
    if (!q.moved && Math.hypot(q.x - q.x0, q.y - q.y0) > 7) {
      q.moved = true;
      if (q.part) {
        if (L.locked(S.world, q.part)) { denyPart(q.part); q.part = null; }
        else if (q.part.anim) q.part = null;
        else { S.drag = { part: q.part, on: false }; C.forEach(function (c) { c.path = []; }); }
      } else if (q.rough) { S.scrub = { part: q.rough, x: q.x0, y: q.y0, e: 0 }; }
    }
    if (S.drag && S.drag.on) moveDrag(q.x, q.y);
    if (S.scrub) scrubMove(q.x, q.y);
    e.preventDefault();
  }
  function onUp(e) {
    var q = S.ptr; if (!q || q.id !== e.pointerId) return; S.ptr = null;
    if (S.scrub) { S.scrub = null; AU.scrub(0, 0); return; }
    if (S.drag) { if (!S.drag.on && !stepOn(S.drag.part)) { startDrag(S.drag.part, q.x0, q.y0); moveDrag(q.x, q.y); } endDrag(); return; }
    if (q.moved || S.mode !== 'play') return;
    if (q.part && !pickNode(q.x, q.y, true)) {
      var p = q.part;
      if (p.kind === 'rot') {
        if (L.locked(S.world, p) || stepOn(p)) { denyPart(p); return; }
        if (!p.anim) { C.forEach(function (c) { c.path = []; }); animPart(p, p.val + 1, 0.5, ease); AU.tick(p.state + 1, p.def.wire ? 'wire' : 'stone'); AU.snap(p.def.wire ? 'wire' : 'stone'); }
      }
      return;
    }
    tap(q.x, q.y);
  }
  fxc.addEventListener('pointerdown', onDown); fxc.addEventListener('pointermove', onMove);
  fxc.addEventListener('pointerup', onUp); fxc.addEventListener('pointercancel', function (e) { if (S.ptr && S.ptr.id === e.pointerId) { S.ptr = null; S.scrub = null; if (S.drag) endDrag(); } });
  fxc.addEventListener('contextmenu', function (e) { e.preventDefault(); });

  // ───────────── 通关演出 ─────────────
  function win() {
    S.won = true; S.mode = 'end'; C.forEach(function (c) { c.path = []; }); setHint(''); AU.goal(S.idx);
    var farewell = S.idx === 4, reunite = S.idx === 7;
    C[0].faceT = farewell ? -2.36 : 0.8 + (reunite ? Math.PI : 0) * 0; C[0].cheer = farewell ? 0 : 1.2;
    if (farewell) { // 烧蓝：阿蓝回望，师傅守着窑火
      after(0.6, function () { C[1].faceT = 0.78; C[1].wave = 1; S.fire = 1.2; AU.farewell(); });
    }
    if (reunite) { after(0.4, function () { S.kilnAnim = { t: 0 }; AU.reignite(); }); C[0].faceT = C[1].faceT = Math.PI; }
    after(0.7, function () { var gn = S.world.nodes.filter(function (n) { return n.goal; })[0]; S.tokenTaken = true; if (gn) S.orb = { t: 0, dur: 1.9, a: proj([gn.stand[0], gn.stand[1] + 0.95, gn.stand[2]]) }; AU.gather(); });
    after(farewell ? 1.8 : 0.9, function () { var d = S.doors[0]; if (d) { S.pulses.push({ p: [d.p[0], d.p[1] + 0.6, d.p[2]], t: 0, dur: 1.4, col: '#ffd98a' }); burst([d.p[0], d.p[1] + 0.6, d.p[2]], 36, '#ffd98a', 1.6, 1.6, -0.3); } AU.door(); });
    after(farewell ? 3.8 : 3.3, function () { $('endvase').textContent = S.def.vase; $('endtext').textContent = S.def.end; $('endline').classList.add('on'); save.done = Math.max(save.done, S.idx + 1); persist(); });
    after(farewell ? 5.8 : 5.0, function () { S.canContinue = true; $('endgo').classList.add('on'); });
  }
  function finaleVase() { var cv = $('fvase'), c = cv.getContext('2d'), t0 = performance.now(); (function lp() { c.clearRect(0, 0, 320, 360); drawVase(c, 160, 180, 250, 8, (performance.now() - t0) / 1000); if (S.mode === 'final') requestAnimationFrame(lp); })(); }
  function nextLevel() {
    S.canContinue = false; AU.ui();
    if (S.idx < LEVELS.length - 1) start(S.idx + 1, true);
    else { S.mode = 'load'; veil(true, function () { $('hud').classList.remove('on'); $('chapter').classList.remove('on'); $('who').classList.remove('on'); $('endline').classList.remove('on'); $('finale').classList.add('on'); S.mode = 'final'; AU.finale(); finaleVase(); veil(false); }); }
  }

  // ───────────── 帧 ─────────────
  function update(dt) {
    S.t += dt;
    var due = []; S.seq = S.seq.filter(function (s) { if (s.at <= S.t) { due.push(s); return false; } return true; });
    due.forEach(function (s) { s.fn(); });
    if (!S.world) return;
    if (S.mode === 'intro') {
      S.introT += dt / 1.8; var k = easeOut(clamp(S.introT, 0, 1)); S.ga = clamp(S.introT * 1.6, 0, 1); S.cam.intro = 90 * (1 - k);
      if (S.introT >= 1) { S.mode = 'play'; S.ga = 1; S.cam.intro = 0; after(0.5, nextHint); }
    }
    if (S.beat > 0) S.beat -= dt;
    if (S.flash > 0) S.flash -= dt * 1.5;
    if (S.fire > 0) S.fire = Math.max(0, S.fire - dt * 0.4);
    if (S.kilnAnim) { S.kilnAnim.t += dt; S.kilnLit = Math.min(1.6, 0.25 + S.kilnAnim.t * 0.6); if (S.kilnAnim.t > 0.4 && S.kilnAnim.t < 3 && Math.random() < 0.5 && S.kiln) burst(S.kiln.p, 2, '#ff9a4a', 1.4, 1.6, -0.8); }
    if (S.drag && !S.drag.on && !stepOn(S.drag.part) && S.ptr) { startDrag(S.drag.part, S.ptr.x0, S.ptr.y0); moveDrag(S.ptr.x, S.ptr.y); }
    S.world.parts.forEach(function (p) {
      if (p.shake > 0) p.shake -= dt;
      if (p.anim) { var a = p.anim; a.t += dt / a.dur; if (a.t >= 1) { p.val = a.to; finishPart(p); } else p.val = a.from + (a.to - a.from) * a.ez(a.t); }
    });
    updFills(dt);
    updChar(C[0], dt); follower(dt); updChar(C[1], dt);
    S.halos.forEach(function (h) { var on = h.n.active ? 1 : 0; h.v += (on - h.v) * Math.min(1, dt * 6); });
    if (S.mode === 'play') { var hs = S.def.hints || [], h = hs[S.hintI]; if (h) { S.hintT += dt; if (S.hintT > (h[1] === 'time' ? 9 : 45)) { S.hintI++; setHint(''); after(1, nextHint); } } }
  }
  function lights() {
    var ls = [], t = S.t;
    if (C[0].on) ls.push({ p: lampPos(C[0]), c: [0.45, 0.62, 0.95], r: 3.2 });
    if (S.kiln) { var f = S.kilnLit * (0.85 + 0.15 * Math.sin(t * 7.3) * Math.sin(t * 3.1)) + S.fire; ls.push({ p: S.kiln.p, c: [1.0 * f, 0.45 * f, 0.18 * f], r: 6.5 }); }
    S.doors.forEach(function (d) { if (ls.length < 5) ls.push({ p: L.tPoint(d.part, d.part.val, [d.p[0], d.p[1] + 0.6, d.p[2] + 0.3]), c: [0.7, 0.55, 0.25], r: 2.6 }); });
    S.pulses.forEach(function (pu) { if (ls.length < 6 && pu.t > 0) ls.push({ p: pu.p, c: mulc(hex(pu.col), 0.9 * (1 - pu.t)), r: 3.5 }); });
    return ls;
  }
  function charList(list, c) {
    if (!c.on || c.vis <= 0.01) return;
    var f = faceOf(c), hop = c.hop || 0, br = 1 + 0.02 * Math.sin(S.t * 2.2 + c.i), sq = c.step ? 1 + 0.06 * Math.sin(Math.PI * c.step.t) : br;
    var a = c.vis;
    list.push({ m: CM.blob, model: M.chain(M.tr(c.pos[0], c.pos[1] + 0.012, c.pos[2]), M.sc(1.3 - hop * 1.6, 1, 1.3 - hop * 1.6)), o: { alpha: 0.28 * a, noDepth: true, noShadow: true } });
    var lean = c.i === 1 ? 0.08 : 0, sway = c.step ? 0.06 * Math.sin(Math.PI * 2 * c.step.t) : 0.015 * Math.sin(S.t * 1.6 + c.i);
    var base = M.chain(M.tr(c.pos[0], c.pos[1] + hop, c.pos[2]), M.sc(1.32, 1.32, 1.32), M.rot('y', f), M.rot('z', sway), M.rot('x', lean), M.sc(1 / Math.sqrt(sq), sq, 1 / Math.sqrt(sq)));
    var o = { alpha: a, noShadow: a < 0.99, tint: [1, 1, 1, 1] };
    list.push({ m: CM[c.i].body, model: base, o: o });
    if (c.i === 0) {
      list.push({ m: CM[0].band, model: base, o: o });
      var sw = 0.25 + (c.step ? 0.35 : 0.08 * Math.sin(S.t * 2));
      list.push({ m: CM[0].sash, model: M.chain(base, M.tr(0.03, 0.52, -0.075), M.rot('x', sw)), o: o });
      list.push({ m: CM[0].lamp, model: M.chain(base, M.tr(0.2, 0.42, 0.06), M.rot('z', 0.12 * Math.sin(S.t * 2.1) + sway * 1.5)), o: { alpha: a, noShadow: true } });
    }
    if (c.i === 1 && c.wave > 0) { /* 挥手由身体轻点头表现 */ }
  }
  function render() {
    if (!S.world) return;
    var cam = S.cam, pal = S.pal, list = [], t = S.t;
    S.parts.forEach(function (m) {
      var p = m.part, model = partModel(p);
      list.push({ m: m.main, model: model, o: {} });
      if (p.glaze) {
        if (p.fillK > 0) { var f = S.fills.filter(function (q) { return q.part === p; })[0]; list.push({ m: m.en, model: model, o: f ? { dis: { p: f.o, k: easeOut(p.fillK) } } : {} }); }
        if (!p.filled) list.push({ m: m.wire, model: model, o: { emis: L.canFill(S.world, p) ? 0.25 + 0.15 * Math.sin(t * 3) : 0 } });
      } else if (p.rough) {
        list.push({ m: m.en, model: model, o: {} });
        if (!p.polished) list.push({ m: m.rough, model: model, o: p.polish > 0 ? { dis: { k: p.polish } } : {} });
      }
    });
    S.halos.forEach(function (h) {
      var model = partModel(h.n.part);
      if (h.v < 0.99) list.push({ m: h.ghost, model: model, o: { alpha: (1 - h.v) * (0.45 + 0.25 * Math.sin(t * 2.4 + h.n.c[0])), noShadow: true, late: true } });
      if (h.v > 0.01) list.push({ m: h.solid, model: M.chain(model, M.tr(h.n.c[0], h.n.c[1] + 0.5, h.n.c[2]), M.sc(1, Math.max(0.02, h.v), 1), M.tr(-h.n.c[0], -h.n.c[1] - 0.5, -h.n.c[2])), o: { alpha: Math.min(1, h.v * 1.4) } });
    });
    if (CM.door) list.push({ m: CM.door, model: M.id(), o: { alpha: 0.42 + 0.06 * Math.sin(t * 1.7) + (S.won ? 0.3 : 0), noShadow: true, late: true, noDepth: true } });
    if (!S.tokenTaken) { var gn = S.world.nodes.filter(function (n) { return n.goal; })[0]; if (gn) { var gp = standNow(gn); list.push({ m: CM.token, model: M.chain(M.tr(gp[0], gp[1] + 0.95 + 0.06 * Math.sin(t * 1.8), gp[2]), M.rot('y', t * 0.9)), o: { noShadow: true } }); } }
    charList(list, C[0]); charList(list, C[1]);
    var key = pal.key, keyC = hex(pal.keyC), amb = pal.amb || 0.32;
    R.frame({ center: cam.c, sx: 2 * cam.ppu / W, sy: 2 * cam.ppu / H, offY: -2 * (cam.base + cam.intro) / H,
      key: key, keyC: mulc(keyC, 1.05), sky: mulc(hex(pal.mist), amb * 1.6), gnd: mixc(mulc(hex(pal.sky[1]), amb * 1.4), [0.25, 0.17, 0.12], 0.3), fogC: hex(pal.fog),
      fog: [-4.6, -0.4, -6.4, -3.0], lights: lights(), time: t, ga: S.ga, ext: S.ext }, list);
  }
  var last = 0;
  function frame(ts) {
    var dt = Math.min(0.05, (ts - last) / 1000 || 0); last = ts;
    update(dt); render(); drawFX(dt);
    requestAnimationFrame(frame);
  }
  function resize() {
    DPR = CAP ? 1 : Math.min(window.devicePixelRatio || 1, 2); W = Math.max(1, window.innerWidth); H = Math.max(1, window.innerHeight);
    [bgc, glc, fxc].forEach(function (c) { c.width = (W * DPR) | 0; c.height = (H * DPR) | 0; });
    bg.setTransform(DPR, 0, 0, DPR, 0, 0); fx.setTransform(DPR, 0, 0, DPR, 0, 0);
    if (S.world) { fitCamera(); } if (S.pal) drawBG();
  }

  // ───────────── 界面 ─────────────
  function buildLevelList() {
    var box = $('lvlist'); box.innerHTML = '';
    LEVELS.forEach(function (lv, i) {
      var b = document.createElement('button'), open = i <= save.done || CAP;
      b.className = 'lv' + (open ? '' : ' locked') + (i < save.done ? ' done' : ''); b.disabled = !open;
      b.innerHTML = '<span class="lv-no">' + lv.no + '</span><span class="lv-name">' + lv.name + '</span>';
      b.setAttribute('aria-label', lv.no + ' ' + lv.name + (open ? '' : '（未解锁）'));
      b.addEventListener('click', function () { AU.init(); AU.ui(); start(i, true); });
      box.appendChild(b);
    });
  }
  function setMuteUI() { $('bmu').classList.toggle('off', save.mute); $('bmu').setAttribute('aria-pressed', save.mute ? 'true' : 'false'); }
  $('title').addEventListener('click', function () { if (S.mode !== 'title') return; AU.init(); AU.ui(); start(Math.min(save.done, LEVELS.length - 1), true); });
  $('blv').addEventListener('click', function () { AU.ui(); buildLevelList(); $('levels').classList.add('on'); });
  $('lvclose').addEventListener('click', function () { AU.ui(); $('levels').classList.remove('on'); });
  $('bre').addEventListener('click', function () { if (S.mode === 'play' || S.mode === 'end') { AU.ui(); start(S.idx, false); } });
  $('bmu').addEventListener('click', function () { save.mute = !save.mute; AU.setMute(save.mute); persist(); setMuteUI(); AU.ui(); });
  $('w0').addEventListener('click', function () { if (S.mode === 'play') select(0); });
  $('w1').addEventListener('click', function () { if (S.mode === 'play') select(1); });
  $('again').addEventListener('click', function () { AU.ui(); start(0, true); });
  $('pick').addEventListener('click', function () { AU.ui(); buildLevelList(); $('levels').classList.add('on'); });
  window.addEventListener('keydown', function (e) {
    if (e.key === 'r' || e.key === 'R') $('bre').click(); else if (e.key === 'm' || e.key === 'M') $('bmu').click();
    else if (e.key === 'Tab' && S.duo === 'ctrl' && S.mode === 'play') { e.preventDefault(); select(1 - S.sel); }
    else if (e.key === 'Escape') $('levels').classList.remove('on');
  });
  window.addEventListener('resize', resize);
  document.addEventListener('visibilitychange', function () { AU.pause(document.hidden); last = performance.now(); });

  buildChars(); setMuteUI();
  S.pal = LEVELS[0].pal; S.def = LEVELS[0]; resize();
  if (save.done > 0) $('tgo').textContent = save.done >= LEVELS.length ? '轻触，再走一遍' : '轻触，继续「' + LEVELS[Math.min(save.done, LEVELS.length - 1)].name + '」';
  var qs = /[?&]lv=(\d)/.exec(location.search);
  if (qs) {
    $('title').style.transition = 'none'; $('title').classList.remove('on'); $('hud').classList.add('on'); $('chapter').classList.add('on');
    loadLevel(clamp(+qs[1], 0, LEVELS.length - 1)); S.mode = 'load'; S.ga = 0; S.cam.intro = 90; beginIntro();
  }
  if (CAP) document.body.classList.add('cap');
  if (!CAP) requestAnimationFrame(frame);

  // 调试 / 自动化 / 录制入口（不影响游玩）
  function findNode(x, y, z) { return S.world.nodes.filter(function (n) { return n.active && n.cell[0] === x && n.cell[1] === y && n.cell[2] === z; })[0]; }
  window.__sy = { S: S, C: C, L: L, start: start, load: function (i) { ['title', 'levels', 'finale', 'card'].forEach(function (id) { $(id).classList.remove('on'); }); $('hud').classList.add('on'); $('chapter').classList.add('on'); loadLevel(i); S.mode = 'play'; S.ga = 1; S.cam.intro = 0; return 'ok'; }, proj: proj,
    tick: function (sec, step, noRender) { step = step || 1 / 60; var n = Math.max(1, Math.round(sec / step)); for (var i = 0; i < n; i++) { update(step); if (!noRender) drawFX(step); } if (!noRender) render(); return S.mode; },
    draw: function () { render(); },
    walk: function (i, x, y, z) { var c = C[i], n = findNode(x, y, z); if (!n) return 'no node'; var p = L.path(c.step ? c.step.to : c.node, n, blockedFor(i)); if (!p) return 'no path'; c.path = p; return p.length; },
    set: function (id, st, dur) { var p = S.world.byId[id]; if (L.locked(S.world, p)) return 'locked'; animPart(p, st, dur || 0.6, ease); AU.snap(p.def.wire ? 'wire' : 'stone'); return 'ok'; },
    fill: function (id) { var p = S.world.byId[id], n = p.nodes[0]; tryFill(p, L.tPoint(p, p.val, [n.c[0], n.c[1] + 0.5, n.c[2]])); return p.fillK > 0 || S.fills.length ? 'ok' : 'spill'; },
    polish: function (id, k) { var p = S.world.byId[id]; S.scrub = { part: p, x: 0, y: 0, e: 0 }; var d = (k || 0.2) * S.cam.ppu * 9 * Math.max(1, p.nodes.length * 0.6); scrubMove(d, 0); var r = p.polish; S.scrub = null; return r; },
    sel: function (i) { select(i); return S.sel; },
    cont: function () { if (S.canContinue) nextLevel(); return S.mode; },
    state: function () { return { mode: S.mode, idx: S.idx, won: S.won, chars: C.map(function (c) { return c.on ? c.node.cell.join(',') : null; }), parts: S.world.parts.map(function (p) { return p.id + ':' + p.state + (p.filled ? 'F' : '') + (p.polished ? 'P' : ''); }) }; },
    title: function () { S.mode = 'title'; }, resize: resize, drawVase: drawVase, AU: AU,
    busy: function () { return C.some(function (c) { return c.on && (c.step || c.path.length || c.fade); }) || S.world.parts.some(function (p) { return p.anim; }) || S.fills.length > 0 || S.beat > 0; } };
})();
