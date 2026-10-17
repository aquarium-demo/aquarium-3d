import * as THREE from 'three';

// Inside measurements of the tank, in metres-ish scene units.
export const TANK = { width: 6, height: 3.4, depth: 3, water: 3.0 };

// A rimless glass tank on a light wooden cabinet, filled with tinted water.
export function makeTank() {
  const tank = new THREE.Group();
  const { width, height, depth, water } = TANK;

  const cabinet = new THREE.Mesh(
    new THREE.BoxGeometry(width + 0.5, 1.4, depth + 0.5),
    new THREE.MeshStandardMaterial({ color: '#dcc7a8', roughness: 0.8 }),
  );
  cabinet.position.y = -0.7;
  cabinet.castShadow = cabinet.receiveShadow = true;
  tank.add(cabinet);

  const glass = new THREE.Mesh(
    new THREE.BoxGeometry(width, height, depth),
    new THREE.MeshStandardMaterial({
      color: '#f4fbfd', roughness: 0.05, metalness: 0.1,
      transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide,
    }),
  );
  glass.position.y = height / 2;
  glass.renderOrder = 3;
  tank.add(glass);

  // Glass edges read as thin green-grey lines, like real tank glass seen edge on.
  const edgeMaterial = new THREE.MeshStandardMaterial({ color: '#9fbcbf', roughness: 0.3 });
  const beam = (w, h, d, x, y, z) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), edgeMaterial);
    mesh.position.set(x, y, z);
    tank.add(mesh);
  };
  const t = 0.035;
  for (const x of [-width / 2, width / 2]) {
    for (const z of [-depth / 2, depth / 2]) beam(t, height, t, x, height / 2, z);
  }
  for (const y of [0, height]) {
    for (const z of [-depth / 2, depth / 2]) beam(width, t, t, 0, y, z);
    for (const x of [-width / 2, width / 2]) beam(t, t, depth, x, y, 0);
  }

  const waterBody = new THREE.Mesh(
    new THREE.BoxGeometry(width - 0.04, water, depth - 0.04),
    new THREE.MeshStandardMaterial({
      color: '#6cc4d3', roughness: 0.2,
      transparent: true, opacity: 0.15, depthWrite: false,
    }),
  );
  waterBody.position.y = water / 2;
  waterBody.renderOrder = 2;
  tank.add(waterBody);

  // The surface ripples a little; tick() moves it.
  const surfaceGeometry = new THREE.PlaneGeometry(width - 0.04, depth - 0.04, 48, 24);
  surfaceGeometry.rotateX(-Math.PI / 2);
  const surface = new THREE.Mesh(
    surfaceGeometry,
    new THREE.MeshStandardMaterial({
      color: '#c9eef3', roughness: 0.1, metalness: 0.2,
      transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide,
    }),
  );
  surface.position.y = water;
  surface.renderOrder = 4;
  tank.add(surface);

  const rest = surfaceGeometry.attributes.position.array.slice();
  tank.userData.tick = (time) => {
    const p = surfaceGeometry.attributes.position.array;
    for (let i = 0; i < p.length; i += 3) {
      const x = rest[i], z = rest[i + 2];
      p[i + 1] = 0.018 * Math.sin(x * 2.1 + time * 1.3) + 0.012 * Math.sin(z * 3.3 - time * 1.7);
    }
    surfaceGeometry.attributes.position.needsUpdate = true;
    surfaceGeometry.computeVertexNormals();
  };

  return tank;
}
