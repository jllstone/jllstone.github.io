/* 一脉蓝 · gfx.js — WebGL 正交等距渲染器（零依赖）。
 * 材质：0 素面 · 1 古铜（锤纹 + 铜绿）· 2 金（金属高光）· 3 珐琅（玻璃釉、菲涅耳、内光）· 4 氧化渣 · 5 布 · 6 自发光
 * 光照：主光（方向光 + 阴影贴图）、天光/地光半球、最多 6 个点光源（灯、窑火、门、釉光）、高度雾。
 * 每次绘制可带：dissolve（釉液流开 / 氧化渣被磨去）、tint、alpha。
 */
(function (root) {
  'use strict';
  var M = {
    id: function () { return new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]); },
    mul: function (a, b) {
      var o = new Float32Array(16);
      for (var c = 0; c < 4; c++) for (var r = 0; r < 4; r++)
        o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
      return o;
    },
    tr: function (x, y, z) { var m = M.id(); m[12] = x; m[13] = y; m[14] = z; return m; },
    sc: function (x, y, z) { var m = M.id(); m[0] = x; m[5] = y; m[10] = z; return m; },
    rot: function (axis, a) {
      var m = M.id(), c = Math.cos(a), s = Math.sin(a);
      if (axis === 'x') { m[5] = c; m[6] = s; m[9] = -s; m[10] = c; }
      else if (axis === 'y') { m[0] = c; m[2] = -s; m[8] = s; m[10] = c; }
      else { m[0] = c; m[1] = s; m[4] = -s; m[5] = c; }
      return m;
    },
    chain: function () { var m = arguments[0]; for (var i = 1; i < arguments.length; i++) m = M.mul(m, arguments[i]); return m; }
  };

  // 顶点：pos3 nor3 col3 emis1 mat1
  var STRIDE = 11;
  function Geo() { this.d = []; this.e = 0; this.m = 0; }
  Geo.prototype.v = function (p, n, c) { this.d.push(p[0], p[1], p[2], n[0], n[1], n[2], c[0], c[1], c[2], this.e, this.m); };
  Geo.prototype.tri = function (a, b, c, n, col) { this.v(a, n, col); this.v(b, n, col); this.v(c, n, col); };
  Geo.prototype.quad = function (a, b, c, d, n, col) { this.tri(a, b, c, n, col); this.tri(a, c, d, n, col); };
  Geo.prototype.box = function (cx, cy, cz, hx, hy, hz, col) {
    var x0 = cx - hx, x1 = cx + hx, y0 = cy - hy, y1 = cy + hy, z0 = cz - hz, z1 = cz + hz;
    this.quad([x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [0, 1, 0], col);
    this.quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [0, -1, 0], col);
    this.quad([x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1], [1, 0, 0], col);
    this.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0], col);
    this.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1], col);
    this.quad([x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [x1, y0, z0], [0, 0, -1], col);
  };
  // 两点之间的方截面细杆（金丝）
  Geo.prototype.bar = function (a, b, r, col) {
    var cx = (a[0] + b[0]) / 2, cy = (a[1] + b[1]) / 2, cz = (a[2] + b[2]) / 2;
    this.box(cx, cy, cz, Math.abs(b[0] - a[0]) / 2 + r, Math.abs(b[1] - a[1]) / 2 + r, Math.abs(b[2] - a[2]) / 2 + r, col);
  };
  Geo.prototype.frustum = function (cx, by, cz, hb, ht, h, col) {
    var s = [[-1, -1], [1, -1], [1, 1], [-1, 1]], b = [], t = [], i;
    for (i = 0; i < 4; i++) { b.push([cx + s[i][0] * hb, by, cz + s[i][1] * hb]); t.push([cx + s[i][0] * ht, by + h, cz + s[i][1] * ht]); }
    for (i = 0; i < 4; i++) {
      var j = (i + 1) % 4, mx = (s[i][0] + s[j][0]) / 2, mz = (s[i][1] + s[j][1]) / 2;
      var ny = (hb - ht) / h, l = Math.sqrt(1 + ny * ny), n = [mx / l, ny / l, mz / l];
      this.quad(b[i], b[j], t[j], t[i], n, col);
    }
    if (ht > 0) this.quad(t[0], t[1], t[2], t[3], [0, 1, 0], col);
    this.quad(b[0], b[1], b[2], b[3], [0, -1, 0], col);
  };
  Geo.prototype.cyl = function (cx, by, cz, r0, r1, h, col, seg, axis) {
    seg = seg || 14; axis = axis || 'y';
    var self = this, mp = function (p) { return axis === 'y' ? p : axis === 'x' ? [p[1], p[0], p[2]] : [p[0], p[2], p[1]]; };
    var P = function (p) { var q = mp(p); return [q[0] + cx, q[1] + by, q[2] + cz]; };
    var sl = (r0 - r1) / h, nl = Math.sqrt(1 + sl * sl);
    for (var i = 0; i < seg; i++) {
      var a0 = i / seg * 6.2831853, a1 = (i + 1) / seg * 6.2831853, c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1);
      var n0 = mp([c0 / nl, sl / nl, s0 / nl]), n1 = mp([c1 / nl, sl / nl, s1 / nl]);
      var b0 = P([r0 * c0, 0, r0 * s0]), b1 = P([r0 * c1, 0, r0 * s1]), t0 = P([r1 * c0, h, r1 * s0]), t1 = P([r1 * c1, h, r1 * s1]);
      self.v(b0, n0, col); self.v(b1, n1, col); self.v(t1, n1, col);
      self.v(b0, n0, col); self.v(t1, n1, col); self.v(t0, n0, col);
      if (r1 > 0) self.tri(P([0, h, 0]), t0, t1, mp([0, 1, 0]), col);
      if (r0 > 0) self.tri(P([0, 0, 0]), b1, b0, mp([0, -1, 0]), col);
    }
  };
  // 旋转体：prof = [[r, y], ...] 自下而上
  Geo.prototype.lathe = function (cx, by, cz, prof, col, seg) {
    seg = seg || 18;
    for (var k = 0; k < prof.length - 1; k++) {
      var r0 = prof[k][0], y0 = prof[k][1], r1 = prof[k + 1][0], y1 = prof[k + 1][1];
      var dy = y1 - y0, dr = r0 - r1, l = Math.sqrt(dy * dy + dr * dr) || 1, ny = dr / l, nr = dy / l;
      for (var i = 0; i < seg; i++) {
        var a0 = i / seg * 6.2831853, a1 = (i + 1) / seg * 6.2831853, c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1);
        var p00 = [cx + r0 * c0, by + y0, cz + r0 * s0], p01 = [cx + r0 * c1, by + y0, cz + r0 * s1], p10 = [cx + r1 * c0, by + y1, cz + r1 * s0], p11 = [cx + r1 * c1, by + y1, cz + r1 * s1];
        var n0 = [nr * c0, ny, nr * s0], n1 = [nr * c1, ny, nr * s1];
        this.v(p00, n0, col); this.v(p01, n1, col); this.v(p11, n1, col);
        this.v(p00, n0, col); this.v(p11, n1, col); this.v(p10, n0, col);
      }
    }
    var top = prof[prof.length - 1]; if (top[0] > 0) this.cyl(cx, by + top[1] - 0.001, cz, top[0], top[0], 0.001, col, seg);
  };
  Geo.prototype.sphere = function (cx, cy, cz, rx, ry, rz, col, seg) {
    if (ry === undefined || typeof ry !== 'number') { col = ry; seg = rz; ry = rz = rx; }
    var m = seg || 12, n = Math.max(3, m >> 1) + 2, self = this;
    var pt = function (i, j) {
      var th = i / n * Math.PI, ph = j / m * 6.2831853, sx = Math.sin(th) * Math.cos(ph), sy = Math.cos(th), sz = Math.sin(th) * Math.sin(ph);
      var nx = sx / rx, ny = sy / ry, nz = sz / rz, l = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
      return [[cx + sx * rx, cy + sy * ry, cz + sz * rz], [nx / l, ny / l, nz / l]];
    };
    for (var i = 0; i < n; i++) for (var j = 0; j < m; j++) {
      var a = pt(i, j), b = pt(i + 1, j), c = pt(i + 1, j + 1), d = pt(i, j + 1);
      self.v(a[0], a[1], col); self.v(b[0], b[1], col); self.v(c[0], c[1], col);
      self.v(a[0], a[1], col); self.v(c[0], c[1], col); self.v(d[0], d[1], col);
    }
  };

  var NOISE = [
    'float h3(vec3 p){p=fract(p*.3183099+.1);p*=17.;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));}',
    'float vn(vec3 x){vec3 i=floor(x),f=fract(x);f=f*f*(3.-2.*f);',
    'return mix(mix(mix(h3(i),h3(i+vec3(1,0,0)),f.x),mix(h3(i+vec3(0,1,0)),h3(i+vec3(1,1,0)),f.x),f.y),',
    'mix(mix(h3(i+vec3(0,0,1)),h3(i+vec3(1,0,1)),f.x),mix(h3(i+vec3(0,1,1)),h3(i+vec3(1,1,1)),f.x),f.y),f.z);}',
    'float fbm(vec3 p){return .5*vn(p)+.27*vn(p*2.03)+.14*vn(p*4.1)+.09*vn(p*8.3);}'
  ].join('\n');

  // 共享：屏幕投影与光源空间
  var VHEAD = [
    'attribute vec3 aP,aN,aC;attribute vec2 aE;uniform mat4 uM;uniform vec3 uCen;uniform vec3 uSc;uniform vec3 uCR,uCU,uCF;',
    'uniform vec3 uLX,uLY,uLZ;uniform vec4 uLS;'
  ].join('\n');
  var VS = VHEAD + [
    'varying vec3 vN,vC,vW,vL;varying vec2 vE;',
    'void main(){vec4 w=uM*vec4(aP,1.);vec3 d=w.xyz-uCen;',
    'float sx=dot(d,uCR);float sy=dot(d,uCU);float sz=dot(d,uCF);',
    'gl_Position=vec4(sx*uSc.x,sy*uSc.y+uSc.z,-sz*.02,1.);vN=(uM*vec4(aN,0.)).xyz;vC=aC;vW=w.xyz;vE=aE;',
    'vec3 q=w.xyz-uCen;vL=vec3(dot(q,uLX)*uLS.x,dot(q,uLY)*uLS.x,dot(q,uLZ)*uLS.y)*.5+.5;}'
  ].join('\n');
  var FS = [
    'precision highp float;varying vec3 vN,vC,vW,vL;varying vec2 vE;uniform vec3 uCF;',
    'uniform vec3 uKey,uKeyC,uSky,uGnd,uFogC;uniform vec4 uFog,uOpt,uDis,uTint;uniform vec3 uPL[6],uPC[6];uniform float uPR[6];uniform sampler2D uSM;uniform vec2 uSMs;',
    NOISE,
    'float unpack(vec4 c){return dot(c,vec4(1.,1./255.,1./65025.,1./16581375.));}',
    'float shadow(vec3 n){if(vL.x<0.||vL.x>1.||vL.y<0.||vL.y>1.)return 1.;float b=.0016+.0035*(1.-max(dot(n,uKey),0.));float s=0.;',
    'for(int i=0;i<4;i++){vec2 o=vec2(float(i-(i/2)*2)-.5,float(i/2)-.5)*uSMs.y;s+=step(vL.z-b,unpack(texture2D(uSM,vL.xy+o)));}return s*.25;}',
    'void main(){vec3 n=normalize(vN);float mat=floor(vE.y+.5);float e=max(vE.x,uOpt.x);vec3 V=normalize(uCF);',
    // 溶解：釉液自注入点流开 / 氧化渣被磨去
    'if(uDis.w>.5){float r=distance(vW,uDis.xyz);if(r>uOpt.w*4.+fbm(vW*3.1)*.6-.3)discard;}',
    'if(uDis.w<-.5){if(fbm(vW*3.1)<uOpt.w*1.08-.04)discard;}',
    'vec3 base=vC*uTint.rgb;float sh=.3+.7*shadow(n);float ndl=max(dot(n,uKey),0.);',
    'vec3 amb=mix(uGnd,uSky,n.y*.5+.5);vec3 c;vec3 R=reflect(-V,n);float spec=0.;',
    'if(mat<.5||mat>4.5&&mat<5.5){float g=.9+.1*vn(vW*14.);c=base*g*(amb+uKeyC*ndl*sh);}',
    'else if(mat<1.5){',
    // 古铜：锤纹 + 铜绿聚在低处与缝里
    '  float ham=vn(vW*9.)*.6+vn(vW*23.)*.4;float pat=smoothstep(.6,.86,fbm(vW*1.3+vec3(0,vW.y*.3,0))+(.1-vW.y*.04)*.3);',
    '  vec3 cu=base*(.86+.26*ham);cu=mix(cu,vec3(.45,.72,.64),pat*.5);',
    '  spec=pow(max(dot(R,uKey),0.),24.)*(1.-pat)*.3;c=cu*(amb*.9+uKeyC*ndl*sh)+uKeyC*spec*sh*base*1.6;}',
    'else if(mat<2.5){',
    // 金：金属高光 + 天地环境反射
    '  vec3 env=mix(base*.3,base*1.3+.08,smoothstep(-.3,.7,R.y));spec=pow(max(dot(R,uKey),0.),60.)*.7;',
    '  c=env*(.55+.45*sh)*(.6+.5*ndl)+uKeyC*spec*sh*1.3+base*.15;}',
    'else if(mat<3.5){',
    // 珐琅：釉色深浅流动、玻璃菲涅耳、透出的内光
    '  float fl=fbm(vW*2.2+vec3(0,uOpt.z*.05,0));vec3 en=mix(base*.62,base*1.28,fl);float fr=pow(1.-max(dot(n,V),0.),3.);',
    '  spec=pow(max(dot(R,uKey),0.),140.);c=en*(amb*.8+uKeyC*ndl*sh*.85)+en*.24+mix(uSky,vec3(1.),.5)*fr*.3+uKeyC*spec*sh*.45;}',
    'else if(mat<4.5){',
    // 氧化渣：粗糙、发灰，几乎无高光
    '  float gr=vn(vW*31.)*.5+vn(vW*7.)*.5;c=base*(.6+.7*gr)*(amb+uKeyC*ndl*sh*.8);}',
    'else{c=base;}',
    // 点光
    'for(int i=0;i<6;i++){if(uPR[i]>0.){vec3 dl=uPL[i]-vW;float d=length(dl);float a=max(0.,1.-d/uPR[i]);a*=a;',
    '  float lam=max(dot(n,dl/d),0.)*.8+.2;c+=uPC[i]*a*lam*(mat>1.5&&mat<3.5?1.5:1.)*(mat>.5&&mat<1.5?1.2:1.)*base*1.4+uPC[i]*a*.06;}}',
    'c=mix(c,vC,e);',
    'float f=smoothstep(uFog.x,uFog.y,vW.y);c=mix(uFogC,c,mix(.25+.75*f,1.,e*.6));',
    'float al=smoothstep(uFog.z,uFog.w,vW.y)*uOpt.y*uTint.a;',
    'gl_FragColor=vec4(c*al,al);}'
  ].join('\n');
  var SVS = VHEAD + [
    'varying float vD;void main(){vec4 w=uM*vec4(aP,1.);vec3 q=w.xyz-uCen;',
    'float z=dot(q,uLZ)*uLS.y;gl_Position=vec4(dot(q,uLX)*uLS.x,dot(q,uLY)*uLS.x,z,1.);vD=z*.5+.5;}'
  ].join('\n');
  var SFS = 'precision highp float;varying float vD;void main(){vec4 e=fract(vec4(1.,255.,65025.,16581375.)*vD);e-=e.yzww*vec4(1./255.,1./255.,1./255.,0.);gl_FragColor=e;}';

  function Renderer(canvas) {
    var opts = { alpha: true, antialias: true, premultipliedAlpha: true, preserveDrawingBuffer: !!root.__CAPTURE };
    var gl = canvas.getContext('webgl', opts) || canvas.getContext('experimental-webgl', opts);
    if (!gl) throw new Error('WebGL unavailable');
    this.gl = gl;
    var sh = function (type, src) {
      var s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      return s;
    };
    var mk = function (vs, fs, us) {
      var pr = gl.createProgram();
      gl.attachShader(pr, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(pr);
      if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(pr));
      var o = { pr: pr, a: {}, u: {} };
      ['aP', 'aN', 'aC', 'aE'].forEach(function (k) { o.a[k] = gl.getAttribLocation(pr, k); });
      us.forEach(function (k) { o.u[k] = gl.getUniformLocation(pr, k); });
      return o;
    };
    var common = ['uM', 'uCen', 'uSc', 'uLX', 'uLY', 'uLZ', 'uLS', 'uCR', 'uCU', 'uCF'];
    this.P = mk(VS, FS, common.concat(['uKey', 'uKeyC', 'uSky', 'uGnd', 'uFogC', 'uFog', 'uOpt', 'uDis', 'uTint', 'uPL', 'uPC', 'uPR', 'uSM', 'uSMs']));
    this.SP = mk(SVS, SFS, common);
    // 阴影贴图
    this.smN = 2048;
    this.smTex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, this.smTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, this.smN, this.smN, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.smRB = gl.createRenderbuffer(); gl.bindRenderbuffer(gl.RENDERBUFFER, this.smRB);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, this.smN, this.smN);
    this.smFB = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, this.smFB);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.smTex, 0);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, this.smRB);
    this.smOK = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  }
  Renderer.prototype.mesh = function (geo) {
    if (!geo.d.length) return null;
    var gl = this.gl, b = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(geo.d), gl.STATIC_DRAW);
    return { buf: b, n: geo.d.length / STRIDE };
  };
  Renderer.prototype.free = function (m) { if (m) this.gl.deleteBuffer(m.buf); };
  function bindMesh(gl, P, m) {
    gl.bindBuffer(gl.ARRAY_BUFFER, m.buf);
    var a = P.a, s = STRIDE * 4;
    gl.enableVertexAttribArray(a.aP); gl.vertexAttribPointer(a.aP, 3, gl.FLOAT, false, s, 0);
    if (a.aN >= 0) { gl.enableVertexAttribArray(a.aN); gl.vertexAttribPointer(a.aN, 3, gl.FLOAT, false, s, 12); }
    if (a.aC >= 0) { gl.enableVertexAttribArray(a.aC); gl.vertexAttribPointer(a.aC, 3, gl.FLOAT, false, s, 24); }
    if (a.aE >= 0) { gl.enableVertexAttribArray(a.aE); gl.vertexAttribPointer(a.aE, 2, gl.FLOAT, false, s, 36); }
  }
  var ISO = [[0.70710678, 0, -0.70710678], [-0.40824829, 0.81649658, -0.40824829], [0.57735027, 0.57735027, 0.57735027]];
  function norm(v) { var l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; }
  function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  // v: center sx sy offY key keyC sky gnd fogC fog lights[{p,c,r}] time ga ext
  Renderer.prototype.frame = function (v, list) {
    var gl = this.gl, i, it, self = this;
    var LZ = norm(v.key), LX = norm(cross([0, 1, 0], LZ)); if (!isFinite(LX[0]) || Math.hypot(LX[0], LX[1], LX[2]) < 0.5) LX = [1, 0, 0];
    var LY = cross(LZ, LX), ext = v.ext || 16;
    var setCommon = function (P) {
      gl.uniform3fv(P.u.uCen, v.center); gl.uniform3f(P.u.uSc, v.sx, v.sy, v.offY);
      var cb = v.cam || ISO; if (P.u.uCR) { gl.uniform3fv(P.u.uCR, cb[0]); gl.uniform3fv(P.u.uCU, cb[1]); gl.uniform3fv(P.u.uCF, cb[2]); }
      gl.uniform3fv(P.u.uLX, LX); gl.uniform3fv(P.u.uLY, LY); gl.uniform3fv(P.u.uLZ, LZ); gl.uniform4f(P.u.uLS, 1 / ext, -1 / (ext * 1.6), 0, 0);
    };
    // 阴影通道
    if (this.smOK && v.shadows !== false) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.smFB); gl.viewport(0, 0, this.smN, this.smN);
      gl.clearColor(1, 1, 1, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT); gl.disable(gl.BLEND);
      gl.useProgram(this.SP.pr); setCommon(this.SP);
      for (var k = 0; k < 8; k++) gl.disableVertexAttribArray(k);
      for (i = 0; i < list.length; i++) {
        it = list[i]; if (!it.m || it.o.noShadow || it.o.dis) continue;
        bindMesh(gl, this.SP, it.m); gl.uniformMatrix4fv(this.SP.u.uM, false, it.model); gl.drawArrays(gl.TRIANGLES, 0, it.m.n);
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.BLEND);
    var P = this.P, u = P.u;
    for (var k2 = 0; k2 < 8; k2++) gl.disableVertexAttribArray(k2);
    gl.useProgram(P.pr); setCommon(P);
    gl.uniform3fv(u.uKey, norm(v.key)); gl.uniform3fv(u.uKeyC, v.keyC); gl.uniform3fv(u.uSky, v.sky); gl.uniform3fv(u.uGnd, v.gnd); gl.uniform3fv(u.uFogC, v.fogC);
    gl.uniform4fv(u.uFog, v.fog);
    var pl = [], pc = [], pr = [];
    for (i = 0; i < 6; i++) { var L = v.lights[i]; if (L) { pl.push(L.p[0], L.p[1], L.p[2]); pc.push(L.c[0], L.c[1], L.c[2]); pr.push(L.r); } else { pl.push(0, 0, 0); pc.push(0, 0, 0); pr.push(0); } }
    gl.uniform3fv(u.uPL, pl); gl.uniform3fv(u.uPC, pc); gl.uniform1fv(u.uPR, pr);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.smTex); gl.uniform1i(u.uSM, 0); gl.uniform2f(u.uSMs, this.smN, this.smOK && v.shadows !== false ? 1 / this.smN : 0);
    var draw = function (it) {
      var o = it.o;
      bindMesh(gl, P, it.m); gl.uniformMatrix4fv(u.uM, false, it.model);
      gl.uniform4f(u.uOpt, o.emis || 0, (o.alpha === undefined ? 1 : o.alpha) * v.ga, v.time, o.dis ? o.dis.k : 0);
      gl.uniform4f(u.uDis, o.dis && o.dis.p ? o.dis.p[0] : 0, o.dis && o.dis.p ? o.dis.p[1] : 0, o.dis && o.dis.p ? o.dis.p[2] : 0, o.dis ? (o.dis.p ? 1 : -1) : 0);
      var t = o.tint || [1, 1, 1, 1]; gl.uniform4f(u.uTint, t[0], t[1], t[2], t[3] === undefined ? 1 : t[3]);
      gl.depthMask(!o.noDepth);
      gl.drawArrays(gl.TRIANGLES, 0, it.m.n);
    };
    for (i = 0; i < list.length; i++) if (list[i].m && !list[i].o.late) draw(list[i]);
    for (i = 0; i < list.length; i++) if (list[i].m && list[i].o.late) draw(list[i]);
    gl.depthMask(true);
    if (!this.smOK) void self;
  };

  root.SY_GFX = { M: M, Geo: Geo, Renderer: Renderer };
})(window);
