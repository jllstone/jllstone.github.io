# 《铁皮的旅行》立体绘本

亲手翻开的网页立体书。纸页立起来，陪铁皮人走过四季，找到属于自己的一点温暖。

在线打开：[https://jllstone.github.io/tiepi/](https://jllstone.github.io/tiepi/)

## 怎么看

- 拖动书页翻页；拖动桌面（或按住 Shift 拖动）转动视角；滚轮缩放
- 键盘：← → 翻页，空格触发本页机关，R 视角复位，M 地图，S 声音，A/D/W/X 转动视角
- 地址加上 `#p05` 可以直接打开第 5 页

页面使用 ES Module，需要通过 HTTP 打开。直接双击 `index.html` 会白屏。本地可以：

```bash
python3 -m http.server 8080
```

然后打开 http://localhost:8080

## 文件

```
index.html              页面全部代码（HTML + CSS + JS，分层数据已内嵌）
three.module.min.js     Three.js r170（本地依赖，不走 CDN）
assets/                 分层纸片、尾页角色、地图缩略图、印刷版大图、字体
```

## 致谢

- 绘本文字与画稿：四个字儿
- 3D 渲染：three.js (MIT)
- 字体：霞鹜文楷 LXGW WenKai（SIL OFL 1.1）
