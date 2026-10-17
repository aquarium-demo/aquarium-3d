import * as THREE from 'three';
import { TANK } from './tank.js';

// A small seeded random, so the plants grow in the same places every load.
function random(seed) {
  return () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
}

// Same surface as the sand mesh, so roots can be planted on it exactly.
function sandHeight(x, z) {
  return 0.22 - z * 0.08 + 0.05 * Math.sin(x * 1.7 + z * 0.6) + 0.025 * Math.sin(x * 4.3 - z * 2.1);
}

// One shared clock for every plant; tick() advances it.
const uTime = { value: 0 };

// Geometry is built one unit tall and scaled per instance, so the shader can
// use the local height (0 at the root, 1 at the tip) as the bend weight.
function builder() {
  const pos = [], col = [], idx = [];
  const base = new THREE.Color(), tip = new THREE.Color();
  return {
    // A bent strip from the root up; `lean` is how far the tip drifts along x.
    strip(width, height, lean, angle, segs, dark, light, taper = 0.6, y0 = 0) {
      base.set(dark); tip.set(light);
      const start = pos.length / 3;
      const c = Math.cos(angle), s = Math.sin(angle);
      for (let i = 0; i <= segs; i++) {
        const t = i / segs;
        const w = (width / 2) * (1 - taper * t * t);
        const cx = lean * t * t * height;
        for (const side of [-1, 1]) {
          // Strip runs along local x, then is turned by `angle` around y.
          const lx = cx + 0, lz = side * w;
          pos.push(lx * c + lz * s, y0 + t * height, -lx * s + lz * c);
          const k = base.clone().lerp(tip, t);
          col.push(k.r, k.g, k.b);
        }
        if (i < segs) {
          const a = start + i * 2;
          idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
        }
      }
    },
    // A small diamond leaf hanging off a point on a stem.
    leaf(x, y, z, size, angle, dark, light) {
      base.set(dark); tip.set(light);
      const start = pos.length / 3;
      const c = Math.cos(angle), s = Math.sin(angle);
      const pts = [[0, 0, 0, 0], [0.5, 0.15, 0.4, 0.5], [0, 0.1, -0.4, 0.5], [1, 0.3, 0, 1]];
      // Diamond: root, two shoulders, tip; pushed outward along the leaf angle.
      const verts = [[0, 0, 0], [0.45, 0.12, 0.3], [0.45, 0.12, -0.3], [1, 0.3, 0]];
      for (let i = 0; i < 4; i++) {
        const [vx, vy, vz] = verts[i];
        const lx = vx * size, lz = vz * size;
        pos.push(x + lx * c + lz * s, y + vy * size, z - lx * s + lz * c);
        const k = base.clone().lerp(tip, pts[i][3]);
        col.push(k.r, k.g, k.b);
      }
      idx.push(start, start + 1, start + 2, start + 1, start + 3, start + 2);
    },
    build() {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      g.setIndex(idx);
      g.computeVertexNormals();
      return g;
    },
  };
}

