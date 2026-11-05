import { FIRST_DESIGN, loadFirstDesign, applyFirstDesign } from '../designs.js';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clothMaterial, knitNormalMap } from './fabric.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/* =========================================================================
   Vestuario · Motion — perchero 3D con camisas genéricas
   ---------------------------------------------------------------------------
   1. Configuración y paleta
   2. Geometría de la camisa (procedural; se puede cambiar por un .glb)
   3. Tela: material físico + shader de ondulación, torsión y arrastre
   4. Escena: sala, riel, luces
   5. Perchas, layout, física e interacción
   ========================================================================= */

// ---------- 1. Configuración ------------------------------------------------
const RAIL_Y = 1.95;                 // altura del riel
const HOOK = 0.11;                   // del riel al cuello de la camisa
const SPACING = 0.16;               // separación entre perchas
const GROUP_GAP = 0.36;              // aire extra entre grupos
const REST_YAW = 1.2;                // camisas de perfil, como en un perchero real
const CAM = new THREE.Vector3(0, 1.48, 2.95);
const FOV = 32;
const MOBILE = innerWidth < 820 || matchMedia('(pointer: coarse)').matches;
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;

// Colores neutros genéricos (sustituibles por tus diseños más adelante)
const HEM_Y=-.78;
const GROUPS = [
  { name: 'Claros', colors: ['#e7e3d6', '#d9d4c3', '#cfc8b4', '#efede6', '#c9c3b0', '#dedbd0'] },
  { name: 'Tierra', colors: ['#b59f86', '#a08a72', '#8f7b66', '#c4ae92', '#7e6c5b', '#ad9a7d'] },
  { name: 'Verdes y fríos', colors: ['#9aa68f', '#7f8c7a', '#66705f', '#8d9c9c', '#5f6b6d', '#a7b0a6'] },
];

function hangerGeometry() {
  // A raised crown and short sloping shoulders seat behind the collar.
  // The tapered ends enter the garment instead of ending in a floating cap.
  const outline = new THREE.Shape();
  outline.moveTo(-.024, .024);
  outline.quadraticCurveTo(0, .028, .024, .024);
  outline.bezierCurveTo(.033, .003, .052, -.029, .103, -.062);
  outline.quadraticCurveTo(.110, -.070, .102, -.079);
  outline.bezierCurveTo(.070, -.057, .030, -.019, 0, -.018);
  outline.bezierCurveTo(-.030, -.019, -.070, -.057, -.102, -.079);
  outline.quadraticCurveTo(-.110, -.070, -.103, -.062);
  outline.bezierCurveTo(-.052, -.029, -.033, .003, -.024, .024);
  const g = new THREE.ExtrudeGeometry(outline, { depth: .018, steps: 1, bevelEnabled: true, bevelSegments: 4, bevelSize: .003, bevelThickness: .003, curveSegments: 24 });
  g.translate(0, 0, -.009); return g;
}
function hookGeometry() {
  // Photo reference: centered short stem, swept left shoulder, open right tip.
  const V = (x,y) => new THREE.Vector3(x,y,0);
  const path = new THREE.CurvePath();
  path.add(new THREE.LineCurve3(V(0,-.016), V(0,.023)));
  path.add(new THREE.CubicBezierCurve3(V(0,.023), V(0,.039), V(-.006,.041), V(-.017,.055)));
  path.add(new THREE.CubicBezierCurve3(V(-.017,.055), V(-.036,.0792), V(-.035,.096), V(-.022,.109)));
  path.add(new THREE.CubicBezierCurve3(V(-.022,.109), V(-.007,.124), V(.021,.128), V(.038,.111)));
  path.add(new THREE.CubicBezierCurve3(V(.038,.111), V(.047,.102), V(.052,.090), V(.059,.086)));
  const radius = .002;
  const wire = new THREE.TubeGeometry(path, 144, radius, 12, false);
  const tip = new THREE.SphereGeometry(radius, 12, 8); tip.translate(.059,.086,0);
  return mergeGeometries([wire, tip]);
}

// ---------- 4. Escena -------------------------------------------------------------
const $ = s => document.querySelector(s);
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, MOBILE ? 1.5 : 2));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.prepend(renderer.domElement);
const canvas = renderer.domElement;

const scene = new THREE.Scene();
scene.background = new THREE.Color('#f0ede9');
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.28;
pmrem.dispose();

const camera = new THREE.PerspectiveCamera(FOV, innerWidth / innerHeight, 0.05, 40);
camera.position.copy(CAM);

