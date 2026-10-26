import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const state = {
  mode: 'menu',
  coins: parseInt(localStorage.getItem('drift_coins') || '0'),
  upgrades: JSON.parse(localStorage.getItem('drift_upgrades') || '{"tires":0,"engine":0,"turbo":0,"neon":0}'),
  score: 0,
  driftScore: 0,
  combo: 1,
  lastDrift: 0,
  isMobile: window.innerWidth < 900 || 'ontouchstart' in window,
  keys: {},
  steer: 0,
  throttle: 0,
  brake: 0,
  handbrake: false,
  leaderboard: JSON.parse(localStorage.getItem('drift_leaderboard') || '[]'),
};

function getDateSeed() {
  const d = new Date();
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
}
function mulberry32(a) {
  return function() {
    let t = a += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
const rng = mulberry32(getDateSeed());

const canvas = document.getElementById('canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0c0c18);
scene.fog = new THREE.Fog(0x0c0c18, 50, 220);

const camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.1, 400);
camera.position.set(0, 6, 12);

const ambient = new THREE.AmbientLight(0x445566, 0.7);
scene.add(ambient);
const sun = new THREE.DirectionalLight(0xffffff, 1.3);
sun.position.set(40, 60, 30);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -80; sun.shadow.camera.right = 80;
sun.shadow.camera.top = 80; sun.shadow.camera.bottom = -80;
scene.add(sun);

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(600, 600),
  new THREE.MeshStandardMaterial({ color: 0x1a1a22, roughness: 1 })
);
ground.rotation.x = -Math.PI / 2;
ground.position.y = -0.2;
ground.receiveShadow = true;
scene.add(ground);

let car = new THREE.Group();
let carModel = null;
const loader = new GLTFLoader();
const carModels = ['sedan-sports.glb', 'race.glb', 'hatchback-sports.glb'];

function loadCar(index = 0) {
  const name = carModels[index % carModels.length];
  loader.load(`models/${name}`, (gltf) => {
    if (carModel) car.remove(carModel);
    carModel = gltf.scene;
    carModel.scale.set(1.6, 1.6, 1.6);
    carModel.position.y = 0.35;
    carModel.traverse(c => {
      if (c.isMesh) {
        c.castShadow = true;
        c.receiveShadow = true;
      }
    });
    car.add(carModel);
  }, undefined, () => {
    createFallbackCar();
  });
}

function createFallbackCar() {
  if (carModel) car.remove(carModel);
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(1.6, 0.55, 3.6),
    new THREE.MeshStandardMaterial({ color: 0xff2244, metalness: 0.4, roughness: 0.3 })
  );
  body.position.y = 0.55;
  body.castShadow = true;
  car.add(body);
  const cabin = new THREE.Mesh(
    new THREE.BoxGeometry(1.3, 0.45, 1.6),
    new THREE.MeshStandardMaterial({ color: 0x222233 })
  );
  cabin.position.set(0, 1.0, -0.2);
  car.add(cabin);
  carModel = body;
}

loadCar(0);
scene.add(car);

const carPhys = {
  pos: new THREE.Vector3(0, 0.8, 0),
  vel: new THREE.Vector3(),
  rot: 0,
  speed: 0,
};

let trackGroup = new THREE.Group();
scene.add(trackGroup);
let trackPoints = [];
const TRACK_WIDTH = 14;

