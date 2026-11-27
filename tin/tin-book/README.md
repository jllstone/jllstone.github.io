# 《铁皮的旅行》立体书 · 占位版

画师用它看“我画的图会出现在书的哪里”。彩色虚线牌子是待画的图，上面写着名字和文件名；书页上的网格和色块是地面页底稿。

## 打开方式（三选一）

1. **最简单：双击 `离线单文件版.html`**。所有图片都打包在这一个文件里，不需要服务器，可以直接发给画师。
2. **本机预览：双击 `启动-Mac.command` 或 `启动-Windows.bat`**（需要电脑装有 Python 3），浏览器会打开 http://localhost:8000/ 。
3. **部署到服务器**：把整个文件夹原样放到任意静态网站服务器即可，比如 Nginx、IIS、宝塔、阿里云 OSS 或腾讯云 COS 的静态网站托管、GitHub Pages。不需要数据库，也不需要后端。

> 直接双击 `index.html` 打不开，这是浏览器的安全限制，不是坏了。用上面任意一种方式即可。

## 和另外两个包一起部署

把三个文件夹放在同一个网站目录下，名字保持不变：

```
网站根目录/
├─ tin-book/    占位版（本包）
├─ tin-check/   画稿自检
└─ tin-brief/   画师需求说明
```

需求说明里的两个按钮会自动指向 `../tin-book/` 和 `../tin-check/`。

## 目录

```
index.html          阅读器页面
book.json           整本书的配置：8 个跨页、每张图的位置、机关、文案
art/                全部图片（占位图、临时抠图、地面页底稿）
  ch1-cave/ … ch8-warmth/   每个跨页一个文件夹
  cast/tin/ …               每个角色一个文件夹
engine/             引擎源码（Three.js）
vendor/             Three.js r160（MIT 许可），已本地化，不依赖外网
tools/
  check_book.py       检查 book.json 和图片：python3 tools/check_book.py book.json（需 pip install pillow）
  rename_parts.py     把画师交来的“左腿.png”等中文部件名改成引擎用的英文名
  build_offline.mjs   重新生成离线单文件版：npm i esbuild && node tools/build_offline.mjs
离线单文件版.html     由 build_offline.mjs 生成
```

## 换上画师交来的图

1. **立牌、道具、地面页**：按任务单里的文件名，直接覆盖 `art/对应跨页/` 下的同名文件。地面页交来的是 `ground.png`，把 book.json 里这一章的 `"ground": {"spread": ".../ground.jpg"}` 改成 `ground.png`。
2. **角色**：把交来的部件放进 `art/cast/角色名/`，运行 `python3 tools/rename_parts.py art/cast/tin` 改名，再把 book.json 里这个角色的 `parts` 改成实际有的部件，顺序从后到前，例如 `["legL","legR","armL","body","head","eyes","armR"]`。
3. 运行 `python3 tools/check_book.py book.json` 确认零错误。
4. 如果还要给画师发离线版，重新运行 `node tools/build_offline.mjs`。

## 调整位置

book.json 里 `"editor": true` 时，右上角有“摆位”按钮（或按 E 键）。点选立牌拖动摆放，滚轮改高度，`[` `]` 转向，方向键微调；点“复制 JSON”，把内容粘回 book.json 对应章节。正式上线前把 `editor` 改成 `false`。

## 字体

页面优先用 Google Fonts 的思源宋体、思源黑体；连不上时自动换成系统字体（苹方、微软雅黑、宋体），不会卡住页面。完全内网环境也能正常使用。
