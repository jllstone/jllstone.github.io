#!/usr/bin/env node
/* 一脉蓝 · 关卡求解器：对每一关做完整状态空间 BFS。
 * 状态 = 可操控角色位置 + 各机关状态 + 踏板 + 已灌釉丝格 + 已磨光残阶。
 * 检查：SOLVABLE 可通关｜NO_SOFTLOCK 任一可达状态仍能通关｜NO_OVERLAP 可走砖无屏幕重叠｜RIDER_SAFE 角色脚下始终有效
 * 用法: node tools/solve.js [--json 输出路径] [--only 章号]
 */
'use strict';
const fs = require('fs');
const path = require('path');
const L = require('../js/logic.js');
const LEVELS = require('../js/levels.js');

function solveLevel(def, idx) {
  const W = L.build(def);
  const res = { level: idx, name: def.name, checks: {}, warnings: [] };
  if (!W.start || (def.duo === 'ctrl' && !W.start2)) { res.checks.SOLVABLE = false; res.warnings.push('起点不是有效砖'); res.pass = false; return res; }
  const plates = W.nodes.filter(n => n.plate);
  const glz = W.parts.filter(p => p.glaze), rgh = W.parts.filter(p => p.rough);
  const nC = W.chars.length;
  const hal = W.nodes.filter(n => n.halo);
  const snap = () => W.chars.map(c => c.id).join(';') + '|' + W.parts.map(p => p.state).join(',') + '|' + plates.map(n => n.pressed ? 1 : 0).join('') + '|' + glz.map(p => p.filled ? 1 : 0).join('') + rgh.map(p => p.polished ? 1 : 0).join('') + '|' + hal.map(n => n.gilt ? 1 : 0).join('');
  const load = s => {
    const [cs, ps, pr, fp, gl] = s.split('|');
    hal.forEach((n, i) => { n.gilt = gl[i] === '1'; });
    cs.split(';').forEach((id, i) => { W.chars[i] = W.nodes[+id]; });
    ps.split(',').forEach((v, i) => { W.parts[i].state = W.parts[i].val = +v; });
    plates.forEach((n, i) => { n.pressed = pr[i] === '1'; });
    glz.forEach((p, i) => { p.filled = fp[i] === '1'; });
    rgh.forEach((p, i) => { p.polished = fp[glz.length + i] === '1'; });
    L.settle(W);
  };
  const follows = () => {
    let ch = true, guard = 0;
    while (ch && guard++ < 20) {
      ch = false; L.settle(W);
      for (const p of W.parts) if (p.follow || p.hold) {
        const t = L.followTarget(W, p);
        if (p.state !== t && !L.anyOn(W, p)) { p.state = p.val = t; ch = true; }
      }
    }
    L.settle(W);
  };
  const isGoal = () => W.chars[0].goal && (!W.nodes.some(n => n.goal2) || (W.chars[1] && W.chars[1].goal2));
  const lint = () => {
    const seen = {};
    for (const n of W.nodes) if (n.active && !n.stair) {
      const k = (n.cell[0] - n.cell[1]) + ',' + (n.cell[2] - n.cell[1]);
      if (seen[k]) res.overlap.add(`(${seen[k].cell}) 与 (${n.cell}) 屏幕重叠`);
      seen[k] = n;
    }
    W.chars.forEach((c, i) => { if (!c.active) res.rider.add(`角色${i} 所在砖 (${c.cell}) 失效`); });
  };
  res.overlap = new Set(); res.rider = new Set();
  const s0 = snap();
  const prev = new Map([[s0, null]]);
  const fwd = new Map();
  const queue = [s0];
  let goalState = null;
  const goals = new Set();
  while (queue.length) {
    const s = queue.shift();
    load(s); lint();
    if (isGoal()) { goals.add(s); if (!goalState) goalState = s; }
    const nexts = [];
    const push = (label, ns, act) => { nexts.push(ns); if (!prev.has(ns)) { prev.set(ns, [s, label, act]); queue.push(ns); } };
    for (let ci = 0; ci < nC; ci++) {
      load(s);
      const me = W.chars[ci];
      for (const e of me.adj.slice()) {
        load(s);
        const t = e.to;
        if (W.chars.some((c, j) => j !== ci && c === t)) continue;
        if (ci === 1 && t.part.onlyA) continue;
        let label = `${ci ? '师傅' : '阿蓝'}走到 (${t.cell})` + (e.ill ? '〔视错觉〕' : '');
        W.chars[ci] = t;
        if (t.plate && !t.pressed) { t.pressed = true; const p = W.byId[t.plate.part]; p.state = p.val = t.plate.to; label += ` 踏板→${p.id}`; }
        follows();
        push(label, snap(), { type: 'walk', ci, cell: t.cell.slice() });
      }
    }
    load(s);
    for (const p of W.parts) {
      if (!p.handles.length || L.locked(W, p)) continue;
      const opts = [];
      if (p.kind === 'rot') for (let k = 0; k < 4; k++) opts.push(k); else for (let k = p.min; k <= p.max; k++) opts.push(k);
      const cur = p.state;
      for (const k of opts) { if (k === cur) continue; load(s); p.state = p.val = k; follows(); push(`${p.id}: ${cur}→${k}`, snap(), { type: 'part', id: p.id, to: k }); }
    }
    for (const p of glz) { load(s); if (L.canFill(W, p)) { p.filled = true; follows(); push(`灌釉 ${p.id}`, snap(), { type: 'fill', id: p.id }); } }
    for (const p of rgh) { load(s); if (!p.polished) { p.polished = true; follows(); push(`磨光 ${p.id}`, snap(), { type: 'polish', id: p.id }); } }
    fwd.set(s, nexts);
  }
  res.states = prev.size;
  res.checks.SOLVABLE = !!goalState;
  if (goalState) {
    const steps = [], acts = []; let s = goalState;
    while (prev.get(s)) { steps.unshift(prev.get(s)[1]); acts.unshift(prev.get(s)[2]); s = prev.get(s)[0]; }
    res.actions = acts;
    const merged = [];
    for (const st of steps) {
      const walk = st.includes('走到') && !st.includes('踏板') && !st.includes('视错觉');
      const who = st.slice(0, 2);
      if (walk && merged.length && merged[merged.length - 1].w === who) merged[merged.length - 1] = { t: st, w: who };
      else merged.push({ t: st, w: walk ? who : null });
    }
    res.solution = merged.map(m => m.t); res.rawSteps = steps.length;
  }
  const rev = new Map();
  for (const [s, ns] of fwd) for (const n of ns) { if (!rev.has(n)) rev.set(n, []); rev.get(n).push(s); }
  const ok = new Set(goals); const q2 = [...goals];
  while (q2.length) { const s = q2.shift(); for (const p of (rev.get(s) || [])) if (!ok.has(p)) { ok.add(p); q2.push(p); } }
  res.checks.NO_SOFTLOCK = ok.size === prev.size;
  if (!res.checks.NO_SOFTLOCK) {
    res.warnings.push(`存在 ${prev.size - ok.size} 个无法通关的可达状态`);
    const bad = [...prev.keys()].filter(s => !ok.has(s)).slice(0, 3);
    bad.forEach(b => { let s = b; const tr = []; while (prev.get(s)) { tr.unshift(prev.get(s)[1]); s = prev.get(s)[0]; } res.warnings.push('  死局例：' + tr.join(' → ')); });
  }
  res.checks.NO_OVERLAP = res.overlap.size === 0;
  res.checks.RIDER_SAFE = res.rider.size === 0;
  res.warnings.push(...[...res.overlap].slice(0, 6), ...res.rider);
  delete res.overlap; delete res.rider;
  res.pass = Object.values(res.checks).every(Boolean);
  return res;
}
const oi = process.argv.indexOf('--only');
const only = oi > 0 ? +process.argv[oi + 1] : null;
const NUM = ['序', '一', '二', '三', '四', '五', '六', '七'];
const results = LEVELS.map((d, i) => (only === null || only === i) ? solveLevel(d, i) : null).filter(Boolean);
let allPass = true;
for (const r of results) {
  allPass = allPass && r.pass;
  console.log(`\n${NUM[r.level]} · ${r.name}  ${r.pass ? 'PASS' : 'FAIL'}  (可达状态 ${r.states}, 最短 ${r.rawSteps} 步)`);
  for (const [k, v] of Object.entries(r.checks)) console.log(`  ${v ? '✔' : '✘'} ${k}`);
  (r.solution || []).forEach((s, i) => console.log(`    ${String(i + 1).padStart(2)}. ${s}`));
  r.warnings.forEach(w => console.log('  ! ' + w));
}
console.log(`\n总计: ${results.filter(r => r.pass).length}/${results.length} PASS`);
const ji = process.argv.indexOf('--json');
if (ji > 0) {
  const out = path.resolve(process.argv[ji + 1]);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify({ schema_version: 1, tool: 'tools/solve.js', generated_at: new Date().toISOString(), all_pass: allPass, levels: results }, null, 2));
}
process.exit(allPass ? 0 : 1);
