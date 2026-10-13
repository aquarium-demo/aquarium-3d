import * as THREE from 'three';
import { TANK } from './tank.js';

// A small seeded random, so the pebbles land in the same places every load.
function random(seed) {
  return () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
}

// A sand floor with soft dunes, and a scatter of pebbles on it.
export function makeSand(seed = 7) {
  const floor = new THREE.Group();
  const { width, depth } = TANK;

  const geometry = new THREE.PlaneGeometry(width - 0.06, depth - 0.06, 96, 48);
  geometry.rotateX(-Math.PI / 2);
  const p = geometry.attributes.position.array;
  for (let i = 0; i < p.length; i += 3) {
    const x = p[i], z = p[i + 2];
    // Higher at the back, with long low dunes across it.
    p[i + 1] = 0.22 - z * 0.08 + 0.05 * Math.sin(x * 1.7 + z * 0.6) + 0.025 * Math.sin(x * 4.3 - z * 2.1);
  }
  geometry.computeVertexNormals();
  const sand = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: '#ead9b4', roughness: 1 }));
  sand.receiveShadow = true;
  floor.add(sand);

  const rand = random(seed);
  const tones = ['#b9b2a6', '#8f8c86', '#d4c4a8', '#a89f93', '#c7beb2'];
  for (let i = 0; i < 26; i++) {
    const r = 0.05 + rand() * 0.12;
    const pebble = new THREE.Mesh(
      new THREE.DodecahedronGeometry(r, 1),
      new THREE.MeshStandardMaterial({ color: tones[i % tones.length], roughness: 0.9, flatShading: true }),
    );
    const x = (rand() - 0.5) * (width - 0.6), z = (rand() - 0.5) * (depth - 0.6);
    pebble.scale.set(1, 0.6 + rand() * 0.3, 1 + rand() * 0.4);
    pebble.rotation.y = rand() * Math.PI;
    pebble.position.set(x, 0.24 - z * 0.08 + r * 0.3, z);
    pebble.castShadow = true;
    floor.add(pebble);
  }

  return floor;
}
