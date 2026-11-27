// 3D 舞台：桌面、书本、可弯曲的书页、立牌折起与竖立、镜头、点选
import * as T from '../vendor/three.module.min.js';
import { clamp, lerp, smooth, beat, prepareGround, blankCanvas } from './util.js';
import { makeStandee, makePuppet, posePuppet, ambient, grain } from './cards.js';
import { createEffects } from './effects.js';

export const W = 6, D = 7, Y0 = 0.04;   // 单页宽 6、纵深 7（世界单位）；左页 x∈[-6,0]，右页 x∈[0,6]
const PI = Math.PI, NX = 28, NZ = 8;

// 书页靠近书脊的隆起
export function camber(r) { return 0.15 * Math.sin(Math.min(1, r / 0.9) * PI / 2) * (1 - 0.62 * Math.pow(Math.min(1, r / W), 1.4)); }

// 正在翻的那张纸：p=0 平放在右边，p=1 平放在左边。整张纸按等曲率卷曲，外缘略领先、靠读者一侧的角更快
export function bend(r, z, p) {
  const s = Math.sin(PI * p);
  const base = PI * p - s * (0.27 - 0.16 * z / D), k = 0.58 * s, phi = base + k * r / W;
  let x, y;
  if (Math.abs(k) < 1e-5) { x = r * Math.cos(base); y = r * Math.sin(base); }
  else { x = W * (Math.sin(phi) - Math.sin(base)) / k; y = W * (Math.cos(base) - Math.cos(phi)) / k; }
  const c = camber(r);
  return { x: x - Math.sin(phi) * c, y: Y0 + y + Math.cos(phi) * c, phi };
}

function cloth(color) {
  const c = blankCanvas(512, 512), g = c.getContext('2d'); g.fillStyle = color; g.fillRect(0, 0, 512, 512);
  let s = 77; const r = () => ((s = (Math.imul(1664525, s) + 1013904223) >>> 0) / 4294967296);
  for (let i = 0; i < 7000; i++) { g.fillStyle = i % 2 ? 'rgba(255,250,220,.06)' : 'rgba(0,0,0,.09)'; g.fillRect(r() * 512, r() * 512, 1 + r() * 4, 1); }
  const t = new T.CanvasTexture(c); t.wrapS = t.wrapT = T.RepeatWrapping; t.repeat.set(70, 70); t.colorSpace = T.SRGBColorSpace; return t;
}

function pageMaterial(side = T.FrontSide) {
  const m = new T.MeshLambertMaterial({ side });
  const u = { inkMap: { value: null }, inkK: { value: 0 }, paperGrain: { value: grain() } };
  m.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, u);
    sh.fragmentShader = 'uniform sampler2D inkMap; uniform float inkK; uniform sampler2D paperGrain;\n' + sh.fragmentShader.replace('#include <map_fragment>',
      `#include <map_fragment>
       vec4 ink = texture2D(inkMap, vMapUv);
       diffuseColor.rgb = mix(diffuseColor.rgb, ink.rgb * 0.92, inkK * ink.a * 0.88);
       diffuseColor.rgb *= 0.93 + 0.11 * texture2D(paperGrain, vMapUv * vec2(9.0, 10.5)).r;`);
  };
  m.userData.u = u;
  m.customProgramCacheKey = () => 'page-ink-v1';
  return m;
}