const std = (color, roughness = 0.9, metalness = 0) => new THREE.MeshStandardMaterial({ color, roughness, metalness });
const add = (geo, mat, x, y, z, parent = scene) => {
  const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; parent.add(m); return m;
};
// Sala Corielo: warm plaster, quiet panel lines and a sage baseboard.
// Garment geometry, materials, lighting and interaction are intentionally preserved.
const FLOOR_Y = 0.5, WALL_Z = -0.55;
const plaster = std('#e9e2d7', .98);
add(new THREE.PlaneGeometry(30, 8), plaster, 0, 2, WALL_Z).castShadow = false;
for (let x = -9; x <= 9; x += 1.5) {
  add(new THREE.BoxGeometry(.005, 8, .005), std('#cec8ba', .98), x, 2, WALL_Z + .004).castShadow = false;
}
const floor = add(new THREE.PlaneGeometry(30, 10), std('#d9d1c1', .88, 0), 0, FLOOR_Y, 2);
floor.rotation.x = -Math.PI / 2; floor.castShadow = false;
add(new THREE.BoxGeometry(30, .075, .025), std('#6b8662', .85), 0, FLOOR_Y + .0375, WALL_Z + .015).castShadow = false;
// Recessed upper moulding adds architecture without changing the garment lights.
for (const y of [2.38, 2.41]) add(new THREE.BoxGeometry(30,.006,.008), std('#d3cbbd', .95), 0,y,WALL_Z+.008).castShadow=false;
const wallBrand = new THREE.TextureLoader().load('../assets/corielo-logo.png');
wallBrand.colorSpace = THREE.SRGBColorSpace;
const wallSign = new THREE.Mesh(new THREE.PlaneGeometry(.62, .242), new THREE.MeshBasicMaterial({map:wallBrand, transparent:true, opacity:.68, depthWrite:false}));
wallSign.position.set(0,2.075,WALL_Z+.018); scene.add(wallSign);

// Small original line motifs inspired by the brand's heart, faith and nature themes.
function wallMotif(kind) {
  const c=document.createElement('canvas');c.width=c.height=256;const g=c.getContext('2d');
  g.strokeStyle='#6b8662';g.lineWidth=3;g.lineCap='round';g.lineJoin='round';
  const line=(x,y,a,b)=>{g.beginPath();g.moveTo(x,y);g.lineTo(a,b);g.stroke();};
  if(kind==='heart'){
    g.beginPath();g.moveTo(128,208);g.bezierCurveTo(107,186,49,143,49,106);g.bezierCurveTo(49,67,101,57,128,94);g.bezierCurveTo(155,57,207,67,207,106);g.bezierCurveTo(207,143,149,186,128,208);g.stroke();
    g.beginPath();g.moveTo(117,71);g.bezierCurveTo(102,52,132,41,126,22);g.bezierCurveTo(153,44,153,60,139,72);g.stroke();
    line(128,7,128,33);line(117,18,139,18);
    g.beginPath();g.moveTo(62,131);g.quadraticCurveTo(128,107,193,133);g.stroke();
    for(let i=0;i<5;i++){const x=79+i*24;line(x,124,x+9,113);}
  }else if(kind==='star'){
    g.beginPath();g.moveTo(128,35);g.quadraticCurveTo(140,116,221,128);g.quadraticCurveTo(140,140,128,221);g.quadraticCurveTo(116,140,35,128);g.quadraticCurveTo(116,116,128,35);g.stroke();
    line(190,39,190,67);line(176,53,204,53);
  }else if(kind==='branch'){
    g.beginPath();g.moveTo(81,221);g.quadraticCurveTo(141,153,156,40);g.stroke();
    for(let i=0;i<5;i++){const x=101+i*10,y=187-i*29,side=i%2?1:-1;g.beginPath();g.moveTo(x,y);g.quadraticCurveTo(x+side*53,y-7,x+side*48,y-37);g.quadraticCurveTo(x+side*14,y-38,x,y);g.stroke();}
  }else{
    for(let i=0;i<8;i++){const a=i*Math.PI/4;g.save();g.translate(128,128);g.rotate(a);g.beginPath();g.ellipse(0,-43,13,30,0,0,Math.PI*2);g.stroke();g.restore();}g.beginPath();g.arc(128,128,13,0,Math.PI*2);g.stroke();
  }
  const texture=new THREE.CanvasTexture(c);texture.colorSpace=THREE.SRGBColorSpace;
  return new THREE.MeshBasicMaterial({map:texture,transparent:true,opacity:.52,depthWrite:false});
}
const wallMotifs={heart:wallMotif('heart'),star:wallMotif('star'),branch:wallMotif('branch'),flower:wallMotif('flower')};
for(const [kind,x,y,size,angle] of [
 ['heart',-.66,2.14,.19,-.08],['star',.64,2.16,.12,.05],['branch',-.98,1.94,.20,-.22],['flower',1.05,2.02,.14,.1],
 ['star',-1.52,2.20,.12,-.1],['heart',1.59,2.15,.19,.08],['branch',2.04,1.87,.21,.2],['flower',-2.08,1.75,.14,0],
 ['heart',-2.65,2.08,.17,-.08],['star',2.73,2.12,.11,0],['branch',3.25,1.95,.18,-.2],['flower',-3.36,2.18,.13,0]
]){const mark=new THREE.Mesh(new THREE.PlaneGeometry(size,size),wallMotifs[kind]);mark.position.set(x,y,WALL_Z+.022);mark.rotation.z=angle;scene.add(mark);}