function generateTrack() {
  trackGroup.clear();
  trackPoints = [];

  const segs = 36 + Math.floor(rng() * 16);
  let x = 0, z = 0, angle = 0;
  const pts = [];

  for (let i = 0; i <= segs; i++) {
    pts.push(new THREE.Vector3(x, 0, z));
    const turn = (rng() - 0.5) * 0.55;
    angle += turn;
    const len = 10 + rng() * 8;
    x += Math.sin(angle) * len;
    z += Math.cos(angle) * len;
  }
  pts.push(pts[0].clone());
  trackPoints = pts;

  const roadMat = new THREE.MeshStandardMaterial({ color: 0x2a2a32, roughness: 0.85 });
  const wallMat = new THREE.MeshStandardMaterial({ color: 0x3a3a48 });
  const lineMat = new THREE.MeshStandardMaterial({ color: 0xffee55 });

  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const dir = new THREE.Vector3().subVectors(b, a);
    const len = dir.length();
    if (len < 0.1) continue;
    dir.normalize();
    const mid = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5);
    const perp = new THREE.Vector3(-dir.z, 0, dir.x);

    const road = new THREE.Mesh(new THREE.BoxGeometry(TRACK_WIDTH, 0.25, len + 1.2), roadMat);
    road.position.copy(mid);
    road.position.y = 0.12;
    road.lookAt(b);
    road.receiveShadow = true;
    trackGroup.add(road);

    const line = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.05, len * 0.6), lineMat);
    line.position.copy(mid);
    line.position.y = 0.28;
    line.lookAt(b);
    trackGroup.add(line);

    const wallH = 1.8;
    [-1, 1].forEach(side => {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(0.7, wallH, len + 0.8), wallMat);
      wall.position.copy(mid).add(perp.clone().multiplyScalar(side * (TRACK_WIDTH / 2 + 0.4)));
      wall.position.y = wallH / 2 + 0.1;
      wall.lookAt(b);
      wall.castShadow = true;
      wall.receiveShadow = true;
      trackGroup.add(wall);
    });
  }

  const start = pts[0];
  const startNext = pts[1];
  const sdir = new THREE.Vector3().subVectors(startNext, start).normalize();
  const sperp = new THREE.Vector3(-sdir.z, 0, sdir.x);
  const finish = new THREE.Mesh(
    new THREE.BoxGeometry(TRACK_WIDTH - 1, 0.05, 1.2),
    new THREE.MeshStandardMaterial({ color: 0xffffff })
  );
  finish.position.copy(start);
  finish.position.y = 0.3;
  finish.lookAt(startNext);
  trackGroup.add(finish);

  for (let i = -6; i <= 6; i++) {
    const sq = new THREE.Mesh(
      new THREE.BoxGeometry(1.1, 0.06, 1.1),
      new THREE.MeshStandardMaterial({ color: i % 2 === 0 ? 0x111111 : 0xffffff })
    );
    sq.position.copy(start).add(sperp.clone().multiplyScalar(i * 1.1));
    sq.position.y = 0.32;
    trackGroup.add(sq);
  }

  carPhys.pos.copy(pts[0]);
  carPhys.pos.y = 0.8;
  carPhys.rot = Math.atan2(pts[1].x - pts[0].x, pts[1].z - pts[0].z);
  carPhys.vel.set(0, 0, 0);
  car.position.copy(carPhys.pos);
  car.rotation.y = carPhys.rot;
}

const marks = [];
const markGeo = new THREE.PlaneGeometry(0.35, 1.8);
const markMat = new THREE.MeshBasicMaterial({ color: 0x111111, transparent: true, opacity: 0.55, side: THREE.DoubleSide });

function spawnMark(pos, rot) {
  if (marks.length > 120) {
    const old = marks.shift();
    scene.remove(old);
  }
  const m = new THREE.Mesh(markGeo, markMat.clone());
  m.position.copy(pos);
  m.position.y = 0.28;
  m.rotation.x = -Math.PI / 2;
  m.rotation.z = -rot;
  scene.add(m);
  marks.push(m);
}

const smokes = [];
const smokeGeo = new THREE.SphereGeometry(0.4, 6, 6);

function spawnSmoke(pos) {
  if (smokes.length > 60) return;
  const mat = new THREE.MeshBasicMaterial({ color: 0xcccccc, transparent: true, opacity: 0.35 });
  const s = new THREE.Mesh(smokeGeo, mat);
  s.position.copy(pos);
  s.position.y = 0.4;
  s.userData = { life: 1, vel: new THREE.Vector3((Math.random()-0.5)*0.6, 0.5, (Math.random()-0.5)*0.6) };
  scene.add(s);
  smokes.push(s);
}

function updateSmoke(dt) {
  for (let i = smokes.length - 1; i >= 0; i--) {
    const s = smokes[i];
    s.userData.life -= dt * 0.7;
    s.position.add(s.userData.vel.clone().multiplyScalar(dt));
    s.material.opacity = Math.max(0, s.userData.life * 0.35);
    s.scale.setScalar(1 + (1 - s.userData.life) * 2.2);
    if (s.userData.life <= 0) {
      scene.remove(s);
      smokes.splice(i, 1);
    }
  }
}

