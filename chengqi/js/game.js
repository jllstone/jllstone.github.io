/* 一脉蓝 · game.js — 主循环、建模、交互、演出与界面。 */
(function () {
  'use strict';
  var L = window.SY_LOGIC, G = window.SY_GFX, AU = window.SY_AUDIO, LEVELS = window.SY_LEVELS, M = G.M;
  var CAP = !!window.__CAPTURE;
  var $ = function (id) { return document.getElementById(id); };
  var RX = [0.70710678, 0, -0.70710678], UY = [-0.40824829, 0.81649658, -0.40824829], VZ = [0.57735027, 0.57735027, 0.57735027];
  var ISO_YAW = Math.PI / 4, ISO_PITCH = Math.asin(1 / Math.sqrt(3)), CAMA = { yaw: ISO_YAW, pitch: ISO_PITCH };
  function setCam(yaw, pitch) { // 相机朝向：yaw 绕竖轴，pitch 俯角；等距视角为 (45°, 35.26°)
    CAMA.yaw = yaw; CAMA.pitch = pitch;
    var f = [Math.cos(pitch) * Math.sin(yaw), Math.sin(pitch), Math.cos(pitch) * Math.cos(yaw)];
    var r = [f[2], 0, -f[0]], rl = Math.hypot(r[0], r[2]) || 1; r = [r[0] / rl, 0, r[2] / rl];
    var u = [f[1] * r[2] - f[2] * r[1], f[2] * r[0] - f[0] * r[2], f[0] * r[1] - f[1] * r[0]];
    RX = r; UY = u; VZ = f;
  }
  function isIso() { return Math.abs(CAMA.yaw - ISO_YAW) < 1e-3 && Math.abs(CAMA.pitch - ISO_PITCH) < 1e-3; }
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

  var bgc = $('bg'), vzc = $('vz'), glc = $('gl'), fxc = $('fx'), bg = bgc.getContext('2d'), vzx = vzc.getContext('2d'), fx = fxc.getContext('2d');
  var R;
  try { R = new G.Renderer(glc); } catch (e) { $('nogl').classList.add('on'); console.error(e); return; }

  var W = 1, H = 1, DPR = 1;
  var save = { done: 0, mute: false };
  try { var sv = JSON.parse(localStorage.getItem('yimailan.v1') || '{}'); if (sv && typeof sv === 'object') { save.done = sv.done | 0; save.mute = !!sv.mute; } } catch (e) { }
  var persist = function () { try { localStorage.setItem('yimailan.v1', JSON.stringify(save)); } catch (e) { } };
  AU.muted = save.mute;

  var S = { mode: 'title', idx: 0, t: 0, world: null, def: null, pal: null, pc: {}, seq: [], cam: { c: [0, 0, 0], ppu: 60, base: 0, intro: 0 }, ga: 1, ext: 14,
    ptr: null, drag: null, scrub: null, pendingTap: null, ripples: [], dust: [], parts: [], pulses: [], fills: [], spills: [], halos: [],
    hintI: 0, hintT: 0, did: {}, beat: 0, vase: { st: 0, anim: null }, orb: null, tokenTaken: false, drains: [], camAnim: null, negVase: null, vz: { flash: 0, band: 0 }, sel: 0, duo: null, won: false, canContinue: false, flash: 0, fire: 0, kilnLit: 1, stepN: 0 };
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
    var top = CAP ? 130 : 76, bot = CAP ? 90 : 110, side = 24, rr = 0;
    var ppu = Math.max(6, Math.min((W - side * 2 - rr) / (mx[0] - mn[0]), (H - top - bot) / (mx[1] - mn[1]), 80 * Math.max(1, Math.min(W, H) / 720)));
    var cu = (mn[0] + mx[0]) / 2 + rr / 2 / ppu, cv = (mn[1] + mx[1]) / 2;
    S.cam.c = [RX[0] * cu + UY[0] * cv, RX[1] * cu + UY[1] * cv, RX[2] * cu + UY[2] * cv];
    S.cam.ppu = ppu; S.cam.base = (top - bot) / 2;
    S.ext = Math.max(hi[0] - lo[0], hi[1] - lo[1] + 4, hi[2] - lo[2]) * 0.95 + 3;
    S.cam0 = { c: S.cam.c.slice(), ppu: ppu }; applyCine();
  }
  function applyCine() { // 宣传片用的镜头推拉：以 fitCamera 的结果为基准，缩放并沿屏幕轴平移
    var b = S.cam0; if (!b) return; var q = S.cine || {}, z = q.z || 1, du = q.x || 0, dv = q.y || 0;
    S.cam.ppu = b.ppu * z; S.cam.c = [b.c[0] + RX[0] * du + UY[0] * dv, b.c[1] + RX[1] * du + UY[1] * dv, b.c[2] + RX[2] * du + UY[2] * dv];
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
    } else if (t === 'rails') { // 升降台的金导轨：让玩家一眼看到“这里能上下”
      gold(); var top = x[4];
      [-0.5, 0.5].forEach(function (dx) { g.box(X + dx, (Y - 0.5 + top) / 2, Z + 0.52, 0.025, (top - Y + 0.5) / 2, 0.025, c.au); });
      for (i = Math.ceil(Y); i <= top; i++) g.box(X, i, Z + 0.52, 0.5, 0.012, 0.012, c.au);
      g.box(X, top + 0.05, Z + 0.52, 0.58, 0.03, 0.04, c.auL); plain();
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
  function enamelCell(g, q, col, thick, motif, kind) {
    var y1 = q[1] + 0.5, y0 = thick ? q[1] - 0.5 : q[1] + 0.12, cy = (y0 + y1) / 2, hy = (y1 - y0) / 2;
    g.m = kind === 'gilt' ? 2 : 3; if (kind === 'gem') g.e = 0.22; g.box(q[0], cy, q[2], 0.47, hy, 0.47, col); g.e = kind === 'gem' ? 0.35 : 0;
    g.m = 2; var r = kind === 'gem' ? 0.014 : 0.022, y = y1 + 0.006;
    g.box(q[0], y, q[2] - 0.47, 0.49, r, r, S.pc.au); g.box(q[0], y, q[2] + 0.47, 0.49, r, r, S.pc.au); g.box(q[0] - 0.47, y, q[2], r, r, 0.49, S.pc.au); g.box(q[0] + 0.47, y, q[2], r, r, 0.49, S.pc.au);
    // 掐丝纹：如意云头的折线 + 小圆点
    var rr = 0.011;
    if (motif % 2 === 0) { g.bar([q[0] - 0.28, y, q[2] - 0.12], [q[0] + 0.05, y, q[2] - 0.12], rr, S.pc.au); g.bar([q[0] + 0.05, y, q[2] - 0.12], [q[0] + 0.05, y, q[2] + 0.2], rr, S.pc.au); g.bar([q[0] - 0.12, y, q[2] + 0.2], [q[0] + 0.28, y, q[2] + 0.2], rr, S.pc.au); }
    else { g.bar([q[0] - 0.2, y, q[2] - 0.24], [q[0] - 0.2, y, q[2] + 0.1], rr, S.pc.au); g.bar([q[0] - 0.2, y, q[2] + 0.1], [q[0] + 0.22, y, q[2] + 0.1], rr, S.pc.au); g.bar([q[0] + 0.22, y, q[2] - 0.2], [q[0] + 0.22, y, q[2] + 0.1], rr, S.pc.au); }
    g.sphere(q[0] + 0.26, y, q[2] - 0.28, 0.035, 0.012, 0.035, S.pc.au, 8);
    g.m = 0; g.e = 0;
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
        var col = colOf((d.boxes && d.boxes[0] && d.boxes[0][6]) || 'en'), yy = enamelCell(ge, q, col, !d.thin && !p.glaze && !(p.kind === 'slide'), mi++, d.gilt ? 'gilt' : p.rough ? 'gem' : '');
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
      g.m = 2; var pv = d.wire.at || p.pivot, dv = d.wire.dir, ln = d.wire.len, y = pv[1] + 0.56;
      g.bar([pv[0], y, pv[2]], [pv[0] + dv[0] * ln, y, pv[2] + dv[2] * ln], 0.03, c.au);
      g.box(pv[0] + dv[0] * ln / 2, y - 0.04, pv[2] + dv[2] * ln / 2, Math.abs(dv[0]) * ln / 2 + 0.012, 0.05, Math.abs(dv[2]) * ln / 2 + 0.012, c.au);
      if (!d.wire.at) g.cyl(pv[0], y - 0.08, pv[2], 0.07, 0.07, 0.14, c.au, 12);
      g.sphere(pv[0] + dv[0] * ln, y + 0.04, pv[2] + dv[2] * ln, 0.1, c.auL, 12);
      if (d.wire.at) g.sphere(pv[0], y + 0.04, pv[2], 0.08, c.auL, 10);
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
    var g, k, lin = [0.95, 0.92, 0.85], robeA = hex('#4f6fa3'), robeA2 = hex('#3e5a8c'), skin = [0.96, 0.86, 0.76], hair = [0.16, 0.14, 0.18], straw = hex('#d9c08a');
    var au = GOLD, dark = [0.1, 0.1, 0.12];
    // 阿蓝：青金长衫、斗笠、腰间七格丝格（随章节一格格点上釉色），右手提一盏釉灯
    var band = function (filled) {
      var b = new G.Geo(), n = 7;
      b.m = 2; b.cyl(0, 0.225, 0, 0.17, 0.166, 0.014, au, 20); b.cyl(0, 0.315, 0, 0.158, 0.154, 0.014, au, 20);
      for (k = 0; k < n; k++) {
        var a0 = k / n * 6.2832, a1 = (k + 1) / n * 6.2832;
        b.m = 2; b.box(Math.cos(a0) * 0.166, 0.27, Math.sin(a0) * 0.166, 0.01, 0.048, 0.01, au);
        b.m = k < filled ? 3 : 5; b.e = k < filled ? 0.25 : 0;
        var col = k < filled ? hex(['#3fb6a8', '#e0786a', '#f0c24b', '#3a6fc4', '#6fae7e', '#f2a7a0', '#f3efe6'][k]) : mixc(robeA, [1, 1, 1], 0.25);
        for (var s2i = 0; s2i < 3; s2i++) { var aa = a0 + (a1 - a0) * (s2i + 0.5) / 3; b.box(Math.cos(aa) * 0.163, 0.27, Math.sin(aa) * 0.163, 0.026, 0.042, 0.026, col); }
        b.e = 0;
      }
      return R.mesh(b);
    };
    g = new G.Geo(); g.m = 5;
    g.lathe(0, 0, 0, [[0.198, 0], [0.202, 0.022], [0.172, 0.18], [0.142, 0.34], [0.118, 0.44], [0.092, 0.515], [0.05, 0.548], [0, 0.553]], robeA, 22);
    g.m = 5; g.box(0, 0.105, 0.183, 0.034, 0.105, 0.008, lin); // 前襟露出的素麻衬里
    g.m = 2; g.cyl(0, 0.012, 0, 0.204, 0.204, 0.012, au, 22);
    g.m = 5; g.cyl(0, 0.5, 0, 0.082, 0.068, 0.06, lin, 14);
    g.m = 0; g.sphere(0, 0.655, 0, 0.1, 0.106, 0.098, skin, 16);
    g.sphere(0, 0.688, -0.014, 0.106, 0.08, 0.103, hair, 14); g.sphere(0, 0.77, -0.06, 0.04, hair, 10);
    g.sphere(-0.036, 0.652, 0.092, 0.011, 0.015, 0.006, dark, 6); g.sphere(0.036, 0.652, 0.092, 0.011, 0.015, 0.006, dark, 6);
    // 斗笠：宽而浅的锥，金丝收边——小尺寸下一眼认得出的剪影
    g.m = 0; g.cyl(0, 0.722, 0.006, 0.235, 0.02, 0.092, straw, 20); g.cyl(0, 0.719, 0.006, 0.235, 0.235, 0.004, mulc(straw, 0.6), 20);
    g.m = 2; g.cyl(0, 0.718, 0.006, 0.24, 0.24, 0.008, au, 22); g.sphere(0, 0.818, 0.006, 0.022, au, 8);
    CM[0].body = R.mesh(g); CM[0].bandFn = band;
    var arm = function (col, cuff) { var a = new G.Geo(); a.m = 5; a.frustum(0, -0.21, 0, 0.042, 0.03, 0.21, col); a.m = 5; a.cyl(0, -0.235, 0, 0.046, 0.046, 0.03, cuff || col, 10); a.m = 0; a.sphere(0, -0.255, 0, 0.026, skin, 8); return R.mesh(a); };
    CM[0].arm = arm(robeA2, lin);
    g = new G.Geo(); g.m = 5; g.box(0, -0.12, 0, 0.018, 0.12, 0.004, hex('#e0786a')); g.box(0.012, -0.25, 0, 0.022, 0.015, 0.005, hex('#e0786a')); CM[0].sash = R.mesh(g);
    g = new G.Geo(); g.m = 2; g.bar([0, 0, 0], [0, -0.12, 0], 0.007, au); g.cyl(0, -0.13, 0, 0.034, 0.034, 0.012, au, 10); g.m = 3; g.e = 0.9; g.sphere(0, -0.18, 0, 0.048, 0.054, 0.048, [0.72, 0.86, 1], 12); g.e = 0; g.m = 2; g.cyl(0, -0.23, 0, 0.03, 0.02, 0.015, au, 10);
    CM[0].lamp = R.mesh(g);
    // 老师傅：编钟般外扩的深褐长袍、铜绿围裙、黑软帽、白须、金丝圆镜，背着掐丝的长镊子，双手背在身后
    var robe = [0.34, 0.22, 0.16], pat = hex('#3f7f74'), grey = [0.9, 0.88, 0.84];
    g = new G.Geo(); g.m = 5;
    g.lathe(0, 0, 0, [[0.238, 0], [0.235, 0.035], [0.204, 0.14], [0.168, 0.31], [0.142, 0.43], [0.094, 0.49], [0, 0.5]], robe, 22);
    g.m = 2; g.cyl(0, 0.01, 0, 0.24, 0.24, 0.012, au, 22);
    g.m = 1; g.box(0, 0.22, 0.17, 0.095, 0.16, 0.02, pat); g.m = 2; g.box(0, 0.375, 0.152, 0.098, 0.006, 0.02, au);
    g.m = 2; g.cyl(0, 0.34, 0, 0.16, 0.157, 0.02, au, 20);
    g.m = 0; g.sphere(0, 0.58, 0.035, 0.098, 0.103, 0.093, skin, 16);
    g.sphere(0, 0.605, 0.012, 0.102, 0.066, 0.098, grey, 14); g.sphere(0, 0.62, -0.078, 0.046, 0.042, 0.042, grey, 10);
    g.m = 5; g.sphere(0, 0.648, 0.01, 0.092, 0.05, 0.09, [0.14, 0.13, 0.14], 14); // 黑软帽
    g.m = 0; g.cyl(0, 0.41, 0.09, 0, 0.056, 0.15, grey, 10); // 长须
    g.box(-0.04, 0.622, 0.12, 0.022, 0.006, 0.006, grey); g.box(0.04, 0.622, 0.12, 0.022, 0.006, 0.006, grey);
    g.m = 2; g.cyl(-0.04, 0.592, 0.12, 0.026, 0.026, 0.006, au, 12, 'z'); g.cyl(0.04, 0.592, 0.12, 0.026, 0.026, 0.006, au, 12, 'z'); g.box(0, 0.592, 0.123, 0.016, 0.004, 0.003, au);
    g.m = 3; g.e = 0.3; g.cyl(-0.04, 0.592, 0.124, 0.019, 0.019, 0.002, [0.75, 0.85, 0.95], 10, 'z'); g.cyl(0.04, 0.592, 0.124, 0.019, 0.019, 0.002, [0.75, 0.85, 0.95], 10, 'z'); g.e = 0;
    g.m = 2; g.bar([-0.04, 0.12, -0.2], [-0.01, 0.62, -0.17], 0.01, au); g.bar([0.04, 0.12, -0.2], [0.01, 0.62, -0.17], 0.01, au);
    CM[1].body = R.mesh(g); CM[1].arm = arm(mulc(robe, 0.85), mulc(robe, 1.15));
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
    if (CM.rail) R.free(CM.rail); var grl = new G.Geo(); grl.m = 2;
    S.world.parts.forEach(function (p) { var rl = p.def.rail; if (!rl) return; var y = rl.from[1] + 0.515, z = rl.from[2] + 0.13; grl.bar([rl.from[0], y, z], [rl.to[0], y, z], 0.01, S.pc.au); for (var x = Math.ceil(rl.from[0]); x <= rl.to[0]; x += 2) grl.box(x, y, z, 0.02, 0.025, 0.04, S.pc.au); });
    CM.rail = R.mesh(grl);
    if (CM.door) R.free(CM.door); var gd = new G.Geo(); gd.m = 6; gd.e = 1;
    S.doorPanels.forEach(function (d) { gd.box(d[0], d[1] + d[4] / 2, d[2], d[3] - 0.03, d[4] / 2 - 0.02, 0.006, [1, 0.86, 0.6]); gd.box(d[0], d[1] + d[4] * 0.4, d[2] + 0.005, d[3] * 0.6, d[4] * 0.36, 0.006, [1, 0.97, 0.88]); });
    CM.door = R.mesh(gd);
    buildHalo();
    if (CM[0].band) R.free(CM[0].band); CM[0].band = CM[0].bandFn(i);
    fitCamera();
    S.duo = def.duo || null;
    C.forEach(function (c) { c.on = false; c.path = []; c.step = null; c.fade = null; c.vis = 1; c.hidden = false; c.cheer = 0; c.wave = 0; c.prev = null; c.face = c.faceT = 0.8; });
    C[0].on = true; setNode(C[0], S.world.start);
    if (S.duo && S.world.start2) { C[1].on = true; setNode(C[1], S.world.start2); C[1].face = C[1].faceT = 0.8; }
    S.sel = 0; S.won = false; S.canContinue = false; S.drag = null; S.scrub = null; S.ptr = null; S.pendingTap = null; S.ripples = []; S.pulses = []; S.fills = []; S.spills = [];
    S.hintI = 0; S.hintT = 0; S.did = {}; S.beat = 0; S.flash = 0; S.vase = { st: i, anim: null }; S.orb = null; S.tokenTaken = false; buildToken(i); S.drains = []; S.camAnim = null; S.sideOn = 0; S.negVase = null; S.negDone = 0; S.collapsed = 0; S.vz = { flash: 0, band: def.band || i, lit: 0 }; setCam(ISO_YAW, ISO_PITCH); S.kilnLit = i === 7 ? 0.25 : 1;
    initDust(); drawBG();
    var rs = document.documentElement.style; rs.setProperty('--ink', def.pal.ink); rs.setProperty('--scrim', def.pal.dark ? 'rgba(6,8,16,.42)' : 'rgba(255,250,240,.62)'); rs.setProperty('--ink-soft', rgba(def.pal.ink, 0.45)); rs.setProperty('--ts', def.pal.dark ? '0 1px 10px rgba(0,0,0,.55)' : '0 0 12px rgba(255,250,240,.8)'); rs.setProperty('--gold', def.pal.dark ? '#d9b45a' : '#9a6d22'); rs.setProperty('--paper', def.pal.sky[0]);
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
  function start(i, withCard) {
    S.mode = 'load'; document.body.classList.remove('opening');
    veil(true, function () {
      ['title', 'levels', 'finale'].forEach(function (id) { $(id).classList.remove('on'); });
      enterChapter(i, withCard);
      veil(false);
    });
  }

  // ───────────── 背景：深靛水彩 + 矿物颗粒 + 铜锈暖褐 + 哑金细线 ─────────────
  function rnd(seed) { var s = (seed * 9301 + 49297) % 233280; return function () { s = (s * 9301 + 49297) % 233280; return s / 233280; }; }
  var grain = null;
  function makeGrain() {
    var c = document.createElement('canvas'); c.width = c.height = 256; var x = c.getContext('2d'), d = x.createImageData(256, 256), r = rnd(7);
    for (var i = 0; i < d.data.length; i += 4) { var v = r(); var on = v > 0.84, cu = v > 0.995; d.data[i] = cu ? 168 : on ? 236 : 0; d.data[i + 1] = cu ? 120 : on ? 220 : 0; d.data[i + 2] = cu ? 80 : on ? 176 : 0; d.data[i + 3] = cu ? 120 : on ? (r() * 44) | 0 : (r() * 30) | 0; }
    x.putImageData(d, 0, 0);
    x.globalAlpha = 0.07; x.strokeStyle = '#f0e6d0'; x.lineWidth = 0.6; // 宣纸纤维
    for (i = 0; i < 70; i++) { var px = r() * 256, py = r() * 256, a = r() * 6.28, l = 6 + r() * 22; x.beginPath(); x.moveTo(px, py); x.quadraticCurveTo(px + Math.cos(a + 0.6) * l * 0.5, py + Math.sin(a + 0.6) * l * 0.5, px + Math.cos(a) * l, py + Math.sin(a) * l); x.stroke(); }
    grain = c;
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
    if (pal.moon) { var mx2 = W * 0.8, my2 = H * 0.16, mr = Math.min(W, H) * 0.045; g = bg.createRadialGradient(mx2, my2, mr * 0.8, mx2, my2, mr * 4); g.addColorStop(0, 'rgba(230,236,255,0.22)'); g.addColorStop(1, 'rgba(230,236,255,0)'); bg.fillStyle = g; bg.fillRect(mx2 - mr * 4, my2 - mr * 4, mr * 8, mr * 8);
      bg.fillStyle = 'rgba(236,240,255,0.9)'; bg.beginPath(); bg.arc(mx2, my2, mr, 0, 6.2832); bg.fill(); bg.fillStyle = rgba(pal.sky[0], 1); bg.beginPath(); bg.arc(mx2 + mr * 0.45, my2 - mr * 0.2, mr * 0.92, 0, 6.2832); bg.fill(); }
    if (pal.beams) { // 暗场里的冷暖斜光：左下窑光，右上冷白硬光
      bg.save(); bg.globalCompositeOperation = 'lighter';
      g = bg.createLinearGradient(0, H, W * 0.55, H * 0.2); g.addColorStop(0, 'rgba(255,120,50,0.34)'); g.addColorStop(0.5, 'rgba(255,120,50,0.1)'); g.addColorStop(1, 'rgba(255,120,50,0)');
      bg.fillStyle = g; bg.beginPath(); bg.moveTo(0, H * 0.62); bg.lineTo(W * 0.22, H); bg.lineTo(W * 0.78, H * 0.18); bg.lineTo(W * 0.5, H * 0.05); bg.closePath(); bg.fill();
      g = bg.createLinearGradient(W, 0, W * 0.45, H * 0.7); g.addColorStop(0, 'rgba(220,232,255,0.3)'); g.addColorStop(0.6, 'rgba(220,232,255,0.06)'); g.addColorStop(1, 'rgba(220,232,255,0)');
      bg.fillStyle = g; bg.beginPath(); bg.moveTo(W * 0.72, 0); bg.lineTo(W, 0); bg.lineTo(W * 0.62, H * 0.8); bg.lineTo(W * 0.45, H * 0.7); bg.closePath(); bg.fill();
      bg.restore();
    }
    if (pal.lamp) { var lx = W * 0.12, ly = H * 0.62; g = bg.createRadialGradient(lx, ly, 0, lx, ly, 40); g.addColorStop(0, 'rgba(255,190,110,0.8)'); g.addColorStop(0.15, 'rgba(255,170,90,0.35)'); g.addColorStop(1, 'rgba(255,170,90,0)'); bg.fillStyle = g; bg.fillRect(lx - 40, ly - 40, 80, 80); }
    // 雾
    g = bg.createLinearGradient(0, H * 0.7, 0, H); g.addColorStop(0, rgba(pal.fog, 0)); g.addColorStop(1, rgba(pal.fog, 0.8));
    bg.fillStyle = g; bg.fillRect(0, H * 0.7, W, H * 0.3);
    if (!grain) makeGrain();
    bg.fillStyle = bg.createPattern(grain, 'repeat'); bg.fillRect(0, 0, W, H);
    // 纸边暗角
    g = bg.createRadialGradient(W / 2, H * 0.45, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.75); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, pal.dark ? 'rgba(4,5,12,0.5)' : rgba(pal.ink, 0.16));
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
    vasePath(c, cx, cy, h); c.setLineDash([3, 5]); c.lineWidth = 1; c.strokeStyle = S.pal && S.pal.dark ? 'rgba(255,226,150,' + (0.6 * (1 - k(2)) + 0.05) + ')' : 'rgba(176,128,40,' + (0.7 * (1 - k(2)) + 0.05) + ')'; c.stroke(); c.setLineDash([]);
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


  // ───────────── 器即空间（一）：背景水雾里的淡墨瓶影 ─────────────
  // 平时几乎隐身；完成一道工序的瞬间，对应的那一圈像宣纸吸墨般亮起，随后沉回去。
  var BANDS = [[0, 0.1], [0.1, 0.3], [0.3, 0.46], [0.46, 0.6], [0.6, 0.74], [0.74, 0.86], [0.86, 1]];
  var BANDC = ['#3fb6a8', '#b5794b', '#e8c46a', '#e0786a', '#ff8a3c', '#2b7cf0', '#f0c860', '#ffe0a0'];
  function inkBox() { var h = Math.min(H * 0.9, W * 1.7); return { cx: W / 2, h: h, cy: H * 0.965 - h / 2 }; }
  function bandPoint(k) { var b = inkBox(), r = BANDS[Math.min(k, 6)]; return [b.cx, b.cy + b.h / 2 - (r[0] + r[1]) / 2 * b.h]; }
  function drawInkVase(c, t) {
    c.clearRect(0, 0, W, H);
    if (!S.pal || S.mode === 'stack' || S.mode === 'final' || S.mode === 'dive' || S.mode === 'open' || S.mode === 'fin') return;
    var b = inkBox(), cx = b.cx, h = b.h, cy = b.cy, y0 = cy + h / 2, dark = !!S.pal.dark, ink = dark ? [0.92, 0.88, 0.8] : [0.25, 0.2, 0.3], k, i;
    var Y = function (y) { return y0 - y * h; };
    c.save(); vasePath(c, cx, cy, h);
    var g = c.createLinearGradient(cx - h * 0.3, 0, cx + h * 0.3, 0); g.addColorStop(0, rgba(ink, 0.015)); g.addColorStop(0.42, rgba(ink, dark ? 0.06 : 0.05)); g.addColorStop(1, rgba(ink, 0.02));
    c.fillStyle = g; c.fill(); c.lineWidth = 1; c.strokeStyle = rgba(ink, dark ? 0.09 : 0.08); c.stroke();
    c.clip();
    for (k = 0; k < 7; k++) { // 已完成的工序：留下很淡的釉色与金线
      var lit = clamp(S.vase.st - k, 0, 1); if (lit <= 0) continue;
      var r = BANDS[k]; c.fillStyle = rgba(BANDC[k], 0.065 * lit); c.fillRect(cx - h, Y(r[1]), h * 2, Y(r[0]) - Y(r[1]));
      c.strokeStyle = rgba('#e8c46a', 0.2 * lit); c.lineWidth = 0.8; c.beginPath(); c.moveTo(cx - h, Y(r[1])); c.lineTo(cx + h, Y(r[1])); c.stroke();
      if (k === 2 || k === 6) { c.beginPath(); for (i = 0; i <= 60; i++) { var u = -1 + i / 30, yy = (r[0] + r[1]) / 2 + Math.sin(u * 9) * (r[1] - r[0]) * 0.25, w3 = vr(h, yy) * 0.92; if (i) c.lineTo(cx + u * w3, Y(yy)); else c.moveTo(cx + u * w3, Y(yy)); } c.stroke(); }
    }
    var f = S.vz.flash, kb = S.vz.band;
    if (f > 0.01) { // 当前工序：吸墨般晕开
      var rr = kb >= 7 ? [0, 1] : BANDS[kb], my = Y((rr[0] + rr[1]) / 2), rad = h * (0.25 + 0.5 * (1 - f) + (kb >= 7 ? 0.4 : 0));
      if (kb < 7) { c.save(); c.beginPath(); c.rect(cx - h, Y(rr[1]), h * 2, Y(rr[0]) - Y(rr[1])); c.clip(); }
      var gg = c.createRadialGradient(cx, my, 0, cx, my, rad); gg.addColorStop(0, rgba(BANDC[kb], 0.55 * f)); gg.addColorStop(0.6, rgba(BANDC[kb], 0.3 * f)); gg.addColorStop(1, rgba(BANDC[kb], 0));
      c.fillStyle = gg; c.fillRect(cx - h, cy - h, h * 2, h * 2);
      c.strokeStyle = rgba('#ffe0a0', 0.7 * f); c.lineWidth = 1.2; c.beginPath(); c.moveTo(cx - h, Y(rr[1])); c.lineTo(cx + h, Y(rr[1])); c.moveTo(cx - h, Y(rr[0])); c.lineTo(cx + h, Y(rr[0])); c.stroke();
      if (kb < 7) c.restore();
    }
    c.restore();
  }

  // 负空间瓶影：两塔之间的留白，被金丝弧线围成一只瓶
  function drawNegVase(t) {
    var nv = S.def.negVase, a = proj([nv.l[0], nv.y1, 0]), b = proj([nv.r[0], nv.y1, 0]), c0 = proj([nv.l[0], nv.y0, 0]);
    var cx = (a[0] + b[0]) / 2, top = Math.min(a[1], b[1]), bot = c0[1], h = bot - top, w = Math.abs(b[0] - a[0]);
    var grow = clamp(t / 0.7, 0, 1), al = t < 1.2 ? 1 : clamp(1 - (t - 1.2) / 2, 0, 1), sc = w / (h * 1.14);
    fx.save(); fx.translate(cx, top + h / 2); fx.scale(sc, 1); fx.translate(-cx, -(top + h / 2));
    vasePath(fx, cx, top + h / 2, h);
    var g = fx.createRadialGradient(cx, top + h * 0.45, 0, cx, top + h * 0.45, h * 0.6); g.addColorStop(0, 'rgba(255,244,220,' + 0.22 * al * grow + ')'); g.addColorStop(1, 'rgba(255,244,220,0)');
    fx.fillStyle = g; fx.fill();
    fx.setLineDash([h * 3 * grow, h * 3]); fx.lineWidth = 1.6 / sc; fx.strokeStyle = 'rgba(255,214,130,' + 0.85 * al + ')'; fx.shadowColor = 'rgba(255,200,120,' + al + ')'; fx.shadowBlur = 10; fx.stroke();
    fx.restore();
  }
  // ───────────── 器即空间（二）：开场三秒，俯身入器 ─────────────
  function drawDive(c, t) {
    var T1 = 0.8, T2 = 2.7, T3 = 3.5, z = 1;
    if (t > T1) z = Math.exp(Math.pow(clamp((t - T1) / (T2 - T1), 0, 1), 1.6) * 3.2);
    var vh = Math.min(H * 0.44, W * 0.62), cx = W / 2, base = H * 0.72, cy = base - vh / 2, mx = cx, my = base - vh * 0.985;
    c.save();
    c.fillStyle = '#0c0a09'; c.fillRect(0, 0, W, H);
    c.translate(mx, my); c.scale(z, z); c.translate(-mx, -my);
    var g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#120f0d'); g.addColorStop(1, '#231a13'); c.fillStyle = g; c.fillRect(-W, -H, W * 3, H * 3);
    g = c.createRadialGradient(W * 0.28, H * 0.42, 0, W * 0.28, H * 0.42, W * 0.6); g.addColorStop(0, 'rgba(255,170,90,0.28)'); g.addColorStop(1, 'rgba(255,170,90,0)'); c.fillStyle = g; c.fillRect(-W, -H, W * 3, H * 3);
    c.fillStyle = '#3a2a1e'; c.beginPath(); c.moveTo(-W, base + 4); c.lineTo(W * 2, base + 4); c.lineTo(W * 2, H * 3); c.lineTo(-W, H * 3); c.fill();
    c.strokeStyle = 'rgba(0,0,0,0.25)'; c.lineWidth = 1; for (var i = 0; i < 9; i++) { c.beginPath(); c.moveTo(-W, base + 12 + i * 14); c.lineTo(W * 2, base + 10 + i * 15); c.stroke(); }
    g = c.createRadialGradient(cx, base + 6, 0, cx, base + 6, vh * 0.5); g.addColorStop(0, 'rgba(0,0,0,0.5)'); g.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = g; c.fillRect(cx - vh, base - 20, vh * 2, 60);
    vasePath(c, cx, cy, vh);
    g = c.createLinearGradient(cx - vh * 0.3, 0, cx + vh * 0.3, 0); g.addColorStop(0, '#24170f'); g.addColorStop(0.35, '#6a4630'); g.addColorStop(0.55, '#4a3020'); g.addColorStop(1, '#1a110b');
    c.fillStyle = g; c.fill(); c.strokeStyle = 'rgba(220,170,110,0.35)'; c.lineWidth = 1; c.stroke();
    c.save(); vasePath(c, cx, cy, vh); c.clip(); var rn = rnd(3);
    for (i = 0; i < 14; i++) { var px = cx + (rn() - 0.5) * vh * 0.6, py = cy + (rn() - 0.3) * vh * 0.8, pr = vh * (0.03 + rn() * 0.06); g = c.createRadialGradient(px, py, 0, px, py, pr); g.addColorStop(0, 'rgba(95,165,150,0.35)'); g.addColorStop(1, 'rgba(95,165,150,0)'); c.fillStyle = g; c.fillRect(px - pr, py - pr, pr * 2, pr * 2); }
    c.restore();
    var mw = VP[VP.length - 1][1] * vh * 0.5; c.fillStyle = '#050403'; c.beginPath(); c.ellipse(mx, my, mw, mw * 0.32, 0, 0, 6.2832); c.fill();
    c.strokeStyle = 'rgba(230,180,120,0.5)'; c.lineWidth = 1.2; c.beginPath(); c.ellipse(mx, my, mw, mw * 0.32, 0, 0, 6.2832); c.stroke();
    c.restore();
    var dk = t < T2 ? clamp((t - (T2 - 0.6)) / 0.6, 0, 1) : 1 - clamp((t - T2) / (T3 - T2), 0, 1);
    if (t < 0.6) dk = Math.max(dk, 1 - t / 0.6);
    c.fillStyle = 'rgba(5,4,3,' + dk + ')'; c.fillRect(0, 0, W, H);
    if (t > T2) { c.globalAlpha = 1 - clamp((t - T2) / (T3 - T2), 0, 1); c.fillStyle = '#050403'; c.globalAlpha *= 0; c.globalAlpha = 1; }
  }

  // ───────────── 器即空间（三）：终章拉远，七重空间叠合成器 ─────────────
  var STACK = null, SH = 8;
  function buildStack() {
    if (STACK) return STACK;
    var cols = { stone: hex('#7c7f92'), cu: hex('#a8714a'), au: hex('#d9b45a'), auL: hex('#ffe9b0'), tq: hex('#3fb6a8'), co: hex('#e0786a'), ye: hex('#f0c24b'), lb: hex('#3a6fc4'), gb: hex('#2b7cf0'), fire: hex('#ff8a3c') };
    STACK = BANDS.map(function (r, k) {
      var g = new G.Geo(), prof = [], n = 7, j, y;
      for (j = 0; j <= n; j++) { var f = r[0] + (r[1] - r[0]) * j / n; prof.push([vr(SH, f), f * SH]); }
      var shrink = function (q) { return prof.map(function (p) { return [p[0] * q, p[1]]; }); };
      if (k === 0) { g.m = 0; g.lathe(0, 0, 0, prof, cols.stone, 28); g.m = 3; g.e = 0.6; for (j = 0; j < 10; j++) { var a = j * 0.628, rr = vr(SH, 0.05); g.frustum(Math.cos(a) * rr, 0.25, Math.sin(a) * rr, 0.09, 0, 0.3 + (j % 3) * 0.12, j % 2 ? cols.tq : cols.co); } g.e = 0; }
      else if (k === 1) { g.m = 1; g.lathe(0, 0, 0, prof, cols.cu, 28); }
      else if (k === 2) { // 镂空金丝笼，里面是铜胎
        g.m = 1; g.lathe(0, 0, 0, shrink(0.86), cols.cu, 24); g.m = 2;
        for (j = 0; j < 20; j++) { var aa = j / 20 * 6.2832; for (var q = 0; q < n; q++) { var p0 = prof[q], p1 = prof[q + 1]; g.bar([Math.cos(aa) * p0[0], p0[1], Math.sin(aa) * p0[0]], [Math.cos(aa) * p1[0], p1[1], Math.sin(aa) * p1[0]], 0.018, cols.au); } }
        for (y = 0; y <= n; y += 2) g.cyl(0, prof[y][1] - 0.02, 0, prof[y][0] + 0.02, prof[y][0] + 0.02, 0.04, cols.au, 28);
      }
      else if (k === 3) { g.m = 3; g.lathe(0, 0, 0, prof, cols.tq, 28); g.e = 0.3; for (j = 0; j < 12; j++) { var a3 = j * 0.5236, ym = (r[0] + r[1]) / 2, r3 = vr(SH, ym); g.sphere(Math.cos(a3) * r3, ym * SH, Math.sin(a3) * r3, 0.16, [cols.co, cols.ye, cols.lb][j % 3], 10); } g.e = 0; }
      else if (k === 4) { g.m = 3; g.lathe(0, 0, 0, prof, cols.lb, 28); g.m = 6; g.e = 1; var ym4 = (r[0] + r[1]) / 2; g.cyl(0, ym4 * SH - 0.06, 0, vr(SH, ym4) + 0.015, vr(SH, ym4) + 0.015, 0.12, cols.fire, 28); g.e = 0; }
      else if (k === 5) { g.m = 3; g.lathe(0, 0, 0, prof, cols.gb, 28); }
      else { g.m = 2; g.lathe(0, 0, 0, prof, cols.au, 28); }
      g.m = 2; g.cyl(0, r[0] * SH - 0.03, 0, vr(SH, r[0]) + 0.03, vr(SH, r[0]) + 0.03, 0.06, cols.auL, 28);
      return { m: R.mesh(g), r: r };
    });
    return STACK;
  }
  function stackList(t) {
    var list = [];
    buildStack().forEach(function (sl, k) {
      var ti = 0.6 + k * 0.62, pr = clamp((t - ti) / 1.25, 0, 1), e = ease(pr);
      if (pr <= 0) return;
      var dy = (1 - e) * (-7 - k * 0.6), spin = (1 - e) * (1.4 + k * 0.2);
      list.push({ m: sl.m, model: M.chain(M.tr(0, dy, 0), M.rot('y', spin)), o: { alpha: Math.min(1, pr * 1.6), emis: t > 5.6 ? 0.08 * Math.sin((t - 5.6) * 2) * Math.exp(-(t - 5.6) * 0.5) : 0 } });
    });
    return list;
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
    var f = faceOf(c), cs = Math.cos(f), sn = Math.sin(f), x = 0.17, z = 0.22, y = 0.13 + c.hop, off = charOffset(c);
    return [c.pos[0] + off[0] + x * cs + z * sn, c.pos[1] + y, c.pos[2] + off[2] - x * sn + z * cs];
  }
  function drawFX(dt) {
    var pal = S.pal, t = S.t, i, d, s, ppu = S.cam.ppu;
    fx.clearRect(0, 0, W, H);
    drawInkVase(vzx, t);
    if (S.mode === 'dive') { drawDive(fx, S.diveT || 0); return; }
    if (S.mode === 'title' || S.mode === 'load' || S.mode === 'open' || S.mode === 'trans' || S.mode === 'fin' || S.mode === 'final' || !S.world) return;
    fx.globalAlpha = 1;
    if (S.vase.anim) { var va = S.vase.anim; va.t += dt / 1.8; S.vase.st = va.from + (va.to - va.from) * ease(clamp(va.t, 0, 1)); if (va.t >= 1) S.vase.anim = null; }
    if (S.orb) {
      var o = S.orb; o.t += dt / o.dur; var u = ease(clamp(o.t, 0, 1)), a0 = o.a, b0 = bandPoint(S.vz.band), qx0 = (a0[0] + b0[0]) / 2, qy0 = Math.min(a0[1], b0[1]) - 80;
      var ox = (1 - u) * (1 - u) * a0[0] + 2 * u * (1 - u) * qx0 + u * u * b0[0], oy = (1 - u) * (1 - u) * a0[1] + 2 * u * (1 - u) * qy0 + u * u * b0[1];
      fx.globalCompositeOperation = 'lighter'; glowDot(ox, oy, 30, '#9cc8ff', 0.75); glowDot(ox, oy, 8, '#ffffff', 0.95); fx.globalCompositeOperation = 'source-over';
      if (o.t >= 1) { S.orb = null; S.vase.anim = { from: S.vase.st, to: S.idx + 1, t: 0 }; vzPulse(1); AU.vase(); }
    }
    if (S.negVase && S.def.negVase) drawNegVase(S.negVase.t);
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
        fx.strokeStyle = S.pal.dark ? 'rgba(255,226,150,' + (0.3 + 0.5 * (1 - k)) + ')' : 'rgba(176,128,40,' + (0.3 + 0.5 * (1 - k)) + ')'; fx.lineWidth = 1.5; fx.beginPath(); fx.arc(s[0], s[1], rr, 0, 6.2832); fx.stroke();
      });
    });
    // 选中人物的标记
    if (S.duo === 'ctrl' && S.mode === 'play' && C[1].on) { var cc = C[S.sel]; s = proj([cc.pos[0], cc.pos[1] + 1.05 + 0.04 * Math.sin(t * 3), cc.pos[2]]); fx.fillStyle = S.pal.dark ? 'rgba(255,226,150,0.95)' : 'rgba(176,128,40,0.95)'; fx.beginPath(); fx.moveTo(s[0], s[1] + 6); fx.lineTo(s[0] - 4.5, s[1] - 1); fx.lineTo(s[0] + 4.5, s[1] - 1); fx.closePath(); fx.fill(); }
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
      var k2 = easeOut(rp.t); fx.strokeStyle = rp.ok ? (S.pal.dark ? 'rgba(255,226,150,' : 'rgba(176,128,40,') + (1 - rp.t) * 0.8 + ')' : 'rgba(230,110,80,' + (1 - rp.t) * 0.8 + ')'; fx.lineWidth = rp.ok ? 1.4 : 2;
      var rr2 = rp.ok ? 6 + 20 * k2 : 14 - 6 * k2;
      fx.beginPath(); fx.moveTo(rp.x, rp.y - rr2 * 0.58); fx.lineTo(rp.x + rr2, rp.y); fx.lineTo(rp.x, rp.y + rr2 * 0.58); fx.lineTo(rp.x - rr2, rp.y); fx.closePath(); fx.stroke();
    }
    if (S.flash > 0) { fx.fillStyle = 'rgba(255,240,210,' + S.flash * 0.5 + ')'; fx.fillRect(0, 0, W, H); }
    fx.globalAlpha = 1;
    drawGuide(fx, t);
  }
  function handlePos(p, h) {
    if (p.def.wire) { var pv = p.def.wire.at || p.pivot, dv = p.def.wire.dir, ln = p.def.wire.len, k = p.def.wire.at ? 0.5 : 1; return L.tPoint(p, p.val, [pv[0] + dv[0] * ln * k, pv[1] + 0.6, pv[2] + dv[2] * ln * k]); }
    return L.tPoint(p, p.val, h);
  }

  // ───────────── 人物 ─────────────
  function standNow(n) {
    var p = n.part, loc = n.stair ? n.c : [n.c[0] + n.n[0] * 0.5, n.c[1] + n.n[1] * 0.5, n.c[2] + n.n[2] * 0.5];
    return L.tPoint(p, p.val, loc);
  }
  function faceOf(c) { var p = c.node.part; return c.face + (!c.step && p.kind === 'rot' && p.axis === 'y' ? (p.val - c.ref) * Math.PI / 2 : 0); }
  function anyAnim() { var ps = S.world.parts; for (var i = 0; i < ps.length; i++) if (ps[i].anim) return true; return S.fills.length > 0 || !!S.camAnim; }
  function canWalk() { return S.mode === 'play' && !anyAnim() && !(S.drag && S.drag.on) && S.beat <= 0 && !S.camAnim; }
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
    if (c.i === 0 && S.duo === 'follow' && C[1].on && !C[1].step && !C[1].fade && C[1].node === nx) { // 让路：师傅侧身让开，实在没地方就和阿蓝换位
      var m = C[1], side = m.node.adj.map(function (e) { return e.to; }).filter(function (n) { return n.active && n !== c.node && c.path.indexOf(n) < 0; })[0];
      m.path = []; beginStep(m, side || c.node);
    }
    var ci = ctrlIdx(c); if (ci >= 0) { S.world.chars[ci] = nx; L.settle(S.world); }
    AU.step(matOfNode(nx), c.i, S.stepN++);
  }
  function matOfNode(n) { var p = n.part; if (n.halo) return 'gold'; if (p.glaze || p.rough) return 'glaze'; var b = p.def.boxes && p.def.boxes[0]; return b && (b[6] === 'rk' || b[6] === 'kl') ? 'stone' : b && b[6] === 'wd' ? 'wood' : 'copper'; }
  function updChar(c, dt) {
    if (!c.on) return;
    c.hop = 0;
    if (c.fade) { // 师傅跟不上时化作金屑，在阿蓝身后重新聚形
      c.fade.t += dt;
      if (!c.fade.to) { c.vis = Math.max(0, 1 - c.fade.t / 0.4); if (c.fade.t >= 0.4) { c.fade = null; c.hidden = true; c.vis = 0; } return; }
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
    var target = a.step ? a.step.from : a.prev;
    var freeNear = function () { return a.node.adj.map(function (e) { return e.to; }).filter(function (n) { return n.active && !n.stair && n !== a.node && a.path.indexOf(n) < 0; })[0] || null; };
    if (m.hidden) { var nr = freeNear(); if (nr && !a.step) { m.hidden = false; m.fade = { t: 0.4, to: nr }; } return; }
    if (!m.node.active && !a.step) { m.path = []; var nr2 = freeNear(); if (nr2) m.fade = { t: 0, to: nr2 }; else { m.fade = { t: 0, to: null }; } return; }
    if (!target || target === m.node || target === a.node || !target.active) return;
    if (!canWalk() && !(S.mode === 'end')) return;
    if (m.path.length) return;
    if (m.node.active) { var p = L.path(m.node, target, [a.node]); if (p && p.length <= 6) { m.path = p; return; } }
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
      AU.plate(); AU.rise(dur); vzPulse(0.6); animPart(p, n.plate.to, dur, ease); burst([n.stand[0], n.stand[1] + 0.2, n.stand[2]], 18, '#6fd0e0', 1.6, 1.2, 0.4);
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
    L.drain(S.world).forEach(startDrain);
    if (p.state !== was) {
      if (p.handles.length) hintEvent('part');
      // 半拍停顿：光先变，人后走
      S.beat = 0.34; S.pulses.push({ p: partCenter(p), t: 0, dur: 0.8, col: p.def.wire ? '#ffe3a0' : '#bcd6ff' }); AU.settle(p.def.wire ? 'wire' : 'stone');
      if (p.def.wire) S.world.parts.forEach(function (q) { if (q.glaze && !q.filled && L.canFill(S.world, q)) { AU.closed(); q.nodes.forEach(function (n) { S.pulses.push({ p: [n.c[0], n.c[1] + 0.5, n.c[2]], t: -0.2, dur: 1.0, col: '#5aa8ff' }); }); } });
    }
    checkFollows();
    if (!anyAnim() && S.pendingTap) { var q = S.pendingTap; S.pendingTap = null; tap(q[0], q[1]); }
  }
  function startDrain(p) { // 金丝离开：釉散回空框
    S.drains.push({ part: p, t: 0, dur: 0.9, o: partCenter(p) }); AU.drain();
    p.nodes.forEach(function (n) { for (var i = 0; i < 6; i++) parts.push({ p: L.tPoint(p, p.val, [n.c[0] + (Math.random() - 0.5) * 0.8, n.c[1] + 0.4, n.c[2] + (Math.random() - 0.5) * 0.8]), v: [(Math.random() - 0.5) * 0.3, -0.4 - Math.random(), (Math.random() - 0.5) * 0.3], t: 0, life: 1.3, col: '#4f9be8', g: 3, r: 1.4 + Math.random() }); });
  }
  function checkFollows() {
    S.world.parts.forEach(function (p) {
      if (!(p.follow || p.hold || p.collapse) || p.anim) return;
      var t = L.followTarget(S.world, p);
      if (p.state !== t && !L.anyOn(S.world, p) && !C.some(function (c) { return c.on && c.step && (c.step.to.part === p || c.step.from.part === p); })) {
        var d = p.hold ? 1.3 : p.collapse ? 2.6 : 1.7; if (!p.collapse) AU.rise(d);
        if (p.collapse) { if (!S.collapsed) { S.collapsed = 1; AU.collapse(); S.fire = 1.4; } burst(partCenter(p), 26, '#ff8a3c', 2.2, 1.6, 1.2); }
        if (p.hold) { AU.hold(t === p.hold.on); if (t === p.hold.on) { S.fire = 0.6; vzPulse(0.5); } }
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
        var s = proj(hw), d = Math.hypot(x - s[0], y - s[1]), r = Math.max(32, 0.62 * S.cam.ppu);
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
        S.beat = 0.36; S.pulses.push({ p: partCenter(f.part), t: 0, dur: 1, col: '#5aa8ff' }); AU.filled(); vzPulse(0.8);
        checkFollows();
      }
    }
    for (i = S.drains.length - 1; i >= 0; i--) {
      var d = S.drains[i]; d.t += dt / d.dur; d.part.fillK = clamp(1 - d.t, 0, 1);
      if (d.t >= 1) { S.drains.splice(i, 1); d.part.fillK = 0; }
    }
  }
  function vzPulse(k) { S.vz.flash = Math.max(S.vz.flash, k || 0.7); }
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
    if (p.polish >= 1) { p.polished = true; L.settle(S.world); AU.polished(); vzPulse(0.8); S.beat = 0.36; hintEvent('polish'); S.pulses.push({ p: partCenter(p), t: 0, dur: 1, col: '#9fd0ff' }); p.nodes.forEach(function (n) { burst(L.tPoint(p, p.val, [n.c[0], n.c[1] + 0.6, n.c[2]]), 8, '#e8f4ff', 1.4, 0.9, 0.5); }); checkFollows(); }
  }

  // ───────────── 输入 ─────────────
  function pickNode(x, y, strict) {
    var best = null, bd = -1e9, near = null, nd = 0.95, ns = S.world.nodes;
    for (var i = 0; i < ns.length; i++) {
      var n = ns[i]; if (!n.active) continue;
      var s = proj(n.stand), du = (x - s[0]) / S.cam.ppu, dv = -(y - s[1]) / S.cam.ppu, a = du * 1.41421356, b = -dv * 2.44948974, dx = (a + b) / 2, dz = (b - a) / 2, m = Math.max(Math.abs(dx), Math.abs(dz));
      if (!isIso()) m = Math.hypot(du, dv * 1.4) * 0.85;
      var depth = n.stand[0] * VZ[0] + n.stand[1] * VZ[1] + n.stand[2] * VZ[2];
      if (m <= 0.5) { if (depth > bd) { bd = depth; best = n; } }
      else if (m < nd) { nd = m; near = n; }
    }
    return best || (strict ? null : near);
  }
  function pickGlaze(x, y) { // 可灌釉的丝格判定范围放宽（手指点不准），未合拢的保持原范围
    var best = null, bm = 1e9, px = Math.max(1, 30 / S.cam.ppu);
    S.world.parts.forEach(function (p) {
      if (!p.glaze || p.filled || p.fillK > 0) return;
      var ok = L.canFill(S.world, p), thr = ok ? Math.max(0.98, px) : 0.55;
      p.nodes.forEach(function (n) {
        var w = L.tPoint(p, p.val, [n.c[0], n.c[1] + 0.5, n.c[2]]), s = proj(w), du = (x - s[0]) / S.cam.ppu, dv = -(y - s[1]) / S.cam.ppu, a = du * 1.41421356, b = -dv * 2.44948974;
        var m = isIso() ? Math.max(Math.abs((a + b) / 2), Math.abs((b - a) / 2)) : Math.hypot(du, dv * 1.4) * 0.85;
        if (m <= thr && m - (ok ? 0.3 : 0) < bm) { bm = m - (ok ? 0.3 : 0); best = { p: p, at: w }; }
      });
    });
    return best;
  }
  function pickChar(x, y) {
    if (S.duo !== 'ctrl') return -1;
    var best = -1, bd = Math.max(26, S.cam.ppu * 0.5);
    C.forEach(function (c, i) { if (!c.on || c.hidden) return; var s = proj([c.pos[0], c.pos[1] + 0.45, c.pos[2]]), d = Math.hypot(x - s[0], (y - s[1]) * 0.8); if (d < bd) { bd = d; best = i; } });
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
    S.guideIdle = 0;
    if (S.mode === 'open') { opTap(); return; }
    if (S.mode === 'card') { cardTap(); return; }
    if (S.mode === 'trans') { transTap(); return; }
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
    startCeremony();
    after(farewell ? 1.8 : 0.9, function () { var d = S.doors[0]; if (d) { S.pulses.push({ p: [d.p[0], d.p[1] + 0.6, d.p[2]], t: 0, dur: 1.4, col: '#ffd98a' }); burst([d.p[0], d.p[1] + 0.6, d.p[2]], 36, '#ffd98a', 1.6, 1.6, -0.3); } AU.door(); });
  }
  function nextLevel() {
    S.canContinue = false; AU.ui();
    if (S.idx < LEVELS.length - 1) startTrans(S.idx + 1);
    else startFinale();
  }


  // ═════════════ 舞台（参考《纪念碑谷3》的带入与转场）═════════════
  // 开场不设菜单：直接是一张亮着灯的作坊案头，轻触铜胎，金丝在空中掐出「成器」二字，点釉、入火、磨光；
  // 关卡结尾：光升起，金丝在天上勾出这一章的纹样，凝成一粒光落进背景里的瓶影；
  // 章节之间：上一关缩进一只梅瓶形的窗，窗里先以金丝勾出下一关，再填上颜色，菱形一层层推开，进入章节卡；
  // 章节卡滑开后，关卡先是金丝骨架，再填成实体——每一章开场都是一次「掐丝 → 点蓝」。
  var trc = $('tr'), tr = trc.getContext('2d');
  var GLY = window.SY_GLYPHS, GPATH = {};
  function gpath(ch) { if (!GPATH[ch]) GPATH[ch] = new Path2D(GLY.g[ch].d); return GPATH[ch]; }
  var CARDC = [['#3f7a8c', '#7a5a8c'], ['#8a5a3a', '#3e5a6a'], ['#2f6f74', '#c09040'], ['#2f5fb0', '#c0605a'], ['#a8442e', '#22283a'], ['#4a5566', '#2b6fd0'], ['#c99a3a', '#1c2350'], ['#d98a5a', '#3a8f9a']];
  function fract(x) { return x - Math.floor(x); }
  function hash(i) { return fract(Math.sin(i * 127.1 + 311.7) * 43758.5453); }

  // —— 景泰蓝字：金丝勾边、釉色填心、入火、磨光、镀金 ——
  // ph: {wire, fill, fire, fireDone, polish, gild, alpha}
  function clText(c, text, cx, cy, size, ph, vertical, pal2) {
    var chars = text.split(''), n = chars.length, gap = size * 0.04, tot = n * size + (n - 1) * gap;
    c.save(); c.globalAlpha = ph.alpha === undefined ? 1 : ph.alpha;
    chars.forEach(function (ch, i) {
      var ox = vertical ? cx - size / 2 : cx - tot / 2 + i * (size + gap), oy = vertical ? cy - tot / 2 + i * (size + gap) : cy - size / 2;
      clGlyph(c, ch, ox, oy, size, ph, i, pal2);
    });
    c.restore();
  }
  function clGlyph(c, ch, ox, oy, size, ph, gi, pal2) {
    var g = GLY.g[ch]; if (!g) return;
    var P = gpath(ch), k = size / 1000, b = g.b, gw = b[2] - b[0], gh = b[3] - b[1], sc = Math.min(1, 940 / Math.max(gw, gh));
    var kk = k * sc, tx = ox + (size - gw * kk) / 2 - b[0] * kk, ty = oy + (size - gh * kk) / 2 + b[3] * kk;
    var col = pal2 || ['#2fa596', '#2f5fb0', '#e0786a', '#f0c24b', '#f6f0e2'];
    c.save(); c.translate(tx, ty); c.scale(kk, -kk);
    var fill = ph.fill || 0, wire = ph.wire === undefined ? 1 : ph.wire;
    if (fill > 0) {
      c.save(); c.shadowColor = 'rgba(0,0,0,' + 0.4 * fill + ')'; c.shadowBlur = size * 0.07; c.shadowOffsetY = size * 0.025; c.fillStyle = 'rgba(0,0,0,0.6)'; c.globalAlpha *= fill; c.fill(P); c.restore();
      c.save(); c.clip(P);
      var y0 = b[1] + (b[3] - b[1]) * (1 - fill) * 0.0, top = b[1] + (b[3] - b[1]) * Math.min(1, fill * 1.25);
      c.beginPath(); c.rect(b[0] - 50, b[1] - 50, gw + 100, top - b[1] + 50); c.clip();
      var gr = c.createLinearGradient(0, b[1], 0, b[3]); gr.addColorStop(0, col[1]); gr.addColorStop(0.55, col[0]); gr.addColorStop(1, mixHex(col[0], '#ffffff', 0.25));
      c.fillStyle = gr; c.fillRect(b[0] - 50, b[1] - 50, gw + 100, gh + 100);
      // 字心里的掐丝小花：珊瑚、明黄、乳白，每朵一圈金丝
      for (var i = 0; i < 14; i++) {
        var px = b[0] + gw * hash(gi * 31 + i), py = b[1] + gh * hash(gi * 17 + i * 3 + 7), pr = 26 + 22 * hash(i * 5 + gi);
        c.fillStyle = col[2 + (i % 3)]; c.beginPath(); c.arc(px, py, pr, 0, 6.2832); c.fill();
        c.fillStyle = col[3]; c.beginPath(); c.arc(px, py, pr * 0.35, 0, 6.2832); c.fill();
        c.strokeStyle = '#e8c46a'; c.lineWidth = 7; c.beginPath(); c.arc(px, py, pr, 0, 6.2832); c.stroke();
      }
      c.strokeStyle = '#e8c46a'; c.lineWidth = 6; // 字心卷草金丝
      for (i = 0; i < 4; i++) { var sx = b[0] + gw * hash(gi * 7 + i + 40), sy = b[1] + gh * hash(gi * 9 + i + 50); c.beginPath(); for (var a = 0; a < 7; a += 0.25) { var rr = 8 + a * 9; c.lineTo(sx + Math.cos(a + i) * rr, sy + Math.sin(a + i) * rr); } c.stroke(); }
      var fd = ph.fireDone || 0; // 入火之前，釉是哑的
      if (fd < 1) { c.fillStyle = 'rgba(200,196,186,' + 0.42 * (1 - fd) + ')'; c.fillRect(b[0] - 50, b[1] - 50, gw + 100, gh + 100); }
      if (ph.fire > 0) { var fg = c.createLinearGradient(0, b[1], 0, b[3]); fg.addColorStop(0, 'rgba(255,120,40,' + 0.7 * ph.fire + ')'); fg.addColorStop(1, 'rgba(255,200,120,' + 0.25 * ph.fire + ')'); c.fillStyle = fg; c.fillRect(b[0] - 50, b[1] - 50, gw + 100, gh + 100); }
      if (ph.polish > 0 && ph.polish < 1) { var px2 = b[0] - 300 + (gw + 600) * ph.polish, pg = c.createLinearGradient(px2 - 160, 0, px2 + 160, 0); pg.addColorStop(0, 'rgba(255,255,255,0)'); pg.addColorStop(0.5, 'rgba(255,255,255,0.75)'); pg.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = pg; c.fillRect(b[0] - 50, b[1] - 50, gw + 100, gh + 100); }
      if (ph.polish >= 1) { var sg = c.createLinearGradient(b[0], 0, b[2], 0); sg.addColorStop(0.1, 'rgba(255,255,255,0)'); sg.addColorStop(0.32, 'rgba(255,255,255,0.22)'); sg.addColorStop(0.42, 'rgba(255,255,255,0)'); c.fillStyle = sg; c.fillRect(b[0] - 50, b[1] - 50, gw + 100, gh + 100); }
      c.restore();
    }
    if (wire > 0) {
      c.lineJoin = 'round'; c.lineCap = 'round';
      var D = 5200; if (wire < 1) c.setLineDash([wire * D, D]);
      var gl = c.createLinearGradient(0, b[3], 0, b[1]); gl.addColorStop(0, '#fff2bf'); gl.addColorStop(0.5, '#e0b04c'); gl.addColorStop(1, '#a8742a');
      if (ph.gild > 0) { c.shadowColor = 'rgba(255,214,120,' + 0.9 * ph.gild + ')'; c.shadowBlur = size * 0.05 * ph.gild; }
      c.strokeStyle = gl; c.lineWidth = Math.max(14, 0.03 * 1000 * (size < 90 ? 1.35 : 1)); c.stroke(P);
      c.shadowBlur = 0; c.strokeStyle = 'rgba(255,246,210,' + (0.55 + 0.4 * (ph.gild || 0)) + ')'; c.lineWidth *= 0.32; c.stroke(P);
      c.setLineDash([]);
    }
    c.restore();
  }
  function mixHex(a, b, t) { var A = hex(a), B = hex(b); return 'rgb(' + [0, 1, 2].map(function (i) { return Math.round((A[i] + (B[i] - A[i]) * t) * 255); }).join(',') + ')'; }
  function phaseAt(t, w0, w1, f0, f1, fi0, fi1, p0, p1, g0, g1) { // 依时间给出各道工序的进度
    var r = function (a, b) { return clamp((t - a) / (b - a), 0, 1); };
    var fp = r(fi0, fi1);
    return { wire: ease(r(w0, w1)), fill: ease(r(f0, f1)), fire: Math.sin(Math.PI * fp) * (fp < 1 ? 1 : 0), fireDone: clamp(fp * 1.4 - 0.2, 0, 1), polish: r(p0, p1), gild: r(g0, g1) };
  }

  // —— 关卡的金丝骨架（组装、章节卡、转场窗里都用） ——
  function levelEdges() {
    var E = [];
    S.world.parts.forEach(function (p) {
      (p.def.boxes || []).forEach(function (b) {
        var yb = Math.max(b[1], b[4] - 2.5) - 0.5, yt = b[4] + 0.5;
        if (p.def.thin) { yb = b[4] + 0.1; }
        if (p.glaze || p.rough) yb = b[4] + 0.12;
        var X = [b[0] - 0.5, b[3] + 0.5], Y = [yb, yt], Z = [b[2] - 0.5, b[5] + 0.5], pt = function (i, j, k) { return L.tPoint(p, p.val, [X[i], Y[j], Z[k]]); };
        if (pt(0, 1, 0)[1] < -3) return;
        var es = [[0, 0, 0, 1, 0, 0], [0, 1, 0, 1, 1, 0], [0, 0, 1, 1, 0, 1], [0, 1, 1, 1, 1, 1], [0, 0, 0, 0, 1, 0], [1, 0, 0, 1, 1, 0], [0, 0, 1, 0, 1, 1], [1, 0, 1, 1, 1, 1], [0, 0, 0, 0, 0, 1], [1, 0, 0, 1, 0, 1], [0, 1, 0, 0, 1, 1], [1, 1, 0, 1, 1, 1]];
        es.forEach(function (e) { var a = pt(e[0], e[1], e[2]), c2 = pt(e[3], e[4], e[5]); E.push([a, c2, Math.min(a[1], c2[1]) + (e[1] + e[4]) * 0.01]); });
      });
    });
    E.sort(function (a, b) { return a[2] - b[2]; });
    return E;
  }
  function drawEdges(c, E, prog, alpha, xf) { // prog 0..1：自下而上逐条勾出
    if (!E || alpha <= 0) return;
    c.save(); c.lineCap = 'round'; c.strokeStyle = 'rgba(240,200,110,' + alpha + ')'; c.lineWidth = 1.2;
    c.shadowColor = 'rgba(255,210,120,' + 0.6 * alpha + ')'; c.shadowBlur = 4;
    var n = E.length;
    for (var i = 0; i < n; i++) {
      var k = clamp(prog * 1.25 * n - i * 1.0, 0, n) / Math.max(1, n * 0.25); if (k <= 0) break; k = Math.min(1, k * 4);
      var a = proj(E[i][0]), b = proj(E[i][1]);
      if (xf) { a = [xf.x + (a[0] - W / 2) * xf.s, xf.y + (a[1] - H / 2) * xf.s]; b = [xf.x + (b[0] - W / 2) * xf.s, xf.y + (b[1] - H / 2) * xf.s]; }
      c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k); c.stroke();
    }
    c.restore();
  }
  function paper(c, col0, col1) {
    var g = c.createRadialGradient(W / 2, H * 0.45, 0, W / 2, H * 0.5, Math.max(W, H) * 0.8); g.addColorStop(0, col0); g.addColorStop(1, col1);
    c.fillStyle = g; c.fillRect(0, 0, W, H); if (grain) { c.fillStyle = c.createPattern(grain, 'repeat'); c.fillRect(0, 0, W, H); }
  }
  function snapshot() {
    var o = document.createElement('canvas'); o.width = glc.width; o.height = glc.height; var x = o.getContext('2d');
    [bgc, vzc, glc, fxc].forEach(function (cv) { x.drawImage(cv, 0, 0); }); return o;
  }

  // ── 一、开场：作坊案头，轻触铜胎，金丝掐出「成器」 ──
  function opLayout() {
    var land = W > H * 1.1, vh = land ? Math.min(H * 0.5, W * 0.3) : Math.min(H * 0.36, W * 0.62), base = H * (land ? 0.86 : 0.8);
    var mouth = base - vh * 0.985, size = Math.min(land ? H * 0.2 : W * 0.33, (mouth - 70) * 0.62);
    return { cx: W / 2, vh: vh, base: base, cy: base - vh / 2, mouth: mouth, ty: Math.max(48 + size / 2, mouth * 0.42), size: size };
  }
  function drawBench(c, t, zoom) {
    var Lo = opLayout(), cx = Lo.cx, vh = Lo.vh, base = Lo.base, cy = Lo.cy, mx = cx, my = Lo.mouth, g, i;
    var dr = 1 + 0.015 * Math.sin(t * 0.25); // 镜头像呼吸一样极慢地漂
    c.save(); c.translate(mx, my); c.scale(zoom * dr, zoom * dr); c.translate(-mx + Math.sin(t * 0.17) * 4, -my);
    g = c.createLinearGradient(0, -H, 0, H * 2); g.addColorStop(0, '#0d0b0b'); g.addColorStop(0.55, '#1a1411'); g.addColorStop(1, '#2a1f17'); c.fillStyle = g; c.fillRect(-W, -H, W * 3, H * 3);
    var lf = 0.85 + 0.15 * Math.sin(t * 7.1) * Math.sin(t * 2.3); // 油灯
    g = c.createRadialGradient(cx - vh * 0.75, base - vh * 0.55, 0, cx - vh * 0.75, base - vh * 0.55, Math.max(W, H) * 0.7); g.addColorStop(0, 'rgba(255,176,96,' + 0.34 * lf + ')'); g.addColorStop(0.4, 'rgba(255,140,70,' + 0.1 * lf + ')'); g.addColorStop(1, 'rgba(255,140,70,0)'); c.fillStyle = g; c.fillRect(-W, -H, W * 3, H * 3);
    c.fillStyle = '#3a2a1e'; c.fillRect(-W, base + 4, W * 3, H * 3);
    g = c.createLinearGradient(0, base, 0, base + 60); g.addColorStop(0, 'rgba(255,190,120,0.18)'); g.addColorStop(1, 'rgba(255,190,120,0)'); c.fillStyle = g; c.fillRect(-W, base + 4, W * 3, 60);
    c.strokeStyle = 'rgba(0,0,0,0.25)'; c.lineWidth = 1; for (i = 0; i < 12; i++) { c.beginPath(); c.moveTo(-W, base + 14 + i * 16); c.lineTo(W * 2, base + 12 + i * 17); c.stroke(); }
    // 灯盏
    var lx = cx - vh * 0.78, ly = base; c.fillStyle = '#5a4030'; c.fillRect(lx - 12, ly - 8, 24, 8); c.fillStyle = '#7a5a3a'; c.beginPath(); c.ellipse(lx, ly - 10, 16, 5, 0, 0, 6.2832); c.fill();
    g = c.createRadialGradient(lx, ly - 22, 0, lx, ly - 22, 26); g.addColorStop(0, 'rgba(255,236,180,' + lf + ')'); g.addColorStop(0.3, 'rgba(255,170,80,' + 0.6 * lf + ')'); g.addColorStop(1, 'rgba(255,150,60,0)'); c.fillStyle = g; c.fillRect(lx - 30, ly - 50, 60, 50);
    // 散落的工具：镊子、铜丝卷、釉碟
    c.strokeStyle = '#c9a050'; c.lineWidth = 2; c.beginPath(); c.moveTo(cx + vh * 0.5, base + 18); c.lineTo(cx + vh * 0.95, base + 10); c.moveTo(cx + vh * 0.5, base + 20); c.lineTo(cx + vh * 0.95, base + 24); c.stroke();
    c.strokeStyle = '#b07445'; c.lineWidth = 1.5; for (i = 0; i < 5; i++) { c.beginPath(); c.ellipse(cx - vh * 0.42, base + 22, 14 - i, 5 - i * 0.6, 0, 0, 6.2832); c.stroke(); }
    [['#3fb6a8', 0.66], ['#e0786a', 0.8], ['#f0c24b', 0.94]].forEach(function (q, k) { var px = cx + vh * q[1] * (k % 2 ? 1 : 1) - vh * 0.05, py = base + 40 + k * 3; c.fillStyle = '#e8e0d0'; c.beginPath(); c.ellipse(px, py, 13, 5, 0, 0, 6.2832); c.fill(); c.fillStyle = q[0]; c.beginPath(); c.ellipse(px, py - 1, 9, 3, 0, 0, 6.2832); c.fill(); });
    // 空铜胎
    g = c.createRadialGradient(cx, base + 6, 0, cx, base + 6, vh * 0.5); g.addColorStop(0, 'rgba(0,0,0,0.55)'); g.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = g; c.fillRect(cx - vh, base - 20, vh * 2, 60);
    vasePath(c, cx, cy, vh);
    g = c.createLinearGradient(cx - vh * 0.3, 0, cx + vh * 0.3, 0); g.addColorStop(0, '#2a1a10'); g.addColorStop(0.3, '#8a5a38'); g.addColorStop(0.42, '#b07a4c'); g.addColorStop(0.6, '#5a3a24'); g.addColorStop(1, '#1a110b');
    c.fillStyle = g; c.fill(); c.strokeStyle = 'rgba(240,190,120,0.35)'; c.lineWidth = 1; c.stroke();
    c.save(); vasePath(c, cx, cy, vh); c.clip(); var rn = rnd(3);
    for (i = 0; i < 16; i++) { var px2 = cx + (rn() - 0.5) * vh * 0.6, py2 = cy + (rn() - 0.3) * vh * 0.8, pr = vh * (0.03 + rn() * 0.06); g = c.createRadialGradient(px2, py2, 0, px2, py2, pr); g.addColorStop(0, 'rgba(95,165,150,0.3)'); g.addColorStop(1, 'rgba(95,165,150,0)'); c.fillStyle = g; c.fillRect(px2 - pr, py2 - pr, pr * 2, pr * 2); }
    c.restore();
    var mw = VP[VP.length - 1][1] * vh * 0.5; c.fillStyle = '#050403'; c.beginPath(); c.ellipse(mx, my, mw, mw * 0.32, 0, 0, 6.2832); c.fill();
    c.strokeStyle = 'rgba(230,180,120,0.55)'; c.lineWidth = 1.2; c.beginPath(); c.ellipse(mx, my, mw, mw * 0.32, 0, 0, 6.2832); c.stroke();
    // 灯下飘浮的尘
    for (i = 0; i < 26; i++) { var dx = (hash(i) * 1.6 - 0.3) * W, dy = fract(hash(i + 9) - t * 0.012 * (0.5 + hash(i + 3))) * H; c.fillStyle = 'rgba(255,220,170,' + (0.15 + 0.2 * Math.sin(t + i)) + ')'; c.fillRect(dx, dy, 1.5, 1.5); }
    c.restore();
  }
  function ring(c, x, y, r, t, col, label) { // 纪念碑谷式的引导环：一圈呼吸的光，告诉你“点这里”
    var k = fract(t * 0.7);
    c.save(); c.strokeStyle = col || 'rgba(255,240,210,'; c.lineWidth = 1.6;
    c.strokeStyle = (col || 'rgba(255,240,210,') + (0.9 * (1 - k)) + ')'; c.beginPath(); c.arc(x, y, r * (0.7 + 0.8 * k), 0, 6.2832); c.stroke();
    c.strokeStyle = (col || 'rgba(255,240,210,') + '0.9)'; c.lineWidth = 1.4; c.beginPath(); c.arc(x, y, r * 0.5, 0, 6.2832); c.stroke();
    c.fillStyle = (col || 'rgba(255,240,210,') + '0.9)'; c.beginPath(); c.arc(x, y, 2.2, 0, 6.2832); c.fill();
    if (label) { c.font = '600 12px ' + FONT; c.textAlign = 'center'; c.fillStyle = (col || 'rgba(255,240,210,') + '0.75)'; c.fillText(label, x, y + r * 1.4 + 14); }
    c.restore();
  }
  var FONT = '"Songti SC","STSong","Noto Serif CJK SC","Source Han Serif SC","Noto Serif SC",serif';
  function spaced(c, text, x, y, size, sp, col, align) { // 宽字距的小字
    c.save(); c.font = '600 ' + size + 'px ' + FONT; c.fillStyle = col; c.textBaseline = 'middle';
    var w = 0, ws = text.split('').map(function (ch) { var m = c.measureText(ch).width; w += m + sp; return m; }); w -= sp;
    var x0 = align === 'left' ? x : x - w / 2; text.split('').forEach(function (ch, i) { c.fillText(ch, x0, y); x0 += ws[i] + sp; });
    c.restore();
  }
  function openScene() {
    S.mode = 'open'; S.op = { t: 0, ph: 'idle', pt: 0 }; S.seq = [];
    ['title', 'levels', 'finale', 'card'].forEach(function (id) { $(id).classList.remove('on'); });
    $('chapter').classList.remove('on'); $('who').classList.remove('on'); $('endline').classList.remove('on'); setHint(''); say(null);
    $('hud').classList.add('on'); document.body.classList.add('opening');
    AU.music(0);
  }
  function opTap() {
    var o = S.op;
    if (o.ph === 'idle') { o.ph = 'title'; o.pt = 0; AU.titleForm(); }
    else if (o.ph === 'title') { if (o.pt < 4.6) o.pt = 4.6; else { o.ph = 'ready'; } }
    else if (o.ph === 'ready') { o.ph = 'dive'; o.pt = 0; AU.dive(); }
  }
  function updOpen(dt) {
    var o = S.op; o.t += dt; o.pt += dt;
    if (o.ph === 'title' && o.pt > 5.2) o.ph = 'ready';
    if (o.ph === 'dive' && o.pt > 2.5) { document.body.classList.remove('opening'); enterChapter(save.done >= LEVELS.length ? 0 : save.done, true); }
  }
  function drawOpen(c) {
    var o = S.op, Lo = opLayout(), z = 1;
    if (o.ph === 'dive') z = Math.exp(Math.pow(clamp(o.pt / 2.2, 0, 1), 1.7) * 3.4);
    drawBench(c, o.t, z);
    if (o.ph === 'dive') { var dk = clamp((o.pt - 1.4) / 0.8, 0, 1); c.fillStyle = 'rgba(5,4,3,' + dk + ')'; c.fillRect(0, 0, W, H); return; }
    var fadeIn = clamp(o.t / 1.2, 0, 1); if (fadeIn < 1) { c.fillStyle = 'rgba(5,4,3,' + (1 - fadeIn) + ')'; c.fillRect(0, 0, W, H); }
    if (o.ph === 'idle') { ring(c, Lo.cx, Lo.cy + Lo.vh * 0.05, Math.max(26, Lo.vh * 0.16), o.t, 'rgba(255,232,190,', '轻触铜胎'); return; }
    var pt = o.pt, ph = phaseAt(pt, 0.5, 2.3, 1.9, 3.0, 2.7, 3.7, 3.6, 4.3, 3.9, 4.8);
    // 金屑自器口升起
    if (pt < 1.6) for (var i = 0; i < 24; i++) { var k = clamp((pt - hash(i) * 0.6) / 1.0, 0, 1); if (k <= 0 || k >= 1) continue; var px = Lo.cx + (hash(i + 5) - 0.5) * Lo.size * 1.8 * k, py = Lo.mouth + (Lo.ty - Lo.mouth) * ease(k); glowDotOn(c, px, py, 6, '#ffd98a', 0.8 * (1 - k)); }
    clText(c, '成器', Lo.cx, Lo.ty, Lo.size, ph, false);
    var sub = clamp((pt - 4.0) / 0.8, 0, 1);
    spaced(c, '铜胎掐丝珐琅 · 师徒解谜', Lo.cx, Lo.ty + Lo.size * 0.66, Math.max(11, Lo.size * 0.1), Math.max(3, Lo.size * 0.05), 'rgba(232,196,106,' + sub + ')');
    spaced(c, '玉不琢，不成器。', Lo.cx, Lo.ty + Lo.size * 0.66 + Math.max(24, Lo.size * 0.2), Math.max(12, Lo.size * 0.11), Math.max(4, Lo.size * 0.07), 'rgba(239,232,218,' + 0.8 * sub + ')');
    if (o.ph === 'ready') { var gb = 0.4 + 0.35 * Math.sin(o.t * 2.4); var nm = save.done > 0 && save.done < LEVELS.length ? '轻触，继续「' + LEVELS[save.done].name + '」' : '轻触，入器'; spaced(c, nm, Lo.cx, Math.min(H - 40, Lo.base + (H - Lo.base) * 0.55), 13, 6, 'rgba(232,196,106,' + gb + ')'); }
  }
  function glowDotOn(c, x, y, r, col, a) { var g = c.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, rgba(col, a)); g.addColorStop(1, rgba(col, 0)); c.fillStyle = g; c.fillRect(x - r, y - r, r * 2, r * 2); }

  // ── 二、章节卡：沙漏形的两块釉色，中间是景泰蓝字的章名 ──
  function enterChapter(i, withCard) {
    loadLevel(i); S.edges = levelEdges(); S.ga = 0; S.cam.intro = 0;
    $('chapter').classList.add('on'); $('hud').classList.add('on'); $('who').classList.remove('on');
    if (withCard) { S.mode = 'card'; S.card = { t: 0, out: -1 }; AU.card(i); } else beginAssembly();
  }
  function beginAssembly() { S.mode = 'intro'; S.introT = 0; S.seq = []; $('who').classList.toggle('on', S.duo === 'ctrl'); AU.assemble(); }
  function cardTap() { var cd = S.card; if (cd.out < 0) cd.out = 0; }
  function updCard(dt) { var cd = S.card; cd.t += dt; if (cd.out < 0 && cd.t > 3.6) cd.out = 0; if (cd.out >= 0) { cd.out += dt; if (cd.out > 0.8) beginAssembly(); } }
  function drawCard(c) {
    var cd = S.card, d = S.def, cc = CARDC[S.idx], inn = ease(clamp(cd.t / 0.5, 0, 1)), out = cd.out < 0 ? 0 : ease(clamp(cd.out / 0.75, 0, 1));
    drawEdges(c, S.edges, clamp(cd.t / 1.6, 0, 1), 0.85, null);
    var off = (1 - inn) * H * 0.6 + out * H * 0.7;
    c.save(); c.globalAlpha = 0.95;
    c.fillStyle = cc[0]; c.beginPath(); c.moveTo(-10, -off); c.lineTo(W + 10, -off); c.lineTo(W / 2, H * 0.53 - off); c.closePath(); c.fill();
    c.fillStyle = cc[1]; c.beginPath(); c.moveTo(-10, H + off); c.lineTo(W + 10, H + off); c.lineTo(W / 2, H * 0.47 + off); c.closePath(); c.fill();
    if (grain) { c.globalAlpha = 0.6; c.fillStyle = c.createPattern(grain, 'repeat'); c.beginPath(); c.moveTo(-10, -off); c.lineTo(W + 10, -off); c.lineTo(W / 2, H * 0.53 - off); c.closePath(); c.moveTo(-10, H + off); c.lineTo(W + 10, H + off); c.lineTo(W / 2, H * 0.47 + off); c.closePath(); c.fill(); }
    c.restore();
    var ta = (1 - out) * clamp((cd.t - 0.3) / 0.4, 0, 1), size = Math.min(W * 0.2, H * 0.13, 150);
    if (ta > 0) {
      spaced(c, d.no === '序' ? '序 章' : '第' + d.no + '道', W / 2, H * 0.12 - out * 40, 13, 10, 'rgba(255,244,220,' + 0.9 * ta + ')');
      var ph = phaseAt(cd.t, 0.35, 1.35, 1.1, 1.8, 1.6, 2.2, 2.1, 2.7, 2.4, 3.0); ph.alpha = ta;
      clText(c, d.name, W / 2, H * 0.5, size, ph, true, ['#3fb6a8', '#2f5fb0', '#e0786a', '#f0c24b', '#f6f0e2']);
      spaced(c, d.poem, W / 2, H * 0.84 + out * 40, Math.max(13, Math.min(16, W * 0.04)), Math.max(4, Math.min(8, W * 0.016)), 'rgba(255,246,228,' + 0.92 * ta * clamp((cd.t - 1.4) / 0.6, 0, 1) + ')');
    }
  }
  function drawAssembly(c) { var k = S.introT; drawEdges(c, S.edges, 1, 0.85 * (1 - clamp((k - 0.35) / 0.6, 0, 1)), null); }

  // ── 三、仪式：光升起，金丝在天上勾出这一章的纹样，凝成一粒光，落进背景里的瓶影 ──
  function emblem(k) { // 每章一枚纹样（单位坐标 -1..1 的折线组）
    var P = [], i, a, arc = function (cx, cy, r, a0, a1, n) { var o = []; for (var j = 0; j <= n; j++) { var t = a0 + (a1 - a0) * j / n; o.push([cx + Math.cos(t) * r, cy + Math.sin(t) * r]); } return o; };
    if (k === 0) { var hx = []; for (i = 0; i <= 6; i++) hx.push([Math.cos(i * 1.0472 + 0.5236) * 0.9, Math.sin(i * 1.0472 + 0.5236) * 0.9]); P.push(hx); P.push([[0, 0], [0, -0.9]], [[0, 0], [0.78, 0.45]], [[0, 0], [-0.78, 0.45]]); P.push(arc(0, 0, 0.35, 0, 6.2832, 24)); }
    else if (k === 1 || k === 7) { var L1 = [], R1 = []; VP.forEach(function (q) { L1.push([-q[1] * 1.5, 1 - q[0] * 2]); R1.push([q[1] * 1.5, 1 - q[0] * 2]); }); P.push(L1, R1, [[-0.25, -1], [0.25, -1]], [[-0.45, 1], [0.45, 1]]); if (k === 7) { P.push([[-0.8, 0.1], [0.8, 0.1]], [[-0.7, -0.45], [0.7, -0.45]], arc(0, -0.17, 0.2, 0, 6.2832, 20)); } }
    else if (k === 2) { var s1 = []; for (a = 0; a < 9.4; a += 0.3) s1.push([-0.45 + Math.cos(a) * a * 0.055, Math.sin(a) * a * 0.055]); var s2 = s1.map(function (q) { return [-q[0], -q[1]]; }); P.push(s1, s2, [[-0.45 + 0.5, 0], [0.45 - 0.5, 0]], arc(0, 0, 0.95, 0, 6.2832, 32)); }
    else if (k === 3) { for (i = 0; i < 6; i++) { var a0 = i * 1.0472; P.push(arc(Math.cos(a0) * 0.45, Math.sin(a0) * 0.45, 0.45, a0 + 2.2, a0 + 4.1, 12)); } P.push(arc(0, 0, 0.22, 0, 6.2832, 18), arc(0, 0, 0.92, 0, 6.2832, 36)); }
    else if (k === 4) { [[0, 0.9, 1], [-0.45, 0.55, 0.6], [0.45, 0.55, 0.6]].forEach(function (f) { var o = []; for (var j = 0; j <= 24; j++) { var t = j / 24 * 6.2832, r = f[2] * 0.42; o.push([f[0] + Math.sin(t) * r * (0.5 + 0.5 * Math.cos(t * 0.5)), 0.85 - (1 - Math.cos(t)) * f[1] * 0.5 - 0.2]); } P.push(o); }); P.push([[-0.8, 0.85], [0.8, 0.85]]); }
    else if (k === 5) { P.push(arc(0, 0, 0.5, 0, 6.2832, 30), arc(0, 0, 0.25, 0, 6.2832, 20)); for (i = 0; i < 12; i++) { a = i * 0.5236; P.push([[Math.cos(a) * 0.6, Math.sin(a) * 0.6], [Math.cos(a) * (i % 2 ? 0.8 : 0.98), Math.sin(a) * (i % 2 ? 0.8 : 0.98)]]); } }
    else if (k === 6) { P.push([[0, -0.95], [0.95, 0], [0, 0.95], [-0.95, 0], [0, -0.95]], [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5], [-0.5, -0.5]], [[0, -0.95], [0, 0.95]], [[-0.95, 0], [0.95, 0]], arc(0, 0, 0.2, 0, 6.2832, 16)); }
    return P;
  }
  function startCeremony() {
    var gn = S.world.nodes.filter(function (n) { return n.goal; })[0], dp = gn ? proj([gn.stand[0], gn.stand[1] + 0.9, gn.stand[2]]) : [W / 2, H / 2];
    S.cer = { t: 0, door: dp, E: [clamp(dp[0], W * 0.3, W * 0.7), Math.max(H * 0.2, 110)], shape: emblem(S.idx), landed: false };
    S.tokenTaken = true; AU.emblem(S.idx);
  }
  function updCeremony(dt) {
    var c = S.cer; if (!c) return; c.t += dt;
    if (!c.landed && c.t > 4.0) { c.landed = true; S.vase.anim = { from: S.vase.st, to: S.idx + 1, t: 0 }; vzPulse(1); AU.vase(); }
    if (c.t > 4.2 && !c.text) { c.text = 1; $('endvase').textContent = S.def.vase; $('endtext').textContent = S.def.end; $('endline').classList.add('on'); save.done = Math.max(save.done, S.idx + 1); persist(); }
    if (c.t > 5.2 && !S.canContinue) { S.canContinue = true; $('endgo').classList.add('on'); }
  }
  function drawCeremony(c) {
    var cr = S.cer; if (!cr) return; var t = cr.t, E = cr.E, R0 = Math.min(W, H) * 0.12, cols = [S.pal.en, S.pal.en2, '#f0c24b', S.pal.mist];
    var env = clamp(t / 0.8, 0, 1) * clamp((3.6 - t) / 0.8, 0, 1);
    if (env > 0) { // 天色随纹样流转（参考《纪念碑谷3》通关时的整屏变色）
      var cu = fract(t * 0.32) * cols.length, c0 = cols[Math.floor(cu) % cols.length], c1 = cols[(Math.floor(cu) + 1) % cols.length], m = mixHex(c0, c1, cu % 1);
      var g = c.createRadialGradient(E[0], E[1], 0, E[0], E[1], Math.max(W, H)); g.addColorStop(0, m.replace('rgb', 'rgba').replace(')', ',' + 0.32 * env + ')')); g.addColorStop(1, m.replace('rgb', 'rgba').replace(')', ',' + 0.12 * env + ')'));
      c.fillStyle = g; c.fillRect(0, 0, W, H);
    }
    var sc2 = clamp((t - 3.9) / 0.8, 0, 1); if (sc2 > 0) { var sg = c.createLinearGradient(0, H * 0.62, 0, H); sg.addColorStop(0, 'rgba(8,8,14,0)'); sg.addColorStop(1, 'rgba(8,8,14,' + (S.pal.dark ? 0.55 : 0.22) * sc2 + ')'); c.fillStyle = sg; c.fillRect(0, H * 0.62, W, H * 0.38); }
    var bk = clamp(t / 0.8, 0, 1), bfade = clamp((2.2 - t) / 0.6, 0, 1); // 光柱
    if (bfade > 0) { var by = cr.door[1] + (E[1] - cr.door[1]) * ease(bk); var lg = c.createLinearGradient(0, cr.door[1], 0, by); lg.addColorStop(0, 'rgba(255,230,170,0)'); lg.addColorStop(1, 'rgba(255,240,200,' + 0.85 * bfade + ')'); c.strokeStyle = lg; c.lineWidth = 3; c.beginPath(); c.moveTo(cr.door[0], cr.door[1]); c.lineTo(cr.door[0] + (E[0] - cr.door[0]) * ease(bk), by); c.stroke(); glowDotOn(c, cr.door[0] + (E[0] - cr.door[0]) * ease(bk), by, 22, '#fff0c8', 0.8 * bfade); }
    var dk = clamp((t - 0.7) / 1.7, 0, 1), sh = clamp((t - 2.7) / 0.6, 0, 1), rot = t * 0.25 + sh * 2;
    var scl = R0 * (1 - 0.92 * ease(sh)), cxE = E[0], cyE = E[1];
    if (t > 3.3) { var fk = ease(clamp((t - 3.3) / 0.75, 0, 1)), bp = bandPoint(S.vz.band); cxE = E[0] + (bp[0] - E[0]) * fk; cyE = E[1] + (bp[1] - E[1]) * fk - Math.sin(Math.PI * fk) * 60; }
    if (t < 4.05 && dk > 0) {
      c.save(); c.translate(cxE, cyE); c.rotate(rot); c.lineCap = 'round';
      c.strokeStyle = 'rgba(255,226,150,0.95)'; c.lineWidth = 1.6; c.shadowColor = 'rgba(255,210,120,0.9)'; c.shadowBlur = 8;
      var tot = 0; cr.shape.forEach(function (pl) { tot += pl.length; }); var shown = dk * tot * 1.05, cnt = 0;
      cr.shape.forEach(function (pl) {
        c.beginPath(); for (var j = 0; j < pl.length && cnt < shown; j++, cnt++) { var q = pl[j]; if (j) c.lineTo(q[0] * scl, q[1] * scl); else c.moveTo(q[0] * scl, q[1] * scl); } c.stroke();
        var q0 = pl[0]; c.fillStyle = 'rgba(255,248,220,0.95)'; c.beginPath(); c.arc(q0[0] * scl, q0[1] * scl, 2.4, 0, 6.2832); c.fill();
      });
      c.restore();
      glowDotOn(c, cxE, cyE, 16 + 40 * sh, '#fff4d0', 0.35 + 0.6 * sh);
      if (t < 2.2) for (var i = 0; i < 30; i++) { var k = clamp((t - 0.6 - hash(i) * 0.9) / 1.0, 0, 1); if (k <= 0 || k >= 1) continue; var a = hash(i + 3) * 6.28, r0 = Math.max(W, H) * 0.45 * (1 - ease(k)); glowDotOn(c, E[0] + Math.cos(a) * r0, E[1] + Math.sin(a) * r0, 7, '#ffe6a8', 0.8 * (1 - k)); }
    }
  }

  // ── 四、章节转场：缩进梅瓶窗 → 金丝勾出下一关 → 填色 → 菱形推开 → 章节卡 ──
  function skyOf(cv) { var x = cv.getContext('2d'), w = cv.width, h = cv.height, avg = function (y) { var r = [0, 0, 0]; [3, w >> 3, w - (w >> 3), w - 4].forEach(function (xx) { var d = x.getImageData(xx, y, 1, 1).data; r[0] += d[0] / 4; r[1] += d[1] / 4; r[2] += d[2] / 4; }); return 'rgb(' + (r[0] | 0) + ',' + (r[1] | 0) + ',' + (r[2] | 0) + ')'; }; return [avg(2), avg(h - 3)]; }
  function startTrans(next) { S.mode = 'trans'; S.trn = { t: 0, next: next, A: null, B: null, loaded: false }; S.snapReq = function (cv) { S.trn.A = cv; S.trn.Ac = skyOf(cv); }; var el = $('endline'); el.style.transition = 'none'; el.classList.remove('on'); setTimeout(function () { el.style.transition = ''; }, 50); $('endgo').classList.remove('on'); $('who').classList.remove('on'); $('chapter').classList.remove('on'); setHint(''); say(null); AU.iris(); }
  function winRect() { var h = Math.min(H * 0.78, W * 1.25); return { cx: W / 2, cy: H * 0.5, h: h, s: Math.min(0.66 * h / W, 0.9 * h / H) }; }
  function updTrans(dt) {
    var tn = S.trn; tn.t += dt;
    if (!tn.loaded && tn.t > 0.95 && tn.A) { tn.loaded = true; loadLevel(tn.next); S.edges = levelEdges(); S.ga = 0; S.mode = 'trans'; $('who').classList.remove('on'); $('chapter').classList.remove('on'); }
    if (tn.loaded && !tn.B && tn.t > 2.35 && !S.snapReq) { S.gaHold = S.ga; S.ga = 1; S.snapReq = function (cv) { tn.B = cv; tn.Bc = skyOf(cv); S.ga = 0; }; }
    if (tn.t > 3.9 && tn.loaded) { S.mode = 'card'; S.card = { t: 0.35, out: -1 }; AU.card(S.idx); $('chapter').classList.add('on'); }
  }
  function transTap() { var tn = S.trn; if (tn.loaded && tn.B) tn.t = Math.max(tn.t, 3.0); }
  function drawTrans(c) {
    var tn = S.trn, t = tn.t, wr = winRect(), cc = CARDC[tn.loaded ? S.idx : Math.min(7, tn.next)];
    paper(c, '#1f1b26', '#0c0a10');
    var shr = ease(clamp(t / 0.9, 0, 1)), big = Math.max(W, H) * 3.2 / wr.h, sc = big + (1 - big) * shr, vh = wr.h * sc;
    var cs = 1 + (wr.s - 1) * shr; // 窗里的画面跟着缩小
    c.save(); vasePath(c, wr.cx, wr.cy, vh); c.clip();
    c.fillStyle = '#0c0d14'; c.fillRect(0, 0, W, H);
    var sky = function (cs2, a) { if (!cs2 || a <= 0) return; var g = c.createLinearGradient(0, wr.cy - H * cs / 2, 0, wr.cy + H * cs / 2); g.addColorStop(0, cs2[0]); g.addColorStop(1, cs2[1]); c.globalAlpha = a; c.fillStyle = g; c.fillRect(0, 0, W, H); c.globalAlpha = 1; };
    sky(tn.Ac, 1 - clamp((t - 1.0) / 0.45, 0, 1)); if (tn.loaded) sky(tn.Bc, clamp((t - 2.45) / 0.55, 0, 1));
    var drawImg = function (img, a) { if (!img || a <= 0) return; c.save(); c.globalAlpha = a; c.translate(wr.cx, wr.cy); c.scale(cs, cs); c.drawImage(img, -W / 2, -H / 2, W, H); c.restore(); };
    drawImg(tn.A, 1 - clamp((t - 1.0) / 0.45, 0, 1));
    if (tn.loaded) {
      var wp = clamp((t - 1.05) / 1.25, 0, 1), fa = clamp((t - 2.45) / 0.55, 0, 1);
      drawImg(tn.B, fa);
      drawEdges(c, S.edges, wp, 0.95 * (1 - fa * 0.7), { x: wr.cx, y: wr.cy, s: cs });
    }
    c.restore();
    c.save(); vasePath(c, wr.cx, wr.cy, vh); c.strokeStyle = 'rgba(232,196,106,0.85)'; c.lineWidth = 2; c.shadowColor = 'rgba(255,210,120,0.6)'; c.shadowBlur = 10; c.stroke(); c.restore();
    if (t > 1.0 && t < 3.0) spaced(c, tn.loaded ? (S.def.no === '序' ? '序' : '第' + S.def.no + '道') + ' · ' + S.def.name : '', W / 2, wr.cy + wr.h / 2 + Math.min(30, (H - wr.cy - wr.h / 2) / 2), 13, 8, 'rgba(232,196,106,' + clamp((t - 1.2) / 0.5, 0, 1) * clamp((3.0 - t) / 0.4, 0, 1) + ')');
    if (t > 2.95) { // 菱形一层层推开
      var cols = ['#f0c24b', cc[1], cc[0]], md = (W + H) * 1.1;
      cols.forEach(function (col, k) { var p = ease(clamp((t - 2.95 - k * 0.14) / 0.75, 0, 1)), r = md * p; if (r <= 0) return; c.fillStyle = col; c.beginPath(); c.moveTo(wr.cx, wr.cy - r); c.lineTo(wr.cx + r, wr.cy); c.lineTo(wr.cx, wr.cy + r); c.lineTo(wr.cx - r, wr.cy); c.closePath(); c.fill(); });
    }
  }

  // ── 五、终章：一只景泰蓝梅瓶，按七道工序在眼前长成 ──
  // 纹样画在瓶身的「展开图」上（θ 绕一周，v 自下而上），再按圆柱投影贴回瓶身，所以会随转动而流转。
  function vaseFrame(cx, cy, h) { return { cx: cx, cy: cy, h: h, y0: cy + h / 2, R: function (v) { return vr(h, clamp(v, 0, 1)); } }; }
  function vmap(F, th, v, rot) { var a = th - rot, s = Math.sin(a), cz = Math.cos(a); return [F.cx + F.R(v) * s, F.y0 - v * F.h, cz]; }
  function vpoly(c, F, pts, rot) { // 按可见性绘制折线（背面的段不画）
    var started = false, ok = false; c.beginPath();
    for (var i = 0; i < pts.length; i++) { var q = vmap(F, pts[i][0], pts[i][1], rot); if (q[2] > 0.02) { if (!started) { c.moveTo(q[0], q[1]); started = true; } else c.lineTo(q[0], q[1]); ok = true; } else started = false; }
    return ok;
  }
  function vshape(c, F, pts, rot) { // 闭合面：只在整体朝前时绘制
    var cz = 0; pts.forEach(function (p) { cz += Math.cos(p[0] - rot); }); if (cz / pts.length < 0.08) return false;
    c.beginPath(); pts.forEach(function (p, i) { var q = vmap(F, p[0], Math.max(0, p[1]), rot); if (i) c.lineTo(q[0], q[1]); else c.moveTo(q[0], q[1]); }); c.closePath(); return true;
  }
  var VASEPAT = null;
  function vasePattern() {
    if (VASEPAT) return VASEPAT;
    var E = [], i, j, k, TAU = 6.2832;
    var petal = function (tc, dt, v0, v1) { var o = []; for (j = 0; j <= 16; j++) { var u = -1 + 2 * j / 16; o.push([tc + u * dt, v0 + (v1 - v0) * Math.pow(Math.max(0, 1 - u * u), 0.6)]); } return o; };
    for (i = 0; i < 12; i++) { var tc = i * TAU / 12; E.push({ z: 1, pts: petal(tc, TAU / 26, 0.05, 0.19), fill: i % 2 ? '#e0786a' : '#f0c24b' }); E.push({ z: 2, pts: petal(tc, TAU / 52, 0.06, 0.15), fill: i % 2 ? '#f6b0a0' : '#f8e3a0' }); }
    var stem = []; for (j = 0; j <= 240; j++) { var th = j / 240 * TAU; stem.push([th, 0.47 + 0.1 * Math.sin(3 * th)]); } E.push({ z: 3, pts: stem, line: 1 });
    for (i = 0; i < 12; i++) { var t0 = i * TAU / 12 + 0.2, vb = 0.47 + 0.1 * Math.sin(3 * t0), dir = i % 2 ? 1 : -1, sp = []; for (j = 0; j <= 30; j++) { var a = j / 30 * 5.2, r = 0.018 + a * 0.012; sp.push([t0 + Math.cos(a) * r * 2.2 * dir, vb + dir * 0.03 + Math.sin(a) * r]); } E.push({ z: 3, pts: sp, line: 1 }); }
    var RB = 0.27; // 腹部半径约 0.27h：展开图里 1 弧度 ≈ 0.27h，用它把“h 单位”的花形换算成 θ
    var leaf = function (t0, v0, ang, len, wid) { var o = [], jj, ax = Math.sin(ang), ay = Math.cos(ang); for (jj = 0; jj <= 18; jj++) { var u = jj / 18, w = Math.sin(Math.PI * u) * wid; o.push([t0 + (ax * u * len + ay * w) / RB, v0 + ay * u * len - ax * w]); } for (jj = 18; jj >= 0; jj--) { var u2 = jj / 18, w2 = -Math.sin(Math.PI * u2) * wid * 0.75; o.push([t0 + (ax * u2 * len + ay * w2) / RB, v0 + ay * u2 * len - ax * w2]); } return o; };
    for (i = 0; i < 18; i++) { var tl = i * TAU / 18 + 0.12, vl = 0.47 + 0.1 * Math.sin(3 * tl), up = i % 2 ? 1 : -1; E.push({ z: 4, pts: leaf(tl, vl, up > 0 ? 0.5 : 2.6, 0.075, 0.022), fill: i % 3 ? '#6fae7e' : '#4f9a6a' }); }
    for (i = 0; i < 6; i++) { // 缠枝莲：七瓣扇开的莲花，花萼、花心
      var tf = i * TAU / 6 + TAU / 12, vf = 0.47 + 0.1 * Math.sin(3 * tf) + (i % 2 ? 0.075 : -0.08), cols = [['#e0786a', '#fbd0c0'], ['#f2a7a0', '#fff2ea'], ['#3a6fc4', '#cfe0f7']][i % 3];
      E.push({ z: 5, pts: leaf(tf, vf - 0.012, 3.14159, 0.028, 0.03), fill: '#4f9a6a' });
      for (k = 0; k < 7; k++) { var ang2 = -1.25 + k * (2.5 / 6), ln = 0.072 - Math.abs(ang2) * 0.012; E.push({ z: 5 + (k === 3 ? 0.5 : 0), pts: leaf(tf, vf, ang2, ln, 0.02), fill: cols[0], fill2: cols[1] }); }
      var ctr = []; for (j = 0; j <= 16; j++) { var w4 = j / 16 * TAU; ctr.push([tf + 0.014 * Math.cos(w4) / RB, vf + 0.012 + 0.01 * Math.sin(w4)]); } E.push({ z: 6, pts: ctr, fill: '#f0c24b' });
    }
    for (i = 0; i < 12; i++) { var tb = i * TAU / 12, bud = []; for (j = 0; j <= 16; j++) { var w5 = j / 16 * TAU; bud.push([tb + 0.012 * Math.cos(w5) / RB, 0.29 + 0.012 * Math.sin(w5)]); } E.push({ z: 6, pts: bud, fill: i % 2 ? '#f0c24b' : '#e0786a' }); }
    var fret = []; for (j = 0; j <= 96; j++) { var tq = j / 96 * TAU; fret.push([tq, 0.905 + ((j % 4) < 2 ? 0.02 : -0.012)]); } E.push({ z: 9, pts: fret, line: 1 });
    for (i = 0; i < 6; i++) { // 肩部如意云头
      var tr0 = i * TAU / 6, la = [], w3 = TAU / 13;
      for (j = 0; j <= 24; j++) { var u3 = -1 + 2 * j / 24, vv = 0.86 - 0.1 * (1 - Math.pow(Math.abs(u3), 1.6)) - 0.025 * Math.sin(Math.abs(u3) * 6.2832) * (1 - Math.abs(u3)); la.push([tr0 + u3 * w3, vv]); }
      la.push([tr0 + w3, 0.875], [tr0 - w3, 0.875]); E.push({ z: 7, pts: la, fill: '#2f5fb0' });
      var lb = la.slice(0, 25).map(function (q) { return [tr0 + (q[0] - tr0) * 0.62, 0.86 - (0.86 - q[1]) * 0.62]; }); lb.push([tr0 + w3 * 0.62, 0.865], [tr0 - w3 * 0.62, 0.865]); E.push({ z: 8, pts: lb, fill: '#3fb6a8' });
    }
    VASEPAT = E.sort(function (a, b) { return a.z - b.z; }); return VASEPAT;
  }
  function drawMeiping(c, F, ph, rot) {
    var TAU = 6.2832, i, sat = ph.fireDone, mut = function (col) { return sat >= 1 ? col : mixHex(col, '#b9b4aa', 0.45 * (1 - sat)); };
    var band = function (v0, v1, col) { c.fillStyle = col; c.fillRect(F.cx - F.h, F.y0 - v1 * F.h - (v1 >= 1 ? 6 : 0.5), F.h * 2, (v1 - v0) * F.h + (v0 <= 0 ? 6 : 1)); };
    var ring2 = function (v, w) { if (vpoly(c, F, (function () { var o = []; for (var j = 0; j <= 60; j++) o.push([rot - 1.57 + j / 60 * 3.14, v]); return o; })(), rot)) { c.lineWidth = w; c.stroke(); } };
    c.save();
    // 地上的影子与光
    var g = c.createRadialGradient(F.cx, F.y0 + 4, 0, F.cx, F.y0 + 4, F.h * 0.4); g.addColorStop(0, 'rgba(0,0,0,' + 0.5 * ph.copper + ')'); g.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = g; c.fillRect(F.cx - F.h * 0.5, F.y0 - 20, F.h, 50);
    vasePath(c, F.cx, F.cy, F.h); c.save(); c.clip();
    c.globalAlpha = ph.copper; g = c.createLinearGradient(F.cx - F.h * 0.3, 0, F.cx + F.h * 0.3, 0); g.addColorStop(0, '#2a1a10'); g.addColorStop(0.32, '#9a6440'); g.addColorStop(0.44, '#c48a5c'); g.addColorStop(0.62, '#6a4228'); g.addColorStop(1, '#1e120b'); c.fillStyle = g; c.fillRect(F.cx - F.h, F.cy - F.h, F.h * 2, F.h * 2);
    c.globalAlpha = 1;
    var fa = ph.fill; // 釉地
    if (fa > 0) {
      c.globalAlpha = fa;
      band(0.0, 0.045, mut('#c9a050')); band(0.045, 0.205, mut('#2f5fb0')); band(0.205, 0.74, mut('#3fb6a8')); band(0.74, 0.875, mut('#f3efe6')); band(0.875, 0.95, mut('#e0786a')); band(0.95, 1.0, mut('#d9b45a'));
      vasePattern().forEach(function (el, n) {
        if (!el.fill) return; var a2 = clamp(fa * 1.6 - n / VASEPAT.length * 0.6, 0, 1); if (a2 <= 0) return;
        if (vshape(c, F, el.pts, rot)) { c.globalAlpha = a2; var col = mut(el.fill); if (el.fill2) { var bb = vmap(F, el.pts[0][0], el.pts[0][1], rot); var gg = c.createRadialGradient(bb[0], bb[1], 0, bb[0], bb[1], F.h * 0.06); gg.addColorStop(0, mut(el.fill2)); gg.addColorStop(1, col); c.fillStyle = gg; } else c.fillStyle = col; c.fill(); }
      });
      c.globalAlpha = 1;
    }
    if (ph.fire > 0) { var fy = F.y0 - F.h * clamp(ph.fireP * 1.2 - 0.1, 0, 1); g = c.createLinearGradient(0, fy + F.h * 0.25, 0, fy - F.h * 0.25); g.addColorStop(0, 'rgba(255,110,40,0)'); g.addColorStop(0.5, 'rgba(255,130,50,' + 0.65 * ph.fire + ')'); g.addColorStop(1, 'rgba(255,200,120,0)'); c.fillStyle = g; c.fillRect(F.cx - F.h, F.cy - F.h, F.h * 2, F.h * 2); }
    // 圆柱明暗：两侧压暗、右侧一线暖光
    g = c.createLinearGradient(F.cx - F.h * 0.3, 0, F.cx + F.h * 0.3, 0); g.addColorStop(0, 'rgba(10,8,14,0.66)'); g.addColorStop(0.16, 'rgba(10,8,14,0.3)'); g.addColorStop(0.36, 'rgba(10,8,14,0)'); g.addColorStop(0.62, 'rgba(10,8,14,0.06)'); g.addColorStop(0.82, 'rgba(10,8,14,0.34)'); g.addColorStop(1, 'rgba(10,8,14,0.66)');
    c.fillStyle = g; c.fillRect(F.cx - F.h, F.cy - F.h, F.h * 2, F.h * 2);
    if (ph.polish > 0) { // 磨光：一道竖向高光，外加一次掠过的光
      var hx = F.cx - F.h * 0.12; g = c.createLinearGradient(hx - F.h * 0.06, 0, hx + F.h * 0.06, 0); g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.5, 'rgba(255,255,255,' + 0.34 * ph.polish + ')'); g.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = g; c.fillRect(F.cx - F.h, F.cy - F.h, F.h * 2, F.h * 2);
      if (ph.polish < 1) { var sx = F.cx - F.h * 0.5 + F.h * ph.polish; g = c.createLinearGradient(sx - 40, 0, sx + 40, 0); g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.5, 'rgba(255,255,255,0.5)'); g.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = g; c.fillRect(F.cx - F.h, F.cy - F.h, F.h * 2, F.h * 2); }
    }
    c.restore();
    // 金丝：按工序逐根掐上去；镀金后更亮、带光晕
    var wk = ph.wire; if (wk > 0) {
      var gold = ph.gild > 0 ? 'rgba(255,' + Math.round(214 + 30 * ph.gild) + ',' + Math.round(120 + 60 * ph.gild) + ',' : 'rgba(224,180,90,';
      c.lineJoin = 'round'; c.lineCap = 'round'; if (ph.gild > 0) { c.shadowColor = 'rgba(255,220,140,' + 0.7 * ph.gild + ')'; c.shadowBlur = 4 * ph.gild; }
      var lw = Math.max(1, F.h * 0.0045);
      c.strokeStyle = gold + '0.95)';
      [0.045, 0.205, 0.74, 0.875, 0.95].forEach(function (v, n) { if (wk * 1.4 > n / 5) ring2(v, lw * 1.3); });
      var pat = vasePattern(); pat.forEach(function (el, n) { if (wk * 1.25 < n / pat.length) return; c.lineWidth = el.line ? lw * 1.1 : lw; if (el.line) { if (vpoly(c, F, el.pts, rot)) c.stroke(); } else if (vshape(c, F, el.pts, rot)) c.stroke(); });
      c.shadowBlur = 0;
    }
    vasePath(c, F.cx, F.cy, F.h); c.strokeStyle = 'rgba(232,196,106,' + (0.25 + 0.6 * ph.gild) * ph.copper + ')'; c.lineWidth = 1.2; c.stroke();
    if (ph.gild > 0) for (i = 0; i < 10; i++) { var sp = fract(S.t * 0.4 + hash(i)), vy = hash(i + 4), q = vmap(F, rot + (hash(i + 8) - 0.5) * 2.4, vy, rot); if (q[2] > 0.3) glowDotOn(c, q[0], q[1], 8 * Math.sin(Math.PI * sp), '#fff4d0', 0.9 * ph.gild * Math.sin(Math.PI * sp)); }
    c.restore();
  }
  function finLayout() {
    var land = W > H * 1.1;
    if (land) { var h = H * 0.8; return { land: 1, F: vaseFrame(W * 0.36, H * 0.48, h), tx: W * 0.7, ty: H * 0.36, ts: Math.min(H * 0.17, W * 0.1), row: H * 0.93, rowX: W * 0.36 }; }
    var hv = Math.min(H * 0.5, W * 1.35), cy = 40 + hv / 2 + H * 0.03, ts = Math.min(W * 0.2, H * 0.085);
    return { land: 0, F: vaseFrame(W / 2, cy, hv), tx: W / 2, ty: cy + hv / 2 + 46 + ts / 2, ts: ts, row: cy + hv / 2 + 20, rowX: W / 2 };
  }
  var FIN_T = { copper: [0.4, 1.8], wire: [1.6, 3.8], fill: [3.6, 5.4], fire: [5.2, 6.6], polish: [6.4, 7.6], gild: [7.4, 8.6] };
  function startFinale() { S.mode = 'fin'; S.fin = { t: 0 }; ['hud', 'chapter', 'who'].forEach(function (id) { $(id).classList.remove('on'); }); $('endline').classList.remove('on'); $('endgo').classList.remove('on'); setHint(''); say(null); AU.finaleRise(); }
  function updFinale(dt) { var f = S.fin; f.t += dt; if (f.t > 11.2 && !f.dom) { f.dom = 1; $('finale').classList.add('on'); AU.finale(); } }
  function drawFinale(c) {
    var f = S.fin, t = f.t, Lo = finLayout(), r = function (k) { var q = FIN_T[k]; return clamp((t - q[0]) / (q[1] - q[0]), 0, 1); };
    paper(c, '#2a2026', '#0e0a0c');
    var sp = c.createRadialGradient(Lo.F.cx, Lo.F.cy - Lo.F.h * 0.2, 0, Lo.F.cx, Lo.F.cy, Lo.F.h * 0.9); sp.addColorStop(0, 'rgba(255,214,160,' + 0.2 * r('copper') + ')'); sp.addColorStop(1, 'rgba(255,214,160,0)'); c.fillStyle = sp; c.fillRect(0, 0, W, H);
    var fp = r('fire'), ph = { copper: ease(r('copper')), wire: r('wire'), fill: ease(r('fill')), fire: Math.sin(Math.PI * fp), fireP: fp, fireDone: clamp(fp * 1.3 - 0.15, 0, 1), polish: r('polish'), gild: ease(r('gild')) };
    drawMeiping(c, Lo.F, ph, -0.6 + t * 0.11);
    var steps = ['制胎', '掐丝', '点蓝', '烧蓝', '磨光', '镀金'], keys = ['copper', 'wire', 'fill', 'fire', 'polish', 'gild'];
    var rowA = clamp((t - 0.6) / 0.6, 0, 1) * clamp((10.4 - t) / 0.8, 0, 1);
    if (rowA > 0) { var sz = Math.max(11, Math.min(14, W * 0.034)), wv = Lo.land ? Math.min(W * 0.5, 460) : Math.min(W * 0.86, 360); steps.forEach(function (s3, k) { var on = r(keys[k]), x = Lo.rowX - wv / 2 + wv * (k + 0.5) / 6; spaced(c, s3, x, Lo.row, sz, 2, 'rgba(' + (on > 0 && on < 1 ? '255,226,150,' : on >= 1 ? '232,196,106,' : '200,190,180,') + (rowA * (0.35 + 0.65 * Math.min(1, on * 3))) + ')'); }); }
    if (t > 8.6) { var ph2 = phaseAt(t - 8.6, 0, 1.0, 0.7, 1.4, 1.2, 1.8, 1.7, 2.2, 1.9, 2.6); clText(c, '成器', Lo.tx, Lo.ty, Lo.ts, ph2, !!Lo.land); }
  }
  function stageUpdate(dt) {
    if (S.mode === 'open') updOpen(dt);
    else if (S.mode === 'card') updCard(dt);
    else if (S.mode === 'trans') updTrans(dt);
    else if (S.mode === 'fin' || (S.mode === 'final' && S.fin)) updFinale(dt);
    if (S.mode === 'end') updCeremony(dt);
  }
  function stageDraw() {
    tr.setTransform(DPR, 0, 0, DPR, 0, 0); tr.clearRect(0, 0, W, H);
    if (S.mode === 'open') drawOpen(tr);
    else if (S.mode === 'card') drawCard(tr);
    else if (S.mode === 'intro') drawAssembly(tr);
    else if (S.mode === 'end') drawCeremony(tr);
    else if (S.mode === 'trans') drawTrans(tr);
    else if (S.mode === 'fin' || S.mode === 'final') drawFinale(tr);
  }

  // —— 引导环（纪念碑谷式）与对白 ——
  function say(line) {
    var el = $('say'); if (!line) { el.classList.remove('on'); return; }
    $('saywho').textContent = line[0] ? '师傅' : '阿蓝'; $('saytext').textContent = line[1]; el.classList.remove('on'); void el.offsetWidth; el.classList.add('on');
  }
  function startTalk() {
    var lines = (S.def.talk || []).slice(), t = 0.4;
    lines.forEach(function (ln) { after(t, function () { if (S.mode === 'play' || S.mode === 'intro') say(ln); }); t += 2.9; });
    after(t, function () { say(null); nextHint(); });
  }
  function guideTarget(gd) {
    var ty = gd[1], tg = gd[2], n, p;
    if (ty === 'node') { n = S.world.nodes.filter(function (q) { return q.cell[0] === tg[0] && q.cell[1] === tg[1] && q.cell[2] === tg[2]; })[0]; return n && n.active ? proj(n.stand) : null; }
    if (ty === 'handle') { p = S.world.byId[tg]; return p && p.handles.length && !p.anim ? proj(handlePos(p, p.handles[0])) : null; }
    if (ty === 'cell' || ty === 'rough') { p = S.world.byId[tg]; if (!p || (ty === 'cell' && (p.filled || !L.canFill(S.world, p))) || (ty === 'rough' && p.polished)) return null; return proj(partCenter(p)); }
    if (ty === 'char') { var c = C[tg]; return c.on && S.sel !== tg ? proj([c.pos[0], c.pos[1] + 0.5, c.pos[2]]) : null; }
    return null;
  }
  function drawGuide(c, t) {
    if (S.mode !== 'play' || S.ptr || window.__noGuide) return;
    var hs = S.def.hints || [], h = hs[S.hintI], col = S.pal.dark ? 'rgba(255,240,210,' : 'rgba(120,80,30,', r = Math.max(18, S.cam.ppu * 0.34);
    S.world.parts.forEach(function (p) { if (p.glaze && !p.filled && !p.fillK && L.canFill(S.world, p)) { var q = proj(partCenter(p)); ring(c, q[0], q[1], r, t + 0.3, 'rgba(140,200,255,'); } });
    if (!h || S.guideIdle < 1.0) return;
    (S.def.guide || []).forEach(function (gd) {
      if (gd[0] !== h[1]) return; var q = guideTarget(gd); if (!q) return;
      ring(c, q[0], q[1], r, t, col);
      if (gd[1] === 'handle') { c.save(); c.strokeStyle = col + '0.7)'; c.lineWidth = 1.4; c.beginPath(); c.arc(q[0], q[1], r * 1.9, -2.2 + fract(t * 0.5) * 0.4, -0.9 + fract(t * 0.5) * 0.4); c.stroke(); c.restore(); }
      if (gd[1] === 'rough') { c.save(); c.strokeStyle = col + '0.75)'; c.lineWidth = 1.4; c.beginPath(); for (var i = 0; i <= 8; i++) c.lineTo(q[0] - r * 1.6 + i * r * 0.4, q[1] + r * 1.4 + (i % 2 ? -6 : 6)); c.stroke(); c.restore(); }
    });
  }

  // ───────────── 帧 ─────────────
  function update(dt) {
    S.t += dt;
    var due = []; S.seq = S.seq.filter(function (s) { if (s.at <= S.t) { due.push(s); return false; } return true; });
    due.forEach(function (s) { s.fn(); });
    stageUpdate(dt); applyCine();
    if (!S.world || S.mode === 'open' || S.mode === 'fin' || S.mode === 'final') return;
    if (S.mode === 'card') { S.ga = 0; }
    if (S.mode === 'intro') { // 组装：金丝骨架先到，实体随后填满
      S.introT += dt / 1.6; S.ga = clamp((S.introT - 0.3) * 1.9, 0, 1); S.cam.intro = 0;
      if (S.introT >= 1) { S.mode = 'play'; S.ga = 1; S.guideIdle = 0; startTalk(); }
    }
    if (S.mode === 'play') S.guideIdle = (S.guideIdle || 0) + dt;
    if (S.beat > 0) S.beat -= dt;
    var sv = S.def && S.def.side;
    if (sv && !S.camAnim && !S.sideOn && S.world.byId[sv.part].state === sv.at && !S.world.byId[sv.part].anim) { S.sideOn = 1; S.camAnim = { t: 0, dur: 2.6, y0: CAMA.yaw, p0: CAMA.pitch, y1: sv.yaw, p1: sv.pitch }; AU.turn(); C.forEach(function (c) { c.path = []; }); }
    if (S.camAnim) { var ca = S.camAnim; ca.t += dt / ca.dur; var ke = ease(clamp(ca.t, 0, 1)); setCam(ca.y0 + (ca.y1 - ca.y0) * ke, ca.p0 + (ca.p1 - ca.p0) * ke); fitCamera(); if (ca.t >= 1) { S.camAnim = null; S.beat = 0.4; } }
    var nv = S.def && S.def.negVase;
    if (nv && !S.negDone && S.world.byId[nv.part].state === nv.at && !S.world.byId[nv.part].anim) { S.negDone = 1; S.negVase = { t: 0 }; AU.negVase(); }
    if (S.negVase) { S.negVase.t += dt; if (S.negVase.t > 3.4) S.negVase = null; }
    if (S.vz.flash > 0) S.vz.flash = Math.max(0, S.vz.flash - dt * 0.45);
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
  function charOffset(c) { // 两人恰好同格时，左右错开站，不叠在一起
    if (!C[0].on || !C[1].on || C[0].step || C[1].step || C[0].node !== C[1].node || C[1].fade) return [0, 0, 0];
    var k = c.i ? 0.2 : -0.2; return [RX[0] * k, 0, RX[2] * k];
  }
  function charList(list, c) {
    if (!c.on || c.vis <= 0.01 || c.hidden) return;
    var f = faceOf(c), hop = c.hop || 0, br = 1 + 0.02 * Math.sin(S.t * 2.2 + c.i), sq = c.step ? 1 + 0.05 * Math.sin(Math.PI * c.step.t) : br;
    var a = c.vis, off = charOffset(c), P = [c.pos[0] + off[0], c.pos[1], c.pos[2] + off[2]];
    list.push({ m: CM.blob, model: M.chain(M.tr(P[0], P[1] + 0.012, P[2]), M.sc(1.3 - hop * 1.6, 1, 1.3 - hop * 1.6)), o: { alpha: 0.28 * a, noDepth: true, noShadow: true } });
    var lean = c.i === 1 ? 0.09 : 0, ph = c.step ? Math.sin(Math.PI * 2 * c.step.t) : 0, sway = c.step ? 0.05 * ph : 0.015 * Math.sin(S.t * 1.6 + c.i);
    var base = M.chain(M.tr(P[0], P[1] + hop, P[2]), M.sc(1.32, 1.32, 1.32), M.rot('y', f), M.rot('z', sway), M.rot('x', lean), M.sc(1 / Math.sqrt(sq), sq, 1 / Math.sqrt(sq)));
    var o = { alpha: a, noShadow: a < 0.99 };
    list.push({ m: CM[c.i].body, model: base, o: o });
    var idle = 0.05 * Math.sin(S.t * 1.5 + c.i * 2);
    if (c.i === 0) {
      list.push({ m: CM[0].band, model: base, o: o });
      var sw = 0.25 + (c.step ? 0.35 : 0.08 * Math.sin(S.t * 2));
      list.push({ m: CM[0].sash, model: M.chain(base, M.tr(0.03, 0.5, -0.075), M.rot('x', sw)), o: o });
      list.push({ m: CM[0].arm, model: M.chain(base, M.tr(-0.118, 0.465, 0), M.rot('z', -0.14), M.rot('x', c.step ? 0.55 * ph : idle)), o: o });
      var ra = M.chain(base, M.tr(0.118, 0.465, 0), M.rot('z', 0.14), M.rot('x', -0.75 - (c.step ? 0.12 * ph : 0)));
      list.push({ m: CM[0].arm, model: ra, o: o });
      list.push({ m: CM[0].lamp, model: M.chain(ra, M.tr(0, -0.255, 0), M.rot('x', 0.75 + 0.12 * Math.sin(S.t * 2.1))), o: { alpha: a, noShadow: true } });
    } else {
      var bk = 0.55 + (c.step ? 0.08 * ph : 0);
      list.push({ m: CM[1].arm, model: M.chain(base, M.tr(-0.13, 0.43, -0.01), M.rot('z', 0.32), M.rot('x', bk)), o: o });
      list.push({ m: CM[1].arm, model: M.chain(base, M.tr(0.13, 0.43, -0.01), M.rot('z', -0.32), M.rot('x', bk)), o: o });
    }
  }
  function renderStack() {
    var pal = S.pal, st = S.stackT || 0, ppu = Math.min(H * 0.72 / (SH + 1.2), W * 0.86 / 6.4) * (1.25 - 0.25 * ease(clamp(st / 8, 0, 1)));
    var c = [0, SH * 0.5, 0], up = (S.mode === 'final' ? -H * 0.1 : 0);
    var ls = [{ p: [2.6, SH * 0.66, 3], c: [0.9, 0.6, 0.3], r: 9 }, { p: [-3, SH * 0.3, 2], c: [0.3, 0.5, 0.9], r: 8 }, { p: [0, SH + 1.5, 0], c: [1, 0.85, 0.5], r: 7 }];
    R.frame({ cam: [RX, UY, VZ], center: c, sx: 2 * ppu / W, sy: 2 * ppu / H, offY: -2 * up / H, key: [-0.45, 0.8, 0.4], keyC: hex(pal.keyC), sky: mulc(hex(pal.mist), 0.75), gnd: [0.28, 0.2, 0.16],
      fogC: hex(pal.fog), fog: [-2, 1.2, -4, -0.6], lights: ls, time: S.t, ga: 1, ext: 9, shadows: true }, stackList(st));
    if (S.flash > 0) { fx.fillStyle = 'rgba(255,240,210,' + S.flash * 0.4 + ')'; fx.fillRect(0, 0, W, H); }
  }
  function render() {
    if (!S.world) return;
    if (S.mode === 'open' || S.mode === 'fin' || S.mode === 'final' || (S.mode === 'trans' && !S.snapReq)) { R.gl.clearColor(0, 0, 0, 0); R.gl.clear(R.gl.COLOR_BUFFER_BIT | R.gl.DEPTH_BUFFER_BIT); return; }
    var cam = S.cam, pal = S.pal, list = [], t = S.t;
    S.parts.forEach(function (m) {
      var p = m.part, model = partModel(p);
      list.push({ m: m.main, model: model, o: {} });
      if (p.glaze) {
        if (p.fillK > 0) { var f = S.fills.filter(function (q) { return q.part === p; })[0] || S.drains.filter(function (q) { return q.part === p; })[0]; list.push({ m: m.en, model: model, o: f ? { dis: { p: f.o, k: easeOut(p.fillK) } } : {} }); }
        if (!p.filled || p.fillK < 1) list.push({ m: m.wire, model: model, o: { emis: L.canFill(S.world, p) ? 0.25 + 0.15 * Math.sin(t * 3) : 0 } });
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
    if (CM.rail) list.push({ m: CM.rail, model: M.id(), o: { noShadow: true } });
    if (CM.door) list.push({ m: CM.door, model: M.id(), o: { alpha: 0.42 + 0.06 * Math.sin(t * 1.7) + (S.won ? 0.3 : 0), noShadow: true, late: true, noDepth: true } });
    if (!S.tokenTaken) { var gn = S.world.nodes.filter(function (n) { return n.goal; })[0]; if (gn) { var gp = standNow(gn); list.push({ m: CM.token, model: M.chain(M.tr(gp[0], gp[1] + 0.95 + 0.06 * Math.sin(t * 1.8), gp[2]), M.rot('y', t * 0.9)), o: { noShadow: true } }); } }
    charList(list, C[0]); charList(list, C[1]);
    var key = pal.key, keyC = hex(pal.keyC), amb = pal.amb || 0.32;
    R.frame({ cam: [RX, UY, VZ], center: cam.c, sx: 2 * cam.ppu / W, sy: 2 * cam.ppu / H, offY: -2 * (cam.base + cam.intro) / H,
      key: key, keyC: mulc(keyC, 1.05), sky: mulc(hex(pal.mist), amb * 1.6), gnd: mixc(mulc(hex(pal.sky[1]), amb * 1.4), [0.25, 0.17, 0.12], 0.3), fogC: hex(pal.fog),
      fog: [-4.6, -0.4, -6.4, -3.0], lights: lights(), time: t, ga: S.ga, ext: S.ext }, list);
  }
  function afterRender() { if (S.snapReq) { var cb = S.snapReq; S.snapReq = null; cb(snapshot()); } }
  var last = 0;
  function frame(ts) {
    var dt = Math.min(0.05, (ts - last) / 1000 || 0); last = ts;
    update(dt); render(); drawFX(dt); afterRender(); stageDraw();
    requestAnimationFrame(frame);
  }
  function resize() {
    DPR = CAP ? 1 : Math.min(window.devicePixelRatio || 1, 2); W = Math.max(1, window.innerWidth); H = Math.max(1, window.innerHeight);
    [bgc, vzc, glc, fxc, trc].forEach(function (c) { c.width = (W * DPR) | 0; c.height = (H * DPR) | 0; });
    bg.setTransform(DPR, 0, 0, DPR, 0, 0); fx.setTransform(DPR, 0, 0, DPR, 0, 0); vzx.setTransform(DPR, 0, 0, DPR, 0, 0);
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
  $('blv').addEventListener('click', function () { AU.ui(); buildLevelList(); $('levels').classList.add('on'); });
  $('lvclose').addEventListener('click', function () { AU.ui(); $('levels').classList.remove('on'); });
  $('bre').addEventListener('click', function () { if (S.mode === 'play' || S.mode === 'end') { AU.ui(); start(S.idx, false); } });
  $('bmu').addEventListener('click', function () { save.mute = !save.mute; AU.setMute(save.mute); persist(); setMuteUI(); AU.ui(); });
  $('w0').addEventListener('click', function () { if (S.mode === 'play') select(0); });
  $('w1').addEventListener('click', function () { if (S.mode === 'play') select(1); });
  $('again').addEventListener('click', function () { AU.ui(); S.fin = null; $('finale').classList.remove('on'); openScene(); });
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
  var qs = /[?&]lv=(\d)/.exec(location.search);
  if (qs) enterChapter(clamp(+qs[1], 0, LEVELS.length - 1), false); else openScene();
  if (CAP) document.body.classList.add('cap');
  if (!CAP) requestAnimationFrame(frame);

  // 调试 / 自动化 / 录制入口（不影响游玩）
  function findNode(x, y, z) { return S.world.nodes.filter(function (n) { return n.active && n.cell[0] === x && n.cell[1] === y && n.cell[2] === z; })[0]; }
  window.__sy = { S: S, C: C, L: L, start: start, load: function (i) { ['title', 'levels', 'finale', 'card'].forEach(function (id) { $(id).classList.remove('on'); }); document.body.classList.remove('opening'); $('hud').classList.add('on'); $('chapter').classList.add('on'); loadLevel(i); S.mode = 'play'; S.ga = 1; S.cam.intro = 0; return 'ok'; }, proj: proj,
    tick: function (sec, step, noRender) { step = step || 1 / 60; var n = Math.max(1, Math.round(sec / step)); for (var i = 0; i < n; i++) { update(step); if (!noRender) drawFX(step); } if (!noRender) { render(); afterRender(); stageDraw(); } return S.mode; },
    draw: function () { render(); },
    walk: function (i, x, y, z) { var c = C[i], n = findNode(x, y, z); if (!n) return 'no node'; var p = L.path(c.step ? c.step.to : c.node, n, blockedFor(i)); if (!p) return 'no path'; c.path = p; return p.length; },
    set: function (id, st, dur) { var p = S.world.byId[id]; if (L.locked(S.world, p)) return 'locked'; animPart(p, st, dur || 0.6, ease); AU.snap(p.def.wire ? 'wire' : 'stone'); return 'ok'; },
    fill: function (id) { var p = S.world.byId[id], n = p.nodes[0]; tryFill(p, L.tPoint(p, p.val, [n.c[0], n.c[1] + 0.5, n.c[2]])); return p.fillK > 0 || S.fills.length ? 'ok' : 'spill'; },
    polish: function (id, k) { var p = S.world.byId[id]; S.scrub = { part: p, x: 0, y: 0, e: 0 }; var d = (k || 0.2) * S.cam.ppu * 9 * Math.max(1, p.nodes.length * 0.6); scrubMove(d, 0); var r = p.polish; S.scrub = null; return r; },
    sel: function (i) { select(i); return S.sel; },
    cont: function () { if (S.canContinue) nextLevel(); return S.mode; },
    state: function () { return { mode: S.mode, idx: S.idx, won: S.won, chars: C.map(function (c) { return c.on ? c.node.cell.join(',') : null; }), parts: S.world.parts.map(function (p) { return p.id + ':' + p.state + (p.filled ? 'F' : '') + (p.polished ? 'P' : ''); }) }; },
    title: function () { S.mode = 'title'; }, resize: resize, drawVase: drawVase, AU: AU,
    open: function () { openScene(); return 'ok'; }, opTap: function () { opTap(); return S.op.ph; }, enter: function (i, card) { enterChapter(i, !!card); return S.mode; }, tap: function () { if (S.mode === 'card') cardTap(); else if (S.mode === 'trans') transTap(); else if (S.mode === 'open') opTap(); return S.mode; },
    trans: function (i) { startTrans(i); return 'ok'; }, finale: function () { startFinale(); return 'ok'; }, win: function () { win(); return 'ok'; }, stageDraw: stageDraw, afterRender: afterRender, cine: function (o) { S.cine = o; applyCine(); return 'ok'; }, snap: snapshot, vasePath: vasePath, CARDC: CARDC, say: say, clText: clText, phaseAt: phaseAt, spaced: spaced, assemble: function () { S.edges = levelEdges(); S.ga = 0; S.cam.intro = 0; beginAssembly(); return S.mode; }, setVase: function (n) { S.vase.st = n; return n; }, LEVELS: LEVELS, mode: function () { return S.mode; },
    busy: function () { return !!S.camAnim || C.some(function (c) { return c.on && (c.step || c.path.length || c.fade); }) || S.world.parts.some(function (p) { return p.anim; }) || S.fills.length > 0 || S.beat > 0; } };
})();
