/* 成器 · levels.js — 八幕关卡（序 + 七道工序），第二版。
 *
 * boxes : [x0,y0,z0, x1,y1,z1, 材质键]   实心块（含端点）
 *         材质键：rk 石 · cu 古铜（带铜绿）· cuL 新铜 · wd 旧木 · au 金 · en / en2 釉 · rg 氧化渣 · kl 窑砖
 * walk  : [x,y,z] 或区间；'m' 幻砖（视错觉连通）· {goal:1} 阿蓝的门 · {goal2:1} 师傅的门
 *         {plate:{part,to}} 一次性踏板 · {hold:'partId'} 托举踏板（有人站着，对应的路才在）
 * stairs: [x,y,z,'-z']
 * 机关  : kind 'rot' | 'slide'；handles 可拖拽金珠；follow 联动；hold 托举
 *         glaze:{need:[[丝id,状态],...]}  丝格：金丝合拢才能灌釉；金丝一走，釉就散回空框
 *         rough:1 氧化渣，磨光后可走 · onlyA:1 只有阿蓝能走 · collapse:{on:[部件...],to} 两人都到了，身后的路就塌
 *         wire:{len,dir} 转动的金丝 · rail:{len,dir} 沿轨滑动的金丝
 * deco  : 摆件一律放在不可走的格子上（求解器会检查）
 * 布局守则：越高的结构越靠 -x/-z；视错觉边只发生在“近处更高”的两块幻砖之间。
 * 情绪弧线：克制微光（序—三）→ 暗场与围困（四—六）→ 窑火重燃（七）。
 */