// Sways the top of each plant and leaves the root alone. The phase and speed
// come from where the instance sits, so neighbours never move together.
function sway(material, amp, key) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uTime;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vec2 ip = instanceMatrix[3].xz;
        float rate = 0.55 + 0.35 * fract(sin(dot(ip, vec2(12.9898, 78.233))) * 43758.5453);
        float phase = ip.x * 1.7 + ip.y * 2.3;
        float bend = pow(clamp(position.y, 0.0, 1.0), 2.0) * ${amp.toFixed(3)};
        transformed.x += sin(uTime * rate + phase) * bend;
        transformed.z += sin(uTime * rate * 0.8 + phase * 1.3 + 1.0) * bend * 0.6;`);
  };
  material.customProgramCacheKey = () => `plants-${key}`;
  return material;
}

// Ribbon grass, bushy stems and low moss, rooted on the sand and swaying.
export function makePlants(seed = 11) {
  const group = new THREE.Group();
  const rand = random(seed);
  const { width, depth } = TANK;
  const dummy = new THREE.Object3D();

  // `reach` is the real worst-case horizontal extent of a plant (lean + sway +
  // half width, after scaling), so even the back rows stay inside the glass.
  // Plants live at the back and sides; the middle stays open for the fish.
  function place(centres, reach) {
    const [cx, cz, spread] = centres[Math.floor(rand() * centres.length)];
    for (let tries = 0; tries < 20; tries++) {
      let x = cx + (rand() + rand() - 1) * spread;
      let z = cz + (rand() + rand() - 1) * spread;
      x = Math.max(-(width / 2 - 0.1 - reach), Math.min(width / 2 - 0.1 - reach, x));
      z = Math.max(-(depth / 2 - 0.1 - reach), Math.min(depth / 2 - 0.1 - reach, z));
      if (Math.abs(x) < 1.5 && z > -0.5) continue;
      return [x, z];
    }
    return [cx, cz];
  }

  function kind(geometry, material, count, centres, reach, size) {
    const mesh = new THREE.InstancedMesh(geometry, material, count);
    const color = new THREE.Color();
    for (let i = 0; i < count; i++) {
      const [x, z] = place(centres, reach);
      const s = size(rand);
      // Sunk a hair into the sand so there is never a gap at the root.
      dummy.position.set(x, sandHeight(x, z) - 0.015, z);
      dummy.rotation.set(0, rand() * Math.PI * 2, 0);
      dummy.scale.set(s[0], s[1], s[0]);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      // Slight tone shifts so a patch isn't one flat green.
      const v = 0.82 + rand() * 0.18;
      color.setRGB(v, v * (0.94 + rand() * 0.06), v * (0.85 + rand() * 0.15));
      mesh.setColorAt(i, color);
    }
    mesh.frustumCulled = false; // the sway moves vertices past the static bounds
    group.add(mesh);
  }

  const mat = (key, amp) => sway(new THREE.MeshStandardMaterial({
    vertexColors: true, side: THREE.DoubleSide, roughness: 0.75,
  }), amp, key);

  // (a) Tall ribbon grass: long thin strips that lean over at the top.
  {
    const b = builder();
    const blades = 5;
    for (let i = 0; i < blades; i++) {
      b.strip(0.09 + (i % 2) * 0.03, 1, 0.02 + i * 0.01, (i / blades) * Math.PI * 2 + 0.5, 10, '#2f6b3c', '#8fc47a');
    }
    kind(b.build(), mat('grass', 0.09), 34,
      [[-2.3, -1.1, 0.5], [-1.3, -1.35, 0.4], [1.6, -1.3, 0.5], [2.4, -0.6, 0.45], [0.2, -1.4, 0.6], [-2.6, 0.5, 0.35]],
      0.3, (r) => [0.9 + r() * 0.3, 2.0 + r() * 0.6]);
  }

  // (b) Bushy stems with small leaves up the sides.
  {
    const b = builder();
    const stems = 4;
    for (let i = 0; i < stems; i++) {
      const a = (i / stems) * Math.PI * 2;
      const lean = 0.06 + (i % 2) * 0.04;
      b.strip(0.025, 1, lean, a, 6, '#3d6e3a', '#6aa35a', 0.3);
      for (let j = 1; j <= 6; j++) {
        const t = j / 6.5;
        const ca = Math.cos(a), sa = Math.sin(a);
        const lx = lean * t * t;
        // Leaf roots sit on the stem; leaves alternate sides and shrink upward.
        b.leaf(lx * ca, t, -lx * sa, 0.17 - t * 0.06, a + (j % 2 ? 0.9 : -0.9) + j, '#4e8a45', '#a3d27c');
        b.leaf(lx * ca, t, -lx * sa, 0.17 - t * 0.06, a + (j % 2 ? -2.2 : 2.2) + j, '#4e8a45', '#a3d27c');
      }
    }
    kind(b.build(), mat('bush', 0.08), 22,
      [[-2.5, -0.9, 0.4], [2.5, -1.0, 0.4], [-0.9, -1.35, 0.35], [1.1, -1.35, 0.35], [2.6, 0.7, 0.3]],
      0.35, (r) => { const s = 0.65 + r() * 0.45; return [s, s]; });
  }

  // (c) Low moss: small tufts packed into a couple of patches.
  {
    const b = builder();
    for (let i = 0; i < 5; i++) {
      b.strip(0.05, 1, 0.12, (i / 5) * Math.PI * 2, 3, '#3f7a42', '#86bd6c', 0.5);
    }
    kind(b.build(), mat('moss', 0.05), 150,
      [[-2.0, -0.2, 0.28], [-2.55, 1.0, 0.3], [2.2, 0.4, 0.3], [1.5, -1.0, 0.25], [-0.4, -1.4, 0.3]],
      0.28, (r) => [0.7 + r() * 0.4, 0.1 + r() * 0.1]);
  }

  group.userData.tick = (time) => { uTime.value = time; };
  return group;
}
