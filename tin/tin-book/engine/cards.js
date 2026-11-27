// 纸片：插画立牌（standee）与分件角色（puppet）
import * as T from '../vendor/three.module.min.js';
import { prepareCut, grainCanvas, clamp, beat, TAU } from './util.js';

let grainTex = null;
export function grain() {
  if (!grainTex) { grainTex = new T.CanvasTexture(grainCanvas()); grainTex.wrapS = grainTex.wrapT = T.RepeatWrapping; }
  return grainTex;
}

// 正面印着插画，背面是素纸；整体叠一层纸纤维颗粒
export function cardMaterial(tex, back = '#efe2c4') {
  const m = new T.MeshLambertMaterial({ map: tex, alphaTest: 0.5, side: T.DoubleSide });
  const uniforms = { paperGrain: { value: grain() }, paperBack: { value: new T.Color(back) } };
  m.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, uniforms);
    sh.fragmentShader = 'uniform sampler2D paperGrain;\nuniform vec3 paperBack;\n' + sh.fragmentShader.replace('#include <map_fragment>',
      `#include <map_fragment>
       float fibre = texture2D(paperGrain, vMapUv * 3.3).r;
       if (!gl_FrontFacing) diffuseColor.rgb = paperBack;
       diffuseColor.rgb *= 0.9 + 0.17 * fibre;`);
  };
  m.customProgramCacheKey = () => 'paper-card-v1';
  return m;
}

function texture(cut) {
  const t = new T.CanvasTexture(cut.canvas);
  t.colorSpace = T.SRGBColorSpace; t.anisotropy = 8; t.generateMipmaps = true;
  return t;
}

// 一张纸片网格。pivot = [从左算的比例, 从上算的比例]，默认底边中点。
export function cardMesh(cut, height, pivot = [0.5, 1], back) {
  const w = height * cut.w / cut.h, h = height;
  const geo = new T.PlaneGeometry(w, h);
  geo.translate(-(pivot[0] - 0.5) * w, -(0.5 - pivot[1]) * h, 0);
  const tex = texture(cut), mesh = new T.Mesh(geo, cardMaterial(tex, back));
  mesh.customDepthMaterial = new T.MeshDepthMaterial({ depthPacking: T.RGBADepthPacking, map: tex, alphaTest: 0.5 });
  mesh.castShadow = mesh.receiveShadow = true;
  mesh.userData.cut = cut; mesh.userData.size = [w, h]; mesh.userData.pivot = pivot;
  return mesh;
}

const flatMats = new Map();
function flat(color) { if (!flatMats.has(color)) flatMats.set(color, new T.MeshLambertMaterial({ color, side: T.DoubleSide })); return flatMats.get(color); }

/**
 * 立牌节点结构： holder（贴在书页上）→ hinge（底边折痕，负责折起/放倒）→ art（摆位偏移、常态动画）→ mech（机关驱动）→ 纸片
 */
