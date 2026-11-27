// 现场合成的纸张与铃声音效（不需要音频文件）；也可以在 book.json 里换成自己的音频
let ctx = null;
const files = {};
export function useFiles(map = {}) { for (const [k, v] of Object.entries(map)) { const a = new Audio(v); a.preload = 'auto'; files[k] = a; } }
function ac() { ctx ||= new (window.AudioContext || window.webkitAudioContext)(); ctx.resume?.().catch(() => {}); return ctx; }
function env(c, t, peak, len) { const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + len); g.connect(c.destination); return g; }
function tone(c, t, f, len, peak, type = 'sine', bend = 1) { const o = c.createOscillator(), g = env(c, t, peak, len); o.type = type; o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(f * bend, t + len); o.connect(g); o.start(t); o.stop(t + len + 0.02); }
export function play(kind) {
  try {
    if (files[kind]) { const a = files[kind].cloneNode(); a.volume = 0.7; a.play().catch(() => {}); return; }
    const c = ac(), t = c.currentTime;
    if (kind === 'turn') {
      const b = c.createBuffer(1, c.sampleRate * 0.28, c.sampleRate), d = b.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(Math.sin(Math.PI * i / d.length), 1.5);
      const s = c.createBufferSource(), f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1900; f.Q.value = 0.7;
      s.buffer = b; s.connect(f); f.connect(env(c, t, 0.06, 0.3)); s.start(t);
    } else if (kind === 'chime') { tone(c, t, 1318, 1.2, 0.05); tone(c, t + 0.005, 1975, 0.9, 0.025); tone(c, t + 0.01, 2637, 0.6, 0.012); }
    else if (kind === 'tap') tone(c, t, 660, 0.16, 0.04, 'triangle', 1.25);
    else if (kind === 'pop') { tone(c, t, 420, 0.12, 0.05, 'sine', 2.2); }
    else if (kind === 'creak') tone(c, t, 140, 0.25, 0.03, 'sawtooth', 0.8);
    else if (kind === 'success') [523, 659, 784, 1046].forEach((f, i) => tone(c, t + i * 0.09, f, 0.5, 0.04, 'triangle'));
    else if (kind === 'wrong') tone(c, t, 300, 0.25, 0.04, 'triangle', 0.7);
  } catch { /* 音频不可用时静默 */ }
}
