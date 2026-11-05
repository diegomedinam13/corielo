import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { FIRST_DESIGN, loadFirstDesign, applyFirstDesign } from '../designs.js';
import { clothMaterial, knitNormalMap } from './fabric.js';

const $=s=>document.querySelector(s),canvas=$('canvas');
const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
const mobile=innerWidth<820;
const renderer=new THREE.WebGLRenderer({canvas,antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio,mobile?1.5:2));renderer.setSize(innerWidth,innerHeight);renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.05;renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
const scene=new THREE.Scene();scene.background=new THREE.Color('#f0ede9');
const pmrem=new THREE.PMREMGenerator(renderer);scene.environment=pmrem.fromScene(new RoomEnvironment(),.04).texture;scene.environmentIntensity=.28;pmrem.dispose();
const camera=new THREE.PerspectiveCamera(36,innerWidth/innerHeight,.03,30);camera.position.set(0,.06,1.8);
const controls=new OrbitControls(camera,canvas);controls.target.set(0,.04,0);controls.enableDamping=true;controls.enablePan=false;controls.minDistance=1.1;controls.maxDistance=3.6;controls.maxPolarAngle=Math.PI*.85;controls.update();controls.saveState();
scene.add(new THREE.HemisphereLight('#e2e8d6','#2a2822',.5));
const key=new THREE.DirectionalLight('#fff1dc',2.6);key.position.set(2.2,4.2,3);key.castShadow=true;key.shadow.mapSize.setScalar(mobile?1024:2048);Object.assign(key.shadow.camera,{left:-1,right:1,top:1,bottom:-1,near:1,far:10});key.shadow.bias=-.0003;key.shadow.normalBias=.003;scene.add(key);
const fill=new THREE.DirectionalLight('#e4e6e3',.85);fill.position.set(-3.2,2.2,3);scene.add(fill);
const floor=new THREE.Mesh(new THREE.PlaneGeometry(20,20),new THREE.MeshStandardMaterial({color:'#e3ddd1',roughness:.9}));floor.rotation.x=-Math.PI/2;floor.position.y=-.365;floor.receiveShadow=true;scene.add(floor);
const garment=new THREE.Group();garment.position.y=.43;scene.add(garment);
const clock={value:0},materials=[],pairs=[],fallbackNormal=knitNormalMap();
let targetYaw=0,showDesign=true,dragged=false,startPointer=null;

// Keep original sewing detail in the albedo map while replacing its navy tint.
function baseLuminance(texture) {
  if(!texture?.image)return .03;
  const img=texture.image,c=document.createElement('canvas');c.width=c.height=64;const ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(img,0,0,64,64);
  const pixels=ctx.getImageData(0,0,64,64).data,values=[];
  for(let i=0;i<pixels.length;i+=4){if(pixels[i]+pixels[i+1]+pixels[i+2]<30||pixels[i+3]<200)continue;const color=new THREE.Color().setRGB(pixels[i]/255,pixels[i+1]/255,pixels[i+2]/255,THREE.SRGBColorSpace);values.push(color.r*.2126+color.g*.7152+color.b*.0722);}
  values.sort((a,b)=>a-b);return values[Math.floor(values.length*.65)]||.03;
}
function printedMaterial(native,design) {
  const cloth=clothMaterial(FIRST_DESIGN.color,native.normalMap||fallbackNormal,clock,0);
  const m=cloth.material;m.map=native.map;m.roughnessMap=native.roughnessMap;m.metalnessMap=native.metalnessMap;m.aoMap=native.aoMap;m.roughness=native.roughness;m.metalness=0;
  if(native.normalScale)m.normalScale.copy(native.normalScale);
  applyFirstDesign(m,design);
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
  m.customProgramCacheKey=()=> 'imported-clo-printed-v2';materials.push(cloth);return cloth;
}

