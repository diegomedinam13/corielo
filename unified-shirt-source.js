import * as THREE from 'three';
// Independent hoodie model: a continuous torso/sleeve surface, no pocket.
export function buildUnifiedShirtGeometry() {
  const blend=(a,b,k)=>{const h=Math.max(k-Math.abs(a-b),0)/k;return Math.min(a,b)-h*h*k*.25;};
  function field(x,y,z) {
    const smooth=(a,b,v)=>{const t=Math.min(1,Math.max(0,(v-a)/(b-a)));return t*t*(3-2*t);};
    const e=Math.max(0,Math.min(1,(-y-.06)/.72)),back=z<0;
    const W=.218+.034*smooth(-.04,-.22,y)-.009*Math.exp(-(((y+.5)/.14)**2))+.01*smooth(-.6,-.78,y);
    const D=.024+.046*smooth(-.02,-.27,y)-.008*smooth(-.45,-.78,y)+.017*Math.exp(-(((y+.045)/.06)**2));
    const t=Math.atan2(Math.sign(z)*Math.pow(Math.abs(z/D),1.6),Math.sign(x)*Math.pow(Math.abs(x/W),1.6));
    const flute=1+(back?.025:.045)*e**2.2*Math.sin(t*9+.7)+(back?.012:.02)*e**2*Math.sin(t*5-1.1);
    const amplitude=.004+.02*e**1.4;
    const fold=(amplitude*(.55*Math.sin(x*36+1.3)+.35*Math.sin(x*67+.4)+.3*Math.sin(x*17-2))+.005*Math.exp(-(((y+.19)/.09)**2))*Math.sin(Math.abs(x)*34-y*26)*smooth(.04,.16,Math.abs(x)))*(back?.5+.25*e:1);
    const depth=(D+fold)* (1+(flute-1)*1.6);
    const radial=(Math.pow(Math.pow(Math.abs(x)/(W*flute),3.2)+Math.pow(Math.abs(z)/depth,3.2),1/3.2)-1)*D;
    const top=y+.008+.052*Math.pow(Math.min(1,Math.abs(x)/.23),1.6)+.04*Math.pow(Math.max(0,z)/.065,2);
    const hem=-.78+.012*Math.pow(Math.abs(x)/W,2)+.006*Math.sin(t*9+.7)-y;
    let body=-blend(-radial,-Math.max(top,hem),.012);
    // Smoothly union short sleeves into the torso, eliminating intersecting caps.
    const dx=.204,dy=-.130,px=Math.abs(x)-.15,py=y+.14,len=Math.hypot(dx,dy);
    const along=(px*dx+py*dy)/(len*len),v=Math.max(0,Math.min(1,along));
    const perp=(px*(-dy)+py*dx)/len,rz=.030+.012*v,ry=.100-.022*v;
    const arm=(Math.pow(Math.pow(Math.abs(perp)/ry,3)+Math.pow(Math.abs(z)/rz,3),1/3)-1)*rz;
    const sleeve=Math.max(arm,Math.max(-along*len,(along-1)*len));
    const inner=(Math.pow(Math.pow(Math.abs(perp)/(ry-.004),3)+Math.pow(Math.abs(z)/(rz-.004),3),1/3)-1)*rz;
    const cuffHole=Math.max(inner,(.84-along)*len);
    body=blend(body,sleeve,.014);
    const neckDepth=.040+.040*smooth(-.01,.035,z);
    const neckHole=(Math.sqrt((x/.088)**2+((y-.020)/neckDepth)**2)-1)*.05;
    return Math.max(body,-neckHole);
  }
  const nx=96,ny=96,nz=40,x0=-.46,y0=-.83,z0=-.115,dx=.92/nx,dy=.90/ny,dz=.23/nz;
  const stride=nx+1,layer=stride*(ny+1),values=new Float32Array(layer*(nz+1));
  const id=(i,j,k)=>k*layer+j*stride+i;
  for(let k=0;k<=nz;k++)for(let j=0;j<=ny;j++)for(let i=0;i<=nx;i++)values[id(i,j,k)]=field(x0+i*dx,y0+j*dy,z0+k*dz);
  const positions=[],normals=[],uvs=[],indices=[],edges=new Map();
  const corners=[[0,0,0],[1,0,0],[1,1,0],[0,1,0],[0,0,1],[1,0,1],[1,1,1],[0,1,1]];
  const tets=[[0,5,1,6],[0,1,2,6],[0,2,3,6],[0,3,7,6],[0,7,4,6],[0,4,5,6]];
  function vertex(a,b) {
    const key=a.id<b.id?a.id+':'+b.id:b.id+':'+a.id;if(edges.has(key))return edges.get(key);
    const t=a.f/(a.f-b.f),x=a.x+(b.x-a.x)*t,y=a.y+(b.y-a.y)*t,z=a.z+(b.z-a.z)*t;
    const e=.00015,n=new THREE.Vector3(field(x+e,y,z)-field(x-e,y,z),field(x,y+e,z)-field(x,y-e,z),field(x,y,z+e)-field(x,y,z-e)).normalize();
    const v=positions.length/3;positions.push(x,y,z);normals.push(n.x,n.y,n.z);uvs.push(z>=0?.25+x/1.2:.75-x/1.2,(.05-y)/.9);edges.set(key,v);return v;
  }
  function triangle(a,b,c) {
    const A=new THREE.Vector3().fromArray(positions,a*3),B=new THREE.Vector3().fromArray(positions,b*3),C=new THREE.Vector3().fromArray(positions,c*3);
    const cross=B.sub(A).cross(C.sub(A));if(cross.lengthSq()<1e-18)return;
    const N=new THREE.Vector3().fromArray(normals,a*3).add(new THREE.Vector3().fromArray(normals,b*3)).add(new THREE.Vector3().fromArray(normals,c*3));
    indices.push(...(cross.dot(N)<0?[a,c,b]:[a,b,c]));
  }
  for(let k=0;k<nz;k++)for(let j=0;j<ny;j++)for(let i=0;i<nx;i++){
    const cube=corners.map(([a,b,c])=>({id:id(i+a,j+b,k+c),x:x0+(i+a)*dx,y:y0+(j+b)*dy,z:z0+(k+c)*dz,f:values[id(i+a,j+b,k+c)]}));
    if(cube.every(v=>v.f>=0)||cube.every(v=>v.f<0))continue;
    for(const tet of tets){const inside=tet.filter(n=>cube[n].f<0),outside=tet.filter(n=>cube[n].f>=0);if(!inside.length||!outside.length)continue;
      const edge=(a,b)=>vertex(cube[a],cube[b]);
      if(inside.length===1){const a=inside[0];triangle(...outside.map(b=>edge(a,b)));}
      else if(inside.length===3){const a=outside[0];triangle(...inside.map(b=>edge(a,b)));}
      else{const [a,b]=inside,[c,d]=outside;const ac=edge(a,c),ad=edge(a,d),bc=edge(b,c),bd=edge(b,d);triangle(ac,ad,bc);triangle(ad,bd,bc);}
    }
  }
  const surface=new THREE.BufferGeometry();surface.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));surface.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));surface.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));surface.setIndex(indices);
  return surface;
}
