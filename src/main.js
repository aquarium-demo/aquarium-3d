import * as THREE from 'three';
import { makeTank, TANK } from './tank.js';
import { makeSand } from './sand.js';
import { makeFish } from './fish.js';

// Radians per second: one full turn around the tank in about 80 s.
const ORBIT = 0.08;

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color('#eef3f6');
scene.fog = new THREE.Fog('#eef3f6', 22, 40);

const camera = new THREE.PerspectiveCamera(35, window.innerWidth / window.innerHeight, 0.1, 100);

scene.add(new THREE.HemisphereLight('#ffffff', '#d5e4e8', 1.4));
const sun = new THREE.DirectionalLight('#fffaf0', 2.2);
sun.position.set(6, 10, 7);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = sun.shadow.camera.bottom = -8;
sun.shadow.camera.right = sun.shadow.camera.top = 8;
sun.shadow.radius = 4;
scene.add(sun);
// A cool light from inside the water, so the tank glows a little.
const glow = new THREE.PointLight('#9be3ee', 6, 8, 2);
glow.position.set(0, TANK.water - 0.3, 0);
scene.add(glow);

const ground = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), new THREE.ShadowMaterial({ opacity: 0.12 }));
ground.rotation.x = -Math.PI / 2;
ground.position.y = -1.4;
ground.receiveShadow = true;
scene.add(ground);

const tank = makeTank();
scene.add(tank);
scene.add(makeSand());
const fish = makeFish(); scene.add(fish);

const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const time = clock.getElapsedTime();
  const angle = 0.5 + time * ORBIT;
  camera.position.set(Math.sin(angle) * 13.5, 4.0, Math.cos(angle) * 13.5);
  camera.lookAt(0, 0.9, 0);
  tank.userData.tick(time);
  fish.userData.tick(time);
  renderer.render(scene, camera);
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