function updatePhysics(dt) {
  const up = state.upgrades;
  const maxSpeed = 32 + up.engine * 5 + up.turbo * 8;
  const accel = 22 + up.engine * 4;
  const turn = 2.4 + up.tires * 0.35;

  let steer = state.steer;
  if (!state.isMobile) {
    steer = (state.keys.KeyA || state.keys.ArrowLeft ? -1 : 0) + (state.keys.KeyD || state.keys.ArrowRight ? 1 : 0);
  }
  const gas = state.throttle || (state.keys.KeyW || state.keys.ArrowUp ? 1 : 0);
  const brk = state.brake || (state.keys.KeyS || state.keys.ArrowDown ? 1 : 0);
  const hb = state.handbrake || state.keys.Space;

  carPhys.rot += steer * turn * Math.min(1, carPhys.speed / 12) * dt * (hb ? 1.5 : 1);

  const forward = new THREE.Vector3(Math.sin(carPhys.rot), 0, Math.cos(carPhys.rot));
  if (gas) carPhys.vel.add(forward.clone().multiplyScalar(accel * gas * dt));
  if (brk) carPhys.vel.multiplyScalar(1 - brk * 4 * dt);

  const spd = carPhys.vel.length();
  if (spd > maxSpeed) carPhys.vel.setLength(maxSpeed);
  carPhys.speed = spd;

  const velDir = spd > 0.1 ? carPhys.vel.clone().normalize() : forward;
  const dot = Math.max(-1, Math.min(1, forward.dot(velDir)));
  const angle = Math.acos(dot);
  const drifting = angle > 0.22 && spd > 7;

  const grip = drifting || hb ? 0.28 + up.tires * 0.06 : 0.88;
  const right = new THREE.Vector3(Math.cos(carPhys.rot), 0, -Math.sin(carPhys.rot));
  const lat = carPhys.vel.dot(right);
  carPhys.vel.add(right.clone().multiplyScalar(-lat * (1 - grip) * 9 * dt));

  carPhys.vel.multiplyScalar(1 - 0.35 * dt);
  carPhys.pos.add(carPhys.vel.clone().multiplyScalar(dt));
  carPhys.pos.y = 0.8;

  if (drifting) {
    const pts = angle * spd * 12 * dt;
    state.driftScore += pts * state.combo;
    state.combo = Math.min(10, state.combo + dt * 0.5);
    state.lastDrift = performance.now();
    if (Math.random() < 0.45) {
      spawnSmoke(carPhys.pos);
      spawnMark(carPhys.pos, carPhys.rot);
    }
  } else if (performance.now() - state.lastDrift > 700) {
    state.combo = Math.max(1, state.combo - dt * 2);
  }
  state.score = Math.floor(state.driftScore);

  car.position.copy(carPhys.pos);
  car.rotation.y = carPhys.rot;

  const offset = new THREE.Vector3(-Math.sin(carPhys.rot) * 11, 5.5, -Math.cos(carPhys.rot) * 11);
  camera.position.lerp(carPhys.pos.clone().add(offset), 0.1);
  camera.lookAt(carPhys.pos.clone().add(new THREE.Vector3(0, 1, 0)));
}

const screens = {
  menu: document.getElementById('menu'),
  shop: document.getElementById('shop-screen'),
  leaderboard: document.getElementById('leaderboard-screen'),
  how: document.getElementById('how-screen'),
  pause: document.getElementById('pause-screen'),
};
const hud = document.getElementById('hud');
const mobile = document.getElementById('mobile-controls');

function show(name) {
  Object.values(screens).forEach(s => s.classList.remove('active'));
  if (screens[name]) screens[name].classList.add('active');
  state.mode = name;
  const playing = name === 'playing';
  hud.style.display = playing ? 'flex' : 'none';
  mobile.style.display = playing && state.isMobile ? 'block' : 'none';
  if (name === 'menu') document.getElementById('menu').classList.add('active');
}

function updateCoins() {
  document.getElementById('menu-coins').textContent = state.coins;
  document.getElementById('coins-hud').textContent = state.coins;
}

function buildShop() {
  const el = document.getElementById('shop-items');
  el.innerHTML = '';
  const items = [
    { id: 'tires', name: 'Drift Tires', costs: [120, 280, 550, 1000], max: 4 },
    { id: 'engine', name: 'Engine', costs: [150, 350, 700], max: 3 },
    { id: 'turbo', name: 'Turbo', costs: [400, 900, 1800], max: 3 },
    { id: 'neon', name: 'Neon', costs: [80, 200], max: 2 },
  ];
  items.forEach(it => {
    const lvl = state.upgrades[it.id] || 0;
    const cost = lvl < it.max ? it.costs[lvl] : null;
    const div = document.createElement('div');
    div.className = 'shop-item';
    div.innerHTML = `<div><b>${it.name}</b> Lv${lvl}/${it.max}</div>
      <button class="btn" ${!cost || state.coins < cost ? 'disabled' : ''} data-id="${it.id}">${cost || 'MAX'}</button>`;
    el.appendChild(div);
  });
  el.querySelectorAll('[data-id]').forEach(btn => {
    btn.onclick = () => {
      const id = btn.dataset.id;
      const it = items.find(i => i.id === id);
      const lvl = state.upgrades[id];
      const cost = it.costs[lvl];
      if (state.coins >= cost && lvl < it.max) {
        state.coins -= cost;
        state.upgrades[id] = (state.upgrades[id] || 0) + 1;
        localStorage.setItem('drift_coins', state.coins);
        localStorage.setItem('drift_upgrades', JSON.stringify(state.upgrades));
        updateCoins();
        buildShop();
      }
    };
  });
}