// Luces: principal con sombra suave, relleno frío, foco cálido sobre el riel
scene.add(new THREE.HemisphereLight('#e2e8d6', '#2a2822', 0.5));
const key = new THREE.DirectionalLight('#fff1dc', 2.6);
key.position.set(2.2, 4.2, 3.0); key.target.position.set(0, 1.5, 0);
key.castShadow = true; key.shadow.mapSize.setScalar(MOBILE ? 1024 : 2048);
Object.assign(key.shadow.camera, { left: -3.6, right: 3.6, top: 2, bottom: -2, near: 1, far: 12 });
key.shadow.bias = -0.0004; key.shadow.normalBias = 0.012; key.shadow.radius = 4;
scene.add(key, key.target);
const fill = new THREE.DirectionalLight('#e4e6e3', 0.85); fill.position.set(-3.2, 2.2, 3); scene.add(fill);
const warm = new THREE.SpotLight('#ffd7a3', 0, 7, 0.95, 1, 2); warm.position.set(0, 3.3, 1.3); warm.target.position.set(0, 1.5, 0);
scene.add(warm, warm.target);

// Riel (se desplaza con el scroll)
const rail = new THREE.Group(); scene.add(rail);
const chrome = new THREE.MeshPhysicalMaterial({ color: '#c9ccc4', roughness: 0.22, metalness: 1 });
const railMesh = add(new THREE.CylinderGeometry(0.013, 0.013, 1, 20), chrome, 0, RAIL_Y, 0, rail);
railMesh.rotation.z = Math.PI / 2;

// Velo que oscurece el perchero cuando abres una prenda
const dim = new THREE.Mesh(new THREE.PlaneGeometry(40, 20), new THREE.MeshBasicMaterial({ color: '#0d0f0d', transparent: true, opacity: 0, depthWrite: false }));
dim.position.set(0, 1.4, 0.48); dim.visible = false; scene.add(dim);

