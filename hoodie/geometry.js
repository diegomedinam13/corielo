import * as THREE from 'three';
// Independent hoodie model: a continuous torso/sleeve surface, no pocket.
export function buildHoodieGeometry() {
  const blend=(a,b,k)=>{const h=Math.max(k-Math.abs(a-b),0)/k;return Math.min(a,b)-h*h*k*.25;};
  function field(x,y,z) {
    const yy=Math.max(0,Math.min(1,(-y-.03)/.72));
    const width=.224+.026*Math.sin(yy*Math.PI*.85)-.012*Math.exp(-(((yy-.98)/.06)**2));
    const depth=.065+.012*Math.sin(yy*Math.PI);
    const frontWeight=Math.min(1,Math.abs(z)/depth);
    const folds=(.0038*Math.sin(x*31+y*2)+.0022*Math.sin(x*57-y*3))*(.35+.65*yy)*frontWeight;
    const power=2.7;
    const side=(Math.pow(Math.pow(Math.abs(x)/width,power)+Math.pow(Math.abs(z)/(depth+folds),power),1/power)-1)*depth;
    const top=y+.026+.035*Math.pow(Math.min(1,Math.abs(x)/.23),2);
    const hem=-.775-y;
    // Soft shoulder line and gently narrowed ribbed hem.
    let body=-blend(-side,-Math.max(top,hem),.016);
    const ax=Math.abs(x),px=ax-.193,py=y+.125,dx=.228,dy=-.52;
    const along=(px*dx+py*dy)/(dx*dx+dy*dy),t=Math.max(0,Math.min(1,along));
    let radius=.101-t*.052;if(t>.91)radius*=.92;
    const sx=px-dx*t,sy=py-dy*t;
    const sleeve=Math.sqrt(sx*sx+sy*sy+(z/.74)**2)-radius;
    const cuffCut=(along-1)*Math.sqrt(dx*dx+dy*dy);
    body=blend(body,Math.max(sleeve,cuffCut),.033);
    // An actual neck opening, instead of a shirt shoulder cap under the hood.
    const neck=(Math.sqrt((x/.088)**2+(z/.05)**2)-1)*.05;
    const hole=Math.max(neck,-.095-y);
    return Math.max(body,-hole);
  }
  const nx=88,ny=88,nz=36,x0=-.53,y0=-.83,z0=-.115,dx=1.06/nx,dy=.90/ny,dz=.23/nz;
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
    const v=positions.length/3;positions.push(x,y,z);normals.push(n.x,n.y,n.z);uvs.push((x+.55)/1.1,(-y)/.9);edges.set(key,v);return v;
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
export function buildHoodGeometry() {
  const p=[],uv=[],ix=[],nu=80,nv=44;
  // Flattened fabric hood folded down over the upper back; an open top edge.
  for(let j=0;j<=nv;j++)for(let i=0;i<=nu;i++){
    const t=i/nu*Math.PI*2,v=j/nv;
    const width=.106+.038*Math.sin(v*Math.PI)-.101*v*v;
    const depth=(.036*(1-v)+.010*Math.sin(v*Math.PI));
    const ripple=.003*Math.sin(t*7+v*8)*Math.sin(v*Math.PI);
    p.push(Math.cos(t)*(width+ripple),-.02-.26*v+.008*Math.sin(t)*(1-v),-.064+Math.sin(t)*depth+ripple);
    uv.push(i/nu*.32,j/nv*.34);
  }
  for(let j=0;j<nv;j++)for(let i=0;i<nu;i++){const a=j*(nu+1)+i,b=a+1,c=a+nu+1,d=c+1;ix.push(a,b,c,b,d,c);}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(ix);g.computeVertexNormals();return g;
}
