// 彩蛋粒子：落叶、星光、爱心、花瓣、雨滴、泡泡、音符、彩纸
import * as T from '../vendor/three.module.min.js';

const SHAPES = {
  leaves: (g, c) => { g.fillStyle = c; g.beginPath(); g.moveTo(8, 32); g.quadraticCurveTo(32, 2, 56, 32); g.quadraticCurveTo(32, 62, 8, 32); g.fill(); g.strokeStyle = 'rgba(80,50,30,.5)'; g.lineWidth = 2; g.beginPath(); g.moveTo(10, 32); g.lineTo(54, 32); g.stroke(); },
  sparkle: (g, c) => { g.fillStyle = c; g.beginPath(); for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4, r = i % 2 ? 9 : 30; g.lineTo(32 + Math.cos(a) * r, 32 + Math.sin(a) * r); } g.fill(); },
  hearts: (g, c) => { g.fillStyle = c; g.beginPath(); g.moveTo(32, 54); g.bezierCurveTo(4, 34, 10, 8, 32, 22); g.bezierCurveTo(54, 8, 60, 34, 32, 54); g.fill(); },
  petals: (g, c) => { g.fillStyle = c; g.beginPath(); g.ellipse(32, 32, 26, 13, 0.5, 0, Math.PI * 2); g.fill(); },
  rain: (g, c) => { g.fillStyle = c; g.beginPath(); g.moveTo(32, 6); g.quadraticCurveTo(50, 40, 32, 58); g.quadraticCurveTo(14, 40, 32, 6); g.fill(); },
  bubbles: (g, c) => { g.strokeStyle = c; g.lineWidth = 5; g.beginPath(); g.arc(32, 32, 22, 0, Math.PI * 2); g.stroke(); g.fillStyle = 'rgba(255,255,255,.7)'; g.beginPath(); g.arc(24, 24, 5, 0, 7); g.fill(); },
  notes: (g, c) => { g.fillStyle = c; g.beginPath(); g.ellipse(22, 46, 11, 8, -0.4, 0, 7); g.fill(); g.fillRect(30, 10, 5, 36); g.fillRect(30, 10, 18, 6); },
  confetti: (g, c) => { g.fillStyle = c; g.fillRect(14, 22, 36, 20); },
};
const COLORS = {
  leaves: ['#c98a3e', '#9bad5c', '#d8a548', '#7d9a55'], sparkle: ['#ffe39a', '#fff2c4', '#f6c75e'], hearts: ['#e0675a', '#f08b7a', '#f3a0a0'],
  petals: ['#f4b6c2', '#fbe0e6', '#f1c96b'], rain: ['#8fc1d4', '#b7d9e6'], bubbles: ['#bfe3f0', '#e8f6fb'], notes: ['#3f5b6a', '#c65138', '#4d7c5d'],
  confetti: ['#e3593d', '#f2c14e', '#4f9d8a', '#7a8fd0', '#f4a259'],
};
const textures = new Map();
function tex(kind, color) {
  const key = kind + color; if (textures.has(key)) return textures.get(key);
  const c = document.createElement('canvas'); c.width = c.height = 64; (SHAPES[kind] || SHAPES.sparkle)(c.getContext('2d'), color);
  const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; textures.set(key, t); return t;
}

export function createEffects(scene) {
  const group = new T.Group(); scene.add(group);
  const live = [], geo = new T.PlaneGeometry(1, 1);
  function burst(kind, at, n = 14) {
    kind = SHAPES[kind] ? kind : 'sparkle';
    const cols = COLORS[kind];
    for (let i = 0; i < n; i++) {
      const m = new T.Mesh(geo, new T.MeshBasicMaterial({ map: tex(kind, cols[i % cols.length]), transparent: true, depthWrite: false, side: T.DoubleSide }));
      const a = Math.random() * Math.PI * 2, sp = 0.6 + Math.random();
      const p = { m, age: 0, life: 1.6 + Math.random() * 1.2, spin: (Math.random() - 0.5) * 6, size: 0.16 + Math.random() * 0.12, kind,
        v: new T.Vector3(Math.cos(a) * sp, 1.4 + Math.random() * 1.6, Math.sin(a) * sp * 0.6) };
      if (kind === 'rain') { p.v.set((Math.random() - .5) * .2, -2.2 - Math.random(), 0); m.position.set(at.x + (Math.random() - .5) * 1.4, at.y, at.z + (Math.random() - .5) * .5); p.life = 0.9 + Math.random() * .4; p.age = -Math.random() * .8; }
      else if (kind === 'hearts' || kind === 'bubbles' || kind === 'notes') { p.v.set((Math.random() - .5) * .6, .7 + Math.random() * .6, (Math.random() - .5) * .3); m.position.copy(at); p.age = -i * 0.07; }
      else m.position.copy(at);
      m.scale.setScalar(p.size); m.visible = p.age >= 0; group.add(m); live.push(p);
    }
  }
  function update(dt, camera) {
    for (let i = live.length - 1; i >= 0; i--) {
      const p = live[i]; p.age += dt; if (p.age < 0) continue; p.m.visible = true;
      const g = p.kind === 'leaves' || p.kind === 'petals' ? 1.1 : p.kind === 'confetti' ? 2.6 : p.kind === 'sparkle' ? 0 : p.kind === 'rain' ? 0 : -0.2;
      p.v.y -= g * dt; if (p.kind === 'leaves' || p.kind === 'petals') { p.v.multiplyScalar(1 - dt * 1.6); p.v.x += Math.sin(p.age * 5 + i) * dt * 1.5; }
      if (p.kind === 'sparkle') p.v.multiplyScalar(1 - dt * 3);
      p.m.position.addScaledVector(p.v, dt);
      p.m.quaternion.copy(camera.quaternion); p.m.rotateZ(p.age * p.spin);
      const k = p.age / p.life, fade = Math.min(1, (1 - k) * 4);
      p.m.material.opacity = fade; if (p.kind === 'sparkle') p.m.scale.setScalar(p.size * (1.2 - k));
      if (k >= 1) { group.remove(p.m); p.m.material.dispose(); live.splice(i, 1); }
    }
  }
  return { burst, update, get busy() { return live.length > 0; } };
}