async function init(){
  const loader=new GLTFLoader();
  const [gltf,design]=await Promise.all([loader.loadAsync('camisa-clo.glb',event=>{if(event.total){const n=Math.min(100,Math.round(event.loaded/event.total*100));$('#loading').textContent='Cargando modelo 3D… '+n+' %';$('progress').value=n;}}),loadFirstDesign()]);
  for(const print of [design.front,design.back]){
    print.texture.premultiplyAlpha=true;
    print.texture.anisotropy=renderer.capabilities.getMaxAnisotropy();
    print.texture.needsUpdate=true;
  }
  gltf.scene.updateMatrixWorld(true);
  const bounds=new THREE.Box3().setFromObject(gltf.scene),height=bounds.max.y-bounds.min.y,scale=.78/height;
  const center=bounds.getCenter(new THREE.Vector3());
  const normalize=new THREE.Matrix4().makeScale(scale,scale,scale);normalize.setPosition(-center.x*scale,-bounds.max.y*scale,-center.z*scale);
  const cache=new Map();
  gltf.scene.traverse(node=>{
    if(!node.isMesh)return;
    const source=Array.isArray(node.material)?node.material[0]:node.material;
    let cloth=cache.get(source.uuid);if(!cloth){cloth=printedMaterial(source,design);cache.set(source.uuid,cloth);}
    const geometry=node.geometry.clone().applyMatrix4(node.matrixWorld).applyMatrix4(normalize);
    const mesh=new THREE.Mesh(geometry,cloth.material);mesh.customDepthMaterial=cloth.depth;mesh.castShadow=mesh.receiveShadow=true;garment.add(mesh);pairs.push({mesh,native:source,cloth});
  });
  if(!pairs.length)throw Error('El modelo no contiene una malla visible.');
  $('#status').hidden=true;
}
function appearance(design){showDesign=design;$('#design').setAttribute('aria-pressed',String(design));$('#original').setAttribute('aria-pressed',String(!design));for(const {mesh,native,cloth}of pairs){mesh.material=design?cloth.material:native;mesh.customDepthMaterial=design?cloth.depth:undefined;}}
$('#design').onclick=()=>appearance(true);$('#original').onclick=()=>appearance(false);
for(const button of document.querySelectorAll('[data-angle]'))button.onclick=()=>{targetYaw=Number(button.dataset.angle);controls.reset();for(const b of document.querySelectorAll('[data-angle]'))b.setAttribute('aria-pressed',String(b===button));};
$('#reset').onclick=()=>{targetYaw=0;controls.reset();appearance(true);};
canvas.addEventListener('pointerdown',e=>{startPointer={x:e.clientX,y:e.clientY};dragged=false;});canvas.addEventListener('pointermove',e=>{if(startPointer&&Math.hypot(e.clientX-startPointer.x,e.clientY-startPointer.y)>6)dragged=true;});canvas.addEventListener('pointerup',e=>{if(startPointer&&!dragged){const rect=canvas.getBoundingClientRect(),ray=new THREE.Raycaster();ray.setFromCamera(new THREE.Vector2((e.clientX-rect.left)/rect.width*2-1,-(e.clientY-rect.top)/rect.height*2+1),camera);if(ray.intersectObjects(garment.children).length)targetYaw+=Math.PI;}startPointer=null;});canvas.addEventListener('pointercancel',()=>{startPointer=null;});
addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);});
let last=performance.now();function frame(t){const dt=Math.min((t-last)/1000,.05);last=t;clock.value=t/1000;const motion=$('#breeze').checked&&!reduced;garment.rotation.y+=(targetYaw-garment.rotation.y)*(reduced?1:1-Math.exp(-8*dt));garment.rotation.z=motion?Math.sin(t*.0007)*.012:0;
  for(const cloth of materials){cloth.uniforms.uAmp.value=motion?.0025:0;cloth.uniforms.uTwist.value=motion?Math.sin(t*.0008)*.012:0;}
  controls.update();renderer.render(scene,camera);requestAnimationFrame(frame);
}
requestAnimationFrame(frame);init().catch(error=>{console.error(error);$('#loading').textContent='No se pudo cargar el modelo. Recarga la página para intentarlo de nuevo.';$('progress').hidden=true;});