// 一张纸的网格；flipU=true 时纹理外缘在 u=0（左页）
function sheetGeometry(flipU) {
  const g = new T.BufferGeometry(), pos = new Float32Array((NX + 1) * (NZ + 1) * 3), uv = [], idx = [];
  for (let j = 0; j <= NZ; j++) for (let i = 0; i <= NX; i++) {
    uv.push(flipU ? 1 - i / NX : i / NX, 1 - j / NZ);
    if (i < NX && j < NZ) { const a = j * (NX + 1) + i, b = a + 1, c = a + NX + 1, d = c + 1; idx.push(a, c, b, b, c, d); }
  }
  const attr = new T.BufferAttribute(pos, 3); attr.setUsage(T.DynamicDrawUsage);
  g.setAttribute('position', attr); g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
  return g;
}
function fillSheet(g, fn) {
  const pos = g.attributes.position.array; let k = 0;
  for (let j = 0; j <= NZ; j++) for (let i = 0; i <= NX; i++) { const r = W * i / NX, z = D * (j / NZ - 0.5), q = fn(r, z); pos[k++] = q.x; pos[k++] = q.y; pos[k++] = z; }
  g.attributes.position.needsUpdate = true; g.computeVertexNormals(); g.computeBoundingSphere();
}

// 自动“印墨”：把立牌放倒后的样子平印在纸面上。翻页时立牌折平，纸面上会显出它们的印刷版
function inkFor(items, half, size) {
  const c = blankCanvas(...size), g = c.getContext('2d'), ppu = size[0] / W;
  const sorted = items.filter(it => !it.def.parent && !it.hidden && (half < 0 ? it.x < 0 : it.x >= 0)).sort((a, b) => a.z - b.z);
  for (const it of sorted) {
    const cut = it.meshes[0].userData.cut; if (!cut) continue;
    const [w, h] = it.meshes[0].userData.size;
    const u = (half < 0 ? it.x + W : it.x) * ppu, v = (it.z + D / 2) * ppu, pw = w * ppu * Math.abs(Math.cos(it.def.yaw || 0)) * 0.98, ph = h * ppu * 0.9;
    g.save(); g.translate(u, v);
    if (it.z < -0.1) { g.scale(1, -1); } // 后排立牌向前倒：图像倒着印
    g.globalAlpha = 0.9; g.drawImage(cut.canvas, -pw / 2, -ph, pw, ph); g.restore();
  }
  const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; return t;
}

