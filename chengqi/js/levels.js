/* 成器 · levels.js — 八幕关卡（序 + 七道工序）。
 *
 * boxes : [x0,y0,z0, x1,y1,z1, 材质键]   实心块（含端点）
 *         材质键：rk 山石 · cu 古铜（带铜绿）· cuL 新铜 · wd 旧木 · au 金 · en 釉（宝石蓝）· en2 釉（孔雀蓝）· rg 氧化渣 · kl 窑砖
 * walk  : [x,y,z] 或区间；'m' 幻砖（视错觉连通）· 'h' 双晕金箔砖 · {goal:1} 阿蓝的门 · {goal2:1} 师傅的门
 *         {plate:{part,to}} 一次性踏板（矿脉/火口）· {hold:'partId'} 托举踏板（有人站着才绷紧）
 * stairs: [x,y,z,'-z']
 * 机关  : kind 'rot' | 'slide'；handles 可拖拽金珠；follow 联动；hold 托举
 *         glaze:{need:[[丝id,状态],...]}  丝格：所需金丝全部合拢才能灌釉；filled:1 为旧釉
 *         rough:1  覆着氧化渣，磨光后才可行走 · onlyA:1 只有阿蓝能走（师傅留在原地）
 *         wire:{len,dir}  可转动的金丝（不可行走，只划定丝格边界）
 * duo   : 'follow' 师傅自动跟随一步之后 · 'ctrl' 两人可分别操控（轻点人物切换）
 * 布局守则：越高的结构越靠 -x/-z；视错觉边只发生在“近处更高”的两块幻砖之间。
 */