function buildLB() {
  const el = document.getElementById('leaderboard-list');
  const list = [...state.leaderboard].sort((a,b) => b.score - a.score).slice(0, 12);
  el.innerHTML = list.length ? list.map((e,i) => 
    `<div class="lb-entry"><span>#${i+1} ${e.name}</span><span>${e.score.toLocaleString()}</span></div>`
  ).join('') : '<p style="opacity:0.6;text-align:center">No scores yet</p>';
}

function saveScore(name) {
  state.leaderboard.push({ name: (name || 'Driver').slice(0,14), score: state.score, date: getDateSeed() });
  state.leaderboard = state.leaderboard.slice(-40);
  localStorage.setItem('drift_leaderboard', JSON.stringify(state.leaderboard));
  state.coins += Math.floor(state.score / 18);
  localStorage.setItem('drift_coins', state.coins);
}

window.addEventListener('keydown', e => { state.keys[e.code] = true; if (e.code === 'Space') state.handbrake = true; if (e.code === 'Escape' && state.mode === 'playing') show('pause'); });
window.addEventListener('keyup', e => { state.keys[e.code] = false; if (e.code === 'Space') state.handbrake = false; });

const wheel = document.getElementById('steering-wheel');
let wheelDown = false;
let center = { x: 0, y: 0 };

function updateCenter() {
  const r = wheel.getBoundingClientRect();
  center = { x: r.left + r.width/2, y: r.top + r.height/2 };
}

wheel.addEventListener('pointerdown', e => {
  wheelDown = true;
  wheel.setPointerCapture(e.pointerId);
  updateCenter();
});
wheel.addEventListener('pointermove', e => {
  if (!wheelDown) return;
  const dx = e.clientX - center.x;
  const dy = e.clientY - center.y;
  let ang = Math.atan2(dx, -dy);
  ang = Math.max(-1.15, Math.min(1.15, ang));
  state.steer = ang / 1.15;
  wheel.style.transform = `rotate(${ang}rad)`;
});
function endWheel() {
  wheelDown = false;
  state.steer = 0;
  wheel.style.transform = '';
}
wheel.addEventListener('pointerup', endWheel);
wheel.addEventListener('pointercancel', endWheel);

document.getElementById('btn-gas').addEventListener('pointerdown', () => state.throttle = 1);
document.getElementById('btn-gas').addEventListener('pointerup', () => state.throttle = 0);
document.getElementById('btn-brake').addEventListener('pointerdown', () => state.brake = 1);
document.getElementById('btn-brake').addEventListener('pointerup', () => state.brake = 0);

document.getElementById('btn-play').onclick = () => {
  generateTrack();
  state.score = 0; state.driftScore = 0; state.combo = 1;
  show('playing');
};
document.getElementById('btn-shop').onclick = () => { buildShop(); show('shop'); };
document.getElementById('btn-leaderboard').onclick = () => { buildLB(); show('leaderboard'); };
document.getElementById('btn-how').onclick = () => show('how');
document.querySelectorAll('.back').forEach(b => b.onclick = () => show(b.dataset.back || 'menu'));
document.getElementById('btn-resume').onclick = () => show('playing');
document.getElementById('btn-menu-from-pause').onclick = () => {
  const n = prompt('Name?', 'Driver') || 'Driver';
  saveScore(n);
  show('menu');
  updateCoins();
};

let last = performance.now();
function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;

  if (state.mode === 'playing') {
    updatePhysics(dt);
    updateSmoke(dt);
    document.getElementById('speed').textContent = Math.round(carPhys.speed * 3.6);
    document.getElementById('score').textContent = state.score.toLocaleString();
    document.getElementById('combo').textContent = state.combo.toFixed(1);
  }
  renderer.render(scene, camera);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  updateCenter();
});

document.getElementById('loading').style.display = 'none';
updateCoins();
show('menu');
loop(performance.now());
