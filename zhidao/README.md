# 立体绘本引擎 · 起步包

把自己的绘本插画做成「可以在桌上翻页的 3D 立体书」。参考 The Folded Atlas 的体验，引擎是独立编写的。

## 30 秒跑起来
```bash
cd popbook-kit
python3 -m http.server 8000      # 或任何静态服务器（不能直接双击 index.html）
# 浏览器打开 http://localhost:8000
```

## 目录
```
index.html            阅读器外壳（一般不用改）
book.json             整本书的数据：章节、文案、立牌摆位、角色、机关  ← 主要改这里
art/                  所有插画（透明 PNG / WebP）
  common/             多章复用的通用件（树、云、山、石头…）
  ch1-xxx/            每章一个文件夹：ground.png + 本章立牌
  cast/<角色>/        每个角色一个文件夹：head.png body.png …（同一画布尺寸导出）
  map.png             地图底图
engine/               引擎源码（Three.js r160）
vendor/three.module.min.js
tools/
  grid-template.png   跨页坐标网格，垫在地面页下面画
  make_grid.py        重新生成网格
  check_book.py       检查素材与 book.json（python3 tools/check_book.py book.json）
  素材清单模板.csv     分工排期用的素材清单
```

## 摆位
book.json 里 `"editor": true` 时，打开页面按 **E**（或右上角「摆位」）：点选立牌 → 拖动摆放，滚轮改高度，`[ ]` 转向，方向键微调。
右侧文本框就是本章的 standees / cast，点「复制 JSON」粘回 book.json 对应章节。发布前把 `editor` 改成 false。

## 机关类型（interaction.type）
| type | 玩法 | 关键字段 |
|---|---|---|
| tap | 点 N 下 | count, react: swing/bounce/spin/shake |
| pull | 拖着走一段（拉条） | dir:[x,z], distance |
| rotate | 绕轴转圈（转盘/风车） | turns |
| flap | 掀开盖片 | angle（弧度） |
| choice | 直接答题 | choices |
任何类型都可加 `choices`（机关完成后答题）、`drive`（进度驱动别的立牌）、隐藏件（立牌 `hidden:true`，解谜后弹出）。

## 发布
整个文件夹原样上传到任意静态托管（GitHub Pages / Netlify / Cloudflare Pages / here.now）。
建议把 PNG 转 WebP：`cwebp -q 85 in.png -o out.webp`，然后改 book.json 里的扩展名。