// ---------- 5. Perchas ------------------------------------------------------------
const HANGER = hangerGeometry(), HOOK_GEO = hookGeometry();
const PROXY = new THREE.BoxGeometry(0.58, 0.86, 0.16).translate(0, -0.4, 0);
const knit = knitNormalMap(); knit.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
const grainCanvas = document.createElement('canvas'); grainCanvas.width = 256; grainCanvas.height = 64;
const grainCtx = grainCanvas.getContext('2d'), grainPixels = grainCtx.createImageData(256, 64);
for (let y = 0; y < 64; y++) for (let x = 0; x < 256; x++) {
  const n = Math.sin(y * 1.15 + Math.sin(x * .025) * 1.8) * 3 + Math.sin(y * 3.8 + x * .017) * 1.5;
  const k = (y * 256 + x) * 4; grainPixels.data.set([117+n,83+n,55+n,255], k);
}
grainCtx.putImageData(grainPixels, 0, 0);
const woodGrain = new THREE.CanvasTexture(grainCanvas); woodGrain.colorSpace = THREE.SRGBColorSpace;
woodGrain.wrapS = woodGrain.wrapT = THREE.RepeatWrapping; woodGrain.repeat.set(2, 5);
const wood = new THREE.MeshPhysicalMaterial({ color: '#e2c9ad', map: woodGrain, roughness: .36, clearcoat: .32, clearcoatRoughness: .3 });
const hookMetal = new THREE.MeshPhysicalMaterial({ color: '#b4b8b9', metalness: 1, roughness: .16, envMapIntensity: .85 });
const clock = { value: 0 };
const fallbackNormal=knit;
function baseLuminance(texture) {
  if(!texture?.image)return .03;
  const img=texture.image,c=document.createElement('canvas');c.width=c.height=64;const ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(img,0,0,64,64);
  const pixels=ctx.getImageData(0,0,64,64).data,values=[];
  for(let i=0;i<pixels.length;i+=4){if(pixels[i]+pixels[i+1]+pixels[i+2]<30||pixels[i+3]<200)continue;const color=new THREE.Color().setRGB(pixels[i]/255,pixels[i+1]/255,pixels[i+2]/255,THREE.SRGBColorSpace);values.push(color.r*.2126+color.g*.7152+color.b*.0722);}
  values.sort((a,b)=>a-b);return values[Math.floor(values.length*.65)]||.03;
}
function printedMaterial(native,design,color,phase) {
  const cloth=clothMaterial(color,native.normalMap||fallbackNormal,clock,phase);
  const m=cloth.material;m.map=native.map;m.roughnessMap=native.roughnessMap;m.metalnessMap=native.metalnessMap;m.aoMap=native.aoMap;m.roughness=native.roughness;m.metalness=0;
  if(native.normalScale)m.normalScale.copy(native.normalScale);
  if(design)applyFirstDesign(m,design);
  const originalCompile=m.onBeforeCompile,reference=baseLuminance(native.map);
  m.onBeforeCompile=shader=>{originalCompile(shader);shader.uniforms.uAlbedoReference={value:reference};shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nuniform float uAlbedoReference;').replace('#include <map_fragment>',`#include <map_fragment>
    #ifdef USE_MAP
      float textileShade=clamp(dot(sampledDiffuseColor.rgb,vec3(.2126,.7152,.0722))/uAlbedoReference,.55,1.12);
      diffuseColor.rgb=diffuse*textileShade;
    #endif
  `);};
  // Keep filtered white ink from blending with transparent black twice.
  const compileWithInk=m.onBeforeCompile;
  m.onBeforeCompile=shader=>{
    compileWithInk(shader);
    shader.fragmentShader=shader.fragmentShader.replace(
      'diffuseColor.rgb = mix(diffuseColor.rgb, printedInk.rgb, printedInk.a);',
      `vec3 inkColor=printedInk.rgb/max(printedInk.a,0.0001);
       float inkCoverage=pow(clamp(printedInk.a,0.0,1.0),0.8);
       diffuseColor.rgb=mix(diffuseColor.rgb,clamp(inkColor,0.0,1.0),inkCoverage);`
    );
  };
  m.customProgramCacheKey=()=> 'imported-clo-rack-v1-'+Boolean(design);return cloth;
}


const [firstDesign,gltf]=await Promise.all([loadFirstDesign(),new GLTFLoader().loadAsync('camisa-clo.glb')]);
for(const print of [firstDesign.front,firstDesign.back]){print.texture.premultiplyAlpha=true;print.texture.anisotropy=renderer.capabilities.getMaxAnisotropy();print.texture.needsUpdate=true;}
gltf.scene.updateMatrixWorld(true);
const boundsGLB=new THREE.Box3().setFromObject(gltf.scene),centerGLB=boundsGLB.getCenter(new THREE.Vector3()),modelScale=.78/(boundsGLB.max.y-boundsGLB.min.y);
const normalizeGLB=new THREE.Matrix4().makeScale(modelScale,modelScale,modelScale);normalizeGLB.setPosition(-centerGLB.x*modelScale,-boundsGLB.max.y*modelScale,-centerGLB.z*modelScale);
const modelParts=[];
gltf.scene.traverse(node=>{if(node.isMesh)modelParts.push({geometry:node.geometry.clone().applyMatrix4(node.matrixWorld).applyMatrix4(normalizeGLB),native:Array.isArray(node.material)?node.material[0]:node.material});});

const items = [];
let restX = 0;
GROUPS.forEach((g, gi) => {
  if (gi) restX += GROUP_GAP;
  g.colors.slice(0,4).forEach(color => {
    const i = items.length, phase = (i * 2.399) % 6.283;
    const hasDesign = i === 5;
    const mesh=new THREE.Group(),cloths=[],materialCache=new Map();
    for(const part of modelParts){
      let cloth=materialCache.get(part.native.uuid);
      if(!cloth){cloth=printedMaterial(part.native,hasDesign?firstDesign:null,hasDesign?FIRST_DESIGN.color:color,phase);materialCache.set(part.native.uuid,cloth);cloths.push(cloth);}
      const panel=new THREE.Mesh(part.geometry,cloth.material);panel.customDepthMaterial=cloth.depth;panel.castShadow=panel.receiveShadow=true;mesh.add(panel);
    }
    const cloth=cloths[0];
    const hanger = new THREE.Mesh(HANGER, wood); hanger.castShadow = true;
    const proxy = new THREE.Mesh(PROXY, new THREE.MeshBasicMaterial({ visible: false })); proxy.userData.i = i;
    const turn = new THREE.Group(); turn.add(mesh, hanger, proxy);
    const socket = new THREE.Mesh(new THREE.CylinderGeometry(.0045,.0055,.012,16), hookMetal);
    socket.position.y = -.004; socket.castShadow = true; turn.add(socket);
    const hook = new THREE.Mesh(HOOK_GEO, hookMetal); hook.rotation.y = Math.PI / 2; hook.castShadow = true;
    const hang = new THREE.Group(); hang.position.y = -HOOK; hang.add(turn, hook);
    const pivot = new THREE.Group(); pivot.add(hang); rail.add(pivot);
    items.push({
      i, name: hasDesign ? FIRST_DESIGN.name : 'Camisa ' + String(i + 1).padStart(2, '0'), group: g.name, pivot, turn, hook, mesh, proxy, cloth, cloths, phase,
      restX, x: restX, y: 0, z: 0, yaw: REST_YAW, scale: 1, hookYaw: Math.PI / 2,
      swing: REDUCED ? 0 : 0.12 * Math.sin(i * 1.3 + 0.6), swingVel: 0, prevWX: 0, prevV: 0,
      lagYaw: REST_YAW, lagYawVel: 0, lagSwing: 0, lagSwingVel: 0,
    });
    restX += SPACING;
  });
});
const mid = (items[0].restX + items[items.length - 1].restX) / 2;
items.forEach(it => { it.restX -= mid; it.x = it.restX; it.prevWX = it.x; });
railMesh.scale.y = items[items.length - 1].restX * 2 + 1.4;
for (const s of [-1, 1]) {   // soportes a la pared
  const x = s * (items[items.length - 1].restX + 0.6);
  const b = add(new THREE.CylinderGeometry(0.009, 0.009, -WALL_Z, 12), chrome, x, RAIL_Y, WALL_Z / 2, rail); b.rotation.x = Math.PI / 2;
}
const proxies = items.map(it => it.proxy);

// ---------- Estado e interacción ---------------------------------------------------
let scroll = 0, scrollTarget = 0, scrollVel = 0, bounds = { min: 0, max: 0 };
let hover = null, selected = null, userYaw = 0, yawVel = 0, stageSince = 0, hoverBack = false, kbd = false;
let time = 0, last = performance.now(), intro = REDUCED ? 1 : 0, introDone = REDUCED;
const pointer = { x: 0, y: 0, inside: false, down: false, moved: 0, sx: 0, sy: 0, lx: 0, lt: 0, touch: false };
const parallax = { x: 0, y: 0 };
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), tmp = new THREE.Vector3();
const lerpExp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));
const nearestYaw = (angle, current) => current + Math.atan2(Math.sin(angle - current), Math.cos(angle - current));
const tanHalf = Math.tan(THREE.MathUtils.degToRad(FOV / 2));
const viewH = dist => 2 * tanHalf * dist;

function updateBounds() {
  const half = viewH(CAM.z) * camera.aspect / 2, first = items[0].restX - 0.45, lastX = items[items.length - 1].restX + 0.45;
  bounds = first + half < lastX - half ? { min: first + half, max: lastX - half } : { min: 0, max: 0 };
}
function stagePose() {               // dónde se presenta la prenda abierta
  const dist = MOBILE ? 1.85 : 1.7, h = viewH(dist), w = h * camera.aspect, tall = 0.9, wide = 0.68;
  const scale = Math.min(1.3, (MOBILE ? 0.50 : 0.64) * h / tall, (MOBILE ? 0.55 : 0.37) * w / wide);
  const x = MOBILE ? CAM.x : CAM.x - w * 0.17;
  const y = CAM.y + ((tall + HOOK) * scale) / 2 + (MOBILE ? h * 0.1 : 0);
  return { x, y, z: CAM.z - dist, scale };
}
function pick() {
  ndc.set(pointer.x, pointer.y); ray.setFromCamera(ndc, camera);
  if (hover && ray.intersectObject(hover.proxy).length) return hover;
  const hit = ray.intersectObjects(proxies)[0];
  return hit ? items[hit.object.userData.i] : null;
}
function centred() {
  let best = null, d = Infinity;
  for (const it of items) { const k = Math.abs(it.restX + rail.position.x); if (k < d) { d = k; best = it; } }
  return best;
}
function setHover(it) {
  if (it === hover) return;
  hover = it; canvas.style.cursor = selected ? 'grab' : it ? 'pointer' : 'grab'; ui();
}
function select(it) {
  selected = it; userYaw = it ? nearestYaw(hoverBack ? Math.PI : 0, it.yaw) : 0; yawVel = 0;
  if (it) { stageSince = time; scrollTarget = THREE.MathUtils.clamp(it.restX, bounds.min, bounds.max); scrollVel = 0; hover = null; }
  canvas.style.cursor = 'grab'; ui();
}
function step(d) {
  const cur = selected ?? hover ?? centred(), next = items[(cur.i + d + items.length) % items.length];
  kbd = true;
  if (selected) select(next); else { setHover(next); scrollTarget = THREE.MathUtils.clamp(next.restX, bounds.min, bounds.max); }
}
function ui() {
  const cur = selected ?? hover ?? centred();
  $('#count').textContent = String(cur.i + 1).padStart(2, '0') + ' / ' + String(items.length).padStart(2, '0');
  $('#detail').classList.toggle('on', !!selected);
  $('#intro').style.opacity = selected ? 0 : 1;
  $('#hint').textContent = selected ? 'CLIC PARA VOLTEAR · ARRASTRA PARA GIRAR · ESC PARA VOLVER' : 'ARRASTRA PARA RECORRER · TOCA UNA CAMISA';
  if (selected) $('#name').textContent = selected.name;
  const cap = $('#caption'); cap.style.opacity = hover && !selected ? 1 : 0;
  if (hover) cap.textContent = hover.name + ' · ' + hover.group.toUpperCase();
}

function setPointer(e) {
  const r = canvas.getBoundingClientRect();
  pointer.x = (e.clientX - r.left) / r.width * 2 - 1; pointer.y = -(e.clientY - r.top) / r.height * 2 + 1;
}
canvas.addEventListener('pointerdown', e => {
  if (!introDone) { intro = Math.max(intro, 0.6); }
  canvas.setPointerCapture(e.pointerId); kbd = false;
  Object.assign(pointer, { down: true, moved: 0, sx: e.clientX, sy: e.clientY, lx: e.clientX, lt: performance.now(), touch: e.pointerType !== 'mouse', inside: true });
  setPointer(e); scrollVel = 0; yawVel = 0;
});
canvas.addEventListener('pointermove', e => {
  setPointer(e); pointer.inside = true; pointer.touch = e.pointerType !== 'mouse';
  if (!pointer.down) return;
  const now = performance.now(), dt = Math.max(1, now - pointer.lt) / 1000, dx = e.clientX - pointer.lx;
  pointer.lx = e.clientX; pointer.lt = now;
  pointer.moved = Math.max(pointer.moved, Math.hypot(e.clientX - pointer.sx, e.clientY - pointer.sy));
  if (pointer.moved < 6) return;
  if (selected) { userYaw += dx * 0.011; yawVel = lerpExp(yawVel, dx * 0.011 / dt, 20, dt); }
  else {
    const wpp = viewH(CAM.z) / canvas.clientHeight;
    scrollTarget -= dx * wpp; scrollVel = lerpExp(scrollVel, -dx * wpp / dt, 18, dt);
    setHover(null);
  }
});
canvas.addEventListener('pointerup', e => {
  if (!pointer.down) return; pointer.down = false;
  if (pointer.moved < 6) {
    setPointer(e);
    const it = selected ? null : (pointer.touch ? (pick() ?? null) : hover ?? pick());
    if (selected) {
      ndc.set(pointer.x, pointer.y); ray.setFromCamera(ndc, camera);
      if (ray.intersectObject(selected.mesh,true).length) { userYaw += Math.PI; yawVel = 0; }
      else select(null);
    }
    else if (it) select(it);
  }
});
canvas.addEventListener('pointercancel', () => { pointer.down = false; });
canvas.addEventListener('pointerleave', () => { pointer.inside = false; });
canvas.addEventListener('wheel', e => {
  e.preventDefault();
  if (selected) { yawVel += e.deltaY * 0.02; return; }
  scrollTarget += (Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY) * 0.0016;
}, { passive: false });
addEventListener('keydown', e => {
  if (e.key === 'Escape') select(null);
  if (e.key === 'ArrowRight') { e.preventDefault(); step(1); }
  if (e.key === 'ArrowLeft') { e.preventDefault(); step(-1); }
  if (e.key === 'Enter' && !selected) select(hover ?? centred());
});
$('#prev').onclick = () => step(-1);
$('#next').onclick = () => step(1);
$('#close').onclick = () => select(null);
$('#side').onclick = () => {
  hoverBack = !hoverBack; $('#side').textContent = 'Hover: ' + (hoverBack ? 'espalda' : 'frente');
  if (selected) { userYaw = nearestYaw(hoverBack ? Math.PI : 0, selected.yaw); yawVel = 0; }
};
function resize() {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight); updateBounds();
  scrollTarget = THREE.MathUtils.clamp(scrollTarget, bounds.min, bounds.max);
}
addEventListener('resize', resize);
resize();
scroll = scrollTarget = MOBILE ? bounds.min : 0;

// ---------- Bucle -----------------------------------------------------------------
const INTRO_FROM = new THREE.Vector3(1.5, 1.45, 3.4), INTRO_LOOK = new THREE.Vector3(0.25, 1.48, 0);
function tick() {
  requestAnimationFrame(tick);
  const now = performance.now(), dt = Math.min((now - last) / 1000, 1 / 20) || 1 / 60;
  last = now; time += dt; clock.value = time;

  // Scroll con inercia y rebote elástico en los extremos
  if (!pointer.down && !selected) { scrollTarget += scrollVel * dt; scrollVel *= Math.exp(-3.2 * dt); }
  const over = scrollTarget < bounds.min ? scrollTarget - bounds.min : scrollTarget > bounds.max ? scrollTarget - bounds.max : 0;
  if (over && !pointer.down) { scrollTarget -= over * (1 - Math.exp(-9 * dt)); scrollVel *= 0.8; }
  scroll = lerpExp(scroll, scrollTarget - (pointer.down ? over * 0.6 : 0), 9, dt);
  rail.position.x = -scroll;

  // Cámara: entrada + parallax suave con el mouse
  if (!introDone) { intro = Math.min(1, intro + dt / 3.4); if (intro >= 1) introDone = true; }
  const e = intro < 0.5 ? 4 * intro ** 3 : 1 - (-2 * intro + 2) ** 3 / 2;
  const live = selected || REDUCED || !introDone ? 0 : 1;
  parallax.x = lerpExp(parallax.x, pointer.inside && !pointer.touch ? pointer.x * 0.07 * live : 0, 3, dt);
  parallax.y = lerpExp(parallax.y, pointer.inside && !pointer.touch ? pointer.y * 0.035 * live : 0, 3, dt);
  camera.position.set(THREE.MathUtils.lerp(INTRO_FROM.x, CAM.x + parallax.x, e), THREE.MathUtils.lerp(INTRO_FROM.y, CAM.y + parallax.y, e), THREE.MathUtils.lerp(INTRO_FROM.z, CAM.z, e));
  camera.lookAt(THREE.MathUtils.lerp(INTRO_LOOK.x, parallax.x * 0.4, e), THREE.MathUtils.lerp(INTRO_LOOK.y, CAM.y, e), 0);
  camera.updateMatrixWorld();

  // Hover
  if (!introDone) setHover(null);
  else if (!selected && !pointer.down && pointer.inside && !pointer.touch && !kbd) setHover(pick());
  else if (pointer.touch && !selected) {
    const c = centred(); setHover(c);
    if (!pointer.down && Math.abs(scrollVel) < 0.25) scrollTarget = lerpExp(scrollTarget, THREE.MathUtils.clamp(c.restX, bounds.min, bounds.max), 5, dt);
  }
  if (selected && !pointer.down) { userYaw += yawVel * dt; yawVel *= Math.exp(-2.6 * dt); }

  const stage = stagePose(), idle = REDUCED ? 0 : Math.sin((time - stageSince) * 0.7) * 0.18;
  const face = hoverBack ? Math.PI : 0, hi = hover && !selected ? hover.i : -1;
  for (const it of items) {
    let x = it.restX, y = 0, z = 0, yaw = REST_YAW, scale = 1, k = 7;
    if (it === selected) {
      x = stage.x - rail.position.x; y = stage.y - RAIL_Y; z = stage.z; scale = stage.scale; yaw = userYaw + idle; k = 5.5;
    } else if (hi >= 0) {
      const d = it.i - hi;
      if (d === 0) { z = 0.55; yaw = face; scale = 1.07; k = 9; }
      else x += Math.sign(d) * 0.28 * Math.exp(-(Math.abs(d) - 1) / 6);
    }
    it.x = lerpExp(it.x, x, k, dt); it.y = lerpExp(it.y, y, k, dt); it.z = lerpExp(it.z, z, k, dt);
    it.yaw = lerpExp(it.yaw, it === selected ? yaw : nearestYaw(yaw, it.yaw), it === selected ? 7 : k, dt); it.scale = lerpExp(it.scale, scale, 9, dt);

    // Péndulo: la percha reacciona a la aceleración del riel + brisa
    const wx = it.x + rail.position.x, v = (wx - it.prevWX) / dt, acc = THREE.MathUtils.clamp((v - it.prevV) / dt, -60, 60);
    it.prevWX = wx; it.prevV = v;
    if (REDUCED || it === selected) { it.swing = lerpExp(it.swing, 0, 8, dt); it.swingVel = 0; }
    else {
      const breeze = 0.45 * Math.sin(time * 0.7 + it.phase) + 0.25 * Math.sin(time * 1.31 + it.phase * 2.1);
      it.swingVel += (-34 * it.swing - 3.2 * it.swingVel - acc * 0.085 + breeze) * dt;
      it.swing = THREE.MathUtils.clamp(it.swing + it.swingVel * dt, -0.5, 0.5);
    }
    // La tela va con retraso respecto a la percha → se dobla y se tuerce
    if (REDUCED) { it.lagYaw = it.yaw; it.lagSwing = it.swing; }
    else {
      it.lagYawVel += ((it.yaw - it.lagYaw) * 70 - it.lagYawVel * 8) * dt; it.lagYaw += it.lagYawVel * dt;
      it.lagSwingVel += ((it.swing - it.lagSwing) * 55 - it.lagSwingVel * 6) * dt; it.lagSwing += it.lagSwingVel * dt;
    }
    const g = THREE.MathUtils.clamp(it.lagSwing - it.swing, -0.35, 0.35) * 0.7;
    for(const cloth of it.cloths){
    const u = cloth.uniforms;
    u.uTwist.value = THREE.MathUtils.clamp(it.lagYaw - it.yaw, -0.7, 0.7);
    u.uBend.value.set(Math.cos(it.yaw) * g, Math.sin(it.yaw) * g);
    u.uAmp.value = REDUCED ? 0 : 0.0025 + Math.min(0.006, Math.abs(it.swingVel) * 0.01 + Math.abs(it.lagYawVel) * 0.004);

    }
    it.pivot.position.set(it.x, RAIL_Y + it.y, it.z);
    it.pivot.rotation.z = it.swing;
    it.pivot.scale.setScalar(it.scale);
    it.turn.rotation.y = it.yaw;
    it.hookYaw = lerpExp(it.hookYaw, nearestYaw(it === selected ? it.yaw : Math.PI / 2, it.hookYaw), 6, dt);
    it.hook.rotation.y = it.hookYaw;
  }
  dim.material.opacity = lerpExp(dim.material.opacity, selected ? 0.8 : 0, 6, dt);
  dim.visible = dim.material.opacity > 0.005;

  if (hover && !selected) {   // rótulo bajo la prenda
    tmp.set(hover.x + rail.position.x, RAIL_Y - HOOK + (HEM_Y - 0.06) * hover.scale, hover.z).project(camera);
    const cap = $('#caption');
    cap.style.left = (tmp.x * 0.5 + 0.5) * innerWidth + 'px'; cap.style.top = (-tmp.y * 0.5 + 0.5) * innerHeight + 'px';
  }
  renderer.render(scene, camera);
}
if (location.hash.includes('nointro')) { intro = 1; introDone = true; }
window.vestuario = { select: i => select(items[i] ?? null), hover: i => setHover(items[i] ?? null) };   // útil para pruebas
$('#total').textContent = items.length;
ui();
$('#status').remove();
requestAnimationFrame(tick);

