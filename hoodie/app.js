import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const REDUCED=matchMedia('(prefers-reduced-motion: reduce)').matches;
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


// This lab is independent of ../app.js. Future hoodie changes belong here only.
const canvas=document.querySelector('canvas');
const renderer=new THREE.WebGLRenderer({canvas,antialias:true});
renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.setSize(innerWidth,innerHeight);
renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.05;
renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
const scene=new THREE.Scene();scene.background=new THREE.Color('#f0ede9');
const pmrem=new THREE.PMREMGenerator(renderer);scene.environment=pmrem.fromScene(new RoomEnvironment(),.04).texture;scene.environmentIntensity=.28;pmrem.dispose();
const camera=new THREE.PerspectiveCamera(36,innerWidth/innerHeight,.03,30);camera.position.set(0,.18,2.05);
const controls=new OrbitControls(camera,canvas);controls.target.set(0,.06,0);controls.enableDamping=true;controls.enablePan=false;controls.minDistance=1.1;controls.maxDistance=3.2;controls.maxPolarAngle=Math.PI*.85;controls.update();controls.saveState();
scene.add(new THREE.HemisphereLight('#e2e8d6','#2a2822',.35));
const key=new THREE.DirectionalLight('#fff1dc',2.6);key.position.set(2.2,4.2,3);key.castShadow=true;key.shadow.mapSize.set(1024,1024);key.shadow.normalBias=.012;scene.add(key);
const fill=new THREE.DirectionalLight('#c9d6df',.55);fill.position.set(-3.2,2.2,3);scene.add(fill);
const ground=new THREE.Mesh(new THREE.PlaneGeometry(20,20),new THREE.MeshStandardMaterial({color:'#e3ddd1',roughness:.9}));ground.rotation.x=-Math.PI/2;ground.position.y=-.36;ground.receiveShadow=true;scene.add(ground);
const clock={value:0},knit=knitNormalMap();knit.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());
const cloth=clothMaterial('#111112',knit,clock,0);
const loader=new THREE.BufferGeometryLoader();
const [bodyGeometry,hoodGeometry]=await Promise.all(['body.json','hood.json'].map(async path=>{const response=await fetch(path);if(!response.ok)throw Error('No se pudo cargar '+path);return loader.parse(await response.json());}));
const garment=new THREE.Group();garment.position.y=.44;scene.add(garment);
for(const geometry of [bodyGeometry,hoodGeometry]){const part=new THREE.Mesh(geometry,cloth.material);part.customDepthMaterial=cloth.depth;part.castShadow=part.receiveShadow=true;garment.add(part);}
const collarPoints=Array.from({length:97},(_,i)=>{const t=i/96*Math.PI*2;return new THREE.Vector3(Math.cos(t)*.089,-.037-.027*Math.max(0,Math.sin(t)),Math.sin(t)*.052);});
const binding=new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(collarPoints),96,.004,8,false),cloth.material);garment.add(binding);
for(const side of [-1,1]){const points=[new THREE.Vector3(side*.065,-.055,.064),new THREE.Vector3(side*.066,-.15,.083),new THREE.Vector3(side*.058,-.26,.082)];const cord=new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points),32,.0022,8,false),cloth.material);cord.castShadow=true;garment.add(cord);}
let targetYaw=0;
for(const button of document.querySelectorAll('[data-angle]'))button.onclick=()=>{targetYaw=Number(button.dataset.angle);controls.reset();};
document.querySelector('#reset').onclick=()=>{targetYaw=0;controls.reset();};
addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);});
let last=performance.now();function frame(t){const dt=Math.min((t-last)/1000,.05);last=t;clock.value=t/1000;garment.rotation.y+=(targetYaw-garment.rotation.y)*(REDUCED?1:1-Math.exp(-dt*8));controls.update();renderer.render(scene,camera);requestAnimationFrame(frame);}requestAnimationFrame(frame);

