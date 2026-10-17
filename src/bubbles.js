import * as THREE from 'three';
import { TANK } from './tank.js';

// A small seeded random, so the stones sit in the same places every load.
function random(seed) {
  return () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
}

// Same height as the sand mesh, so stones and bubbles start on the surface.
const sandY = (x, z) => 0.22 - z * 0.08 + 0.05 * Math.sin(x * 1.7 + z * 0.6) + 0.025 * Math.sin(x * 4.3 - z * 2.1);

const POOL = 220;
const STONES = [[-1.7, -0.35], [1.9, 0.5]];
const STREAM_GAP = 0.11; // seconds between bubbles from one stone
const STRAY_GAP = 2.2; // average seconds between stray bubbles

// Air stones on the sand, each sending up a stream, plus the odd stray bubble.
export function makeBubbles(seed = 11) {
  const group = new THREE.Group();
  // One rng per source, so each stream looks the same whatever the frame rate.
  const strayRand = random(seed * 7 + 3);
  const limitX = TANK.width / 2 - 0.1, limitZ = TANK.depth / 2 - 0.1;
  const clamp = (v, limit) => Math.max(-limit, Math.min(limit, v));
  const top = TANK.water - 0.03; // the surface ripples a little, so pop just under it

  const stoneMaterial = new THREE.MeshStandardMaterial({ color: '#9aa3a8', roughness: 0.95, flatShading: true });
  const stones = STONES.map(([x, z], n) => {
    const rand = random(seed * 31 + n * 101 + 17);
    const stone = new THREE.Mesh(new THREE.DodecahedronGeometry(0.09, 0), stoneMaterial);
    stone.scale.set(1.2, 0.55, 1);
    stone.position.set(x, sandY(x, z) + 0.02, z);
    stone.castShadow = true;
    group.add(stone);
    return { x, z, y: stone.position.y + 0.04, wait: rand() * STREAM_GAP, rand };
  });

  const geometry = new THREE.SphereGeometry(1, 14, 10);
  const material = new THREE.MeshPhysicalMaterial({
    color: '#c4e0f5',
    emissive: '#8fbfe6', // a soft cool glow so they read on the pale background
    emissiveIntensity: 0.18,
    roughness: 0.04,
    metalness: 0,
    clearcoat: 1,
    clearcoatRoughness: 0.03,
    transparent: true,
    opacity: 0.55,
    depthWrite: false, // so bubbles never cut holes in the water behind them
  });
  const mesh = new THREE.InstancedMesh(geometry, material, POOL);
  mesh.renderOrder = 5; // after water body (2), glass (3) and surface (4)
  mesh.frustumCulled = false; // instances move; the bounding sphere would go stale
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  group.add(mesh);

  // Per-bubble state in flat arrays, so nothing is allocated while running.
  const x0 = new Float32Array(POOL), z0 = new Float32Array(POOL);
  const y = new Float32Array(POOL), speed = new Float32Array(POOL);
  const size = new Float32Array(POOL), phase = new Float32Array(POOL);
  const wobble = new Float32Array(POOL), rise = new Float32Array(POOL);
  const alive = new Uint8Array(POOL);
  let next = 0;
  let strayWait = strayRand() * STRAY_GAP;

  const scratch = new THREE.Object3D();
  const hidden = new THREE.Matrix4().makeScale(0, 0, 0);
  for (let i = 0; i < POOL; i++) mesh.setMatrixAt(i, hidden);

  function spawn(rand, x, z, startY) {
    // Take the next slot; if the pool is full the oldest bubble is recycled.
    const i = next;
    next = (next + 1) % POOL;
    x0[i] = x; z0[i] = z; y[i] = startY;
    size[i] = 0.025 + rand() * 0.03;
    speed[i] = 0.15 + rand() * 0.1;
    phase[i] = rand() * Math.PI * 2;
    wobble[i] = 0.015 + rand() * 0.025;
    rise[i] = 0;
    alive[i] = 1;
  }

  let last = null;
  group.userData.tick = (time) => {
    const dt = last === null ? 0 : Math.min(Math.max(time - last, 0), 0.1);
    last = time;

    for (let n = 0; n < stones.length; n++) {
      const s = stones[n], rand = s.rand;
      s.wait -= dt;
      while (s.wait <= 0) {
        spawn(rand, s.x + (rand() - 0.5) * 0.04, s.z + (rand() - 0.5) * 0.04, s.y);
        s.wait += STREAM_GAP * (0.7 + rand() * 0.6);
      }
    }

    strayWait -= dt;
    while (strayWait <= 0) {
      const x = (strayRand() - 0.5) * 2 * limitX, z = (strayRand() - 0.5) * 2 * limitZ;
      spawn(strayRand, x, z, sandY(x, z) + 0.03);
      strayWait += STRAY_GAP * (0.4 + strayRand() * 1.2);
    }

    for (let i = 0; i < POOL; i++) {
      if (!alive[i]) continue;
      // Gentle acceleration, up to a lazy terminal speed.
      speed[i] = Math.min(speed[i] + 0.12 * dt, 0.9);
      y[i] += speed[i] * dt;
      rise[i] += speed[i] * dt;

      const r = size[i] * (1 + rise[i] * 0.25); // grows a little as pressure drops
      if (y[i] + r >= top) {
        alive[i] = 0;
        mesh.setMatrixAt(i, hidden);
        continue;
      }
      // Wobble sideways, more as it climbs; wider bubbles wobble in a looser circle.
      const sway = wobble[i] * (1 + rise[i] * 0.4);
      const px = clamp(x0[i] + Math.sin(time * 3 + phase[i]) * sway, limitX);
      const pz = clamp(z0[i] + Math.cos(time * 2.3 + phase[i]) * sway * 0.7, limitZ);
      // Shrink all the way to nothing over the last stretch, so the pop is soft.
      const k = r * Math.min(1, (top - y[i] - r) / 0.12);
      scratch.position.set(px, y[i], pz);
      scratch.scale.set(k, k, k);
      scratch.updateMatrix();
      mesh.setMatrixAt(i, scratch.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  };

  return group;
}