export async function makeStandee(def, opts) {
  const cut = await prepareCut(def.src, { edge: def.edge ?? opts.edge, paper: opts.paperEdge, maxSide: def.maxSide ?? 1024 });
  const pivot = def.pivot || [0.5, 1];
  const holder = new T.Group(), hinge = new T.Group(), art = new T.Group(), mech = new T.Group();
  holder.add(hinge); hinge.add(art); art.add(mech);
  const mesh = cardMesh(cut, def.h, pivot, opts.paperBack);
  if (def.flip) mesh.scale.x = -1;
  mech.add(mesh);
  if (def.type === 'cross') { // 十字插片：两张同图交叉，转动视角时仍有体积
    const m2 = cardMesh(cut, def.h, pivot, opts.paperBack); m2.rotation.y = Math.PI / 2; mech.add(m2);
  }
  const [w] = mesh.userData.size;
  const lift = def.y || 0;
  art.position.y = lift; art.rotation.order = 'YXZ'; art.rotation.set(def.pitch || 0, def.yaw || 0, 0);
  if (!def.parent) {
    if (lift > 0.05 && def.stick !== false) { // 悬空的云、太阳用一根纸杆撑住
      const stick = new T.Mesh(new T.BoxGeometry(0.045, lift, 0.018), flat(opts.stick));
      stick.position.set(0, lift / 2, -0.03); stick.castShadow = true; hinge.add(stick);
    }
    if (def.tab !== false && lift < 0.05) { // 底部折舌，平贴在纸面
      const bw = Math.max(0.12, (cut.base[1] - cut.base[0]) * w * 0.92), tw = bw * 0.82;
      const shape = new T.Shape([new T.Vector2(-bw / 2, 0), new T.Vector2(bw / 2, 0), new T.Vector2(tw / 2, -0.16), new T.Vector2(-tw / 2, -0.16)]);
      const tab = new T.Mesh(new T.ShapeGeometry(shape), flat(opts.tab));
      tab.rotation.x = -Math.PI / 2; tab.position.set(((cut.base[0] + cut.base[1]) / 2 - 0.5) * w, 0.004, -0.005); tab.receiveShadow = true;
      if ((def.z || 0) < -0.1) tab.rotation.z = Math.PI; // 往前折的立牌，折舌朝后
      holder.add(tab);
    }
  }
  const item = {
    kind: 'standee', id: def.id, def, holder, hinge, art, mech, meshes: [mesh, ...mech.children.filter(c => c !== mesh)],
    x: def.x || 0, z: def.z || 0, height: def.h + lift, halfWidth: w / 2,
    rest: { x: 0, y: lift, z: 0 }, rise: 1, reveal: def.hidden ? 0 : 1, hidden: !!def.hidden,
  };
  for (const m of item.meshes) m.userData.item = item;
  return item;
}

// ───────────── 分件角色 ─────────────
const ROLE_ORDER = ['tail', 'legL', 'legR', 'armL', 'body', 'head', 'earL', 'earR', 'eyes', 'armR'];

function autoPivot(role, b, body) {
  const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
  switch (role) {
    case 'body': return [cx, b.y + b.h];
    case 'head': return [cx, b.y + b.h * 0.9];
    case 'eyes': return [cx, cy];
    case 'earL': case 'earR': case 'hat': return [cx, b.y + b.h * 0.92];
    case 'armL': case 'armR': { const s = body ? Math.sign(body.cx - cx) : (role === 'armL' ? 1 : -1); return [cx + s * b.w * 0.22, b.y + b.h * 0.12]; }
    case 'legL': case 'legR': return [cx, b.y + b.h * 0.15];
    case 'tail': return body ? [clamp(body.cx, b.x, b.x + b.w), clamp(body.cy, b.y, b.y + b.h)] : [cx, cy];
    default: return [cx, cy];
  }
}

/**
 * 角色：每个部件导出为“同一画布尺寸”的透明 PNG（不要裁切），引擎自动找出位置与旋转轴心。
 * def: { name, dir, parts:[...从后到前], h, pivots:{部件:[x,y]}, edge }
 */
