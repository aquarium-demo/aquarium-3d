import * as THREE from 'three';
import { TANK } from './tank.js';
import { makeSchool } from './fish-shape.js';

// Same tiny seeded random as sand.js, so the school starts the same way every load.
function random(seed) {
  return () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
}

// Must match the dune formula in sand.js.
const sandHeight = (x, z) =>
  0.22 - z * 0.08 + 0.05 * Math.sin(x * 1.7 + z * 0.6) + 0.025 * Math.sin(x * 4.3 - z * 2.1);

const MIN_SPEED = 0.35, MAX_SPEED = 1.0, CRUISE = 0.65;
const MAX_ACCEL = 1.6;       // keeps turns wide and unhurried
const NEIGHBOUR = 1.3, SEPARATION = 0.38;
const WALL_MARGIN = 0.7;     // where steering away from a wall begins
const MAX_DT = 1 / 20;       // a slow frame (or a hidden tab) must not fling anyone
const UP = new THREE.Vector3(0, 1, 0);

// A school of boids that wanders the tank: separation, alignment and cohesion,
// plus a slow drifting wander so the school splits and rejoins instead of circling.
export function makeFish(seed = 11) {
  const rand = random(seed);
  const school = makeSchool(rand);
  const { count, species, length } = school;
  const group = new THREE.Group();
  school.meshes.forEach((m) => group.add(m));

  const limitX = TANK.width / 2 - 0.1, limitZ = TANK.depth / 2 - 0.1;
  const pos = [], vel = [], acc = [], wander = [], phase = [], roll = [], wobble = [];
  for (let i = 0; i < count; i++) {
    const x = (rand() * 2 - 1) * (limitX - 1), z = (rand() * 2 - 1) * (limitZ - 0.6);
    const y = sandHeight(x, z) + 0.5 + rand() * (TANK.water - 1.2);
    pos.push(new THREE.Vector3(x, y, z));
    const a = rand() * Math.PI * 2;
    vel.push(new THREE.Vector3(Math.cos(a), 0, Math.sin(a)).multiplyScalar(CRUISE));
    acc.push(new THREE.Vector3());
    wander.push(new THREE.Vector3());
    phase.push(rand() * Math.PI * 2);
    roll.push(0);
    wobble.push(rand() * 100);
  }

  const steer = new THREE.Vector3(), tmp = new THREE.Vector3();
  const sep = new THREE.Vector3(), ali = new THREE.Vector3(), coh = new THREE.Vector3();
  const right = new THREE.Vector3(), up = new THREE.Vector3(), fwd = new THREE.Vector3();
  const matrix = new THREE.Matrix4();
  let last = null;

  // Push back from a wall: zero outside the margin, rising smoothly to 1 at the wall.
  const push = (depthIn) => {
    const t = THREE.MathUtils.clamp(depthIn / WALL_MARGIN, 0, 1);
    return t * t * (3 - 2 * t);
  };

  group.userData.tick = (time) => {
    const dt = last === null ? 0 : Math.min(Math.max(time - last, 0), MAX_DT);
    last = time;

    if (dt > 0) {
      for (let i = 0; i < count; i++) {
        const p = pos[i], v = vel[i];
        sep.set(0, 0, 0); ali.set(0, 0, 0); coh.set(0, 0, 0);
        let n = 0, nAli = 0;
        for (let j = 0; j < count; j++) {
          if (j === i) continue;
          tmp.subVectors(pos[j], p);
          const d = tmp.length();
          if (d > NEIGHBOUR) continue;
          n++;
          coh.add(pos[j]);
          // Own kind lines up strongly; others only a little.
          const same = species[j] === species[i];
          ali.addScaledVector(vel[j], same ? 1 : 0.25);
          nAli += same ? 1 : 0.25;
          if (d < SEPARATION && d > 1e-4) sep.addScaledVector(tmp, -(SEPARATION - d) / (d * SEPARATION));
        }
        steer.set(0, 0, 0);
        if (n > 0) {
          coh.multiplyScalar(1 / n).sub(p);
          steer.addScaledVector(coh, 0.5);
          steer.addScaledVector(ali.multiplyScalar(1 / nAli).sub(v), 1.1);
          steer.addScaledVector(sep, 2.4);
        }

        // Wander: a slowly changing random heading, different for each fish.
        const w = wander[i], t = time * 0.35 + wobble[i];
        w.set(Math.sin(t * 1.3) + Math.sin(t * 0.7 + 2), 0.3 * Math.sin(t * 0.9 + 1), Math.sin(t * 1.1 + 4) + Math.sin(t * 0.6));
        steer.addScaledVector(w, 0.35);

        // Soft boundaries. Steer early; the margin grows with body length so big fish turn sooner.
        const half = length[i] * 0.5;
        const bx = limitX - half, bz = limitZ - half;
        steer.x -= Math.sign(p.x) * push(Math.abs(p.x) - (bx - WALL_MARGIN)) * 3;
        steer.z -= Math.sign(p.z) * push(Math.abs(p.z) - (bz - WALL_MARGIN)) * 3;
        const floor = sandHeight(p.x, p.z) + 0.15 + half * 0.5, ceil = TANK.water - 0.15 - half * 0.5;
        steer.y += push(floor + WALL_MARGIN - p.y) * 3;
        steer.y -= push(p.y - (ceil - WALL_MARGIN)) * 3;
        // Mid-water is where the interest is; a faint pull back from the extremes.
        steer.y += (1.6 - p.y) * 0.05;

        steer.y *= 0.6; // mostly level swimming, like a real school
        if (steer.length() > MAX_ACCEL) steer.setLength(MAX_ACCEL);
        acc[i].lerp(steer, 1 - Math.exp(-dt * 6)); // smooth, so turns never snap

        v.addScaledVector(acc[i], dt);
        v.y *= 1 - Math.min(dt * 1.5, 1); // damp climbing and diving
        const s = THREE.MathUtils.clamp(v.length(), MIN_SPEED, MAX_SPEED);
        // Ease speed toward cruise so fish don't sit at a limit.
        v.setLength(s + (CRUISE - s) * Math.min(dt * 0.5, 1));
      }
    }

    for (let i = 0; i < count; i++) {
      const p = pos[i], v = vel[i];
      p.addScaledVector(v, dt);
      // Last resort: never let the body cross the glass, sand or surface.
      const half = length[i] * 0.5;
      const bx = limitX - half * 0.7, bz = limitZ - half * 0.7;
      if (Math.abs(p.x) > bx) { p.x = Math.sign(p.x) * bx; v.x *= -0.2; }
      if (Math.abs(p.z) > bz) { p.z = Math.sign(p.z) * bz; v.z *= -0.2; }
      const lo = sandHeight(p.x, p.z) + 0.1 + half * 0.3, hi = TANK.water - 0.1 - half * 0.3;
      if (p.y < lo) { p.y = lo; v.y = Math.max(v.y, 0); }
      if (p.y > hi) { p.y = hi; v.y = Math.min(v.y, 0); }

      // Face the way we swim; bank into the turn (sideways acceleration), smoothed.
      fwd.copy(v).normalize();
      right.crossVectors(UP, fwd).normalize();
      const lateral = acc[i].dot(right);
      const targetRoll = THREE.MathUtils.clamp(-lateral * 0.5, -0.6, 0.6);
      roll[i] += (targetRoll - roll[i]) * (1 - Math.exp(-dt * 3));
      up.crossVectors(fwd, right);
      const c = Math.cos(roll[i]), s = Math.sin(roll[i]);
      tmp.copy(right).multiplyScalar(c).addScaledVector(up, s); // roll about the heading
      up.multiplyScalar(c).addScaledVector(right, -s);
      right.copy(tmp);
      matrix.makeBasis(right, up, fwd).setPosition(p);

      // Wiggle faster the faster we swim, and a little faster for small fish.
      phase[i] += dt * (3 + 9 * (v.length() / MAX_SPEED)) * (0.25 / Math.max(length[i], 0.1) + 0.75);
      school.setFish(i, matrix, phase[i]);
    }
    school.commit();
  };

  return group;
}
