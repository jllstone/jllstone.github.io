// 摆位编辑器：按 E（或工具栏“摆位”）打开。点选立牌/角色，拖动摆放，滚轮改高度，导出本章 JSON
import { clamp } from './util.js';

const r2 = v => Math.round(v * 100) / 100;

export function createEditor(stage, book, getIdx, getPos, toast) {
  const panel = document.getElementById('editor');
  let on = false, sel = null, dragging = null;
  const fields = ['x', 'z', 'h', 'y', 'yaw'];

  function baseH(it) { it._h0 ??= it.kind === 'puppet' ? it.height : (it.def.h); return it._h0; }
  function apply(it) {
    const d = it.def; it.x = d.x ?? 0; it.z = d.z ?? 0;
    const k = (d.h ?? baseH(it)) / baseH(it); it.art.scale.setScalar(k);
    it.height = (it.kind === 'puppet' ? baseH(it) : baseH(it)) * k + (it.kind === 'puppet' ? 0 : (d.y || 0));
    if (it.kind !== 'puppet') { it.rest.y = d.y || 0; }
    if (it.child) it.holder.position.set(d.x || 0, 0, d.z ?? 0.02);
    stage.editor.refresh();
  }
  function render() {
    const ch = book.chapters[getIdx()];
    if (!sel) { panel.querySelector('.sel').innerHTML = `<p>点一个立牌或角色来选中它。<br>拖动＝移动 · 滚轮＝改高度 · [ ]＝转向 · 方向键＝微调</p>`; }
    else {
      const d = sel.def;
      panel.querySelector('.sel').innerHTML = `<p><b>${sel.kind === 'puppet' ? '角色' : '立牌'}</b> ${sel.id}${sel.child ? '（子部件，坐标相对父立牌）' : ''}</p>` +
        `<div class="grid">${fields.filter(f => !(sel.kind === 'puppet' && f === 'y')).map(f => `<label>${f}<input data-f="${f}" type="number" step="0.05" value="${r2(d[f] ?? (f === 'h' ? baseH(sel) : 0))}"></label>`).join('')}</div>`;
    }
    panel.querySelector('pre').textContent = exportJSON(ch);
  }
  function exportJSON(ch) {
    const clean = o => { const c = { ...o }; for (const k of ['x', 'z', 'h', 'y', 'yaw']) if (typeof c[k] === 'number') c[k] = r2(c[k]); if (!c.y) delete c.y; if (!c.yaw) delete c.yaw; return c; };
    const list = a => (a || []).map(o => '    ' + JSON.stringify(clean(o))).join(',\n');
    return '"standees": [\n' + list(ch.standees) + '\n],\n"cast": [\n' + list(ch.cast) + '\n]';
  }
  panel.addEventListener('input', e => { const f = e.target.dataset.f; if (!f || !sel) return; sel.def[f] = +e.target.value; apply(sel); panel.querySelector('pre').textContent = exportJSON(book.chapters[getIdx()]); });
  panel.querySelector('[data-copy]').onclick = async () => { const t = panel.querySelector('pre'); const r = document.createRange(); r.selectNodeContents(t); const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r); try { await navigator.clipboard.writeText(t.textContent); toast('已复制本章摆位 JSON'); } catch { toast('请手动复制文本框里的内容'); } };
  panel.querySelector('[data-close]').onclick = () => toggle(false);

  function toggle(v = !on) { on = v; stage.editor.on = on; panel.hidden = !on; document.body.classList.toggle('editing', on); if (!on) { sel = null; stage.editor.select(null); } render(); }
  function select(it) { sel = it; stage.editor.select(it); render(); }

  return {
    get on() { return on; }, toggle,
    down(e, hit) {
      if (!Number.isInteger(getPos())) return;
      if (hit.kind === 'item') { select(hit.item); const p = stage.pagePoint(e.clientX, e.clientY); dragging = p && !hit.item.child ? { off: [hit.item.x - p.x, hit.item.z - p.z] } : null; }
      else { select(null); dragging = null; }
    },
    move(e) {
      if (!dragging || !sel) return; const p = stage.pagePoint(e.clientX, e.clientY); if (!p) return;
      sel.def.x = r2(clamp(p.x + dragging.off[0], -5.9, 5.9)); sel.def.z = r2(clamp(p.z + dragging.off[1], -3.4, 3.4)); apply(sel);
      const inputs = panel.querySelectorAll('input'); inputs.forEach(i => { if (i.dataset.f === 'x') i.value = sel.def.x; if (i.dataset.f === 'z') i.value = sel.def.z; });
    },
    up() { if (dragging) render(); dragging = null; },
    key(e) {
      const k = e.key;
      if (!sel) return false;
      const d = sel.def, step = e.shiftKey ? 0.25 : 0.05;
      if (k === 'ArrowLeft') d.x = r2((d.x || 0) - step); else if (k === 'ArrowRight') d.x = r2((d.x || 0) + step);
      else if (k === 'ArrowUp') d.z = r2((d.z || 0) - step); else if (k === 'ArrowDown') d.z = r2((d.z || 0) + step);
      else if (k === '[') d.yaw = r2((d.yaw || 0) - 0.05); else if (k === ']') d.yaw = r2((d.yaw || 0) + 0.05);
      else if (k === '+' || k === '=') d.h = r2((d.h ?? baseH(sel)) * 1.05); else if (k === '-') d.h = r2((d.h ?? baseH(sel)) / 1.05);
      else if (k === 'Escape') { select(null); return true; }
      else return false;
      e.preventDefault(); apply(sel); render(); return true;
    },
    wheel(e) { if (!sel) return false; const d = sel.def; d.h = r2((d.h ?? baseH(sel)) * (e.deltaY > 0 ? 0.96 : 1.04)); apply(sel); render(); return true; },
    frame() { if (on && sel) stage.editor.refresh(); },
  };
}