(function (root) {
  'use strict';
  // 全局材质色（各幕可覆盖）
  // 色彩体系：景泰蓝真实的釉色谱（松石绿、珊瑚红、明黄、青金蓝、翠绿、粉、乳白）+ 金丝；
  // 天色取《纪念碑谷》式的柔和渐变，每一幕一个时辰、一组主釉色。
  var BASE = {
    cu: '#a8714a', cuL: '#d29466', patina: '#5fa596', au: '#d9b45a', auL: '#ffe9b0', en: '#3fb6a8', en2: '#e0786a',
    rg: '#6a6460', kl: '#c0644a', rk: '#a39ab5', wd: '#a7866c', glow: '#ffd98a', ink: '#4b4262', fire: '#ff8a3c'
  };
  function pal(o) { var p = {}, k; for (k in BASE) p[k] = BASE[k]; for (k in o) p[k] = o[k]; return p; }

  var LEVELS = [
    // ───────────────────────── 序 · 寻矿 ─────────────────────────
    {
      name: '寻矿', gift: '色样', vase: '器，有了颜色。', no: '序', craft: '珐琅釉以矿石研磨而成，一色一石，先要找到它', poem: '山里有一种蓝，只肯藏在石头里。', end: '第一块色样，收进了师傅的布包。',
      start: [6, 0, 6], start2: [6, 0, 5], duo: 'follow',
      hints: [['轻点地面，阿蓝会走过去', 'walk'], ['踩上发光的矿脉', 'plate'], ['拖动金珠，升起铜台', 'part'], ['把金门里的色样，交给天上那件器', 'time']],
      pal: pal({ sky: ['#c9c3e6', '#efd3d6', '#f9e2cf'], mist: '#b9b4dc', fog: '#f3dcd2', ink: '#4b4262', key: [0.55, 0.78, 0.3], keyC: '#fff1e0', amb: 0.5, fx: 'mote', en: '#3fb6a8', en2: '#e0786a' }),
      music: { ch: 0 },
      parts: [
        { id: 'base',
          boxes: [[4, -6, 4, 6, 0, 6, 'rk'], [-2, -6, 2, -1, 2, 4, 'rk'], [-2, -6, 1, -2, 3, 1, 'rk']],
          walk: [[5, 0, 4, 6, 0, 6], [4, 0, 5, 4, 0, 6], [4, 0, 4, { plate: { part: 'vein', to: 0 } }],
            [-1, 2, 3, -1, 2, 4], [-2, 2, 3, -2, 2, 4], [-1, 2, 2, { plate: { part: 'rise', to: 0 } }], [-2, 3, 1, { goal: 1 }]],
          deco: [['ore', 4, 0, 4, 'en'], ['ore', -1, 2, 2, 'en2'], ['crystal', 6.3, 0, 4.2], ['crystal', -1.6, 2, 4.4], ['door', -2, 3, 1]] },
        { id: 'vein', kind: 'slide', axis: 'y', min: -6, max: 0, state: -6, boxes: [[1, -5, 4, 3, 0, 4, 'rk']], walk: [[1, 0, 4, 3, 0, 4]], deco: [['vein', 1, 0, 4, 3]] },
        { id: 'lift', kind: 'slide', axis: 'y', min: 0, max: 2, state: 0, boxes: [[0, -8, 4, 0, 0, 4, 'cu']], walk: [[0, 0, 4]], handles: [[0, 0.1, 4.62]] },
        { id: 'rise', kind: 'slide', axis: 'y', min: -5, max: 0, state: -5, stairs: [[-2, 3, 2, '-z']] }
      ]
    },
    // ───────────────────────── 一 · 制胎 ─────────────────────────
    {
      name: '制胎', gift: '铜胎', vase: '器，有了骨。', no: '一', craft: '紫铜片剪裁、锤打、焊接，成为器物的胎骨', poem: '铜要先敲成胎，器才有骨。', end: '铜胎成形。叮当声在空屋里回了很久。',
      start: [-1, 0, 0], start2: [-1, 0, 1], duo: 'follow',
      hints: [['拖动金珠，转动铜胎', 'part'], ['看起来相连的地方，就走得过去', 'time']],
      pal: pal({ sky: ['#f2e3cf', '#f6d9c0', '#eac3a8'], mist: '#e9c9ab', fog: '#efd2bb', ink: '#5a4232', key: [-0.35, 0.86, 0.38], keyC: '#fff4e2', amb: 0.5, fx: 'dust', skylight: 1, rk: '#b8a089' }),
      music: { ch: 1 },
      parts: [
        { id: 'base',
          boxes: [[-1, -6, -1, 1, 0, 1, 'wd'], [3, -6, 0, 3, -1, 0, 'cu'], [6, -6, 5, 6, 3, 7, 'cu'], [5, -6, 7, 5, 3, 7, 'wd'], [2, -6, 7, 4, 4, 7, 'wd']],
          walk: [[-1, 0, 0, 1, 0, 1], [0, 0, -1, 1, 0, -1], [6, 3, 5, 'm'], [6, 3, 6], [6, 3, 7], [3, 4, 7, 4, 4, 7], [2, 4, 7, { goal: 1 }]],
          stairs: [[5, 4, 7, '-x']],
          deco: [['scrap', -1, 0, -1], ['anvil', 1, 0, -1], ['door', 2, 4, 7], ['lattice', 6, 1, 6, 'x'], ['lattice', 4, 2, 7, 'z'], ['vase', 0.2, 0, -0.9]] },
        { id: 'arm', kind: 'rot', axis: 'y', pivot: [3, 0, 0], state: 1, thin: 1,
          boxes: [[2, 0, 0, 4, 0, 0, 'cuL']], walk: [[2, 0, 0, 'm'], [3, 0, 0], [4, 0, 0, 'm']], handles: [[3, 0.3, 1], [3, 0.3, -1]], deco: [['hub', 3, 0, 0]] }
      ]
    },
    // ───────────────────────── 二 · 掐丝 ─────────────────────────
    {
      name: '掐丝', gift: '金丝', vase: '器，有了纹。', no: '二', craft: '扁铜丝用镊子掐成纹样，粘在胎上，围出一个个丝格', poem: '丝合拢的地方，才盛得住釉。', end: '纹样是死的，可路终究要阿蓝自己去走。',
      start: [7, 0, 5], start2: [7, 0, 4], duo: 'follow',
      hints: [['拖动金丝末端的珠子，让丝格合拢', 'part'], ['丝格合拢后，轻点它灌釉', 'fill']],
      pal: pal({ sky: ['#cfe5da', '#e8eedb', '#f6ecd2'], mist: '#bcd8c9', fog: '#e6ecd8', ink: '#3e5248', key: [0.45, 0.8, -0.4], keyC: '#fff8e6', amb: 0.5, fx: 'mote', en: '#4a8fd6', en2: '#3fb6a8' }),
      music: { ch: 2 },
      parts: [
        { id: 'base',
          boxes: [[5, -6, 3, 7, 0, 5, 'cu'], [0, -6, 2, 1, 0, 4, 'cu'], [0, -6, -2, 0, 0, -2, 'cu'], [-3, -6, 2, -2, 3, 3, 'cu']],
          walk: [[5, 0, 3, 7, 0, 5], [0, 0, 2, 1, 0, 4], [0, 0, -2], [-2, 3, 2, -2, 3, 3], [-3, 3, 3], [-3, 3, 2, { goal: 1 }]],
          deco: [['book', 0, 0, -2], ['door', -3, 3, 2], ['spool', 6.2, 0, 3.2], ['frame', 2, 0, 4, 4, 0, 4]] },
        { id: 'old', glaze: { need: [], filled: 1 }, boxes: [[0, 0, -1, 0, 0, 1, 'en2']], walk: [[0, 0, -1, 0, 0, 1]] },
        { id: 'cell', glaze: { need: [['w1', 0], ['w2', 0]] }, boxes: [[2, 0, 4, 4, 0, 4, 'en']], walk: [[2, 0, 4, 4, 0, 4]] },
        { id: 'w1', kind: 'rot', axis: 'y', pivot: [1.5, 0, 3.5], state: 3, wire: { len: 1, dir: [0, 0, 1] }, handles: [[1.5, 0.3, 4.5]] },
        { id: 'w2', kind: 'rot', axis: 'y', pivot: [4.5, 0, 4.5], state: 1, wire: { len: 3, dir: [-1, 0, 0] }, handles: [[2.5, 0.3, 4.5]] },
        { id: 'lift', kind: 'slide', axis: 'y', min: 0, max: 3, state: 0, boxes: [[-1, -9, 3, -1, 0, 3, 'cu']], walk: [[-1, 0, 3]], handles: [[-1, 0.1, 3.62]] }
      ]
    },
    // ───────────────────────── 三 · 点蓝 ─────────────────────────
    {
      name: '点蓝', gift: '釉', vase: '器，有了蓝。', no: '三', craft: '把研细的釉料一格一格填进丝格，一色一格', poem: '一格一格地点，蓝是慢慢长出来的。', end: '师傅的手抖了一下。阿蓝装作没有看见。',
      start: [7, 0, 6], start2: [7, 0, 5], duo: 'follow',
      hints: [['一根金丝，可以围出两个丝格', 'time']],
      pal: pal({ sky: ['#bfe3e2', '#e2f0e6', '#fbe4d8'], mist: '#a9d6d4', fog: '#e9efe4', ink: '#2f5552', key: [0.5, 0.82, 0.25], keyC: '#fffaf0', amb: 0.5, fx: 'mote', en: '#e0786a', en2: '#3fb6a8' }),
      music: { ch: 3 },
      parts: [
        { id: 'base',
          boxes: [[6, -6, 5, 8, 0, 7, 'cu'], [2, -6, 6, 2, 0, 6, 'cu'], [1, -6, 1, 3, 0, 2, 'cu'], [-2, -6, -1, -1, 3, 1, 'cu']],
          walk: [[6, 0, 5, 8, 0, 7], [2, 0, 6], [1, 0, 1, 3, 0, 2], [-1, 3, -1, -1, 3, 1], [-2, 3, 1], [-2, 3, -1], [-2, 3, 0, { goal: 1 }]],
          deco: [['door', -2, 3, 0], ['pots', 7.6, 0, 5.4], ['frame', 3, 0, 6, 5, 0, 6], ['frame', 2, 0, 3, 2, 0, 5]] },
        { id: 'a', glaze: { need: [['w', 0]] }, color: 'en2', boxes: [[3, 0, 6, 5, 0, 6, 'en2']], walk: [[3, 0, 6, 5, 0, 6]] },
        { id: 'b', glaze: { need: [['w', 1]] }, boxes: [[2, 0, 3, 2, 0, 5, 'en']], walk: [[2, 0, 3, 2, 0, 5]] },
        { id: 'w', kind: 'rot', axis: 'y', pivot: [2.5, 0, 5.5], state: 2, wire: { len: 3, dir: [1, 0, 0] }, handles: [[5.5, 0.3, 5.5]] },
        { id: 'lift', kind: 'slide', axis: 'y', min: 0, max: 3, state: 0, boxes: [[0, -9, 1, 0, 0, 1, 'cu']], walk: [[0, 0, 1]], handles: [[0, 0.1, 1.62]] }
      ]
    },
    // ───────────────────────── 四 · 烧蓝 ─────────────────────────
    {
      name: '烧蓝', gift: '火', vase: '器，经了火。', no: '四', craft: '入窑烧至八百度上下，釉料熔化下沉，再点、再烧，往复数次', poem: '火要有人守着。', end: '师傅没有跟来。窑火映着他的背影。',
      start: [8, 0, 7], start2: [8, 0, 6], duo: 'ctrl',
      hints: [['轻点师傅，换他走', 'select'], ['师傅踩住窑口，丝桥才会绷紧', 'hold']],
      pal: pal({ sky: ['#f6c9a8', '#f0a08c', '#c98a9e'], mist: '#f2b39a', fog: '#e9a99c', ink: '#5a2f2c', key: [-0.6, 0.6, -0.5], keyC: '#ffd9b0', amb: 0.46, fx: 'ember', en: '#3a6fc4', en2: '#f0c24b', kl: '#b5523d' }),
      music: { ch: 4 },
      parts: [
        { id: 'base',
          boxes: [[7, -6, 6, 8, 0, 7, 'cu'], [1, -6, 5, 3, 0, 7, 'kl'], [0, -6, 0, 1, 0, 1, 'cu']],
          walk: [[7, 0, 6, 8, 0, 7], [1, 0, 6, 3, 0, 7], [1, 0, 5], [2, 0, 5], [3, 0, 5, { hold: 'bridge' }], [0, 0, 0, { goal: 1 }], [1, 0, 0], [0, 0, 1, 1, 0, 1]],
          deco: [['kiln', 1.6, 0, 7.2], ['door', 0, 0, 0], ['tongs', 3.3, 0, 6.6]] },
        { id: 'path', kind: 'slide', axis: 'y', min: -7, max: 0, state: 0, glaze: { need: [], filled: 1 }, follow: { src: 'bridge', when: 0, on: -7, off: 0 },
          boxes: [[4, 0, 6, 6, 0, 6, 'en']], walk: [[4, 0, 6, 6, 0, 6]] },
        { id: 'bridge', kind: 'slide', axis: 'y', min: -9, max: 0, state: -9, hold: { on: 0, off: -9 }, onlyA: 1, glaze: { need: [], filled: 1 },
          boxes: [[1, 0, 2, 1, 0, 4, 'en2']], walk: [[1, 0, 2, 1, 0, 4]], deco: [['taut', 3, 0, 5, 1, 0, 3]] }
      ]
    },
    // ───────────────────────── 五 · 磨光 ─────────────────────────
    {
      name: '磨光', gift: '光', vase: '器，有了光。', no: '五', craft: '用砂石、黄石、木炭逐层打磨，直到釉面与铜丝齐平、透出光来', poem: '粗砺磨去，蓝才肯露出来。', end: '磨了一遍又一遍，阿蓝的手稳了。',
      start: [0, 0, 2], duo: null,
      hints: [['在灰黑的残阶上来回划动，把它磨亮', 'polish']],
      pal: pal({ sky: ['#d9dbe6', '#eceaea', '#f3efe6'], mist: '#c8cbd9', fog: '#eceae6', ink: '#45474f', key: [0.6, 0.7, 0.4], keyC: '#ffffff', amb: 0.5, fx: 'grit', en: '#6fae7e', en2: '#f2a7a0' }),
      music: { ch: 5 },
      parts: [
        { id: 'base',
          boxes: [[0, -6, 0, 2, 0, 2, 'cu'], [5, -6, 1, 5, -1, 1, 'cu'], [7, -6, 0, 9, 0, 2, 'cu'], [7, -6, -2, 9, 1, -2, 'cu'], [7, -6, -1, 9, 0, -1, 'cu'], [3, -6, 1, 3, -1, 1, 'cu']],
          walk: [[0, 0, 1, 2, 0, 2], [1, 0, 0, 2, 0, 0], [7, 0, 1, 9, 0, 2], [7, 0, 0], [9, 0, 0], [8, 1, -2, { goal: 1 }], [7, 1, -2], [9, 1, -2]],
          stairs: [[8, 1, 0, '-z']],
          deco: [['stones', 0, 0, 0], ['door', 8, 1, -2]] },
        { id: 'r1', rough: 1, boxes: [[3, 0, 1, 3, 0, 1, 'en']], walk: [[3, 0, 1]] },
        { id: 'bridge', kind: 'rot', axis: 'y', pivot: [5, 0, 1], state: 1, thin: 1, rough: 1,
          boxes: [[4, 0, 1, 6, 0, 1, 'en2']], walk: [[4, 0, 1, 6, 0, 1]], handles: [[5, 0.3, 2], [5, 0.3, 0]], deco: [['hub', 5, 0, 1]] },
        { id: 'r2', rough: 1, boxes: [[7, 1, -1, 9, 1, -1, 'en']], walk: [[7, 1, -1, 9, 1, -1]] }
      ]
    },
    // ───────────────────────── 六 · 镀金 ─────────────────────────
    {
      name: '镀金', gift: '金', vase: '器，镀了金。', no: '六', craft: '外露的铜丝与铜胎镀上金层，防锈，也让纹样亮起来', poem: '隔着山水，金线也是连着的。', end: '两盏灯，朝着同一个方向。',
      start: [0, 0, 6], start2: [3, 3, 7], duo: 'ctrl', haloR: 2.3,
      hints: [['两人的光晕重叠处，金箔会凝成路', 'halo'], ['轻点人物切换，一前一后地走', 'select']],
      pal: pal({ sky: ['#34356a', '#7a6aa0', '#e7a9a0'], mist: '#8d7fb3', fog: '#c99aa6', ink: '#fbeede', key: [0.4, 0.85, 0.35], keyC: '#ffe6cc', amb: 0.56, fx: 'star', stars: 0.7, lamp: 1, en: '#f2a7a0', en2: '#3fb6a8' }),
      music: { ch: 6 },
      parts: [
        { id: 'low', thin: 1,
          boxes: [[0, 0, 6, 2, 0, 6, 'cu'], [5, 0, 6, 5, 0, 6, 'cu'], [8, 0, 6, 9, 0, 6, 'cu']],
          walk: [[0, 0, 6, 2, 0, 6], [3, 0, 6, 'h'], [4, 0, 6, 'h'], [5, 0, 6], [6, 0, 6, 'h'], [7, 0, 6, 'h'], [8, 0, 6], [9, 0, 6, { goal: 1 }]],
          deco: [['door', 9, 0, 6]] },
        { id: 'high', thin: 1,
          boxes: [[3, 3, 7, 3, 3, 7, 'cu'], [6, 3, 7, 8, 3, 7, 'cu'], [11, 3, 7, 12, 3, 7, 'cu']],
          walk: [[3, 3, 7], [4, 3, 7, 'h'], [5, 3, 7, 'h'], [6, 3, 7, 8, 3, 7], [9, 3, 7, 'h'], [10, 3, 7, 'h'], [11, 3, 7], [12, 3, 7, { goal2: 1 }]],
          deco: [['door', 12, 3, 7]] }
      ]
    },
    // ───────────────────────── 七 · 复磨 ─────────────────────────
    {
      name: '复磨', gift: '器', vase: '器，成了。', no: '七', craft: '七道大工序，一器之成。手艺，靠人一代一代接下去', poem: '窑火重燃。', end: '窑火重燃，一脉接续。',
      start: [1, 1, 6], start2: [7, 1, 2], duo: 'ctrl',
      hints: [['这一次，换师傅为阿蓝托住路', 'hold']],
      pal: pal({ sky: ['#fbe3b8', '#f9cfc0', '#cfe6e0'], mist: '#f6d2b5', fog: '#f2e1cf', ink: '#5a4236', key: [-0.4, 0.8, -0.45], keyC: '#fff0d8', amb: 0.5, fx: 'ember', en: '#3a6fc4', en2: '#3fb6a8', kl: '#c0644a' }),
      music: { ch: 7 },
      parts: [
        { id: 'base',
          boxes: [[1, -6, 0, 4, 1, 2, 'cu'], [1, -6, 5, 2, 1, 6, 'cu'], [6, -6, 1, 7, 1, 2, 'cu']],
          walk: [[1, 1, 1, 1, 1, 2], [3, 1, 1, 4, 1, 2], [2, 1, 1], [2, 1, 2, { hold: 'r' }], [1, 1, 0], [4, 1, 0], [2, 1, 0, { goal: 1 }], [3, 1, 0, { goal2: 1 }],
            [1, 1, 5, 2, 1, 6], [6, 1, 1, 7, 1, 2]],
          deco: [['kiln', 2.5, 1, -1.2], ['book', 4, 1, 0], ['pots', 6.4, 1, 1.3]] },
        { id: 'r', kind: 'slide', axis: 'y', min: -9, max: 0, state: -9, hold: { on: 0, off: -9 }, rough: 1, onlyA: 1, boxes: [[1, 1, 3, 1, 1, 4, 'en']], walk: [[1, 1, 3, 1, 1, 4]] },
        { id: 'g', glaze: { need: [['w', 0]] }, boxes: [[5, 1, 1, 5, 1, 2, 'en2']], walk: [[5, 1, 1, 5, 1, 2]] },
        { id: 'w', kind: 'rot', axis: 'y', pivot: [4.5, 1, 0.5], state: 1, wire: { len: 1, dir: [1, 0, 0] }, handles: [[5.5, 1.3, 0.5]] }
      ]
    }
  ];
  if (typeof module !== 'undefined' && module.exports) module.exports = LEVELS; else root.SY_LEVELS = LEVELS;
})(typeof window !== 'undefined' ? window : this);