export async function makePuppet(id, def, place, opts) {
  const parts = def.parts || ROLE_ORDER;
  const cuts = await Promise.all(parts.map(p => prepareCut(def.dir + p + (def.ext || '.png'), { edge: def.edge ?? 4, paper: opts.paperEdge, maxSide: 768 })));
  const boxes = cuts.map(c => c.crop);
  const U = { x0: Math.min(...boxes.map(b => b.x)), y0: Math.min(...boxes.map(b => b.y)), x1: Math.max(...boxes.map(b => b.x + b.w)), y1: Math.max(...boxes.map(b => b.y + b.h)) };
  const height = place.h || def.h || 1.2, s = height / (U.y1 - U.y0);
  const feet = [(U.x0 + U.x1) / 2, U.y1];
  const bi = parts.indexOf('body'), bodyBox = bi >= 0 ? boxes[bi] : null;
  const body = bodyBox ? { cx: bodyBox.x + bodyBox.w / 2, cy: bodyBox.y + bodyBox.h / 2 } : null;
  const holder = new T.Group(), hinge = new T.Group(), art = new T.Group(), rig = new T.Group();
  holder.add(hinge); hinge.add(art); art.add(rig);
  const joints = {}, pivots = {}, meshes = [];
  parts.forEach((role, i) => {
    const b = boxes[i], cut = cuts[i];
    pivots[role] = def.pivots?.[role] || autoPivot(role, b, body);
  });
  parts.forEach((role, i) => {
    const b = boxes[i], cut = cuts[i], P = pivots[role];
    const parentRole = role === 'eyes' || role === 'earL' || role === 'earR' || role === 'hat' ? (pivots.head ? 'head' : null) : null;
    const PP = parentRole ? pivots[parentRole] : feet;
    const g = new T.Group();
    (parentRole ? joints[parentRole] : rig).add(g);
    g.position.set((P[0] - PP[0]) * s, (PP[1] - P[1]) * s, parentRole ? 0.006 : i * 0.007);
    const ph = (cut.h / cut.crop.k) * s, cx = b.x + b.w / 2, cy = b.y + b.h / 2;
    const mesh = cardMesh(cut, ph, [0.5, 0.5], opts.paperBack);
    mesh.position.set((cx - P[0]) * s, (P[1] - cy) * s, 0);
    g.add(mesh); joints[role] = g; meshes.push(mesh);
  });
  if (place.flip) rig.scale.x = -1;
  art.rotation.y = place.yaw || 0;
  const item = {
    kind: 'puppet', id: place.id || id, who: id, name: def.name || id, def: place, holder, hinge, art, mech: rig, rig, joints, meshes,
    x: place.x || 0, z: place.z || 0, height, halfWidth: (U.x1 - U.x0) * s / 2, rise: 1, reveal: place.hidden ? 0 : 1, hidden: !!place.hidden,
    eyesRest: joints.eyes ? joints.eyes.position.clone() : null, rest: { x: 0, y: 0, z: 0 }, gaze: { x: 0, y: 0 }, react: 99, phase: (place.x || 0) * 0.7, headTop: height,
    sayIndex: 0,
  };
  for (const m of meshes) m.userData.item = item;
  return item;
}

function stride(t, out, hold, back) {
  if (t < out) return t / out < 0 ? 0 : (t / out) * (t / out) * (3 - 2 * t / out);
  if (t < out + hold) return 1;
  const u = clamp((t - out - hold) / back); return 1 - u * u * (3 - 2 * u);
}

