import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Soft, light colours that sit well in the blue-green water.
export const SPECIES = [
  { color: '#f2b27a', accent: '#f7d9b0', length: 0.26, count: 14 },
  { color: '#a9c7e8', accent: '#e4eefa', length: 0.2, count: 10 },
  { color: '#e8a3b8', accent: '#f6d3de', length: 0.3, count: 6 },
];

// One fish is a unit-length mesh (nose at +Z, back at +Y, centred on the origin),
// so the simulation scales the instance matrix by the fish's length.
function paint(geometry, color) {
  const c = new THREE.Color(color);
  const n = geometry.attributes.position.count;
  const a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) c.toArray(a, i * 3);
  geometry.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return geometry;
}

// A flat double-sided fin from a polygon in the (z, y) plane at x = 0.
function fin(points, x = 0) {
  const g = new THREE.BufferGeometry();
  const v = [];
  for (const [z, y] of points) v.push(x, y, z);
  const idx = [];
  for (let i = 1; i < points.length - 1; i++) idx.push(0, i, i + 1);
  g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function buildGeometry(color, accent) {
  // Body: a sphere stretched along Z, fat near the front and tapering to the tail.
  const body = new THREE.SphereGeometry(0.5, 20, 14);
  body.deleteAttribute('uv'); // fins have none, and merging needs matching attributes
  // Map the sphere's (x, y, z) onto (side, along, up).
  const b = body.attributes.position;
  for (let i = 0; i < b.count; i++) {
    const x = b.getX(i), y = b.getY(i), z = b.getZ(i);
    const along = y / 0.5; // -1 tail .. 1 nose
    const shape = along < 0 ? 0.25 + 0.75 * Math.sqrt(1 + along) : 1;
    b.setXYZ(i, x * 0.3 * shape, z * 0.5 * shape, along * 0.38 - 0.05);
  }
  body.computeVertexNormals();

  const tail = fin([[-0.4, 0], [-0.62, 0.17], [-0.56, 0], [-0.62, -0.17]]);
  const dorsal = fin([[0.12, 0.2], [-0.1, 0.34], [-0.24, 0.14]]);
  const side = (sign) => fin([[0.1, -0.03], [-0.04, -0.1], [-0.07, 0.0]], sign * 0.12);

  const parts = [paint(body, color), paint(tail, accent), paint(dorsal, accent), paint(side(1), accent), paint(side(-1), accent)];
  const merged = mergeGeometries(parts);
  if (!merged) throw new Error('fish-shape: mergeGeometries failed (mismatched attributes)');
  parts.forEach((g) => g.dispose());
  return merged;
}

// Bend the body side to side, more toward the tail, driven by a per-instance phase.
function addWiggle(shader) {
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nattribute float aPhase;')
    .replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
      float tailness = clamp(0.2 - transformed.z, 0.0, 0.8);
      transformed.x += sin(aPhase - transformed.z * 6.0) * 0.12 * tailness * tailness;`,
    );
}

export function makeSchool(rand = Math.random) {
  const meshes = [];
  const species = [];
  const length = [];
  const slots = []; // per fish: [mesh, local index]
  const phases = [];

  SPECIES.forEach((sp, si) => {
    const geometry = buildGeometry(sp.color, sp.accent);
    const phase = new THREE.InstancedBufferAttribute(new Float32Array(sp.count), 1);
    phase.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute('aPhase', phase);

    const material = new THREE.MeshStandardMaterial({
      vertexColors: true, roughness: 0.55, metalness: 0.05, side: THREE.DoubleSide,
    });
    material.onBeforeCompile = addWiggle;

    const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, side: THREE.DoubleSide });
    depth.onBeforeCompile = addWiggle;

    const mesh = new THREE.InstancedMesh(geometry, material, sp.count);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.customDepthMaterial = depth;
    mesh.castShadow = true;
    mesh.frustumCulled = false; // instances roam the whole tank
    meshes.push(mesh);
    phases.push(phase);

    for (let k = 0; k < sp.count; k++) {
      species.push(si);
      length.push(sp.length * (0.85 + rand() * 0.3));
      slots.push([mesh, k]);
    }
  });

  return {
    meshes,
    count: species.length,
    species: Int32Array.from(species),
    length: Float32Array.from(length),
    setFish(i, matrix, phase) {
      const [mesh, k] = slots[i];
      mesh.setMatrixAt(k, matrix);
      phases[species[i]].setX(k, phase);
    },
    commit() {
      for (const mesh of meshes) mesh.instanceMatrix.needsUpdate = true;
      for (const phase of phases) phase.needsUpdate = true;
    },
  };
}
