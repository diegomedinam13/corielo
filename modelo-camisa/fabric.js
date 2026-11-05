import * as THREE from 'three';
// ---------- 3. Tela -------------------------------------------------------------
// Mapa de normales de punto jersey (columnas de "V") generado por código.
function knitNormalMap() {
  const S = 256, cells = 16, h = new Float32Array(S * S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const cx = (x / S * cells) % 1, cy = (y / S * cells * 1.25) % 1;
    const u = cx * 2 - 1;                       // cada columna = dos medias mallas inclinadas → "V"
    const lx = (Math.abs(u) - 0.5) * 2, ly = ((cy + Math.abs(u) * 0.5) % 1) * 2 - 1;
    const r = Math.hypot(lx, ly * 1.2);
    h[y * S + x] = Math.max(0, 1 - r * r) ** 0.8 + (Math.random() - 0.5) * 0.08;
  }
  const data = new Uint8Array(S * S * 4), H = (x, y) => h[((y + S) % S) * S + ((x + S) % S)];
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const dx = (H(x + 1, y) - H(x - 1, y)) * 1.6, dy = (H(x, y + 1) - H(x, y - 1)) * 1.6, l = Math.hypot(dx, dy, 1);
    const o = (y * S + x) * 4;
    data[o] = (-dx / l) * 127 + 128; data[o + 1] = (-dy / l) * 127 + 128; data[o + 2] = (1 / l) * 127 + 128; data[o + 3] = 255;
  }
  const t = new THREE.DataTexture(data, S, S);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(28, 22);
  t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true; t.needsUpdate = true;
  return t;
}

const CLOTH_COMMON = /* glsl */`
uniform float uTime, uPhase, uAmp, uTwist;
uniform vec2 uBend;
// 0 en los hombros (apoyados en la percha) → 1 en el bajo. Las mangas cuelgan libres.
float clothWeight(vec3 p) {
  float body = smoothstep(-0.08, -0.80, p.y);
  float sleeve = 0.7 * smoothstep(0.22, 0.36, abs(p.x)) * smoothstep(-0.03, -0.16, p.y);
  return max(body, sleeve);
}
// x = altura de la onda, yz = derivadas en x,y (para corregir la normal)
vec3 clothWave(vec3 p) {
  float a1 = uTime * 1.3 + p.x * 7.0 + p.y * 10.0 + uPhase;
  float a2 = uTime * 2.1 - p.x * 15.0 + p.y * 6.0 + uPhase * 1.9;
  float a3 = uTime * 0.6 + p.y * 3.0 + uPhase * 0.7;
  float gust = 0.6 + 0.4 * sin(uTime * 0.27 + uPhase * 3.1);
  float h = 0.45 * sin(a1) + 0.25 * sin(a2) + 0.9 * sin(a3);
  vec2 g = vec2(3.15 * cos(a1) - 3.75 * cos(a2), 4.5 * cos(a1) + 1.5 * cos(a2) + 2.7 * cos(a3));
  return vec3(h, g) * gust;
}
vec2 clothTurn(vec2 v, float a) { float c = cos(a), s = sin(a); return vec2(c * v.x + s * v.y, -s * v.x + c * v.y); }
`;
const CLOTH_NORMAL = /* glsl */`
float clothN = clothWeight(position);
objectNormal.xy -= objectNormal.z * uAmp * clothN * clothWave(position).yz;
objectNormal.xz = clothTurn(objectNormal.xz, uTwist * clothN);
objectNormal = normalize(objectNormal);
`;
const CLOTH_VERTEX = /* glsl */`
float clothW = clothWeight(position);
transformed.z += uAmp * clothW * clothWave(position).x;
transformed.xz += uBend * clothW * clothW;
transformed.y += length(uBend) * clothW * clothW * 0.25;
transformed.xz = clothTurn(transformed.xz, uTwist * clothW);
`;
function injectCloth(shader, uniforms) {
  Object.assign(shader.uniforms, uniforms);
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\n' + CLOTH_COMMON)
    .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\n' + CLOTH_NORMAL)
    .replace('#include <begin_vertex>', '#include <begin_vertex>\n' + CLOTH_VERTEX);
}
function clothMaterial(color, normalMap, clock, phase) {
  const c = new THREE.Color(color);
  const uniforms = {
    uTime: clock, uPhase: { value: phase }, uAmp: { value: 0 }, uTwist: { value: 0 },
    uBend: { value: new THREE.Vector2() }, uLining: { value: c.clone().multiplyScalar(0.55) },
  };
  const material = new THREE.MeshPhysicalMaterial({
    color: c, roughness: 0.78, normalMap, normalScale: new THREE.Vector2(0.18, 0.18),
    sheen: 0.55, sheenRoughness: 0.55, sheenColor: new THREE.Color('#f2efe6'), side: THREE.DoubleSide,
  });
  material.onBeforeCompile = shader => {
    injectCloth(shader, uniforms);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uLining;')
      .replace('#include <map_fragment>', '#include <map_fragment>\nif (!gl_FrontFacing) diffuseColor.rgb = uLining;');
  };
  material.customProgramCacheKey = () => 'cloth';
  const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, side: THREE.DoubleSide });
  depth.onBeforeCompile = shader => injectCloth(shader, uniforms);
  depth.customProgramCacheKey = () => 'cloth-depth';
  return { material, depth, uniforms };
}


export { clothMaterial, knitNormalMap };