// 角色常态动画：呼吸、眨眼、视线跟随、走动/蹦跳/挥手；被点到时跳一下并挥手
export function posePuppet(a, time, w, hover) {
  const j = a.joints, idle = a.def.idle || 'breathe', t = time + a.phase;
  let x = 0, y = 0, lean = 0, turn = 0, head = 0, armR = 0, armL = 0, legs = 0;
  if (idle === 'walk') {
    const cyc = t % 7, trip = stride(cyc, 1.6, 1.8, 1.6), walking = cyc < 1.6 || (cyc > 3.4 && cyc < 5);
    const step = walking ? Math.sin(t * 12) : 0;
    x = trip * (a.def.walk ?? 0.7); y = Math.abs(step) * 0.06; legs = step * 0.5; armL = -step * 0.3; armR = step * 0.3; lean = step * 0.04;
    turn = (walking ? (cyc < 1.6 ? 1 : -1) : 0) * 0.35;
  } else if (idle === 'hop') {
    const h = beat(t % 4.2, 0, 0.55) + 0.6 * beat(t % 4.2, 0.65, 1.05);
    y = h * 0.22; legs = h * 0.4; armR = h * 0.5; armL = -h * 0.5; lean = -h * 0.08;
  } else if (idle === 'wave') {
    const g = beat(t % 5.5, 1, 3.2); armR = g * (1.1 + 0.35 * Math.sin(t * 11)); head = -g * 0.12;
  } else if (idle === 'look') {
    head = Math.sin(t * 0.7) * 0.18; turn = Math.sin(t * 0.5) * 0.25;
  }
  // 被点到
  const r = a.react, pop = beat(r, 0, 0.6) + 0.5 * beat(r, 0.7, 1.15), salute = beat(r, 0, 1.6);
  y += pop * 0.28; armR += salute * 1.3; head += salute * -0.15; legs += pop * 0.3;
  const breathe = Math.sin(t * 2.3) * 0.012;
  a.rig.position.set(x * w, y * w, 0);
  a.rig.rotation.set(0, (turn + a.gaze.x * 0.18) * w, (lean + hover * 0.05) * w);
  a.rig.scale.y = 1 + breathe * w;
  if (j.head) j.head.rotation.set((-a.gaze.y * 0.12) * w, a.gaze.x * 0.3 * w, (head + a.gaze.x * -0.1 + hover * 0.08) * w);
  // 手臂“向外抬”的方向取决于它在身体哪一侧
  if (j.armR) j.armR.rotation.z = armR * w * (j.armR.position.x >= 0 ? 1 : -1);
  if (j.armL) j.armL.rotation.z = armL * w * (j.armL.position.x >= 0 ? 1 : -1);
  if (j.legL) j.legL.rotation.z = legs * w;
  if (j.legR) j.legR.rotation.z = -legs * w;
  if (j.tail) j.tail.rotation.z = (Math.sin(t * 4.1) * 0.22 + salute * 0.4) * w;
  if (j.earL) j.earL.rotation.z = (Math.sin(t * 1.7) * 0.05 + pop * 0.2) * w;
  if (j.earR) j.earR.rotation.z = (-Math.sin(t * 1.7 + 1) * 0.05 - pop * 0.2) * w;
  if (j.eyes && a.eyesRest) {
    j.eyes.position.copy(a.eyesRest); j.eyes.position.x += a.gaze.x * 0.035 * w; j.eyes.position.y += a.gaze.y * 0.02 * w;
    j.eyes.scale.y = 1 - 0.88 * beat((t + 0.3) % 3.7, 3.25, 3.45) * w;
  }
}

// 立牌常态动画：摇摆、漂浮、上下浮动、绕圈飞、慢转、呼吸
export function ambient(item, t, w) {
  const kind = item.def.anim; if (!kind) return;
  const a = item.art, ph = item.x * 0.9 + item.z, s = item.def.animStrength ?? 1;
  const shake = item.shake > 0 ? Math.sin(item.shake * 26) * item.shake * 0.5 : 0;
  a.rotation.z = shake * 0.4;
  switch (kind) {
    case 'sway': a.rotation.z += Math.sin(t * 1.1 + ph) * 0.07 * s * w; break;
    case 'drift': a.position.x = item.rest.x + Math.sin(t * 0.35 + ph) * 0.35 * s * w; a.rotation.z += Math.sin(t * 0.5 + ph) * 0.03 * w; break;
    case 'bob': a.position.y = item.rest.y + (Math.sin(t * 1.6 + ph) * 0.06) * s * w; a.rotation.z += Math.sin(t * 1.3 + ph) * 0.08 * s * w; break;
    case 'float': a.position.y = item.rest.y + Math.sin(t * 1.2 + ph) * 0.12 * s * w; break;
    case 'spin': item.mech.rotation.z = t * 0.6 * s * w; break;
    case 'pulse': item.mech.scale.setScalar(1 + Math.sin(t * 2.4 + ph) * 0.05 * s * w); break;
    case 'fly': { const v = t * 0.7 * s + ph; a.position.set(Math.sin(v) * 1.2 * w, item.rest.y + (0.3 * Math.sin(v * 2)) * w, Math.cos(v) * 0.5 * w); a.rotation.y = (item.def.yaw || 0) + Math.cos(v) * 0.6 * w; a.rotation.z += Math.sin(v * 6) * 0.08; break; }
  }
}
