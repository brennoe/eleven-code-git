/* =========================================================
   ELEVEN CODE — "O Toque"
   Duas mãos em nuvem de pontos 3D (humana e digital), desenhadas
   em WebGL. A mão é gerada a partir de um esqueleto anatómico
   (cápsulas + elipsoides), sem modelos externos.
   ========================================================= */
(function () {
  'use strict';

  var DEG = Math.PI / 180;

  /* ---------------- utilitários ---------------- */
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function v3(x, y, z) { return [x, y, z]; }
  function add(a, b) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }
  function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
  function mul(a, s) { return [a[0] * s, a[1] * s, a[2] * s]; }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function len(a) { return Math.sqrt(dot(a, a)); }
  function norm(a) { var l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; }
  function lerp3(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }

  /* matrizes 3x3 em row-major */
  function rx(a) { var c = Math.cos(a), s = Math.sin(a); return [1, 0, 0, 0, c, -s, 0, s, c]; }
  function ry(a) { var c = Math.cos(a), s = Math.sin(a); return [c, 0, s, 0, 1, 0, -s, 0, c]; }
  function rz(a) { var c = Math.cos(a), s = Math.sin(a); return [c, -s, 0, s, c, 0, 0, 0, 1]; }
  var MIRROR_X = [-1, 0, 0, 0, 1, 0, 0, 0, 1];
  function mm(A, B) {
    var r = [];
    for (var i = 0; i < 3; i++) {
      for (var j = 0; j < 3; j++) r.push(A[i * 3] * B[j] + A[i * 3 + 1] * B[3 + j] + A[i * 3 + 2] * B[6 + j]);
    }
    return r;
  }
  function mv(M, v) {
    return [M[0] * v[0] + M[1] * v[1] + M[2] * v[2], M[3] * v[0] + M[4] * v[1] + M[5] * v[2], M[6] * v[0] + M[7] * v[1] + M[8] * v[2]];
  }
  function glMat(M) { return new Float32Array([M[0], M[3], M[6], M[1], M[4], M[7], M[2], M[5], M[8]]); }

  /* ---------------- anatomia da mão ----------------
     Mão direita a apontar (unidades ≈ cm).
     x: para os dedos · y: dorso · z: lado do polegar.
     Pulso na origem; ponta do indicador em INDEX_TIP. */
  /* Esqueleto (pose inspirada na Criação de Adão): indicador estendido,
     restantes dedos relaxados e afastados, polegar aberto e visível. */
  function fingerChain(mcp, yawDeg, lengths, flexDeg, radii) {
    var pts = [mcp];
    var phi = 0;
    var yaw = yawDeg * DEG;
    var cur = mcp;
    for (var i = 0; i < lengths.length; i++) {
      phi += flexDeg[i] * DEG;
      var d = [Math.cos(phi) * Math.cos(yaw), -Math.sin(phi), Math.cos(phi) * Math.sin(yaw)];
      cur = add(cur, mul(d, lengths[i]));
      pts.push(cur);
    }
    var last = sub(pts[pts.length - 1], pts[pts.length - 2]);
    return { pts: pts, radii: radii, tip: add(pts[pts.length - 1], mul(norm(last), radii[radii.length - 1])) };
  }

  // Duas poses diferentes, como no fresco: a mão humana chega relaxada (Adão),
  // a mão digital chega firme e decidida.
  var SK_HUMAN = {
    index: fingerChain(v3(9.4, 0.3, 2.5), 4, [4.2, 2.5, 1.9], [7, 11, 12], [0.95, 0.84, 0.75, 0.68]),
    middle: fingerChain(v3(9.8, 0.35, 0.75), 2, [4.6, 2.9, 2.0], [16, 26, 18], [0.98, 0.86, 0.77, 0.7]),
    ring: fingerChain(v3(9.35, 0.25, -1.1), -7, [4.3, 2.7, 1.9], [22, 32, 20], [0.92, 0.82, 0.74, 0.66]),
    pinky: fingerChain(v3(8.5, 0.0, -2.8), -16, [3.4, 2.1, 1.7], [28, 34, 20], [0.8, 0.72, 0.64, 0.58]),
    thumb: { pts: [v3(2.4, -0.8, 2.8), v3(5.3, -1.3, 4.9), v3(7.6, -1.6, 5.9), v3(9.4, -1.7, 6.3)], radii: [1.3, 1.05, 0.95, 0.85] }
  };
  var SK_DIGITAL = {
    index: fingerChain(v3(9.4, 0.3, 2.5), 3, [4.3, 2.6, 1.9], [0, 2, 3], [0.95, 0.84, 0.75, 0.68]),
    middle: fingerChain(v3(9.8, 0.35, 0.75), 0, [4.6, 2.9, 2.0], [40, 62, 34], [0.98, 0.86, 0.77, 0.7]),
    ring: fingerChain(v3(9.35, 0.25, -1.1), -4, [4.3, 2.7, 1.9], [46, 64, 34], [0.92, 0.82, 0.74, 0.66]),
    pinky: fingerChain(v3(8.5, 0.0, -2.8), -9, [3.4, 2.1, 1.7], [52, 62, 32], [0.8, 0.72, 0.64, 0.58]),
    thumb: { pts: [v3(2.4, -0.8, 2.5), v3(5.6, -1.6, 3.7), v3(8.0, -2.2, 3.3), v3(9.7, -2.6, 2.6)], radii: [1.3, 1.05, 0.95, 0.85] }
  };
  var TIP_HUMAN = SK_HUMAN.index.tip;
  var TIP_DIGITAL = SK_DIGITAL.index.tip;

  // Orientação de cada mão: ângulo de chegada, rotação sobre o próprio eixo e queda do pulso.
  var POSE = {
    human: { angle: 17, roll: 30, bend: -8 },
    digital: { angle: -2, roll: -40, bend: 3 }
  };

  // Altura do dorso da mão (para desenhar os tendões à superfície).
  function dorsalY(x, z) {
    function top(c, ax) {
      var k = 1 - Math.pow((x - c[0]) / ax[0], 2) - Math.pow((z - c[2]) / ax[2], 2);
      return k > 0 ? c[1] + ax[1] * Math.sqrt(k) : -9;
    }
    return Math.max(top([4.9, 0.05, 0.25], [5.4, 1.55, 4.15]), top([-1.0, 0.0, 0.1], [2.3, 1.8, 2.85])) + 0.08;
  }

  // Linhas anatómicas: tendões no dorso (dos nós dos dedos ao pulso) e "ossos" dos dedos.
  function anatomyLines(sk) {
    var tendons = [];
    ['index', 'middle', 'ring', 'pinky'].forEach(function (name) {
      var m = sk[name].pts[0];
      var line = [];
      for (var i = 0; i <= 8; i++) {
        var t = i / 8;
        var x = m[0] + (0.2 - m[0]) * t;
        var z = m[2] + (m[2] * 0.35 - m[2]) * t;
        line.push([x, dorsalY(x, z), z]);
      }
      tendons.push(line);
    });
    var bones = [];
    ['index', 'middle', 'ring', 'pinky', 'thumb'].forEach(function (name) {
      var f = sk[name];
      bones.push(f.pts.map(function (q, i) { return [q[0], q[1] + f.radii[i] * 0.92, q[2]]; }));
    });
    return { tendons: tendons, bones: bones };
  }

  // Perfil do antebraço [x, centro y, raio y (espessura), raio z (largura)], do cotovelo ao pulso.
  var FOREARM = [
    [-26, -0.7, 3.5, 4.0],
    [-20, -0.55, 3.75, 4.35],
    [-14, -0.35, 3.45, 4.2],
    [-8, -0.15, 2.75, 3.7],
    [-3, 0.0, 2.05, 3.1],
    [-0.6, 0.0, 1.85, 2.9]
  ];

  // Interpolação suave (Catmull-Rom) do perfil numa posição x.
  function forearmAt(prof, x) {
    var n = prof.length;
    if (x <= prof[0][0]) return prof[0].slice(1);
    if (x >= prof[n - 1][0]) return prof[n - 1].slice(1);
    var i = 0;
    while (i < n - 2 && x > prof[i + 1][0]) i++;
    var p0 = prof[Math.max(0, i - 1)], p1 = prof[i], p2 = prof[i + 1], p3 = prof[Math.min(n - 1, i + 2)];
    var t = (x - p1[0]) / (p2[0] - p1[0]);
    var t2 = t * t, t3 = t2 * t;
    var out = [];
    for (var k = 1; k < 4; k++) {
      out.push(0.5 * ((2 * p1[k]) + (-p0[k] + p2[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3));
    }
    return out;
  }

  function handPrimitives(sk) {
    var prims = [];
    function cap(a, b, ra, rb) { prims.push({ t: 0, a: a, b: b, ra: ra, rb: rb }); }
    function sph(c, r) { prims.push({ t: 1, c: c, r: r }); }
    function ell(c, ax) { prims.push({ t: 2, c: c, ax: ax }); }
    function finger(p, r) {
      for (var i = 0; i < p.length - 1; i++) cap(p[i], p[i + 1], r[i], r[i + 1]);
      for (var j = 0; j < p.length; j++) sph(p[j], r[j]);
    }

    // antebraço: um volume contínuo e musculado (secção elíptica, mais largo do que espesso)
    prims.push({ t: 3, x0: -26, x1: -0.6, profile: FOREARM, w: 0.75 });
    // pulso
    ell(v3(-1.0, 0.0, 0.1), v3(2.3, 1.8, 2.85));
    // palma, eminência tenar e hipotenar
    ell(v3(4.9, 0.05, 0.25), v3(5.4, 1.55, 4.15));
    ell(v3(3.3, -1.0, 2.7), v3(3.1, 1.45, 1.55));
    ell(v3(4.6, -0.85, -2.55), v3(3.7, 1.2, 1.25));
    // nós dos dedos
    ['index', 'middle', 'ring', 'pinky'].forEach(function (name) {
      var m = sk[name].pts[0];
      sph(v3(m[0] - 0.1, m[1] + 0.45, m[2]), sk[name].radii[0] * 0.66);
      prims[prims.length - 1].w = 2.2;
    });
    // dedos (com mais densidade de pontos para se lerem bem)
    ['index', 'middle', 'ring', 'pinky', 'thumb'].forEach(function (name) {
      var start = prims.length;
      finger(sk[name].pts, sk[name].radii);
      for (var k = start; k < prims.length; k++) prims[k].w = name === 'thumb' ? 2.0 : 2.5;
    });
    return prims;
  }

  function primArea(p) {
    if (p.t === 3) {
      var mid = forearmAt(p.profile, (p.x0 + p.x1) / 2);
      return Math.PI * (mid[1] + mid[2]) * (p.x1 - p.x0);
    }
    if (p.t === 0) return Math.PI * (p.ra + p.rb) * len(sub(p.b, p.a));
    if (p.t === 1) return 4 * Math.PI * p.r * p.r;
    var a = p.ax[0], b = p.ax[1], c = p.ax[2], k = 1.6;
    return 4 * Math.PI * Math.pow((Math.pow(a * b, k) + Math.pow(a * c, k) + Math.pow(b * c, k)) / 3, 1 / k);
  }

  function randDir(rand) {
    var z = rand() * 2 - 1;
    var phi = rand() * Math.PI * 2;
    var s = Math.sqrt(1 - z * z);
    return [s * Math.cos(phi), s * Math.sin(phi), z];
  }

  function samplePrim(p, rand) {
    if (p.t === 3) {
      var x = p.x0 + rand() * (p.x1 - p.x0);
      var f = forearmAt(p.profile, x);
      var a = rand() * Math.PI * 2;
      var c = Math.cos(a), s = Math.sin(a);
      return { p: [x, f[0] + f[1] * c, f[2] * s], n: norm([0, c / f[1], s / f[2]]) };
    }
    if (p.t === 0) {
      var axis = sub(p.b, p.a);
      var dir = norm(axis);
      var helper = Math.abs(dir[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
      var u = norm(cross(dir, helper));
      var w = cross(dir, u);
      var t = rand();
      var th = rand() * Math.PI * 2;
      var r = p.ra + (p.rb - p.ra) * t;
      var radial = add(mul(u, Math.cos(th)), mul(w, Math.sin(th)));
      return { p: add(add(p.a, mul(axis, t)), mul(radial, r)), n: radial };
    }
    if (p.t === 1) {
      var d = randDir(rand);
      return { p: add(p.c, mul(d, p.r)), n: d };
    }
    var e = randDir(rand);
    return {
      p: [p.c[0] + e[0] * p.ax[0], p.c[1] + e[1] * p.ax[1], p.c[2] + e[2] * p.ax[2]],
      n: norm([e[0] / p.ax[0], e[1] / p.ax[1], e[2] / p.ax[2]])
    };
  }

  function insidePrim(p, q, margin) {
    if (p.t === 3) {
      if (q[0] < p.x0 || q[0] > p.x1) return false;
      var f = forearmAt(p.profile, q[0]);
      var dy = (q[1] - f[0]) / (f[1] - margin);
      var dz = q[2] / (f[2] - margin);
      return dy * dy + dz * dz < 1;
    }
    if (p.t === 0) {
      var axis = sub(p.b, p.a);
      var t = Math.max(0, Math.min(1, dot(sub(q, p.a), axis) / dot(axis, axis)));
      var r = p.ra + (p.rb - p.ra) * t;
      return len(sub(q, add(p.a, mul(axis, t)))) < r - margin;
    }
    if (p.t === 1) return len(sub(q, p.c)) < p.r - margin;
    var dx = (q[0] - p.c[0]) / p.ax[0];
    var dy = (q[1] - p.c[1]) / p.ax[1];
    var dz = (q[2] - p.c[2]) / p.ax[2];
    return dx * dx + dy * dy + dz * dz < 0.94;
  }

  // Pontos na pele da mão (união das primitivas, sem pontos interiores).
  function sampleHand(count, rand, sk) {
    var prims = handPrimitives(sk);
    var total = 0;
    prims.forEach(function (p) { p.area = primArea(p) * (p.w || 1.2); total += p.area; });
    var pts = [];
    var target = count * 1.8;
    prims.forEach(function (p, i) {
      var n = Math.round((target * p.area) / total);
      for (var k = 0; k < n; k++) {
        var s = samplePrim(p, rand);
        var hidden = false;
        for (var j = 0; j < prims.length; j++) {
          if (j !== i && insidePrim(prims[j], s.p, 0.04)) { hidden = true; break; }
        }
        if (!hidden) pts.push(s);
      }
    });
    for (var m = pts.length - 1; m > 0; m--) {
      var r = Math.floor(rand() * (m + 1));
      var tmp = pts[m]; pts[m] = pts[r]; pts[r] = tmp;
    }
    return pts.slice(0, count);
  }

  function pickNodes(pts, n, minDist, rand, filter) {
    var order = pts.map(function (_, i) { return i; });
    for (var m = order.length - 1; m > 0; m--) {
      var r = Math.floor(rand() * (m + 1));
      var tmp = order[m]; order[m] = order[r]; order[r] = tmp;
    }
    var chosen = [];
    for (var k = 0; k < order.length && chosen.length < n; k++) {
      var p = pts[order[k]].p;
      if (filter && !filter(p)) continue;
      var ok = true;
      for (var c = 0; c < chosen.length; c++) {
        if (len(sub(pts[chosen[c]].p, p)) < minDist) { ok = false; break; }
      }
      if (ok) chosen.push(order[k]);
    }
    return chosen;
  }

  function linkNodes(pts, nodes, maxDist, k) {
    var pairs = [];
    var seen = {};
    nodes.forEach(function (a) {
      var near = [];
      nodes.forEach(function (b) {
        if (a === b) return;
        var d = len(sub(pts[a].p, pts[b].p));
        if (d < maxDist) near.push({ b: b, d: d });
      });
      near.sort(function (x, y) { return x.d - y.d; });
      near.slice(0, k).forEach(function (o) {
        var key = a < o.b ? a + '-' + o.b : o.b + '-' + a;
        if (!seen[key]) { seen[key] = true; pairs.push([a, o.b]); }
      });
    });
    return pairs;
  }

  /* ---------------- shaders ---------------- */
  var COMMON = [
    'precision highp float;',
    'uniform mat3 uRot0; uniform mat3 uRot1; uniform vec3 uPos0; uniform vec3 uPos1;',
    'uniform mat3 uScene; uniform float uCamZ; uniform float uFocal; uniform vec2 uRes; uniform vec2 uShift; uniform float uDpr;',
    'uniform float uForm0; uniform float uForm1; uniform float uTime;',
    'uniform vec3 uContact; uniform float uEnergy;',
    'uniform vec2 uRevealC; uniform float uRevealR;',
    'uniform float uThreads; uniform float uDim; uniform float uDust;',
    'float formOf(float hand, float seed) {',
    '  float form = hand < 0.5 ? uForm0 : (hand < 1.5 ? uForm1 : 1.0);',
    '  float f = clamp(form * 1.7 - seed * 0.7, 0.0, 1.0);',
    '  return f * f * (3.0 - 2.0 * f);',
    '}',
    'vec3 toWorld(vec3 local, float hand) {',
    '  if (hand < 0.5) return uRot0 * local + uPos0;',
    '  if (hand < 1.5) return uRot1 * local + uPos1;',
    '  return local;',
    '}',
    'vec2 toScreen(vec3 w, out float z) {',
    '  vec3 v = uScene * w;',
    '  z = uCamZ - v.z;',
    '  return v.xy * (uFocal / max(z, 0.001)) + uShift;',
    '}',
    'float darkAt(vec2 scr) { return smoothstep(uRevealR + 36.0, uRevealR - 36.0, distance(scr, uRevealC)); }',
    '// a energia é uma onda que passa: forte na frente, desvanece atrás',
    'float energyIn(vec3 w) {',
    '  if (uEnergy < 0.01) return 0.0;',
    '  float d = distance(w, uContact);',
    '  return smoothstep(uEnergy, uEnergy - 5.0, d) * smoothstep(uEnergy - 30.0, uEnergy - 9.0, d) + smoothstep(7.0, 0.0, d) * 0.6;',
    '}',
    'float energyFront(vec3 w) { return uEnergy > 0.01 ? exp(-abs(distance(w, uContact) - uEnergy) * 0.7) : 0.0; }'
  ].join('\n');

  var POINTS_VS = COMMON + '\n' + [
    'attribute vec3 aLocal; attribute vec3 aNormal; attribute vec3 aStart;',
    'attribute float aSeed; attribute float aHand; attribute float aKind;',
    'varying vec4 vColor;',
    'varying float vRing;',
    'void main() {',
    '  bool dust = aKind > 1.5 && aKind < 2.5;',
    '  bool node = aKind > 0.5 && aKind < 1.5;',
    '  bool human = aHand < 0.5;',
    '  float f = dust ? 1.0 : formOf(aHand, aSeed);',
    '  vec3 nW = human ? uRot0 * aNormal : uRot1 * aNormal;',
    '  vec3 target = toWorld(aLocal, aHand);',
    '  if (aKind < 0.5) target += nW * sin(uTime * 1.2 + aSeed * 60.0) * 0.035;',
    '  if (aKind > 1.5) {',
    '    vec3 drift = vec3(sin(uTime * 0.21 + aSeed * 17.0), cos(uTime * 0.17 + aSeed * 29.0), sin(uTime * 0.13 + aSeed * 41.0));',
    '    target += drift * (dust ? 2.4 : 1.4);',
    '  }',
    '  vec3 w = mix(aStart, target, f);',
    '  float z;',
    '  vec2 sp = toScreen(w, z);',
    '  gl_Position = vec4(sp / (uRes * 0.5), 0.0, 1.0);',
    '  vec2 scr = sp + uRes * 0.5;',
    '',
    '  vec3 nV = normalize(uScene * nW);',
    '  vec3 L = normalize(vec3(-0.35, 0.8, 0.5));',
    '  float diff = clamp(dot(nV, L), 0.0, 1.0);',
    '  float rim = pow(1.0 - abs(nV.z), 2.0);',
    '  if (aKind > 1.5) { diff = 0.5; rim = 0.0; }',
    '  float pick = fract(aSeed * 7.31);',
    '',
    '  vec3 ink = vec3(0.07, 0.08, 0.085);',
    '  vec3 cL = ink; float aL;',
    '  bool bead = node && pick > 0.68;',
    '  if (human && aKind < 0.5) aL = 0.04 + 0.85 * pow(1.0 - diff, 2.2) + rim * 0.62;',
    '  else if (node) { aL = 0.9; if (bead) cL = vec3(0.99); else if (pick < 0.07) cL = vec3(0.0, 0.62, 0.38); }',
    '  else if (aKind < 0.5) aL = 0.26 + rim * 0.7;',
    '  else aL = 0.42;',
    '',
    '  vec3 silver = vec3(0.86, 0.9, 0.89);',
    '  vec3 green = vec3(0.0, 0.9, 0.46);',
    '  vec3 cD = mix(silver, green, rim * 0.35); float aD;',
    '  if (human && aKind < 0.5) aD = 0.05 + 0.6 * pow(diff, 1.4) + rim * 0.7;',
    '  else if (node) { aD = 0.92; cD = pick > 0.88 ? green : silver; }',
    '  else if (aKind < 0.5) aD = 0.18 + rim * 0.6;',
    '  else aD = 0.32;',
    '',
    '  float inE = energyIn(w);',
    '  float front = energyFront(w);',
    '  float reach = human ? smoothstep(11.0, 2.0, distance(w, uContact)) : 1.0;',
    '  cL = mix(cL, vec3(0.0, 0.6, 0.36), clamp(inE * reach * 0.8 + front * 0.9, 0.0, 1.0));',
    '  cD = mix(cD, green, clamp(inE * reach * (human ? 0.7 : 0.45) + front, 0.0, 1.0));',
    '  aL += front * 0.4; aD += front * 0.8;',
    '',
    '  float dark = darkAt(scr);',
    '  vec3 col = mix(cL, cD, dark);',
    '  float a = clamp(mix(aL, aD, dark), 0.0, 1.0);',
    '  a *= dust ? uDust * 0.55 : mix(0.28, 1.0, smoothstep(0.0, 0.7, f));',
    '  a *= uDim;',
    '  vColor = vec4(col * a, a * (1.0 - dark * 0.72));',
    '  vRing = bead ? 1.0 - dark : 0.0;',
    '',
    '  float size = node ? (bead ? 0.36 : 0.27) : (aKind < 0.5 ? (human ? 0.13 : 0.11) : 0.1);',
    '  size *= 0.7 + fract(aSeed * 13.7) * 0.65;',
    '  gl_PointSize = z < 1.0 ? 0.0 : max(size * uFocal / z * uDpr, 1.0);',
    '}'
  ].join('\n');

  var POINTS_FS = [
    'precision mediump float;',
    'varying vec4 vColor;',
    'varying float vRing;',
    'void main() {',
    '  float r = length(gl_PointCoord - 0.5);',
    '  if (r > 0.5) discard;',
    '  vec4 c = vColor * smoothstep(0.5, 0.36, r);',
    '  // contas brancas com contorno escuro (como na referência)',
    '  float edge = smoothstep(0.3, 0.38, r) * vRing;',
    '  c.rgb = mix(c.rgb, vec3(0.32, 0.35, 0.36) * c.a, edge);',
    '  gl_FragColor = c;',
    '}'
  ].join('\n');

  var LINES_VS = COMMON + '\n' + [
    'attribute vec3 aLocal; attribute vec3 aStart; attribute float aSeed; attribute float aHand; attribute float aKind;',
    'varying vec4 vColor;',
    'void main() {',
    '  float f = formOf(aHand, aSeed);',
    '  vec3 w = aHand > 1.5 ? aLocal : mix(aStart, toWorld(aLocal, aHand), f);',
    '  float z;',
    '  vec2 sp = toScreen(w, z);',
    '  gl_Position = vec4(sp / (uRes * 0.5), 0.0, 1.0);',
    '  vec2 scr = sp + uRes * 0.5;',
    '  bool thread = aKind > 0.5;',
    '  bool anat = aKind > 2.5;',
    '  bool far = aKind > 1.5 && !anat;',
    'thread = thread && !anat;',
    '  float aL = anat ? 0.62 : (far ? 0.15 : (thread ? 0.27 : 0.3));',
    '  float aD = anat ? 0.4 : (far ? 0.07 : (thread ? 0.13 : 0.15));',
    '  vec3 cL = vec3(0.08, 0.09, 0.1);',
    '  vec3 cD = vec3(0.84, 0.9, 0.89);',
    '  float inE = energyIn(w);',
    '  float front = energyFront(w);',
    '  float reach = aHand < 0.5 ? smoothstep(11.0, 2.0, distance(w, uContact)) : 1.0;',
    '  cL = mix(cL, vec3(0.0, 0.6, 0.36), clamp(inE * reach * 0.9 + front, 0.0, 1.0));',
    '  cD = mix(cD, vec3(0.0, 0.9, 0.46), clamp(inE * reach * 0.55 + front, 0.0, 1.0));',
    '  aD += front * 0.45 + inE * reach * 0.08;',
    '  float dark = darkAt(scr);',
    '  float a = mix(aL, aD, dark) * smoothstep(0.35, 1.0, f) * (thread ? uThreads : 1.0) * uDim;',
    '  vColor = vec4(mix(cL, cD, dark) * a, a * (1.0 - dark * 0.72));',
    '}'
  ].join('\n');

  var LINES_FS = [
    'precision mediump float;',
    'varying vec4 vColor;',
    'void main() { gl_FragColor = vColor; }'
  ].join('\n');

  var BG_VS = [
    'attribute vec2 aPos;',
    'void main() { gl_Position = vec4(aPos, 0.0, 1.0); }'
  ].join('\n');

  var BG_FS = [
    'precision highp float;',
    'uniform vec2 uRes; uniform float uDpr; uniform float uTime;',
    'uniform vec2 uRevealC; uniform float uRevealR; uniform float uRing;',
    'uniform vec2 uGlowC; uniform float uGlow;',
    'float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }',
    'void main() {',
    '  vec2 px = gl_FragCoord.xy / uDpr;',
    '  vec2 uv = px / uRes;',
    '  vec2 q = (uv - vec2(0.5, 0.6)) * vec2(uRes.x / uRes.y, 1.0);',
    '  vec3 light = mix(vec3(0.95, 0.957, 0.953), vec3(0.79, 0.815, 0.81), smoothstep(0.15, 1.15, length(q * vec2(0.8, 1.1))));',
    '  light *= mix(0.92, 1.0, smoothstep(0.0, 0.5, uv.y));',
    '  vec2 qd = (uv - vec2(0.5, 0.52)) * vec2(uRes.x / uRes.y, 1.0);',
    '  vec3 dark = mix(vec3(0.047, 0.078, 0.094), vec3(0.012, 0.02, 0.027), smoothstep(0.0, 1.05, length(qd)));',
    '  dark += vec3(0.0, 0.9, 0.46) * uGlow * 0.11 * exp(-distance(px, uGlowC) / (uRes.y * 0.22));',
    '  float d = distance(px, uRevealC);',
    '  float k = smoothstep(uRevealR + 3.0, uRevealR - 3.0, d);',
    '  vec3 col = mix(light, dark, k);',
    '  col += vec3(0.0, 0.9, 0.46) * uRing * exp(-abs(d - uRevealR) / 5.0) * 0.55;',
    '  col += (hash(px + fract(uTime) * 91.0) - 0.5) * 0.022;',
    '  gl_FragColor = vec4(col, 1.0);',
    '}'
  ].join('\n');

  function compile(gl, type, src) {
    var s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  }
  function makeProgram(gl, vs, fs) {
    var p = gl.createProgram();
    gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vs));
    gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    return p;
  }

  /* ---------------- cena ---------------- */
  var S = {
    form0: 1, form1: 1,
    gap: 0,
    angle: 16,
    roll0: -28, roll1: -28,
    sceneRot: 0,
    camZ: 64,
    shiftX: 0, shiftY: 0,
    energy: 60, reveal: 1e5, revealX: 0, revealY: 0, ring: 0,
    glow: 1, threads: 1, dim: 1, dust: 1,
    float: 1
  };

  var gl, canvas, progPts, progLines, progBg;
  var bufPts, bufLines, bufBg, nPts = 0, nLineVerts = 0;
  var W = 0, H = 0, dpr = 1, focal = 1;
  var mouse = { x: 0, y: 0, tx: 0, ty: 0 };
  var running = false;
  var frameHooks = [];
  var startTime = 0;
  var reduceMotion = false;
  var anchors = { labels: [], bubbles: [] };
  var model = null;

  function buildModel(small) {
    var rand = mulberry32(1107);
    var counts = small
      ? { human: 6000, digital: 2300, dNodes: 110, hNodes: 60, dissolve: 520, dust: 260, links: 2, far: 8, threads: 9 }
      : { human: 13500, digital: 5200, dNodes: 190, hNodes: 110, dissolve: 1100, dust: 520, links: 2, far: 14, threads: 16 };

    // O antebraço humano vai-se desfazendo: menos pele à medida que se afasta da mão.
    var human = sampleHand(Math.round(counts.human * 1.25), rand, SK_HUMAN).filter(function (s) {
      if (s.p[0] > -15) return true;
      return rand() < Math.max(0.1, 1 - (-15 - s.p[0]) / 10);
    }).slice(0, counts.human);
    var digital = sampleHand(counts.digital + counts.dNodes * 6, rand, SK_DIGITAL);
    var dNodeIdx = pickNodes(digital, counts.dNodes, small ? 1.3 : 1.05, rand);
    var hNodeIdx = pickNodes(human, counts.hNodes, 1.4, rand, function (p) { return p[0] < -15 || rand() < 0.16; });

    var pts = [];   // registos: local(3) normal(3) start(3) seed hand kind
    var nodeRefs = { h: [], d: [] };

    function start() {
      return [(rand() * 2 - 1) * 46, (rand() * 2 - 1) * 28, (rand() * 2 - 1) * 22];
    }
    function push(local, normal, hand, kind, st, seed) {
      var rec = { local: local, normal: normal, start: st || start(), seed: seed === undefined ? rand() : seed, hand: hand, kind: kind };
      pts.push(rec);
      return rec;
    }

    // mão humana: pele pontilhada
    human.forEach(function (s) { push(s.p, s.n, 0, 0); });
    // nós da mão humana (sobretudo onde se dissolve em rede)
    hNodeIdx.forEach(function (i) { nodeRefs.h.push(push(human[i].p, human[i].n, 0, 1)); });
    // mão digital: poucos pontos de pele + muitos nós
    var dNodeSet = {};
    dNodeIdx.forEach(function (i) { dNodeSet[i] = true; nodeRefs.d.push(push(digital[i].p, digital[i].n, 1, 1)); });
    var skin = 0;
    for (var i = 0; i < digital.length && skin < counts.digital; i++) {
      if (dNodeSet[i]) continue;
      push(digital[i].p, digital[i].n, 1, 0);
      skin++;
    }
    // o antebraço humano dissolve-se em pó
    for (var k = 0; k < counts.dissolve; k++) {
      var x = -16 - Math.pow(rand(), 0.8) * 14;
      var spread = 3.6 + (-16 - x) * 0.32;
      push([x, (rand() * 2 - 1) * spread, (rand() * 2 - 1) * spread], [0, 0, 1], 0, 3);
    }
    // pó livre no ar
    for (var j = 0; j < counts.dust; j++) {
      var dp = [(rand() * 2 - 1) * 50, (rand() * 2 - 1) * 30, (rand() * 2 - 1) * 26];
      push(dp, [0, 0, 1], 2, 2, dp);
    }

    // linhas: rede da mão digital, rede no pulso humano, fios entre as mãos e fios para fora
    var lines = [];
    function lineV(rec) { return { local: rec.local, start: rec.start, seed: rec.seed, hand: rec.hand }; }
    function link(a, b, kind) { lines.push([lineV(a), lineV(b), kind]); }

    var dPts = nodeRefs.d.map(function (r) { return { p: r.local }; });
    linkNodes(dPts, dPts.map(function (_, i) { return i; }), small ? 2.7 : 2.4, counts.links).forEach(function (pr) {
      link(nodeRefs.d[pr[0]], nodeRefs.d[pr[1]], 0);
    });
    // anatomia em linhas: tendões nas duas mãos; ossos e articulações na mão digital
    var anatH = anatomyLines(SK_HUMAN);
    var anatD = anatomyLines(SK_DIGITAL);
    function polyline(list, hand, withNodes) {
      var prev = null;
      list.forEach(function (q) {
        var rec = withNodes ? push(q, [0, 1, 0], hand, 1) : { local: q, start: start(), seed: rand(), hand: hand };
        if (prev) link(prev, rec, 3);
        prev = rec;
      });
    }
    anatH.tendons.forEach(function (l) { polyline(l, 0, false); });
    anatD.tendons.forEach(function (l) { polyline(l, 1, true); });
    anatD.bones.forEach(function (l) { polyline(l, 1, true); });

    var hPts = nodeRefs.h.map(function (r) { return { p: r.local }; });
    linkNodes(hPts, hPts.map(function (_, i) { return i; }), 3.2, 2).forEach(function (pr) {
      link(nodeRefs.h[pr[0]], nodeRefs.h[pr[1]], 0);
    });

    function nodesBetween(list, x0, x1) { return list.filter(function (r) { return r.local[0] > x0 && r.local[0] < x1; }); }
    var hHand = nodesBetween(nodeRefs.h, 0, 16);
    var hArm = nodesBetween(nodeRefs.h, -30, -2);
    var dHand = nodesBetween(nodeRefs.d, 1, 17);
    var dArm = nodesBetween(nodeRefs.d, -30, -2);

    var threadPairs = [];
    var nThreads = counts.threads;
    for (var t = 0; t < nThreads; t++) {
      var a = (hHand.length ? hHand : nodeRefs.h)[Math.floor(rand() * (hHand.length || nodeRefs.h.length))];
      var b = dHand[Math.floor(rand() * dHand.length)];
      link(a, b, 1);
      threadPairs.push([a, b]);
    }
    var nFar = counts.far;
    for (var fz = 0; fz < nFar; fz++) {
      var from = fz % 2 ? dArm[Math.floor(rand() * dArm.length)] : (hArm.length ? hArm : nodeRefs.h)[Math.floor(rand() * (hArm.length || nodeRefs.h.length))];
      var dir = norm([(rand() * 2 - 1), (rand() * 2 - 1), (rand() * 2 - 1) * 0.4]);
      var far = mul(dir, 70 + rand() * 30);
      lines.push([lineV(from), { local: far, start: far, seed: 0, hand: 2 }, 2]);
    }

    // âncoras para etiquetas (áreas de trabalho) e para as mensagens
    var labelX = [12.5, 8.5, 4.5, 0.5, -4.5, -9.5, -14.5];
    var labels = labelX.map(function (lx, i) {
      var best = null, bestScore = 1e9;
      nodeRefs.d.forEach(function (r) {
        var side = i % 2 ? -1 : 1;
        var score = Math.abs(r.local[0] - lx) * 2 - r.local[1] * side * 0.8;
        if (score < bestScore) { bestScore = score; best = r; }
      });
      return best;
    });

    return { pts: pts, lines: lines, labels: labels, threads: threadPairs };
  }

  function upload() {
    var stride = 12;
    var data = new Float32Array(model.pts.length * stride);
    model.pts.forEach(function (r, i) {
      var o = i * stride;
      data[o] = r.local[0]; data[o + 1] = r.local[1]; data[o + 2] = r.local[2];
      data[o + 3] = r.normal[0]; data[o + 4] = r.normal[1]; data[o + 5] = r.normal[2];
      data[o + 6] = r.start[0]; data[o + 7] = r.start[1]; data[o + 8] = r.start[2];
      data[o + 9] = r.seed; data[o + 10] = r.hand; data[o + 11] = r.kind;
    });
    nPts = model.pts.length;
    bufPts = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, bufPts);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);

    var lstride = 9;
    var ldata = new Float32Array(model.lines.length * 2 * lstride);
    model.lines.forEach(function (ln, i) {
      for (var e = 0; e < 2; e++) {
        var v = ln[e];
        var o = (i * 2 + e) * lstride;
        ldata[o] = v.local[0]; ldata[o + 1] = v.local[1]; ldata[o + 2] = v.local[2];
        ldata[o + 3] = v.start[0]; ldata[o + 4] = v.start[1]; ldata[o + 5] = v.start[2];
        ldata[o + 6] = v.seed; ldata[o + 7] = v.hand; ldata[o + 8] = ln[2];
      }
    });
    nLineVerts = model.lines.length * 2;
    bufLines = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, bufLines);
    gl.bufferData(gl.ARRAY_BUFFER, ldata, gl.STATIC_DRAW);

    bufBg = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, bufBg);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  }

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, W && W < 760 ? 1.75 : 2);
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    focal = (H * 0.5) / Math.tan(20 * DEG);
    if (gl) gl.viewport(0, 0, canvas.width, canvas.height);
  }

  /* ---------------- transformações ---------------- */
  var T = {};
  function computeTransforms(time) {
    var a = S.angle * DEG;
    var dir = [Math.cos(a), Math.sin(a), 0];
    var bob = S.float * Math.sin(time * 0.55) * 0.22;
    var gap = S.gap;

    // Cada braço chega com o seu ângulo; só as pontas dos indicadores se encontram.
    var a0 = a + POSE.human.angle * DEG;
    var a1 = a + POSE.digital.angle * DEG;
    var R0 = mm(rz(a0), mm(rx(POSE.human.roll * DEG), rz(POSE.human.bend * DEG)));
    var R1 = mm(rz(a1), mm(MIRROR_X, mm(rx(POSE.digital.roll * DEG), rz(POSE.digital.bend * DEG))));
    var tip0 = mv(R0, TIP_HUMAN);
    var tip1 = mv(R1, TIP_DIGITAL);
    var P0 = sub(mul(dir, -gap / 2), tip0);
    var P1 = sub(mul(dir, gap / 2), tip1);
    P0[1] += bob; P1[1] += bob;

    mouse.x += (mouse.tx - mouse.x) * 0.05;
    mouse.y += (mouse.ty - mouse.y) * 0.05;
    var par = reduceMotion ? [1, 0, 0, 0, 1, 0, 0, 0, 1] : mm(ry(mouse.x * 0.16 + Math.sin(time * 0.12) * 0.04), rx(mouse.y * 0.1));
    var SC = mm(rz(S.sceneRot * DEG), par);

    T.R0 = R0; T.R1 = R1; T.P0 = P0; T.P1 = P1; T.SC = SC;
  }

  function formOf(hand, seed) {
    var form = hand === 0 ? S.form0 : hand === 1 ? S.form1 : 1;
    var f = Math.max(0, Math.min(1, form * 1.7 - seed * 0.7));
    return f * f * (3 - 2 * f);
  }

  // Posição no ecrã (px CSS, origem no canto superior esquerdo) de um registo da cena.
  function screenOf(rec) {
    var target = rec.hand === 0 ? add(mv(T.R0, rec.local), T.P0) : rec.hand === 1 ? add(mv(T.R1, rec.local), T.P1) : rec.local;
    var w = lerp3(rec.start, target, formOf(rec.hand, rec.seed));
    return project(w);
  }
  function project(w) {
    var v = mv(T.SC, w);
    var z = S.camZ - v[2];
    var k = focal / Math.max(z, 0.001);
    return { x: W / 2 + v[0] * k + S.shiftX, y: H / 2 - (v[1] * k + S.shiftY), z: z };
  }

  /* ---------------- desenho ---------------- */
  var locCache = {};
  function loc(prog, name) {
    var key = (prog === progPts ? 'p' : prog === progLines ? 'l' : 'b') + name;
    if (!(key in locCache)) locCache[key] = gl.getUniformLocation(prog, name);
    return locCache[key];
  }
  function setCommon(prog, time) {
    gl.uniformMatrix3fv(loc(prog, 'uRot0'), false, glMat(T.R0));
    gl.uniformMatrix3fv(loc(prog, 'uRot1'), false, glMat(T.R1));
    gl.uniform3fv(loc(prog, 'uPos0'), T.P0);
    gl.uniform3fv(loc(prog, 'uPos1'), T.P1);
    gl.uniformMatrix3fv(loc(prog, 'uScene'), false, glMat(T.SC));
    gl.uniform1f(loc(prog, 'uCamZ'), S.camZ);
    gl.uniform1f(loc(prog, 'uFocal'), focal);
    gl.uniform2f(loc(prog, 'uRes'), W, H);
    gl.uniform2f(loc(prog, 'uShift'), S.shiftX, S.shiftY);
    gl.uniform1f(loc(prog, 'uDpr'), dpr);
    gl.uniform1f(loc(prog, 'uForm0'), S.form0);
    gl.uniform1f(loc(prog, 'uForm1'), S.form1);
    gl.uniform1f(loc(prog, 'uTime'), time);
    gl.uniform3f(loc(prog, 'uContact'), 0, 0, 0);
    gl.uniform1f(loc(prog, 'uEnergy'), S.energy);
    gl.uniform2f(loc(prog, 'uRevealC'), S.revealX, H - S.revealY);
    gl.uniform1f(loc(prog, 'uRevealR'), S.reveal);
    gl.uniform1f(loc(prog, 'uThreads'), S.threads);
    gl.uniform1f(loc(prog, 'uDim'), S.dim);
    gl.uniform1f(loc(prog, 'uDust'), S.dust);
  }
  function bindAttribs(prog, names, sizes, stride) {
    var offset = 0;
    for (var i = 0; i < names.length; i++) {
      var l = gl.getAttribLocation(prog, names[i]);
      if (l >= 0) {
        gl.enableVertexAttribArray(l);
        gl.vertexAttribPointer(l, sizes[i], gl.FLOAT, false, stride * 4, offset * 4);
      }
      offset += sizes[i];
    }
  }
  function unbindAttribs(prog, names) {
    names.forEach(function (n) {
      var l = gl.getAttribLocation(prog, n);
      if (l >= 0) gl.disableVertexAttribArray(l);
    });
  }

  var PT_ATTR = ['aLocal', 'aNormal', 'aStart', 'aSeed', 'aHand', 'aKind'];
  var LN_ATTR = ['aLocal', 'aStart', 'aSeed', 'aHand', 'aKind'];

  function render(now) {
    if (!gl) return;
    var time = reduceMotion ? 0 : (now - startTime) / 1000;
    computeTransforms(time);

    // fundo
    gl.disable(gl.BLEND);
    gl.useProgram(progBg);
    gl.bindBuffer(gl.ARRAY_BUFFER, bufBg);
    var lb = gl.getAttribLocation(progBg, 'aPos');
    gl.enableVertexAttribArray(lb);
    gl.vertexAttribPointer(lb, 2, gl.FLOAT, false, 0, 0);
    var contact = project([0, 0, 0]);
    gl.uniform2f(loc(progBg, 'uRes'), W, H);
    gl.uniform1f(loc(progBg, 'uDpr'), dpr);
    gl.uniform1f(loc(progBg, 'uTime'), time);
    gl.uniform2f(loc(progBg, 'uRevealC'), S.revealX, H - S.revealY);
    gl.uniform1f(loc(progBg, 'uRevealR'), S.reveal);
    gl.uniform1f(loc(progBg, 'uRing'), S.ring);
    gl.uniform2f(loc(progBg, 'uGlowC'), contact.x, H - contact.y);
    gl.uniform1f(loc(progBg, 'uGlow'), S.glow);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.disableVertexAttribArray(lb);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

    // linhas
    gl.useProgram(progLines);
    setCommon(progLines, time);
    gl.bindBuffer(gl.ARRAY_BUFFER, bufLines);
    bindAttribs(progLines, LN_ATTR, [3, 3, 1, 1, 1], 9);
    gl.drawArrays(gl.LINES, 0, nLineVerts);
    unbindAttribs(progLines, LN_ATTR);

    // pontos
    gl.useProgram(progPts);
    setCommon(progPts, time);
    gl.bindBuffer(gl.ARRAY_BUFFER, bufPts);
    bindAttribs(progPts, PT_ATTR, [3, 3, 3, 1, 1, 1], 12);
    gl.drawArrays(gl.POINTS, 0, nPts);
    unbindAttribs(progPts, PT_ATTR);

    for (var i = 0; i < frameHooks.length; i++) frameHooks[i](time);
  }

  function loop(now) {
    if (!running) return;
    render(now);
    requestAnimationFrame(loop);
  }

  /* ---------------- API ---------------- */
  window.ElevenScene = {
    state: S,
    init: function (el, opts) {
      canvas = el;
      reduceMotion = !!(opts && opts.reduceMotion);
      try {
        gl = canvas.getContext('webgl', {
          antialias: true,
          alpha: false,
          premultipliedAlpha: true,
          preserveDrawingBuffer: !!(opts && opts.preserve),
          powerPreference: 'high-performance'
        }) ||
          canvas.getContext('experimental-webgl');
        if (!gl) return false;
        progPts = makeProgram(gl, POINTS_VS, POINTS_FS);
        progLines = makeProgram(gl, LINES_VS, LINES_FS);
        progBg = makeProgram(gl, BG_VS, BG_FS);
      } catch (err) {
        gl = null;
        return false;
      }
      W = window.innerWidth;
      model = buildModel(W < 760);
      anchors.labels = model.labels;
      anchors.threads = model.threads;
      upload();
      resize();
      startTime = performance.now();
      computeTransforms(0);

      window.addEventListener('resize', resize);
      window.addEventListener('pointermove', function (e) {
        mouse.tx = (e.clientX / W - 0.5) * 2;
        mouse.ty = (e.clientY / H - 0.5) * 2;
      }, { passive: true });
      return true;
    },
    start: function () {
      if (running || !gl) return;
      running = true;
      if (reduceMotion) { render(performance.now()); running = false; return; }
      requestAnimationFrame(loop);
    },
    render: function () { render(performance.now()); },
    onFrame: function (fn) { frameHooks.push(fn); },
    anchors: anchors,
    screenOf: function (rec) { return screenOf(rec); },
    contact: function () { return project([0, 0, 0]); },
    size: function () { return { w: W, h: H }; }
  };
})();
