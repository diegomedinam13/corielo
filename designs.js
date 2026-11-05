import * as THREE from 'three';

// Placement is measured on the existing garment, with the origin at its collar.
export const FIRST_DESIGN = {
  itemIndex: 0,
  name: 'Dios no se olvida',
  color: '#A39382', // Pantone 7530 C · aproximación sRGB
  front: { url: new URL('./assets/designs/dios-no-se-olvida-front.png', import.meta.url).href, width: .16, centerY: -.185 },
  back: { url: new URL('./assets/designs/dios-no-se-olvida-back.png', import.meta.url).href, width: .38, centerY: -.32 },
};

async function loadPrint(placement) {
  const image = await new THREE.ImageLoader().loadAsync(placement.url);
  const scan = document.createElement('canvas'); scan.width = image.width; scan.height = image.height;
  const ctx = scan.getContext('2d', { willReadFrequently: true }); ctx.drawImage(image, 0, 0);
  const pixels = ctx.getImageData(0, 0, scan.width, scan.height).data;
  let minX = scan.width, minY = scan.height, maxX = -1, maxY = -1;
  // Transparent margins in the original PNG do not determine the print size.
  for (let y = 0; y < scan.height; y++) for (let x = 0; x < scan.width; x++) {
    if (pixels[(y * scan.width + x) * 4 + 3] > 2) {
      minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
    }
  }
  if (maxX < minX) throw Error('El PNG del diseño está vacío.');
  const w = maxX - minX + 1, h = maxY - minY + 1;
  const crop = document.createElement('canvas'); crop.width = w + 4; crop.height = h + 4;
  crop.getContext('2d').drawImage(image, minX, minY, w, h, 2, 2, w, h);
  const texture = new THREE.CanvasTexture(crop); texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8; texture.minFilter = THREE.LinearMipmapLinearFilter;
  return { texture, width: placement.width * (w + 4) / w, height: placement.width * (h + 4) / w, centerY: placement.centerY };
}

export async function loadFirstDesign() {
  const [front, back] = await Promise.all([loadPrint(FIRST_DESIGN.front), loadPrint(FIRST_DESIGN.back)]);
  return { front, back };
}

export function applyFirstDesign(material, design) {
  const originalCompile = material.onBeforeCompile;
  material.onBeforeCompile = shader => {
    originalCompile(shader);
    shader.uniforms.uPrintFront = { value: design.front.texture };
    shader.uniforms.uPrintBack = { value: design.back.texture };
    shader.uniforms.uPrintFrontRect = { value: new THREE.Vector3(design.front.width, design.front.height, design.front.centerY) };
    shader.uniforms.uPrintBackRect = { value: new THREE.Vector3(design.back.width, design.back.height, design.back.centerY) };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vPrintPosition;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvPrintPosition = position;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vPrintPosition;\nuniform sampler2D uPrintFront, uPrintBack;\nuniform vec3 uPrintFrontRect, uPrintBackRect;')
      .replace('#include <map_fragment>', `#include <map_fragment>
        vec4 printedInk = vec4(0.0);
        if (gl_FrontFacing && vPrintPosition.z > 0.02) {
          vec2 printUV = vec2(vPrintPosition.x / uPrintFrontRect.x + 0.5, (vPrintPosition.y - uPrintFrontRect.z) / uPrintFrontRect.y + 0.5);
          if (all(greaterThanEqual(printUV, vec2(0.0))) && all(lessThanEqual(printUV, vec2(1.0)))) printedInk = texture2D(uPrintFront, printUV);
        } else if (gl_FrontFacing && vPrintPosition.z < -0.02) {
          vec2 printUV = vec2(0.5 - vPrintPosition.x / uPrintBackRect.x, (vPrintPosition.y - uPrintBackRect.z) / uPrintBackRect.y + 0.5);
          if (all(greaterThanEqual(printUV, vec2(0.0))) && all(lessThanEqual(printUV, vec2(1.0)))) printedInk = texture2D(uPrintBack, printUV);
        }
        diffuseColor.rgb = mix(diffuseColor.rgb, printedInk.rgb, printedInk.a);
      `);
  };
  material.customProgramCacheKey = () => 'cloth-dios-no-se-olvida-v1';
}


