/* 一脉蓝 · logic.js — 世界模型：机关变换、行走节点、视错觉连通、寻路。
 * 在《拾月》底座上扩展了景泰蓝专属规则（浏览器与 Node 求解器共用，无 DOM 依赖）：
 *   glaze  掐丝成界 × 闭丝灌釉：丝格只有在所需金丝全部合拢时才能灌釉；灌釉后才成实路
 *   rough  磨光显蓝：覆着氧化渣的残阶不可走，打磨之后才显出镜面蓝釉
 *   hold   托举：有人站在托举踏板上时，悬空丝桥才绷紧成路（人离开、且桥上无人时收回）
 *   halo   双晕：两人在屏幕上的光晕同时罩住的金箔砖才凝成实路（同屏交织）
 *   多角色：chars[0] 为阿蓝，chars[1] 为老师傅；彼此占位不可穿行
 *
 * 坐标：整数格，y 向上。相机固定为 (1,1,1) 方向的正交等距投影，两点差为 k·(1,1,1) 时屏幕重合。
 */
(function (root) {
  'use strict';
  var FACES = { py: [0, 1, 0], ny: [0, -1, 0], px: [1, 0, 0], nx: [-1, 0, 0], pz: [0, 0, 1], nz: [0, 0, -1] };
  var DIRS = { '+x': [1, 0, 0], '-x': [-1, 0, 0], '+z': [0, 0, 1], '-z': [0, 0, -1] };
  var AXV = { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] };
  var key = function (x, y, z) { return x + ',' + y + ',' + z; };
  var RX = [0.70710678, 0, -0.70710678], UY = [-0.40824829, 0.81649658, -0.40824829];
  function scr(v) { return [v[0] * RX[0] + v[2] * RX[2], v[0] * UY[0] + v[1] * UY[1] + v[2] * UY[2]]; }

  function rot90(v, axis, n) {
    n = ((n % 4) + 4) % 4;
    var x = v[0], y = v[1], z = v[2], t;
    for (var i = 0; i < n; i++) {
      if (axis === 'y') { t = x; x = z; z = -t; }
      else if (axis === 'z') { t = x; x = -y; y = t; }
      else { t = y; y = -z; z = t; }
    }
    return [x, y, z];
  }
  function rotC(v, axis, a) {
    var c = Math.cos(a), s = Math.sin(a), x = v[0], y = v[1], z = v[2];
    if (axis === 'y') return [x * c + z * s, y, -x * s + z * c];
    if (axis === 'z') return [x * c - y * s, x * s + y * c, z];
    return [x, y * c - z * s, y * s + z * c];
  }
  function tPoint(p, val, v) {
    if (p.kind === 'rot') {
      var pv = p.pivot, r = rotC([v[0] - pv[0], v[1] - pv[1], v[2] - pv[2]], p.axis, val * Math.PI / 2);
      return [r[0] + pv[0], r[1] + pv[1], r[2] + pv[2]];
    }
    if (p.kind === 'slide') { var a = AXV[p.axis]; return [v[0] + a[0] * val, v[1] + a[1] * val, v[2] + a[2] * val]; }
    return [v[0], v[1], v[2]];
  }
  function tCell(p, st, c) {
    if (p.kind === 'rot') {
      var pv = p.pivot, r = rot90([c[0] - pv[0], c[1] - pv[1], c[2] - pv[2]], p.axis, st);
      return [r[0] + pv[0], r[1] + pv[1], r[2] + pv[2]];
    }
    if (p.kind === 'slide') { var a = AXV[p.axis]; return [c[0] + a[0] * st, c[1] + a[1] * st, c[2] + a[2] * st]; }
    return [c[0], c[1], c[2]];
  }
  function tDirI(p, st, d) { return p.kind === 'rot' ? rot90(d, p.axis, st) : [d[0], d[1], d[2]]; }

  function build(def) {
    var W = { def: def, parts: [], byId: {}, nodes: [], start: null, start2: null, chars: [], haloR: def.haloR || 2.3 };
    def.parts.forEach(function (pd) {
      var p = {
        id: pd.id, kind: pd.kind || 'static', axis: pd.axis || 'y', pivot: pd.pivot || [0, 0, 0],
        min: pd.min, max: pd.max, state: pd.state || 0, val: pd.state || 0,
        handles: pd.handles || [], follow: pd.follow || null, hold: pd.hold || null,
        glaze: pd.glaze || null, filled: !!(pd.glaze && pd.glaze.filled), onlyA: !!pd.onlyA, rough: !!pd.rough, polished: false,
        def: pd, cells: [], nodes: []
      };
      (pd.boxes || []).forEach(function (b) {
        for (var x = b[0]; x <= b[3]; x++) for (var y = b[1]; y <= b[4]; y++) for (var z = b[2]; z <= b[5]; z++) p.cells.push([x, y, z]);
      });
      var add = function (c, o) {
        var n = { id: W.nodes.length, part: p, c: c, n: o.n || [0, 1, 0], stair: o.stair || null, magic: !!o.magic, halo: !!o.halo, hollow: !!o.hollow, gilt: false,
          goal: !!o.goal, goal2: !!o.goal2, plate: o.plate || null, holdOf: o.hold || null, pressed: false,
          cell: null, stand: null, active: false, dir: null, adj: [] };
        W.nodes.push(n); p.nodes.push(n);
      };
      (pd.walk || []).forEach(function (w) {
        var nums = [], o = {};
        w.forEach(function (t) {
          if (typeof t === 'number') nums.push(t);
          else if (typeof t === 'string') { if (t === 'm') o.magic = true; else if (t === 'h') o.halo = true; else if (t === 'x') o.hollow = true; else o.n = FACES[t]; }
          else { if (t.goal) o.goal = true; if (t.goal2) o.goal2 = true; if (t.plate) o.plate = t.plate; if (t.hold) o.hold = t.hold; }
        });
        if (nums.length === 6) {
          for (var x = nums[0]; x <= nums[3]; x++) for (var y = nums[1]; y <= nums[4]; y++) for (var z = nums[2]; z <= nums[5]; z++) add([x, y, z], o);
        } else add([nums[0], nums[1], nums[2]], o);
      });
      (pd.stairs || []).forEach(function (s) { add([s[0], s[1], s[2]], { stair: DIRS[s[3]] }); });
      W.parts.push(p); W.byId[p.id] = p;
    });
    settle(W);
    var find = function (c) {
      for (var i = 0; i < W.nodes.length; i++) { var n = W.nodes[i]; if (!n.stair && n.active && n.cell[0] === c[0] && n.cell[1] === c[1] && n.cell[2] === c[2]) return n; }
      return null;
    };
    W.start = find(def.start);
    W.chars = [W.start];
    if (def.start2) W.start2 = find(def.start2);
    if (def.start2 && def.duo === 'ctrl') W.chars.push(W.start2);
    settle(W);
    return W;
  }

  function partOpen(p) { return (!p.glaze || p.filled) && (!p.rough || p.polished); }
  function occupied(W, n) { for (var i = 0; i < W.chars.length; i++) if (W.chars[i] === n) return true; return false; }
  function inHalos(W, n) {
    if (W.chars.length < 2) return false;
    var s = scr(n.stand);
    for (var i = 0; i < W.chars.length; i++) {
      var c = W.chars[i]; if (!c || !c.stand) return false;
      var q = scr(c.stand); if (Math.hypot(s[0] - q[0], s[1] - q[1]) > W.haloR) return false;
    }
    return true;
  }

  // 依据各机关的整数状态与角色位置，重算节点位置与连通图
  function settle(W) {
    var occ = {}, flat = {}, stairs = {}, i, n, p, wc;
    W.parts.forEach(function (p) {
      if (!partOpen(p) && (p.glaze)) return; // 未灌釉的丝格是镂空的，不占体积
      p.cells.forEach(function (c) { var w = tCell(p, p.state, c); occ[key(w[0], w[1], w[2])] = 1; });
    });
    for (i = 0; i < W.nodes.length; i++) {
      n = W.nodes[i]; p = n.part; wc = tCell(p, p.state, n.c);
      var wn = tDirI(p, p.state, n.n);
      n.cell = wc; n.adj = []; n.active = wn[1] === 1 && wc[1] >= -1 && partOpen(p) && !n.hollow;
      if (n.stair) { n.dir = tDirI(p, p.state, n.stair); n.stand = [wc[0], wc[1], wc[2]]; if (n.active) stairs[key(wc[0], wc[1], wc[2])] = n; }
      else {
        n.stand = [wc[0], wc[1] + 0.5, wc[2]];
        if (n.active && occ[key(wc[0], wc[1] + 1, wc[2])]) n.active = false;
      }
    }
    // 双晕砖：站位决定；有人站着的砖保持有效
    for (i = 0; i < W.nodes.length; i++) {
      n = W.nodes[i];
      if (n.halo && n.active) { if (occupied(W, n)) n.gilt = true; n.active = n.gilt || inHalos(W, n); }
      if (!n.stair && n.active) flat[key(n.cell[0], n.cell[1], n.cell[2])] = n;
    }
    var link = function (a, b, ex) { var e = { to: b, ill: false, step: null }; if (ex) { e.ill = true; e.step = ex; } a.adj.push(e); };
    var D4 = [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1]], k, m;
    var magic = [];
    for (k in flat) {
      n = flat[k];
      for (i = 0; i < 4; i++) { m = flat[key(n.cell[0] + D4[i][0], n.cell[1], n.cell[2] + D4[i][2])]; if (m) link(n, m); }
      if (n.magic) magic.push(n);
    }
    for (k in stairs) {
      n = stairs[k]; var c = n.cell, d = n.dir;
      var lo = flat[key(c[0] - d[0], c[1] - 1, c[2] - d[2])], hi = flat[key(c[0] + d[0], c[1], c[2] + d[2])];
      if (lo) { link(n, lo); link(lo, n); }
      if (hi) { link(n, hi); link(hi, n); }
      var up = stairs[key(c[0] + d[0], c[1] + 1, c[2] + d[2])];
      if (up && up.dir[0] === d[0] && up.dir[2] === d[2]) { link(n, up); link(up, n); }
    }
    for (i = 0; i < magic.length; i++) for (var j = 0; j < magic.length; j++) {
      var a = magic[i], b = magic[j];
      if (b.cell[1] <= a.cell[1]) continue;
      var du = (b.cell[0] - b.cell[1]) - (a.cell[0] - a.cell[1]), dv = (b.cell[2] - b.cell[1]) - (a.cell[2] - a.cell[1]);
      if ((du === 1 && dv === 0) || (du === 0 && dv === 1)) { link(a, b, [du, 0, dv]); link(b, a, [-du, 0, -dv]); }
    }
  }

  // 寻路；blocked 为其他角色所在节点（不可穿行）
  function path(a, b, blocked) {
    if (a === b) return [];
    var prev = {}, q = [a], n, i; prev[a.id] = a;
    while (q.length) {
      n = q.shift(); if (n === b) break;
      for (i = 0; i < n.adj.length; i++) {
        var t = n.adj[i].to;
        if (blocked && blocked.indexOf(t) >= 0) continue;
        if (prev[t.id] === undefined) { prev[t.id] = n; q.push(t); }
      }
    }
    if (prev[b.id] === undefined) return null;
    var out = []; for (n = b; n !== a; n = prev[n.id]) out.unshift(n);
    return out;
  }
  function edge(a, b) { for (var i = 0; i < a.adj.length; i++) if (a.adj[i].to === b) return a.adj[i]; return null; }

  // 竖直面旋转的机关，有人站在上面时不可转
  function locked(W, part) {
    if (part.kind !== 'rot' || part.axis === 'y') return false;
    for (var i = 0; i < W.chars.length; i++) if (W.chars[i] && W.chars[i].part === part) return true;
    return false;
  }
  function anyOn(W, part) { for (var i = 0; i < W.chars.length; i++) if (W.chars[i] && W.chars[i].part === part) return true; return false; }
  // 联动 / 托举机关的目标状态
  function followTarget(W, p) {
    if (p.hold) {
      for (var i = 0; i < W.nodes.length; i++) { var n = W.nodes[i]; if (n.holdOf === p.id && occupied(W, n)) return p.hold.on; }
      return p.hold.off;
    }
    var s = W.byId[p.follow.src]; return s.state === p.follow.when ? p.follow.on : p.follow.off;
  }
  // 丝格是否已合拢、可以灌釉
  function canFill(W, p) {
    if (!p.glaze || p.filled) return false;
    for (var i = 0; i < p.glaze.need.length; i++) { var nd = p.glaze.need[i]; if (W.byId[nd[0]].state !== nd[1]) return false; }
    return true;
  }

  var api = { build: build, settle: settle, path: path, edge: edge, locked: locked, anyOn: anyOn, followTarget: followTarget, canFill: canFill,
    occupied: occupied, scr: scr, tPoint: tPoint, tCell: tCell, rot90: rot90, AXV: AXV, key: key };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.SY_LOGIC = api;
})(typeof window !== 'undefined' ? window : this);
