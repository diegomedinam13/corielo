import * as THREE from 'three';

// Only the first printed shirt uses this continuous cloth surface.
// Other garments continue to use the approved original geometry.
export async function unifiedShirtGeometry(fallback) {
  try {
    const path = new URL('./assets/unified-shirt.json?v=2', import.meta.url).href;
    return await new THREE.BufferGeometryLoader().loadAsync(path);
  } catch (error) {
    console.warn('No se pudo cargar la mejora de la camisa; se conserva el modelo original.', error);
    return fallback;
  }
}