export async function createStage(canvas, book, onProgress) {
  const theme = Object.assign({ table: '#2f4b44', sky: '#25443d', paper: '#f4e7c8', paperEdge: '#fbf2de', paperBack: '#eadbb8', cover: '#8d4a35', coverEdge: '#c98557', ribbon: '#c0533e', stick: '#b49b74', tab: '#d9c39a' }, book.theme || {});
  const renderer = new T.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.outputColorSpace = T.SRGBColorSpace; renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.PCFSoftShadowMap;
  const scene = new T.Scene(); scene.background = new T.Color(theme.sky); scene.fog = new T.FogExp2(theme.sky, 0.008);
  const camera = new T.PerspectiveCamera(33, 1, 0.1, 200);
  scene.add(new T.HemisphereLight(0xfff6e2, 0xc7b493, 2.3));
  const sun = new T.DirectionalLight(0xffe8c6, 2.6); sun.position.set(-6, 11, 7); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -10, right: 10, top: 10, bottom: -10, near: 1, far: 32 }); sun.shadow.bias = -0.0003; sun.shadow.normalBias = 0.02; scene.add(sun);
  const fill = new T.DirectionalLight(0xc6e2ee, 0.8); fill.position.set(6, 5, -6); scene.add(fill);
  const table = new T.Mesh(new T.PlaneGeometry(400, 400), new T.MeshLambertMaterial({ map: cloth('#7f948a'), color: theme.table }));
  table.rotation.x = -PI / 2; table.position.y = -0.42; table.receiveShadow = true; scene.add(table);

  // 书壳与书芯
  const box = (x, y, z, w, h, d, col) => { const m = new T.Mesh(new T.BoxGeometry(w, h, d), new T.MeshLambertMaterial({ color: col })); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; scene.add(m); return m; };
  for (const s of [-1, 1]) {
    box(s * (W / 2 + 0.02), -0.34, 0, W + 0.26, 0.1, D + 0.34, theme.cover);
    box(s * (W / 2 + 0.02), -0.285, 0, W + 0.28, 0.03, D + 0.36, theme.coverEdge);
    for (let i = 0; i < 8; i++) box(s * (W / 2 + 0.02), -0.255 + i * 0.033, 0, W + 0.02 + Math.sin(i * 2.3) * 0.012, 0.033, D + 0.05, ['#d9c299', '#eedcb5', '#f6e7c4'][i % 3]);
  }
  box(0, -0.31, 0, 0.34, 0.16, D + 0.32, theme.cover);
  box(0, Y0 + 0.02, 0, 0.04, 0.012, D, '#8e7754');
  const ribbonShape = new T.Shape([new T.Vector2(0, 0), new T.Vector2(0.26, 0), new T.Vector2(0.26, 0.95), new T.Vector2(0.13, 0.78), new T.Vector2(0, 0.95)]);
  const ribbon = new T.Mesh(new T.ShapeGeometry(ribbonShape), new T.MeshLambertMaterial({ color: theme.ribbon, side: T.DoubleSide }));
  ribbon.rotation.x = PI / 2; ribbon.rotation.z = -0.12; ribbon.position.set(0.45, -0.23, D / 2 - 0.04); scene.add(ribbon);

  // 四张纸：静止的左右页 + 正在翻的那张（正反两面）
  const geoR = sheetGeometry(false), geoL = sheetGeometry(true);
  fillSheet(geoR, (r) => ({ x: r, y: Y0 + camber(r) })); fillSheet(geoL, (r) => ({ x: r, y: Y0 + camber(r) }));
  const left = new T.Mesh(geoL, pageMaterial()); left.scale.x = -1;
  const right = new T.Mesh(geoR, pageMaterial());
  const leafFront = sheetGeometry(false), leafBack = sheetGeometry(true);
  leafBack.setAttribute('position', leafFront.attributes.position);
  const front = new T.Mesh(leafFront, pageMaterial(T.FrontSide)), back = new T.Mesh(leafBack, pageMaterial(T.BackSide));
  for (const m of [left, right, front, back]) { m.receiveShadow = true; m.castShadow = m === front || m === back; m.frustumCulled = false; scene.add(m); }
  front.castShadow = true;

  // ── 载入各章 ──
  const effects = createEffects(scene);
  const groundSize = book.groundSize || [1024, 1200];
  const chapters = [];
  const cardOpts = { edge: book.edge ?? 5, paperEdge: theme.paperEdge, paperBack: theme.paperBack, stick: theme.stick, tab: theme.tab };
  let loaded = 0; const total = book.chapters.length;
  for (const def of book.chapters) {
    const halves = await prepareGround(def.ground, groundSize, theme.paper);
    const tex = halves.map(c => { const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; t.anisotropy = 8; return t; });
    const items = [], byId = {};
    const roots = (def.standees || []).filter(s => !s.parent), kids = (def.standees || []).filter(s => s.parent);
    const made = await Promise.all(roots.map(s => makeStandee(s, cardOpts).catch(e => { console.warn(e.message); return null; })));
    made.forEach(it => { if (it) { items.push(it); byId[it.id] = it; } });
    for (const s of kids) { // 子部件挂在父立牌上，一起折起
      const parent = byId[s.parent]; if (!parent) { console.warn('找不到父立牌', s.parent); continue; }
      const it = await makeStandee({ ...s, tab: false, stick: false }, cardOpts).catch(e => (console.warn(e.message), null)); if (!it) continue;
      parent.art.add(it.holder); it.holder.position.set(s.x || 0, 0, (s.z ?? 0.02)); it.art.position.y = s.y || 0; it.rest.y = s.y || 0;
      it.child = true; it.parent = parent; items.push(it); byId[it.id] = it;
    }
    for (const c of def.cast || []) {
      const cdef = book.characters?.[c.who]; if (!cdef) { console.warn('未定义角色', c.who); continue; }
      const it = await makePuppet(c.who, cdef, c, cardOpts).catch(e => (console.warn(e.message), null)); if (!it) continue;
      items.push(it); byId[it.id] = it;
    }
    const group = new T.Group(); group.visible = false; scene.add(group);
    for (const it of items) if (!it.child) group.add(it.holder);
    const ink = def.ink ? await Promise.all([def.ink.left, def.ink.right].map(async s => { const c = (await prepareGround({ left: s }, groundSize, 'rgba(0,0,0,0)'))[0]; const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; return t; }))
      : [inkFor(items, -1, groundSize), inkFor(items, 1, groundSize)];
    chapters.push({ def, tex, ink, items, byId, group, time: 0, sky: new T.Color(def.sky || theme.sky), table: new T.Color(def.table || theme.table) });
    onProgress?.(++loaded / total);
  }

  // 机关提示的小星光
  const glint = new T.Group(); scene.add(glint);
  { const s = new T.Shape(); [[0, .13], [.03, .03], [.12, 0], [.03, -.03], [0, -.13], [-.03, -.03], [-.12, 0], [-.03, .03]].forEach(([x, y], i) => i ? s.lineTo(x, y) : s.moveTo(x, y));
    const m = new T.MeshBasicMaterial({ color: '#fff0b0', side: T.DoubleSide, depthTest: false, transparent: true });
    for (let i = 0; i < 2; i++) { const g = new T.Mesh(new T.ShapeGeometry(s), m); g.position.set(i * .14, -i * .14, 0); g.scale.setScalar(i ? .55 : 1); g.renderOrder = 10; glint.add(g); } glint.visible = false; }

  // ── 状态 ──
  let position = 0, opening = 1, yaw = 0.08, tilt = 0.46, zoom = 1, clock = 0, last = performance.now(), frame = 0;
  const pointer = { inside: false, x: 0, y: 0, hover: null };
  const mechState = chapters.map(() => ({ mode: 'story', progress: 0, taps: 0, angle: 0, tapAt: -9, hold: false }));
  let cue = null, editorOn = false, selected = null, frameCb = null;
  const tmp = new T.Vector3(), target = new T.Vector3();

  function cameraPlace() {
    const w = canvas.clientWidth, h = canvas.clientHeight, aspect = w / Math.max(1, h); camera.aspect = aspect;
    const narrow = aspect < 0.9, span = narrow ? 8.8 : 15.6;
    const vf = camera.fov * PI / 180, hf = 2 * Math.atan(Math.tan(vf / 2) * aspect);
    const dist = Math.max(span / (2 * Math.tan(hf / 2)), (narrow ? 11 : 8.8) / (2 * Math.tan(vf / 2))) / zoom;
    const turnLift = Math.sin(PI * (position % 1));
    const cy = (narrow ? 1.3 : 1.25) + turnLift * (narrow ? 0.2 : 0.4);
    target.set(0, cy, narrow ? 0.2 : 0);
    camera.position.set(target.x + dist * Math.sin(yaw) * Math.cos(tilt), cy + dist * Math.sin(tilt), target.z + dist * Math.cos(yaw) * Math.cos(tilt));
    camera.lookAt(target); camera.updateProjectionMatrix(); camera.updateMatrixWorld();
  }

  // 在两张纸之间的楔形空间里，某点能容纳多高的立牌
  function wedgeRoom(r, gapAngle) { return 0.92 * r * Math.tan(clamp(gapAngle, 0, 2.9) / 2); }
  function riseFor(item, room) {
    const r = Math.max(0.18, Math.abs(item.x) - item.halfWidth * Math.abs(Math.cos(item.def.yaw || 0)) * 0.85);
    const h = Math.max(0.1, item.height), k = clamp(room(r) / h, 0, 1);
    return (2 / PI) * Math.asin(k);
  }

  function placeItem(it, mode, p, rise) {
    // mode: 'static' 静止页上 | 'leafTop' 在翻起的纸正面 | 'leafUnder' 在翻起的纸背面
    const r = Math.abs(it.x);
    let px, py, rot;
    if (mode === 'static') { px = it.x; py = Y0 + camber(r); rot = 0; }
    else {
      const q = bend(r, it.z, p), off = 0.024;
      if (mode === 'leafTop') { px = q.x - Math.sin(q.phi) * off; py = q.y + Math.cos(q.phi) * off; rot = q.phi; }
      else { px = q.x + Math.sin(q.phi) * off; py = q.y - Math.cos(q.phi) * off; rot = q.phi - PI; }
    }
    it.holder.position.set(px, py + 0.003, it.z); it.holder.rotation.set(0, 0, rot);
    const show = it.reveal * (it.driveRise ?? 1);
    const lift = rise * show;
    it.rise = lift;
    it.hinge.rotation.x = (it.z < -0.1 ? 1 : -1) * (1 - lift) * PI * 0.49;
    it.holder.visible = show > 0.01;
  }

  function resetMech(it) {
    it.mech.rotation.set(0, 0, 0); it.mech.position.set(0, 0, 0); it.mech.scale.set(1, 1, 1);
    it.art.position.set(it.rest.x || 0, it.rest.y || 0, it.rest.z || 0); it.art.rotation.set(it.def.pitch || 0, it.def.yaw || 0, 0);
    it.driveRise = 1;
  }

  function applyMechanics(ch, n, dt, w) {
    const st = mechState[n], ix = ch.def.interaction; if (!ix) return;
    const tgt = ch.byId[ix.target];
    const prog = st.mode === 'solved' ? 1 : st.progress;
    if (tgt) {
      const since = clock - st.tapAt;
      switch (ix.type) {
        case 'tap': case 'choice': {
          const k = Math.exp(-3 * since) * (since >= 0 ? 1 : 0), react = ix.react || 'swing';
          if (react === 'swing') tgt.mech.rotation.z += Math.sin(since * 13) * k * 0.6;
          else if (react === 'bounce') tgt.mech.position.y += Math.abs(Math.sin(since * 10)) * k * 0.25;
          else if (react === 'spin') tgt.mech.rotation.z += (1 - Math.exp(-4 * since)) * PI * 2 * (since < 2 ? 1 : 0);
          else tgt.mech.rotation.z += Math.sin(since * 30) * k * 0.15;
          break;
        }
        case 'pull': { const d = ix.dir || [1, 0], len = Math.hypot(d[0], d[1]) || 1, dist = ix.distance ?? 1.5; tgt.art.position.x += d[0] / len * dist * prog; tgt.art.position.z += d[1] / len * dist * prog; break; }
        case 'rotate': tgt.mech.rotation.z += st.angle; break;
        case 'flap': tgt.mech.rotation.x += -prog * (ix.angle ?? 1.9); break;
      }
    }
    for (const b of ix.drive || []) {
      const it = ch.byId[b.target]; if (!it) continue;
      const [a0, a1] = b.range || [0, 1], v = lerp(b.from ?? 0, b.to ?? 1, smooth(a0, a1, prog));
      switch (b.prop) {
        case 'rotX': it.mech.rotation.x += v; break; case 'rotY': it.mech.rotation.y += v; break; case 'rotZ': it.mech.rotation.z += v; break;
        case 'x': it.art.position.x += v; break; case 'y': it.art.position.y += v; break; case 'z': it.art.position.z += v; break;
        case 'scale': it.mech.scale.multiplyScalar(Math.max(0.001, v)); break; case 'scaleX': it.mech.scale.x *= Math.max(0.001, v); break; case 'scaleY': it.mech.scale.y *= Math.max(0.001, v); break;
        case 'rise': it.driveRise *= clamp(v); break;
      }
    }
  }

  function animateChapter(n, w, dt, isCurrent) {
    const ch = chapters[n];
    for (const it of ch.items) {
      resetMech(it);
      if (it.shake > 0) it.shake = Math.max(0, it.shake - dt);
      if (it.kind === 'puppet') {
        if (it.react < 99) it.react += dt;
        // 视线：看向指针
        let gx = 0, gy = 0;
        if (pointer.inside && isCurrent) {
          it.holder.getWorldPosition(tmp); tmp.y += it.height * 0.85; tmp.project(camera);
          const sx = (tmp.x * 0.5 + 0.5) * canvas.clientWidth, sy = (0.5 - tmp.y * 0.5) * canvas.clientHeight;
          gx = clamp((pointer.x - sx) / (canvas.clientWidth * 0.3), -1, 1); gy = clamp((sy - pointer.y) / (canvas.clientHeight * 0.25), -1, 1);
        }
        const e = 1 - Math.exp(-dt * 10); it.gaze.x += (gx - it.gaze.x) * e; it.gaze.y += (gy - it.gaze.y) * e;
        posePuppet(it, ch.time, w, pointer.hover === it ? 1 : 0);
      } else ambient(it, ch.time, w);
      // 揭示动画（解谜后弹出的立牌）
      const want = it.hidden ? (mechState[n].mode === 'solved' ? 1 : 0) : 1;
      if (it.reveal !== want) { it.reveal = want > it.reveal ? Math.min(1, it.reveal + dt * 1.6) : Math.max(0, it.reveal - dt * 3); }
    }
    applyMechanics(ch, n, dt, w);
    for (const it of ch.items) if (it.child) { const k = it.reveal * (it.driveRise ?? 1); it.holder.visible = k > 0.01; it.holder.scale.setScalar(Math.max(0.001, k)); it.rise = k; }
  }

  function setPaper(mesh, tex, ink, inkK) { const m = mesh.material; if (m.map !== tex) { m.map = tex; m.needsUpdate = true; } m.userData.u.inkMap.value = ink; m.userData.u.inkK.value = inkK; }

  function paint(now) {
    frame = 0;
    const dt = Math.min(0.1, Math.max(0, (now - last) / 1000)); last = now; clock = now / 1000;
    const N = chapters.length, n = clamp(Math.floor(position), 0, N - 1), p = position - n, turning = p > 1e-4 && n < N - 1;
    const inkK = open => 1 - smooth(0.45, 0.97, open);
    // 纸面贴图
    if (turning) {
      const a = chapters[n], b = chapters[n + 1];
      setPaper(left, a.tex[0], a.ink[0], inkK(1 - p)); setPaper(right, b.tex[1], b.ink[1], inkK(p));
      setPaper(front, a.tex[1], a.ink[1], inkK(1 - p)); setPaper(back, b.tex[0], b.ink[0], inkK(p));
      fillSheet(leafFront, (r, z) => bend(r, z, p)); leafBack.attributes.normal = leafFront.attributes.normal;
      front.visible = back.visible = true;
    } else {
      const a = chapters[n]; setPaper(left, a.tex[0], a.ink[0], inkK(opening)); setPaper(right, a.tex[1], a.ink[1], inkK(opening));
      front.visible = back.visible = false;
    }
    // 天色与桌布随章节渐变
    const c0 = chapters[n], c1 = chapters[Math.min(N - 1, n + 1)], mix = turning ? smooth(0.2, 0.8, p) : 0;
    scene.background.copy(c0.sky).lerp(c1.sky, mix); scene.fog.color.copy(scene.background); table.material.color.copy(c0.table).lerp(c1.table, mix);
    chapters.forEach(c => c.group.visible = false);
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (turning) {
      const out = chapters[n], inn = chapters[n + 1];
      out.group.visible = inn.group.visible = true;
      const wOut = 1 - smooth(0.0, 0.25, p), wIn = smooth(0.75, 1, p);
      animateChapter(n, wOut, dt, false); animateChapter(n + 1, wIn, dt, false);
      for (const it of out.items) if (!it.child) {
        const onLeaf = it.x >= 0;
        const room = rr => { const q = bend(rr, it.z, p); const a = Math.atan2(q.y - Y0, q.x); return wedgeRoom(rr, PI - a); };
        placeItem(it, onLeaf ? 'leafTop' : 'static', p, Math.min(riseFor(it, room), 1 - smooth(0.6, 1, p)));
      }
      for (const it of inn.items) if (!it.child) {
        const onLeaf = it.x < 0;
        const room = rr => { const q = bend(rr, it.z, p); const a = Math.atan2(q.y - Y0, q.x); return wedgeRoom(rr, a); };
        placeItem(it, onLeaf ? 'leafUnder' : 'static', p, Math.min(riseFor(it, room), smooth(0, 0.4, p)));
      }
    } else {
      const ch = chapters[n]; ch.group.visible = true;
      if (!reduce && opening > 0.99) ch.time += dt;
      animateChapter(n, reduce ? 0 : smooth(0.6, 1, opening), dt, true);
      for (const it of ch.items) if (!it.child) placeItem(it, 'static', 0, opening);
    }
    // 机关提示星光
    glint.visible = false;
    if (cue && !turning && opening > 0.99) {
      const it = chapters[n].byId[cue]; if (it && it.rise > 0.95) {
        const u = (clock % 2.6) / 1.1, pulse = u < 1 ? Math.sin(PI * u) : 0;
        if (pulse > 0.05 || pointer.hover === it) {
          it.mech.getWorldPosition(tmp); const sz = it.meshes[0].userData.size; tmp.y += sz[1] * 0.75; tmp.x += sz[0] * 0.3;
          glint.position.copy(tmp); glint.quaternion.copy(camera.quaternion); glint.scale.setScalar(pointer.hover === it ? 1 : 0.4 + pulse * 0.8); glint.visible = true;
          if (!reduce && pointer.hover !== it) it.mech.rotation.z += Math.sin(u * PI * 3) * pulse * 0.06;
        }
      }
    }
    effects.update(dt, camera);
    cameraPlace();
    renderer.render(scene, camera);
    frameCb?.({ dt, turning, p, n });
    if (!document.hidden) frame = requestAnimationFrame(paint);
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden && !frame) { last = performance.now(); frame = requestAnimationFrame(paint); } });

  function resize() { renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.75)); renderer.setSize(canvas.clientWidth, canvas.clientHeight, false); cameraPlace(); }
  new ResizeObserver(resize).observe(canvas); resize();
  frame = requestAnimationFrame(paint);

  // ── 点选 ──
  const ray = new T.Raycaster(), ndc = new T.Vector2();
  function castAt(x, y) {
    const r = canvas.getBoundingClientRect(); ndc.set(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1); ray.setFromCamera(ndc, camera);
  }
  function pick(x, y) {
    castAt(x, y);
    if (!Number.isInteger(position)) return { kind: 'page' };
    const ch = chapters[position], meshes = [];
    for (const it of ch.items) if (it.holder.visible && it.rise > 0.6) meshes.push(...it.meshes);
    for (const h of ray.intersectObjects(meshes, false)) {
      const cut = h.object.userData.cut, uv = h.uv;
      const u = uv.x;
      const x0 = Math.floor(u * cut.maskW), y0 = Math.floor((1 - uv.y) * cut.maskH);
      if (cut.mask[clamp(y0, 0, cut.maskH - 1) * cut.maskW + clamp(x0, 0, cut.maskW - 1)] > 90) {
        let it = h.object.userData.item; return { kind: 'item', item: it, point: h.point };
      }
    }
    const pg = ray.intersectObjects([left, right], false)[0];
    if (pg) return { kind: 'page', point: pg.point };
    if (ray.intersectObject(table, false)[0]) return { kind: 'table' };
    return { kind: 'none' };
  }
  const pagePlane = new T.Plane(new T.Vector3(0, 1, 0), -Y0 - 0.06);
  function pagePoint(x, y) { castAt(x, y); const v = new T.Vector3(); return ray.ray.intersectPlane(pagePlane, v) ? v : null; }
  function screenOf(v3) { tmp.copy(v3).project(camera); return { x: (tmp.x * 0.5 + 0.5) * canvas.clientWidth, y: (0.5 - tmp.y * 0.5) * canvas.clientHeight, behind: tmp.z > 1 }; }
  function headOf(it) { const v = new T.Vector3(); it.mech.getWorldPosition(v); v.y += it.kind === 'puppet' ? it.height * 1.05 : (it.meshes[0].userData.size[1]) * 0.9; return screenOf(v); }

  // 编辑模式的坐标网格
  const grid = new T.Group(); grid.visible = false; scene.add(grid);
  { const mat = new T.LineBasicMaterial({ color: '#2a6f9e', transparent: true, opacity: 0.55, depthTest: false }), strong = new T.LineBasicMaterial({ color: '#c0392b', depthTest: false });
    for (let x = -W; x <= W + 1e-6; x += 0.5) { const pts = []; for (let j = 0; j <= 8; j++) { const z = -D / 2 + D * j / 8; pts.push(new T.Vector3(x, Y0 + camber(Math.abs(x)) + 0.015, z)); } const l = new T.Line(new T.BufferGeometry().setFromPoints(pts), Math.abs(x) < 1e-6 ? strong : mat); l.renderOrder = 5; grid.add(l); }
    for (let z = -3.5; z <= 3.5 + 1e-6; z += 0.5) for (const s of [-1, 1]) { const pts = []; for (let i = 0; i <= 24; i++) { const r = W * i / 24; pts.push(new T.Vector3(s * r, Y0 + camber(r) + 0.015, z)); } const l = new T.Line(new T.BufferGeometry().setFromPoints(pts), Math.abs(z) < 1e-6 ? strong : mat); l.renderOrder = 5; grid.add(l); } }
  const selBox = new T.BoxHelper(undefined, '#ff5a36'); selBox.visible = false; selBox.material.depthTest = false; selBox.renderOrder = 11; scene.add(selBox);

  return {
    chapters, mechState, effects, camera,
    get position() { return position; },
    setPosition(v) { position = clamp(v, 0, chapters.length - 1); },
    setOpening(v) { opening = clamp(v); },
    setCue(id) { cue = id; },
    setView(a, e, z = zoom) { yaw = Math.atan2(Math.sin(a), Math.cos(a)); tilt = clamp(e, 0.12, 1.3); zoom = clamp(z, 0.7, 1.6); },
    orbit(dx, dy) { this.setView(yaw + dx, tilt + dy); },
    zoomBy(k) { zoom = clamp(zoom * k, 0.7, 1.6); },
    resetView() { yaw = 0.08; tilt = 0.46; zoom = 1; },
    get view() { return { yaw, tilt, zoom }; },
    attend(x, y, hoverItem) { if (x === null) { pointer.inside = false; pointer.hover = null; return; } const r = canvas.getBoundingClientRect(); pointer.inside = true; pointer.x = x - r.left; pointer.y = y - r.top; pointer.hover = hoverItem || null; },
    pick, pagePoint, screenOf, headOf,
    onFrame(fn) { frameCb = fn; },
    tapAt(n) { mechState[n].tapAt = clock; },
    burstAt(it, kind, n) { const v = new T.Vector3(); it.mech.getWorldPosition(v); v.y += it.kind === 'puppet' ? it.height * 0.7 : it.meshes[0].userData.size[1] * 0.6; if (kind === 'rain') v.y = Math.max(v.y, 2.2); effects.burst(kind, v, n); },
    get clock() { return clock; },
    editor: {
      set on(v) { editorOn = v; grid.visible = v; selBox.visible = v && !!selected; },
      get on() { return editorOn; },
      select(it) { selected = it; if (it) { selBox.setFromObject(it.holder); selBox.visible = editorOn; } else selBox.visible = false; },
      refresh() { if (selected) selBox.setFromObject(selected.holder); },
    },
  };
}