(function (root) {
  'use strict';
  // 釉色取景泰蓝真实色谱：松石绿、珊瑚红、明黄、青金蓝、宝石蓝、翠绿、粉；金丝勾边
  var BASE = {
    cu: '#9a6744', cuL: '#c48a5c', patina: '#5fa596', au: '#d9b45a', auL: '#ffe9b0', en: '#3fb6a8', en2: '#e0786a',
    rg: '#5e5a56', kl: '#a8503a', rk: '#6f7590', wd: '#8a6e58', glow: '#ffd98a', ink: '#efe8da', fire: '#ff8a3c', dark: 1
  };
  function pal(o) { var p = {}, k; for (k in BASE) p[k] = BASE[k]; for (k in o) p[k] = o[k]; return p; }

  var LEVELS = [
    // ───────────────────────── 序 · 寻矿 ─────────────────────────
    {
      name: '寻矿', gift: '色样', vase: '器，有了颜色。', no: '序', poem: '空着的地方，才好落第一笔。', end: '他把那点颜色，揣进了怀里。',
      start: [6, 0, 6], start2: [6, 0, 5], duo: 'follow', band: 0,
      hints: [['轻点地面，阿蓝会走过去', 'walk'], ['踩上发光的矿脉', 'plate'], ['拖动金珠，升起铜台', 'part']],
      pal: pal({ sky: ['#232c4a', '#454c70', '#8a7f95'], mist: '#6f7aa0', fog: '#323b5e', key: [0.55, 0.78, 0.3], keyC: '#efe8ff', amb: 0.46, fx: 'mote', stars: 0.3 }),
      music: { ch: 0 },
      parts: [
        { id: 'base',
          boxes: [[4, -6, 4, 6, 0, 6, 'rk'], [7, -6, 4, 7, -1, 5, 'rk'], [-2, -6, 2, -1, 2, 4, 'rk'], [-3, -6, 3, -3, 1, 4, 'rk'], [-2, -6, 1, -2, 3, 1, 'rk']],
          walk: [[5, 0, 4, 6, 0, 6], [4, 0, 5, 4, 0, 6], [4, 0, 4, { plate: { part: 'vein', to: 0 } }],
            [-1, 2, 3, -1, 2, 4], [-2, 2, 3, -2, 2, 4], [-1, 2, 2, { plate: { part: 'rise', to: 0 } }], [-2, 3, 1, { goal: 1 }]],
          deco: [['ore', 4, 0, 4, 'en'], ['ore', -1, 2, 2, 'en2'], ['crystal', 7, -1, 4.6], ['crystal', -3, 1, 3.6], ['door', -2, 3, 1]] },
        { id: 'vein', kind: 'slide', axis: 'y', min: -6, max: 0, state: -6, boxes: [[1, -5, 4, 3, 0, 4, 'rk']], walk: [[1, 0, 4, 3, 0, 4]], deco: [['vein', 1, 0, 4, 3]] },
        { id: 'lift', kind: 'slide', axis: 'y', min: 0, max: 2, state: 0, boxes: [[0, -8, 4, 0, 0, 4, 'cu']], walk: [[0, 0, 4]], handles: [[0, 0.1, 4.62]] },
        { id: 'rise', kind: 'slide', axis: 'y', min: -5, max: 0, state: -5, stairs: [[-2, 3, 2, '-z']] }
      ]
    },
    // ───────────────────────── 一 · 制胎 ─────────────────────────
    {
      name: '制胎', gift: '铜胎', vase: '器，有了骨。', no: '一', poem: '屋子空了，炉还是冷的。', end: '敲了一夜，师傅没说一句话。',
      start: [-1, 0, 0], start2: [-1, 0, 1], duo: 'follow', band: 1,
      hints: [['拖动金珠，转动铜胎', 'part'], ['看起来相连的地方，就走得过去', 'time']],
      pal: pal({ sky: ['#211d1a', '#3e342c', '#6e5a48'], mist: '#86705a', fog: '#2e2620', key: [-0.35, 0.86, 0.38], keyC: '#e6eeff', amb: 0.42, fx: 'dust', skylight: 1 }),
      music: { ch: 1 },
      parts: [
        { id: 'base',
          boxes: [[-1, -6, -1, 1, 0, 1, 'wd'], [3, -6, 0, 3, -1, 0, 'cu'], [6, -6, 5, 6, 3, 7, 'cu'], [5, -6, 7, 5, 3, 7, 'wd'], [2, -6, 7, 4, 4, 7, 'wd']],
          walk: [[-1, 0, 0, 1, 0, 1], [6, 3, 5, 'm'], [6, 3, 6], [6, 3, 7], [3, 4, 7, 4, 4, 7], [2, 4, 7, { goal: 1 }]],
          stairs: [[5, 4, 7, '-x']],
          deco: [['scrap', -1, 0, -1], ['anvil', 1, 0, -1], ['door', 2, 4, 7], ['vase', 0, 0, -1]] },
        { id: 'arm', kind: 'rot', axis: 'y', pivot: [3, 0, 0], state: 1, thin: 1,
          boxes: [[2, 0, 0, 4, 0, 0, 'cuL']], walk: [[2, 0, 0, 'm'], [3, 0, 0], [4, 0, 0, 'm']], handles: [[3, 0.3, 1], [3, 0.3, -1]], deco: [['hub', 3, 0, 0]] }
      ]
    },
    // ───────────────────────── 二 · 掐丝 ─────────────────────────
    // 一根沿轨滑动的金丝，一次只合得住一个丝格：走过去的釉格会在身后散掉，回程要自己想好。
    {
      name: '掐丝', gift: '金丝', vase: '器，有了纹。', no: '二', poem: '师傅的手，比从前慢了。', end: '旧的样子走到头了。剩下的，得自己走。',
      start: [8, 0, 5], start2: [8, 0, 4], duo: 'follow', band: 2,
      hints: [['沿着轨道拖动金丝，让丝格合拢', 'part'], ['丝格合拢后，轻点它灌釉', 'fill'], ['金丝一走，身后的釉就散了', 'time']],
      pal: pal({ sky: ['#122a33', '#204a54', '#4f7d7a'], mist: '#4f8a86', fog: '#183238', key: [0.45, 0.8, -0.4], keyC: '#fff4dc', amb: 0.46, fx: 'mote', en: '#3e8fd6', en2: '#3fb6a8' }),
      music: { ch: 2 },
      parts: [
        { id: 'base',
          boxes: [[7, -6, 3, 8, 0, 5, 'cu'], [5, -6, 3, 5, 0, 4, 'cu'], [3, -6, 4, 3, 0, 4, 'cu'], [0, -6, 3, 1, 0, 5, 'cu'], [5, -6, 0, 5, 0, 1, 'cu'], [4, -6, -1, 6, 1, -1, 'cu'], [9, -6, 3, 9, 0, 3, 'cu']],
          walk: [[7, 0, 3, 8, 0, 5], [5, 0, 3, 5, 0, 4], [3, 0, 4], [0, 0, 3, 1, 0, 4], [1, 0, 5], [0, 0, 5, { plate: { part: 'stair', to: 0 } }], [5, 0, 1], [5, 1, -1, { goal: 1 }], [4, 1, -1], [6, 1, -1]],
          deco: [['door', 5, 1, -1], ['spool', 9, 0, 3]] },
        { id: 'a', glaze: { need: [['w', 0]] }, boxes: [[6, 0, 4, 6, 0, 4, 'en']], walk: [[6, 0, 4]] },
        { id: 'b', glaze: { need: [['w', -2]] }, boxes: [[4, 0, 4, 4, 0, 4, 'en']], walk: [[4, 0, 4]] },
        { id: 'c', glaze: { need: [['w', -4]] }, boxes: [[2, 0, 4, 2, 0, 4, 'en2']], walk: [[2, 0, 4]] },
        { id: 'd', glaze: { need: [['w2', 0]] }, boxes: [[5, 0, 2, 5, 0, 2, 'en2']], walk: [[5, 0, 2]] },
        { id: 'w', kind: 'slide', axis: 'x', min: -4, max: 0, state: -2, rail: { from: [1.5, 0, 4.5], to: [6.5, 0, 4.5] }, wire: { len: 1, dir: [-1, 0, 0], at: [6.5, 0, 4.5] }, handles: [[6, 0.3, 4.75]] },
        { id: 'w2', kind: 'rot', axis: 'y', pivot: [5.5, 0, 1.5], state: 1, wire: { len: 1, dir: [0, 0, 1] }, handles: [[5.5, 0.3, 2.5]] },
        { id: 'stair', kind: 'slide', axis: 'y', min: -6, max: 0, state: -6, stairs: [[5, 1, 0, '-z']] }
      ]
    },
    // ───────────────────────── 三 · 点蓝 ─────────────────────────
    // 一根金丝绕着中庭转，三格丝格轮流合拢：先去右边踩亮机关，再折回来换左边。
    {
      name: '点蓝', gift: '釉', vase: '器，有了蓝。', no: '三', poem: '外面又响了一夜。', end: '师傅的手抖了一下。阿蓝装作没看见。',
      start: [7, 0, 6], start2: [7, 0, 7], duo: 'follow', band: 3,
      hints: [['一根金丝，围得住三格，却一次只合得住一格', 'time']],
      pal: pal({ sky: ['#121a30', '#22305a', '#4a5a86'], mist: '#56679a', fog: '#1a2340', key: [0.5, 0.82, 0.25], keyC: '#e6efff', amb: 0.44, fx: 'mote', moon: 1, en: '#3fb6a8', en2: '#e0786a' }),
      music: { ch: 3 },
      parts: [
        { id: 'base',
          boxes: [[6, -6, 5, 8, 0, 7, 'cu'], [2, -6, 6, 2, 0, 6, 'cu'], [1, -6, 1, 3, 0, 2, 'cu'], [-2, -6, 5, -1, 0, 6, 'cu'], [-3, -6, 6, -3, 0, 6, 'cu'], [-5, -6, 4, -4, 1, 6, 'cu'], [9, -6, 5, 9, 0, 5, 'cu']],
          walk: [[6, 0, 5, 8, 0, 7], [2, 0, 6], [1, 0, 1, 3, 0, 1], [1, 0, 2], [3, 0, 2], [2, 0, 2, { plate: { part: 'rise', to: 0 } }], [-2, 0, 5, -1, 0, 6],
            [-4, 1, 6], [-5, 1, 5, -5, 1, 6], [-4, 1, 5, { goal: 1 }]],
          deco: [['pots', 9, 0, 5], ['door', -4, 1, 5], ['crystal', -4, 1, 4]] },
        { id: 'a', glaze: { need: [['w', 0]] }, boxes: [[3, 0, 6, 5, 0, 6, 'en']], walk: [[3, 0, 6, 5, 0, 6]] },
        { id: 'b', glaze: { need: [['w', 1]] }, boxes: [[2, 0, 3, 2, 0, 5, 'en2']], walk: [[2, 0, 3, 2, 0, 5]] },
        { id: 'c', glaze: { need: [['w', 2]] }, boxes: [[0, 0, 6, 1, 0, 6, 'en']], walk: [[0, 0, 6, 1, 0, 6]] },
        { id: 'w', kind: 'rot', axis: 'y', pivot: [2.5, 0, 5.5], state: 3, wire: { len: 3, dir: [1, 0, 0] }, handles: [[5.5, 0.3, 5.5]] },
        { id: 'rise', kind: 'slide', axis: 'y', min: -6, max: 0, state: -6, stairs: [[-3, 1, 6, '-x']] }
      ]
    },
    // ───────────────────────── 四 · 烧蓝 ─────────────────────────
    // 两人一到窑前，来路便塌进火里；镜头转成正面剖面：下层窑房里师傅守火，上层冷光里阿蓝独行。
    {
      name: '烧蓝', gift: '火', vase: '器，经了火。', no: '四', poem: '总得有人留下来。', end: '他没跟来，火还在烧。',
      start: [7, 0, 5], start2: [6, 0, 5], duo: 'ctrl', band: 4,
      side: { part: 'path', at: -14, yaw: 0, pitch: 0.2 }, negVase: { part: 'g1', at: 0, l: [-1.5], r: [7.5], y0: -3.2, y1: 7.2 },
      hints: [['先一起走到窑前', 'walk'], ['轻点人物，切换阿蓝和师傅', 'select'], ['师傅站到哪块炉砖上，哪段路就被金丝吊起来', 'hold']],
      pal: pal({ sky: ['#0b0d12', '#14161c', '#1e1a1a'], mist: '#2a2c33', fog: '#0e1015', key: [0.55, 0.75, 0.35], keyC: '#dfe8ff', amb: 0.3, fx: 'ember', beams: 1, rk: '#8a8f9c', en: '#3e8fd6', en2: '#f0c24b', kl: '#9a4532' }),
      music: { ch: 4 },
      parts: [
        { id: 'start', collapse: { on: ['kiln', 'lift', 'upper', 'g1', 'g2'], to: -14 }, kind: 'slide', axis: 'y', min: -14, max: 0, state: 0, boxes: [[6, -6, 4, 7, 0, 5, 'cu']], walk: [[6, 0, 4, 7, 0, 5]] },
        { id: 'path', collapse: { on: ['kiln', 'lift', 'upper', 'g1', 'g2'], to: -14 }, kind: 'slide', axis: 'y', min: -14, max: 0, state: 0, glaze: { need: [], filled: 1 }, boxes: [[6, 0, 2, 6, 0, 3, 'en']], walk: [[6, 0, 2, 6, 0, 3]] },
        { id: 'kiln',
          boxes: [[0, -6, 0, 6, 0, 1, 'kl'], [-1, -6, -2, 2, 0, -1, 'kl']],
          walk: [[0, 0, 0], [2, 0, 0, 3, 0, 0], [5, 0, 0, 6, 0, 0], [0, 0, 1, 6, 0, 1], [1, 0, 0, { hold: 'g1' }], [4, 0, 0, { hold: 'g2' }]],
          deco: [['kiln', 0.5, 0, -1.3]] },
        { id: 'shaft', onlyA: 1, boxes: [[8, -6, 0, 8, 4, 0, 'rk'], [-2, -6, 0, -2, 4, 0, 'rk']], walk: [] },
        { id: 'lift', onlyA: 1, kind: 'slide', axis: 'y', min: 0, max: 4, state: 0, boxes: [[7, -8, 0, 7, 0, 0, 'cu']], walk: [[7, 0, 0]], handles: [[7.62, 0.1, 0]] },
        { id: 'upper', onlyA: 1, thin: 1, boxes: [[5, 4, 0, 6, 4, 0, 'rk'], [2, 4, 0, 2, 4, 0, 'rk'], [-1, 4, 0, -1, 4, 0, 'rk']],
          walk: [[5, 4, 0, 6, 4, 0], [2, 4, 0], [-1, 4, 0, { goal: 1 }]], deco: [['door', -1, 4, 0]] },
        { id: 'g2', onlyA: 1, kind: 'slide', axis: 'y', min: -14, max: 0, state: -14, hold: { on: 0, off: -14 }, glaze: { need: [], filled: 1 }, boxes: [[3, 4, 0, 4, 4, 0, 'en']], walk: [[3, 4, 0, 4, 4, 0]] },
        { id: 'g1', onlyA: 1, kind: 'slide', axis: 'y', min: -14, max: 0, state: -14, hold: { on: 0, off: -14 }, glaze: { need: [], filled: 1 }, boxes: [[0, 4, 0, 1, 4, 0, 'en2']], walk: [[0, 4, 0, 1, 4, 0]] }
      ]
    },
    // ───────────────────────── 五 · 磨光 ─────────────────────────
    // 下沉的深井：四壁冷灰，只有亲手磨亮的台阶透出宝石蓝，一路通向井口那扇暖光的门。
    {
      name: '磨光', gift: '光', vase: '器，有了光。', no: '五', poem: '四下都是灰的。', end: '磨到后来，手就不抖了。',
      start: [4, 0, 4], duo: null, band: 5,
      hints: [['在灰黑的残阶上来回划动，把它磨亮', 'polish']],
      pal: pal({ sky: ['#16191e', '#23272e', '#353a43'], mist: '#4b515c', fog: '#14161a', key: [0.5, 0.8, 0.33], keyC: '#f4f6ff', amb: 0.34, fx: 'grit', rk: '#6c7079', en: '#1f6fe8', en2: '#2b8af2', rg: '#55524f' }),
      music: { ch: 5 },
      parts: [
        { id: 'well',
          boxes: [[2, -6, 2, 5, 0, 5, 'rk'], [-1, -6, -2, 0, 6, 6, 'rk'], [1, -6, -2, 7, 6, -1, 'rk'], [1, -6, 1, 1, 0, 4, 'rk'], [1, 1, 1, 1, 1, 1, 'rk'],
            [1, -6, 0, 3, 1, 0, 'rk'], [4, -6, 0, 4, 2, 0, 'rk'], [5, -6, 0, 6, 3, 0, 'rk'], [6, -6, 2, 6, 1, 6, 'rk'], [2, -6, 6, 5, 1, 6, 'rk']],
          walk: [[3, 0, 3, 5, 0, 5], [5, 3, 0, { goal: 1 }], [6, 3, 0]],
          stairs: [[2, 1, 4, '-x'], [1, 2, 1, '-z'], [4, 3, 0, '+x']],
          deco: [['door', 5, 3, 0], ['stones', 2, 0, 2]] },
        { id: 'r1', rough: 1, boxes: [[1, 1, 2, 1, 1, 4, 'en']], walk: [[1, 1, 2, 1, 1, 4]] },
        { id: 'r2', rough: 1, boxes: [[1, 2, 0, 3, 2, 0, 'en2']], walk: [[1, 2, 0, 3, 2, 0]] }
      ]
    },
    // ───────────────────────── 六 · 镀金 ─────────────────────────
    // 两条金路隔着夜色：师傅踩住一块，阿蓝的路才亮；可他自己的路，得等阿蓝去踩亮。
    {
      name: '镀金', gift: '金', vase: '器，镀了金。', no: '六', poem: '隔着山，也知道他在。', end: '两盏灯，朝着同一个方向。',
      start: [0, 0, 6], start2: [3, 3, 7], duo: 'ctrl', band: 6,
      hints: [['师傅踩住金砖，阿蓝的路才亮', 'hold'], ['轻点人物切换，一前一后地让路', 'select']],
      pal: pal({ sky: ['#0a0f26', '#172048', '#3a3c6e'], mist: '#3e4a86', fog: '#0c1330', key: [0.4, 0.85, 0.35], keyC: '#ffe6cc', amb: 0.52, fx: 'star', stars: 0.8, lamp: 1, en: '#f0c24b', en2: '#f0c24b' }),
      music: { ch: 6 },
      parts: [
        { id: 'low', thin: 1,
          boxes: [[0, 0, 6, 2, 0, 6, 'cu'], [5, 0, 6, 5, 0, 6, 'cu'], [8, 0, 6, 9, 0, 6, 'cu']],
          walk: [[0, 0, 6, 2, 0, 6], [5, 0, 6, { hold: 'm1' }], [8, 0, 6, { hold: 'm2' }], [9, 0, 6, { goal: 1 }]],
          deco: [['door', 9, 0, 6]] },
        { id: 'high', thin: 1,
          boxes: [[3, 3, 7, 4, 3, 7, 'cu'], [7, 3, 7, 7, 3, 7, 'cu'], [10, 3, 7, 12, 3, 7, 'cu']],
          walk: [[3, 3, 7], [4, 3, 7, { hold: 'a1' }], [7, 3, 7, { hold: 'a2' }], [10, 3, 7, 11, 3, 7], [12, 3, 7, { goal2: 1 }]],
          deco: [['door', 12, 3, 7]] },
        { id: 'a1', kind: 'slide', axis: 'y', min: -14, max: 0, state: -14, hold: { on: 0, off: -14 }, glaze: { need: [], filled: 1 }, gilt: 1, thin: 1, boxes: [[3, 0, 6, 4, 0, 6, 'en']], walk: [[3, 0, 6, 4, 0, 6]] },
        { id: 'a2', kind: 'slide', axis: 'y', min: -14, max: 0, state: -14, hold: { on: 0, off: -14 }, glaze: { need: [], filled: 1 }, gilt: 1, thin: 1, boxes: [[6, 0, 6, 7, 0, 6, 'en']], walk: [[6, 0, 6, 7, 0, 6]] },
        { id: 'm1', kind: 'slide', axis: 'y', min: -14, max: 0, state: -14, hold: { on: 0, off: -14 }, glaze: { need: [], filled: 1 }, gilt: 1, thin: 1, boxes: [[5, 3, 7, 6, 3, 7, 'en']], walk: [[5, 3, 7, 6, 3, 7]] },
        { id: 'm2', kind: 'slide', axis: 'y', min: -14, max: 0, state: -14, hold: { on: 0, off: -14 }, glaze: { need: [], filled: 1 }, gilt: 1, thin: 1, boxes: [[8, 3, 7, 9, 3, 7, 'en']], walk: [[8, 3, 7, 9, 3, 7]] }
      ]
    },
    // ───────────────────────── 七 · 复磨 ─────────────────────────
    {
      name: '复磨', gift: '器', vase: '器，成了。', no: '七', poem: '火，又着了。', end: '器，成了。',
      start: [1, 1, 6], start2: [7, 1, 2], duo: 'ctrl', band: 7,
      hints: [['这一次，换师傅为阿蓝托住路', 'hold']],
      pal: pal({ sky: ['#ffd9a0', '#f7b6a0', '#a9d3d6'], mist: '#f4c7a6', fog: '#f3dcc6', ink: '#4a3426', key: [-0.4, 0.8, -0.45], keyC: '#fff0d8', amb: 0.55, fx: 'ember', dark: 0, en: '#3a6fc4', en2: '#3fb6a8', kl: '#c0644a', cu: '#a8714a', cuL: '#d29466' }),
      music: { ch: 7 },
      parts: [
        { id: 'base',
          boxes: [[1, -6, 0, 4, 1, 2, 'cu'], [1, -6, 5, 2, 1, 6, 'cu'], [6, -6, 1, 7, 1, 2, 'cu'], [1, -6, -2, 4, 1, -1, 'kl']],
          walk: [[1, 1, 1, 1, 1, 2], [3, 1, 1, 4, 1, 2], [2, 1, 1], [2, 1, 2, { hold: 'r' }], [2, 1, 0, { goal: 1 }], [3, 1, 0, { goal2: 1 }],
            [1, 1, 5, 2, 1, 6], [6, 1, 1, 7, 1, 2]],
          deco: [['kiln', 2.5, 1, -1.3], ['book', 4, 1, 0], ['pots', 1, 1, 0]] },
        { id: 'r', kind: 'slide', axis: 'y', min: -14, max: 0, state: -14, hold: { on: 0, off: -14 }, rough: 1, onlyA: 1, boxes: [[1, 1, 3, 1, 1, 4, 'en']], walk: [[1, 1, 3, 1, 1, 4]] },
        { id: 'g', glaze: { need: [['w', 0]] }, boxes: [[5, 1, 1, 5, 1, 2, 'en2']], walk: [[5, 1, 1, 5, 1, 2]] },
        { id: 'w', kind: 'rot', axis: 'y', pivot: [4.5, 1, 0.5], state: 1, wire: { len: 1, dir: [1, 0, 0] }, handles: [[5.5, 1.3, 0.5]] }
      ]
    }
  ];
  if (typeof module !== 'undefined' && module.exports) module.exports = LEVELS; else root.SY_LEVELS = LEVELS;
})(typeof window !== 'undefined' ? window : this);
