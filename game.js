// ---- Renderer ----
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x060612, 120, 380);

// ---- Sky: canvas gradient + stars ----
(function buildSky() {
  const size = 512;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const grad = ctx.createLinearGradient(0, 0, 0, size);
  grad.addColorStop(0, '#000005');
  grad.addColorStop(0.5, '#06061a');
  grad.addColorStop(1, '#0d1a2e');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  // Stars
  const rng = (s => () => { s = Math.sin(s) * 43758.5453; return s - Math.floor(s); })(42);
  for (let i = 0; i < 320; i++) {
    const sx = rng() * size, sy = rng() * size * 0.7;
    const r  = rng() * 1.2 + 0.2;
    const a  = 0.4 + rng() * 0.6;
    ctx.beginPath();
    ctx.arc(sx, sy, r, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255,255,255,${a})`;
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  scene.background = tex;
})();

const camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.1, 1000);

// ---- Lighting ----
scene.add(new THREE.AmbientLight(0xffffff, 0.6));
const sun = new THREE.DirectionalLight(0xffffff, 1.0);
sun.position.set(50, 100, 50);
sun.castShadow = true;
scene.add(sun);

// ---- Track ----
const TRACK_RX = 60;
const TRACK_RZ = 35;
const TRACK_W  = 10;
const SEG = 128;

function buildTrack() {
  const shape = new THREE.Shape();
  for (let i = 0; i <= SEG; i++) {
    const t = (i / SEG) * Math.PI * 2;
    const x = (TRACK_RX + TRACK_W / 2) * Math.cos(t);
    const y = (TRACK_RZ + TRACK_W / 2) * Math.sin(t);
    i === 0 ? shape.moveTo(x, y) : shape.lineTo(x, y);
  }
  const hole = new THREE.Path();
  for (let i = 0; i <= SEG; i++) {
    const t = (i / SEG) * Math.PI * 2;
    const x = (TRACK_RX - TRACK_W / 2) * Math.cos(t);
    const y = (TRACK_RZ - TRACK_W / 2) * Math.sin(t);
    i === 0 ? hole.moveTo(x, y) : hole.lineTo(x, y);
  }
  shape.holes.push(hole);
  // Road canvas texture: dark asphalt + subtle grid lines
  const texSize = 256;
  const tc = document.createElement('canvas');
  tc.width = tc.height = texSize;
  const tctx = tc.getContext('2d');
  tctx.fillStyle = '#3a3a3a';
  tctx.fillRect(0, 0, texSize, texSize);
  tctx.strokeStyle = 'rgba(255,255,255,0.06)';
  tctx.lineWidth = 1;
  for (let g = 0; g < texSize; g += 32) {
    tctx.beginPath(); tctx.moveTo(g, 0); tctx.lineTo(g, texSize); tctx.stroke();
    tctx.beginPath(); tctx.moveTo(0, g); tctx.lineTo(texSize, g); tctx.stroke();
  }
  // Subtle noise-like speckle
  for (let p = 0; p < 2000; p++) {
    const px = Math.random() * texSize, py = Math.random() * texSize;
    const br = Math.random() * 30 + 20;
    tctx.fillStyle = `rgba(${br},${br},${br},0.3)`;
    tctx.fillRect(px, py, 1, 1);
  }
  const roadTex = new THREE.CanvasTexture(tc);
  roadTex.wrapS = roadTex.wrapT = THREE.RepeatWrapping;
  roadTex.repeat.set(8, 8);

  const mesh = new THREE.Mesh(
    new THREE.ShapeGeometry(shape, SEG),
    new THREE.MeshLambertMaterial({ map: roadTex })
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.receiveShadow = true;
  scene.add(mesh);
  buildKerb(TRACK_RX + TRACK_W / 2, TRACK_RZ + TRACK_W / 2);
  buildKerb(TRACK_RX - TRACK_W / 2, TRACK_RZ - TRACK_W / 2);
}

function buildKerb(rx, rz) {
  for (let i = 0; i < 48; i++) {
    const t1 = (i / 48) * Math.PI * 2;
    const t2 = ((i + 0.5) / 48) * Math.PI * 2;
    const tm = (t1 + t2) / 2;
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(Math.abs(rx * Math.cos(t2) - rx * Math.cos(t1)) + 1, 0.05,
                            Math.abs(rz * Math.sin(t2) - rz * Math.sin(t1)) + 1),
      new THREE.MeshLambertMaterial({ color: i % 2 === 0 ? 0xff2222 : 0xffffff })
    );
    mesh.position.set(rx * Math.cos(tm), 0.025, rz * Math.sin(tm));
    scene.add(mesh);
  }
}

function buildGuardrails(rx, rz, postCount) {
  const postGeo = new THREE.BoxGeometry(0.3, 1.2, 0.3);
  const railGeo = new THREE.BoxGeometry(0.12, 0.25, 0.12); // will be scaled per-segment
  for (let i = 0; i < postCount; i++) {
    const t  = (i / postCount) * Math.PI * 2;
    const px = rx * Math.cos(t);
    const pz = rz * Math.sin(t);
    const color = i % 2 === 0 ? 0xdd1111 : 0xffffff;
    const post = new THREE.Mesh(postGeo,
      new THREE.MeshLambertMaterial({ color }));
    post.position.set(px, 0.6, pz);
    post.castShadow = true;
    scene.add(post);

    // Horizontal rail connecting to next post
    const t2  = ((i + 1) / postCount) * Math.PI * 2;
    const nx2 = rx * Math.cos(t2), nz2 = rz * Math.sin(t2);
    const mx  = (px + nx2) / 2, mz = (pz + nz2) / 2;
    const len = Math.sqrt((nx2-px)**2 + (nz2-pz)**2);
    const ang = Math.atan2(nz2 - pz, nx2 - px);
    const rail = new THREE.Mesh(
      new THREE.BoxGeometry(len, 0.12, 0.12),
      new THREE.MeshLambertMaterial({ color: 0xcccccc })
    );
    rail.position.set(mx, 0.9, mz);
    rail.rotation.y = -ang;
    scene.add(rail);
  }
}

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(400, 400),
  new THREE.MeshLambertMaterial({ color: 0x2d6a2d })
);
ground.rotation.x = -Math.PI / 2;
ground.position.y = -0.05;
scene.add(ground);
buildTrack();
buildGuardrails(TRACK_RX + TRACK_W / 2 + 0.6, TRACK_RZ + TRACK_W / 2 + 0.6, 80);
buildGuardrails(TRACK_RX - TRACK_W / 2 - 0.6, TRACK_RZ - TRACK_W / 2 - 0.6, 60);

const sfLine = new THREE.Mesh(
  new THREE.PlaneGeometry(TRACK_W, 3),
  new THREE.MeshLambertMaterial({ color: 0xffffff })
);
sfLine.rotation.x = -Math.PI / 2;
sfLine.position.set(TRACK_RX, 0.01, 0);
scene.add(sfLine);

// ---- Car mesh ----
const carGroup = new THREE.Group();
const bodyMat  = new THREE.MeshLambertMaterial({ color: 0xe10600 });
const wingMat  = new THREE.MeshLambertMaterial({ color: 0xcccccc });

carGroup.add(Object.assign(new THREE.Mesh(new THREE.BoxGeometry(3.5, 0.6, 1.8), bodyMat),
  { castShadow: true }));

const cockpit = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.5, 1.0),
  new THREE.MeshLambertMaterial({ color: 0x111111 }));
cockpit.position.set(0.2, 0.5, 0);
carGroup.add(cockpit);

const fw = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.1, 2.8), wingMat);
fw.position.set(1.9, -0.1, 0);
carGroup.add(fw);

const rw = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.6, 2.2), wingMat);
rw.position.set(-1.9, 0.3, 0);
carGroup.add(rw);

const wheelGeo = new THREE.CylinderGeometry(0.4, 0.4, 0.3, 16);
const wheelMat = new THREE.MeshLambertMaterial({ color: 0x111111 });
for (const [wx, wy, wz] of [[1.2,-0.3,1.1],[1.2,-0.3,-1.1],[-1.2,-0.3,1.1],[-1.2,-0.3,-1.1]]) {
  const w = new THREE.Mesh(wheelGeo, wheelMat);
  w.rotation.z = Math.PI / 2;
  w.position.set(wx, wy, wz);
  w.castShadow = true;
  carGroup.add(w);
}
scene.add(carGroup);

// ---- GLB loader helper ----
function loadGLB(path, callback) {
  const loader = new THREE.GLTFLoader();
  loader.load(path, function(gltf) {
    callback(gltf.scene);
  }, undefined, function(err) {
    console.error('GLB load error:', path, err);
  });
}

// Async load player car GLB; hide placeholder meshes once loaded
loadGLB('assets/kenney_racing-kit/Models/GLTF%20format/raceCarRed.glb', function(model) {
  model.scale.setScalar(2);
  model.rotation.y = Math.PI;
  // Hide original box meshes (keep exhaustLight which is a PointLight)
  carGroup.children.forEach(function(child) {
    if (child.isMesh) child.visible = false;
  });
  carGroup.add(model);
});

// Exhaust point light (rear of car)
const exhaustLight = new THREE.PointLight(0xff6600, 0, 6);
exhaustLight.position.set(-2.2, 0.2, 0);
carGroup.add(exhaustLight);

// ---- AI Cars ----
const AI_CONFIGS = [
  { color: 0xff6600, glb: 'assets/kenney_racing-kit/Models/GLTF%20format/raceCarOrange.glb', startAngle: Math.PI * 0.10 },
  { color: 0x00aa00, glb: 'assets/kenney_racing-kit/Models/GLTF%20format/raceCarGreen.glb',  startAngle: Math.PI * 0.20 },
  { color: 0xdddddd, glb: 'assets/kenney_racing-kit/Models/GLTF%20format/raceCarWhite.glb',  startAngle: Math.PI * 0.30 },
];

const aiCars = AI_CONFIGS.map(function(cfg, idx) {
  const group = new THREE.Group();
  // Placeholder box mesh
  const bodyMesh = new THREE.Mesh(
    new THREE.BoxGeometry(3.5, 0.6, 1.8),
    new THREE.MeshLambertMaterial({ color: cfg.color })
  );
  group.add(bodyMesh);
  scene.add(group);

  // Load GLB
  loadGLB(cfg.glb, function(model) {
    model.scale.setScalar(2);
    model.rotation.y = Math.PI;
    group.children.forEach(function(child) {
      if (child.isMesh) child.visible = false;
    });
    group.add(model);
  });

  const startX = TRACK_RX * Math.cos(cfg.startAngle);
  const startZ = TRACK_RZ * Math.sin(cfg.startAngle);
  return {
    group: group,
    x: startX,
    z: startZ,
    angle: cfg.startAngle + Math.PI / 2,
    speed: 0.55 + idx * 0.03,   // slight variation per car
    trackAngle: cfg.startAngle,  // current angle along ellipse
  };
});

function updateAICars() {
  aiCars.forEach(function(ai) {
    // Advance along ellipse at constant angular speed proportional to car speed
    // ds ≈ R·dθ, approximate R as mean of RX and RZ
    const R = (TRACK_RX + TRACK_RZ) / 2;
    ai.trackAngle -= ai.speed / R;   // negative = counter-clockwise (same as player start direction)

    const nx = TRACK_RX * Math.cos(ai.trackAngle);
    const nz = TRACK_RZ * Math.sin(ai.trackAngle);
    // heading = tangent of ellipse
    ai.angle = Math.atan2(nz - ai.z, nx - ai.x);
    ai.x = nx;
    ai.z = nz;

    ai.group.position.set(ai.x, 0.3, ai.z);
    ai.group.rotation.y = ai.angle - Math.PI / 2;
  });
}

// ---- Physics state ----
const car = {
  x: TRACK_RX,
  z: 0,
  angle: Math.PI / 2,   // heading: 0=+X axis
  vx: 0,                // world-space velocity
  vz: 0,
  angularVel: 0,
  driftFactor: 0,       // 0=grip, 1=full slide
  drifting: false,
  onTrack: true,
};

// Tuning
const MASS          = 1.0;
const ACCEL_FORCE   = 0.06;
const BRAKE_FORCE   = 0.12;
const HANDBRAKE_F   = 0.04;
const MAX_SPEED     = 1.4;
const GRIP_FRIC     = 0.94;   // longitudinal friction on track
const GRASS_FRIC    = 0.80;
const GRIP_LAT      = 0.18;   // lateral grip (fraction of lat vel removed per frame)
const DRIFT_LAT     = 0.015;  // lateral grip while drifting
const TURN_BASE     = 0.055;
const TURN_DRIFT    = 0.072;
const ANG_DAMP      = 0.78;
const DRIFT_BUILDUP = 0.12;
const DRIFT_DECAY   = 0.08;

function isOnTrack(x, z) {
  const ni = (x/(TRACK_RX-TRACK_W/2))**2 + (z/(TRACK_RZ-TRACK_W/2))**2;
  const no = (x/(TRACK_RX+TRACK_W/2))**2 + (z/(TRACK_RZ+TRACK_W/2))**2;
  return no <= 1 && ni >= 1;
}

// ---- Boundary collision ----
// Push car back onto track and reflect velocity when it crosses the edge.
// Returns true if a collision was resolved.
function resolveTrackBoundary() {
  const outerRX = TRACK_RX + TRACK_W / 2;
  const outerRZ = TRACK_RZ + TRACK_W / 2;
  const innerRX = TRACK_RX - TRACK_W / 2;
  const innerRZ = TRACK_RZ - TRACK_W / 2;

  const no = (car.x / outerRX)**2 + (car.z / outerRZ)**2;
  const ni = (car.x / innerRX)**2 + (car.z / innerRZ)**2;

  let hit = false;

  if (no > 1) {
    // Outside outer wall — find nearest point on outer ellipse and push in
    const t = Math.atan2(car.z / outerRZ, car.x / outerRX);
    const nx = outerRX * Math.cos(t);
    const nz = outerRZ * Math.sin(t);
    // Normal pointing inward
    const nnx = -Math.cos(t), nnz = -Math.sin(t);
    car.x = nx + nnx * 0.1;
    car.z = nz + nnz * 0.1;
    // Reflect velocity along normal and damp
    const dot = car.vx * nnx + car.vz * nnz;
    if (dot < 0) {
      car.vx -= 2 * dot * nnx;
      car.vz -= 2 * dot * nnz;
    }
    car.vx *= 0.35; car.vz *= 0.35;
    shakeTimer = 18; shakeAmt = 0.45;
    hit = true;
  } else if (ni < 1) {
    // Inside inner wall
    const t = Math.atan2(car.z / innerRZ, car.x / innerRX);
    const nx = innerRX * Math.cos(t);
    const nz = innerRZ * Math.sin(t);
    const nnx = Math.cos(t), nnz = Math.sin(t); // normal pointing outward
    car.x = nx + nnx * 0.1;
    car.z = nz + nnz * 0.1;
    const dot = car.vx * nnx + car.vz * nnz;
    if (dot < 0) {
      car.vx -= 2 * dot * nnx;
      car.vz -= 2 * dot * nnz;
    }
    car.vx *= 0.35; car.vz *= 0.35;
    shakeTimer = 18; shakeAmt = 0.45;
    hit = true;
  }

  return hit;
}

// ---- Checkpoint + lap system ----
// 4 checkpoints evenly around the ellipse, starting just past the S/F line.
// S/F line is at angle=0 (car.x = TRACK_RX, car.z = 0).
const CP_ANGLES = [Math.PI/2, Math.PI, 3*Math.PI/2, 0]; // quarter, half, 3/4, finish
const CP_RADIUS = 8; // distance threshold to "hit" a checkpoint

const lapState = {
  lap: 0,          // completed laps
  maxLaps: 3,
  nextCp: 0,       // index into CP_ANGLES — next checkpoint to hit
  lapStart: 0,     // performance.now() at start of current lap
  bestLap: null,   // ms
  lastLap: null,
  finished: false,
  // Flash message
  flash: '',
  flashTimer: 0,
};

function cpWorld(angle) {
  return { x: TRACK_RX * Math.cos(angle), z: TRACK_RZ * Math.sin(angle) };
}

function updateLap() {
  if (lapState.finished) return;

  const cp = cpWorld(CP_ANGLES[lapState.nextCp]);
  const dx = car.x - cp.x, dz = car.z - cp.z;
  if (dx*dx + dz*dz < CP_RADIUS * CP_RADIUS) {
    if (lapState.nextCp === CP_ANGLES.length - 1) {
      // Crossed S/F line — completed a lap
      const now = performance.now();
      if (lapState.lapStart > 0) {
        const lapTime = now - lapState.lapStart;
        lapState.lastLap = lapTime;
        if (lapState.bestLap === null || lapTime < lapState.bestLap) {
          lapState.bestLap = lapTime;
          lapState.flash = 'BEST LAP!';
          lapState.flashTimer = 180;
        }
        lapState.lap++;
        if (lapState.lap >= lapState.maxLaps) {
          lapState.finished = true;
          lapState.flash = 'FINISHED!';
          lapState.flashTimer = 9999;
        }
      } else {
        // First time crossing S/F — start timing
        lapState.lap = 1;
      }
      lapState.lapStart = now;
    }
    lapState.nextCp = (lapState.nextCp + 1) % CP_ANGLES.length;
  }

  if (lapState.flashTimer > 0) lapState.flashTimer--;
}

// ---- Tire marks ----
const MARK_MAX = 2000;
const markPositions = [];   // {x,z} pairs queued
const markGeo = new THREE.BufferGeometry();
const markVerts = new Float32Array(MARK_MAX * 3);
markGeo.setAttribute('position', new THREE.BufferAttribute(markVerts, 3));
markGeo.setDrawRange(0, 0);
const markLine = new THREE.LineSegments(markGeo,
  new THREE.LineBasicMaterial({ color: 0x111111, transparent: true, opacity: 0.7 }));
markLine.position.y = 0.02;
scene.add(markLine);
let markCount = 0;
let prevMarkL = null, prevMarkR = null;

function addTireMarks(x, z, angle) {
  const cosA = Math.cos(angle), sinA = Math.sin(angle);
  // rear-axle offset
  const rx = x - cosA * 1.5, rz = z + sinA * 1.5;
  const lx = rx - sinA * 1.0, lz = rz - cosA * 1.0; // left
  const rrx = rx + sinA * 1.0, rrz = rz + cosA * 1.0; // right

  function addSeg(prev, cx, cz) {
    if (prev && markCount + 2 <= MARK_MAX) {
      const i = markCount * 3;
      markVerts[i]   = prev.x; markVerts[i+1] = 0; markVerts[i+2] = prev.z;
      markVerts[i+3] = cx;     markVerts[i+4] = 0; markVerts[i+5] = cz;
      markCount += 2;
      markGeo.setDrawRange(0, markCount);
      markGeo.attributes.position.needsUpdate = true;
    }
    return { x: cx, z: cz };
  }
  prevMarkL = addSeg(prevMarkL, lx, lz);
  prevMarkR = addSeg(prevMarkR, rrx, rrz);
}

// ---- Smoke particle system ----
const SMOKE_MAX = 600;
const smokeData = {
  pos:  new Float32Array(SMOKE_MAX * 3),
  vel:  new Float32Array(SMOKE_MAX * 3), // world-space drift
  life: new Float32Array(SMOKE_MAX),     // 0=dead, 1=fresh
  count: 0,
  head: 0,  // ring-buffer head
};
const smokeGeo = new THREE.BufferGeometry();
const smokePosAttr = new THREE.BufferAttribute(smokeData.pos, 3);
smokePosAttr.setUsage(THREE.DynamicDrawUsage);
smokeGeo.setAttribute('position', smokePosAttr);
smokeGeo.setDrawRange(0, 0);

// Canvas sprite for smoke puff
const sc = document.createElement('canvas'); sc.width = sc.height = 64;
const sctx = sc.getContext('2d');
const sg = sctx.createRadialGradient(32,32,2,32,32,30);
sg.addColorStop(0, 'rgba(200,200,200,0.9)');
sg.addColorStop(1, 'rgba(180,180,180,0)');
sctx.fillStyle = sg;
sctx.beginPath(); sctx.arc(32,32,30,0,Math.PI*2); sctx.fill();
const smokeTex = new THREE.CanvasTexture(sc);

const smokePoints = new THREE.Points(smokeGeo, new THREE.PointsMaterial({
  map: smokeTex, size: 2.0, transparent: true, opacity: 0.55,
  depthWrite: false, sizeAttenuation: true,
}));
scene.add(smokePoints);

function spawnSmoke(x, y, z) {
  const i = smokeData.head % SMOKE_MAX;
  smokeData.pos[i*3]   = x;
  smokeData.pos[i*3+1] = y;
  smokeData.pos[i*3+2] = z;
  smokeData.vel[i*3]   = (Math.random()-0.5)*0.03;
  smokeData.vel[i*3+1] = 0.02 + Math.random()*0.03;
  smokeData.vel[i*3+2] = (Math.random()-0.5)*0.03;
  smokeData.life[i]    = 1.0;
  smokeData.head++;
  smokeData.count = Math.min(smokeData.count + 1, SMOKE_MAX);
}

function updateSmoke() {
  let alive = 0;
  for (let i = 0; i < SMOKE_MAX; i++) {
    if (smokeData.life[i] <= 0) continue;
    smokeData.life[i] -= 0.018;
    smokeData.pos[i*3]   += smokeData.vel[i*3];
    smokeData.pos[i*3+1] += smokeData.vel[i*3+1];
    smokeData.pos[i*3+2] += smokeData.vel[i*3+2];
    alive++;
  }
  smokePosAttr.needsUpdate = true;
  smokeGeo.setDrawRange(0, SMOKE_MAX);
  smokePoints.material.opacity = 0.55;
}

// ---- Game state machine ----
// 'intro' → 'countdown' → 'racing' → 'finished'
let gameState = 'intro';
let countdownStart = 0;
let raceStartTime  = 0;
let totalRaceTime  = 0;

function startCountdown() {
  if (gameState !== 'intro') return;
  gameState = 'countdown';
  countdownStart = performance.now();
}

function getCountdownPhase() {
  // returns { label, color, done } where done=true means GO phase finished
  const elapsed = performance.now() - countdownStart;
  if (elapsed < 1000) return { label: '3', color: '#ffffff', elapsed };
  if (elapsed < 2000) return { label: '2', color: '#ffaa00', elapsed };
  if (elapsed < 3000) return { label: '1', color: '#ff2200', elapsed };
  if (elapsed < 4000) return { label: 'GO!', color: '#00ff66', elapsed };
  return { label: '', color: '', done: true, elapsed };
}

// ---- Screen shake ----
let shakeTimer = 0;
let shakeAmt   = 0;

// ---- Input ----
const keys = {};
document.addEventListener('keydown', e => {
  keys[e.code] = true;
  if (e.code === 'Space') e.preventDefault();
  if (e.code === 'Enter') startCountdown();
});
document.addEventListener('keyup', e => { keys[e.code] = false; });

// ---- Camera ----
let camPos    = new THREE.Vector3(TRACK_RX - 14, 6, 0);
let camTarget = new THREE.Vector3(TRACK_RX, 0.5, 4);
camera.position.copy(camPos);
camera.lookAt(camTarget);

// ---- HUD canvas overlay ----
const hud = document.createElement('canvas');
hud.style.cssText = 'position:fixed;top:0;left:0;pointer-events:none';
document.body.appendChild(hud);
const hctx = hud.getContext('2d');
function resizeHud() { hud.width = window.innerWidth; hud.height = window.innerHeight; }
resizeHud();

function fmtTime(ms) {
  if (ms === null) return '--:--.--';
  const m  = Math.floor(ms / 60000);
  const s  = Math.floor((ms % 60000) / 1000);
  const cs = Math.floor((ms % 1000) / 10);
  return `${m}:${String(s).padStart(2,'0')}.${String(cs).padStart(2,'0')}`;
}

// ---- Gear helper ----
function getGear(kmh) {
  if (kmh <  30) return 1;
  if (kmh <  70) return 2;
  if (kmh < 120) return 3;
  if (kmh < 170) return 4;
  if (kmh < 220) return 5;
  return 6;
}

// ---- Speedometer (circular, bottom-left) ----
function drawSpeedometer(cx, cy, radius, kmh, gear, drifting, driftAngleDeg) {
  const startA = Math.PI * 0.75;   // 135°
  const endA   = Math.PI * 2.25;   // 405° (= 45°) → 270° arc
  const maxKmh = 280;
  const ratio  = Math.min(kmh / maxKmh, 1);
  const needleA = startA + ratio * (endA - startA);

  // Outer ring background
  hctx.save();
  hctx.beginPath();
  hctx.arc(cx, cy, radius, 0, Math.PI * 2);
  hctx.fillStyle = 'rgba(0,0,0,0.75)';
  hctx.fill();

  // Coloured arc (green → yellow → red)
  const grad = hctx.createConicalGradient
    ? null   // not standard; use segment approach
    : null;
  const arcW = radius * 0.14;
  hctx.lineWidth = arcW;
  hctx.lineCap   = 'round';
  // bg track
  hctx.beginPath();
  hctx.arc(cx, cy, radius - arcW / 2, startA, endA);
  hctx.strokeStyle = 'rgba(255,255,255,0.08)';
  hctx.stroke();
  // filled portion — 3 colour segments
  const seg1End = startA + 0.55 * (endA - startA);
  const seg2End = startA + 0.82 * (endA - startA);
  function arcSeg(from, to, color) {
    if (needleA <= from) return;
    hctx.beginPath();
    hctx.arc(cx, cy, radius - arcW / 2, from, Math.min(needleA, to));
    hctx.strokeStyle = color;
    hctx.stroke();
  }
  arcSeg(startA, seg1End, '#00e676');
  arcSeg(seg1End, seg2End, '#ffea00');
  arcSeg(seg2End, endA,    '#ff1744');

  // Tick marks
  hctx.lineWidth = 2;
  for (let i = 0; i <= 14; i++) {
    const a = startA + (i / 14) * (endA - startA);
    const inner = i % 7 === 0 ? radius * 0.70 : (i % 2 === 0 ? radius * 0.76 : radius * 0.80);
    const outer = radius * 0.86;
    hctx.beginPath();
    hctx.moveTo(cx + Math.cos(a) * inner, cy + Math.sin(a) * inner);
    hctx.lineTo(cx + Math.cos(a) * outer, cy + Math.sin(a) * outer);
    hctx.strokeStyle = i % 7 === 0 ? '#fff' : 'rgba(255,255,255,0.4)';
    hctx.stroke();
  }

  // Needle
  hctx.save();
  hctx.translate(cx, cy);
  hctx.rotate(needleA);
  hctx.beginPath();
  hctx.moveTo(-radius * 0.12, 0);
  hctx.lineTo(radius * 0.70, 0);
  hctx.lineWidth = 2.5;
  hctx.strokeStyle = '#fff';
  hctx.lineCap = 'round';
  hctx.stroke();
  hctx.restore();

  // Centre dot
  hctx.beginPath();
  hctx.arc(cx, cy, radius * 0.06, 0, Math.PI * 2);
  hctx.fillStyle = '#fff';
  hctx.fill();

  // Speed number
  hctx.textAlign = 'center';
  hctx.font = `bold ${Math.round(radius * 0.30)}px monospace`;
  hctx.fillStyle = '#fff';
  hctx.fillText(Math.round(kmh), cx, cy + radius * 0.18);
  hctx.font = `${Math.round(radius * 0.16)}px monospace`;
  hctx.fillStyle = '#aaa';
  hctx.fillText('km/h', cx, cy + radius * 0.36);

  // Gear box (right of centre)
  const gx = cx + radius * 0.35, gy = cy - radius * 0.18;
  hctx.font = `bold ${Math.round(radius * 0.36)}px monospace`;
  hctx.fillStyle = drifting ? '#ffea00' : '#00e5ff';
  hctx.fillText(`${gear}`, gx, gy);
  hctx.font = `${Math.round(radius * 0.14)}px monospace`;
  hctx.fillStyle = '#888';
  hctx.fillText('GEAR', gx, gy + radius * 0.22);

  // Drift angle (above speedometer)
  if (drifting && driftAngleDeg > 2) {
    hctx.font = `bold ${Math.round(radius * 0.22)}px monospace`;
    hctx.fillStyle = `rgba(255,220,0,${0.7 + 0.3 * Math.sin(Date.now()/80)})`;
    hctx.shadowColor = '#f80';
    hctx.shadowBlur = 12;
    hctx.fillText(`${Math.round(driftAngleDeg)}°`, cx, cy - radius * 0.60);
    hctx.font = `${Math.round(radius * 0.14)}px monospace`;
    hctx.fillStyle = '#f80';
    hctx.shadowBlur = 0;
    hctx.fillText('DRIFT ANGLE', cx, cy - radius * 0.42);
  }

  hctx.restore();
}

// ---- Intro screen ----
function drawIntro() {
  const W = hud.width, H = hud.height;
  hctx.save();

  // Dark overlay
  hctx.fillStyle = 'rgba(0,0,0,0.72)';
  hctx.fillRect(0, 0, W, H);

  // Title
  hctx.textAlign = 'center';
  hctx.font = 'bold 72px monospace';
  hctx.fillStyle = '#e10600';
  hctx.shadowColor = '#e10600';
  hctx.shadowBlur = 40;
  hctx.fillText('SPEED RUN', W/2, H/2 - 130);
  hctx.shadowBlur = 0;

  hctx.font = '18px monospace';
  hctx.fillStyle = '#aaa';
  hctx.fillText('F1 Style Racing', W/2, H/2 - 90);

  // Controls box
  const bw = 360, bh = 170, bx = W/2 - bw/2, by = H/2 - 60;
  hctx.fillStyle = 'rgba(255,255,255,0.06)';
  hctx.strokeStyle = 'rgba(255,255,255,0.15)';
  hctx.lineWidth = 1;
  hctx.fillRect(bx, by, bw, bh);
  hctx.strokeRect(bx, by, bw, bh);

  const controls = [
    ['W / ↑',       'Accelerate'],
    ['S / ↓',       'Brake / Reverse'],
    ['A / ← D / →', 'Steer'],
    ['Space',        'Handbrake (drift)'],
  ];
  hctx.font = '15px monospace';
  controls.forEach(([key, desc], i) => {
    const y = by + 34 + i * 34;
    hctx.textAlign = 'right';
    hctx.fillStyle = '#00e5ff';
    hctx.fillText(key, W/2 - 10, y);
    hctx.textAlign = 'left';
    hctx.fillStyle = '#ddd';
    hctx.fillText(desc, W/2 + 14, y);
  });

  // ENTER prompt (pulsing)
  const pulse = 0.6 + 0.4 * Math.sin(Date.now() / 400);
  hctx.textAlign = 'center';
  hctx.font = 'bold 22px monospace';
  hctx.fillStyle = `rgba(255,255,255,${pulse})`;
  hctx.fillText('PRESS  ENTER  TO  RACE', W/2, H/2 + 140);

  hctx.restore();
}

// ---- Countdown overlay ----
function drawCountdown() {
  const cd = getCountdownPhase();
  if (!cd.label) return;
  const W = hud.width, H = hud.height;

  hctx.save();
  hctx.textAlign = 'center';
  hctx.textBaseline = 'middle';

  // Pulse: scale shrinks 1.4→1.0 over each 1s window
  const phase  = (cd.elapsed % 1000) / 1000;
  const scale  = cd.label === 'GO!' ? 1.0 + (1 - phase) * 0.4 : 1.4 - phase * 0.4;
  const fsize  = Math.round(120 * scale);

  // Shadow
  hctx.font = `bold ${fsize}px monospace`;
  hctx.fillStyle = 'rgba(0,0,0,0.4)';
  hctx.fillText(cd.label, W/2 + 5, H/2 + 5);
  // Main
  hctx.fillStyle = cd.color;
  hctx.shadowColor = cd.color;
  hctx.shadowBlur = 50;
  hctx.fillText(cd.label, W/2, H/2);

  hctx.restore();
}

// ---- Finish screen ----
function drawFinishScreen() {
  const W = hud.width, H = hud.height;
  hctx.save();

  hctx.fillStyle = 'rgba(0,0,0,0.78)';
  hctx.fillRect(0, 0, W, H);

  hctx.textAlign = 'center';
  hctx.font = 'bold 80px monospace';
  hctx.fillStyle = '#ffea00';
  hctx.shadowColor = '#f80';
  hctx.shadowBlur = 50;
  hctx.fillText('FINISHED!', W/2, H/2 - 110);
  hctx.shadowBlur = 0;

  const rows = [
    ['Total Time', fmtTime(totalRaceTime)],
    ['Best Lap',   fmtTime(lapState.bestLap)],
    ['Last Lap',   fmtTime(lapState.lastLap)],
    ['Laps',       `${lapState.maxLaps} / ${lapState.maxLaps}`],
  ];
  rows.forEach(([label, val], i) => {
    const y = H/2 - 20 + i * 48;
    hctx.font = '20px monospace';
    hctx.fillStyle = '#888';
    hctx.textAlign = 'right';
    hctx.fillText(label, W/2 - 10, y);
    hctx.font = 'bold 24px monospace';
    hctx.fillStyle = i === 1 ? '#00e676' : '#fff';
    hctx.textAlign = 'left';
    hctx.fillText(val, W/2 + 14, y);
  });

  const pulse = 0.5 + 0.5 * Math.sin(Date.now() / 500);
  hctx.textAlign = 'center';
  hctx.font = '16px monospace';
  hctx.fillStyle = `rgba(170,170,170,${pulse})`;
  hctx.fillText('Refresh page to race again', W/2, H/2 + 200);

  hctx.restore();
}

// ---- Racing HUD ----
function drawRacingHud(kmh, gear, drifting, driftAngleDeg) {
  const W = hud.width, H = hud.height;

  // Speedometer — bottom-left
  const sR = 80;
  drawSpeedometer(sR + 20, H - sR - 20, sR, kmh, gear, drifting, driftAngleDeg);

  // Lap panel — top-right
  const now = performance.now();
  const currentLapMs = lapState.lapStart > 0 ? now - lapState.lapStart : 0;
  const lapLabel = lapState.finished ? 'FINISHED' : `LAP ${lapState.lap}/${lapState.maxLaps}`;
  const lx = W - 250;

  hctx.fillStyle = 'rgba(0,0,0,0.6)';
  hctx.fillRect(lx, 10, 240, 102);
  hctx.fillStyle = '#ffea00';
  hctx.font = 'bold 22px monospace';
  hctx.textAlign = 'left';
  hctx.fillText(lapLabel, lx + 12, 38);
  hctx.fillStyle = '#fff';
  hctx.font = '14px monospace';
  hctx.fillText(`Current: ${fmtTime(currentLapMs)}`, lx + 12, 60);
  hctx.fillText(`Last:    ${fmtTime(lapState.lastLap)}`, lx + 12, 78);
  hctx.fillStyle = '#00e676';
  hctx.fillText(`Best:    ${fmtTime(lapState.bestLap)}`, lx + 12, 96);

  // Checkpoint dots
  hctx.fillStyle = 'rgba(0,0,0,0.5)';
  hctx.fillRect(lx, 114, 240, 22);
  for (let i = 0; i < CP_ANGLES.length; i++) {
    const passed = i < lapState.nextCp;
    hctx.beginPath();
    hctx.arc(lx + 25 + i * 55, 125, 7, 0, Math.PI * 2);
    hctx.fillStyle = passed ? '#00e676' : '#333';
    hctx.fill();
    hctx.strokeStyle = '#666';
    hctx.lineWidth = 1;
    hctx.stroke();
  }

  // Off-track warning
  if (!car.onTrack) {
    hctx.save();
    hctx.textAlign = 'center';
    hctx.font = 'bold 20px monospace';
    hctx.fillStyle = `rgba(255,150,0,${0.7 + 0.3 * Math.sin(Date.now()/200)})`;
    hctx.fillText('OFF TRACK', W/2, 40);
    hctx.restore();
  }

  // Flash message (BEST LAP)
  if (lapState.flashTimer > 0 && !lapState.finished) {
    const alpha = Math.min(1, lapState.flashTimer / 40);
    hctx.save();
    hctx.textAlign = 'center';
    hctx.font = 'bold 48px monospace';
    hctx.fillStyle = `rgba(255,234,0,${alpha})`;
    hctx.shadowColor = '#f80';
    hctx.shadowBlur = 30;
    hctx.fillText(lapState.flash, W/2, H/2 - 30);
    hctx.font = '20px monospace';
    hctx.fillStyle = `rgba(255,255,255,${alpha})`;
    hctx.shadowBlur = 0;
    hctx.fillText(fmtTime(lapState.bestLap), W/2, H/2 + 10);
    hctx.restore();
  }
}

function drawHud() {
  hctx.clearRect(0, 0, hud.width, hud.height);

  if (gameState === 'intro') { drawIntro(); return; }
  if (gameState === 'finished' || lapState.finished) { drawFinishScreen(); return; }

  const spd = Math.sqrt(car.vx*car.vx + car.vz*car.vz);
  const kmh = spd * 60 * 3.6 * 4;
  const gear = getGear(kmh);

  // Drift angle: angle between velocity vector and car heading
  const velAngle  = Math.atan2(-car.vz, car.vx);
  const angleDiff = Math.abs(((velAngle - car.angle + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
  const driftDeg  = (angleDiff * 180 / Math.PI);

  drawRacingHud(kmh, gear, car.drifting, driftDeg);

  if (gameState === 'countdown') drawCountdown();
}

// ---- Update ----
function update() {
  // Advance countdown → racing
  if (gameState === 'countdown') {
    const cd = getCountdownPhase();
    if (cd.done) {
      gameState = 'racing';
      raceStartTime = performance.now();
      lapState.lapStart = raceStartTime;
      lapState.lap = 1;
    }
  }

  // Freeze physics when not racing
  if (gameState !== 'racing') {
    // Still update camera to orbit gently around start
    const t = performance.now() / 4000;
    const orbitX = TRACK_RX + Math.cos(t) * 20;
    const orbitZ = Math.sin(t) * 14;
    camPos.lerp(new THREE.Vector3(orbitX, 8, orbitZ), 0.02);
    camTarget.lerp(new THREE.Vector3(TRACK_RX, 0, 0), 0.05);
    camera.position.copy(camPos);
    camera.lookAt(camTarget);
    return;
  }

  if (lapState.finished) {
    if (totalRaceTime === 0) totalRaceTime = performance.now() - raceStartTime;
    return;
  }

  const up        = keys['KeyW'] || keys['ArrowUp'];
  const down      = keys['KeyS'] || keys['ArrowDown'];
  const left      = keys['KeyA'] || keys['ArrowLeft'];
  const right     = keys['KeyD'] || keys['ArrowRight'];
  const handbrake = keys['Space'];

  car.onTrack = isOnTrack(car.x, car.z);
  const fric = car.onTrack ? GRIP_FRIC : GRASS_FRIC;

  const spd  = Math.sqrt(car.vx*car.vx + car.vz*car.vz);
  const cosA = Math.cos(car.angle);
  const sinA = Math.sin(car.angle);

  // Forward component of velocity
  const fwdVel = car.vx * cosA - car.vz * sinA;  // note: z is inverted in world

  // ---- Drift factor ----
  const wantDrift = handbrake && spd > 0.15;
  if (wantDrift) {
    car.driftFactor = Math.min(1, car.driftFactor + DRIFT_BUILDUP);
    car.drifting = true;
  } else {
    car.driftFactor = Math.max(0, car.driftFactor - DRIFT_DECAY);
    car.drifting = car.driftFactor > 0.05;
  }

  // ---- Steering — speed-sensitive ----
  const speedNorm  = Math.min(spd / MAX_SPEED, 1);
  const steerScale = car.drifting
    ? TURN_DRIFT
    : TURN_BASE * (0.3 + 0.7 * speedNorm);

  if (spd > 0.05) {
    const dir = fwdVel >= 0 ? 1 : -1;
    if (left)  car.angularVel += steerScale * dir;
    if (right) car.angularVel -= steerScale * dir;
  }
  car.angularVel *= ANG_DAMP;
  // Extra oversteer: angularVel grows with drift
  car.angle += car.angularVel * (1 + car.driftFactor * 0.8);

  // ---- Acceleration ----
  if (up && fwdVel < MAX_SPEED) {
    car.vx += cosA * ACCEL_FORCE;
    car.vz -= sinA * ACCEL_FORCE;
  }

  // ---- Brake (S key) vs handbrake (Space) ----
  if (down) {
    if (fwdVel > 0.05) {
      // Progressive brake
      car.vx -= cosA * BRAKE_FORCE;
      car.vz += sinA * BRAKE_FORCE;
    } else if (fwdVel > -MAX_SPEED * 0.3) {
      // Reverse
      car.vx -= cosA * ACCEL_FORCE * 0.5;
      car.vz += sinA * ACCEL_FORCE * 0.5;
    }
  }
  if (handbrake && spd > 0.01) {
    // Handbrake: cut forward momentum sharply
    car.vx -= cosA * HANDBRAKE_F * Math.sign(fwdVel);
    car.vz += sinA * HANDBRAKE_F * Math.sign(fwdVel);
  }

  // ---- Lateral grip ----
  // Lateral axis (perpendicular to heading)
  const latX =  sinA;
  const latZ =  cosA;
  const latVel = car.vx * latX + car.vz * latZ;
  const latGrip = car.drifting
    ? DRIFT_LAT + (1 - car.driftFactor) * (GRIP_LAT - DRIFT_LAT)
    : GRIP_LAT;
  car.vx -= latX * latVel * latGrip;
  car.vz -= latZ * latVel * latGrip;

  // ---- Friction ----
  car.vx *= fric;
  car.vz *= fric;

  // ---- Clamp speed ----
  const curSpd = Math.sqrt(car.vx*car.vx + car.vz*car.vz);
  if (curSpd > MAX_SPEED) {
    car.vx = (car.vx / curSpd) * MAX_SPEED;
    car.vz = (car.vz / curSpd) * MAX_SPEED;
  }

  // ---- Integrate position ----
  car.x += car.vx;
  car.z += car.vz;

  // ---- Boundary collision ----
  resolveTrackBoundary();

  // ---- Lap system ----
  updateLap();

  // ---- Tire marks during drift ----
  if (car.drifting && spd > 0.1) {
    addTireMarks(car.x, car.z, car.angle);
  } else {
    prevMarkL = null;
    prevMarkR = null;
  }

  // ---- Smoke particles (drift rear wheels) ----
  if (car.drifting && spd > 0.12) {
    const rearX = car.x - cosA * 1.8;
    const rearZ = car.z + sinA * 1.8;
    for (let s = 0; s < 3; s++) {
      spawnSmoke(
        rearX + sinA * (Math.random() - 0.5) * 1.6,
        0.15,
        rearZ + cosA * (Math.random() - 0.5) * 1.6
      );
    }
  }
  updateSmoke();

  // ---- Exhaust flash (low-speed acceleration = launch) ----
  const launching = up && spd < 0.25 && fwdVel < 0.2;
  exhaustLight.intensity = launching
    ? 2.5 + Math.random() * 1.5
    : Math.max(0, exhaustLight.intensity - 0.3);

  // ---- Update AI cars ----
  updateAICars();

  // ---- Update mesh ----
  const rollAngle = -latVel * car.driftFactor * 0.4;
  carGroup.position.set(car.x, 0.3, car.z);
  carGroup.rotation.set(0, car.angle - Math.PI / 2, rollAngle, 'YXZ');

  // ---- Camera follow + screen shake ----
  const camDist = 14 + spd * 4;
  const camH    = 5  + spd * 2;
  const bx = car.x - cosA * camDist;
  const bz = car.z + sinA * camDist;
  const desiredCam    = new THREE.Vector3(bx, camH, bz);
  const desiredTarget = new THREE.Vector3(car.x + cosA * 5, 0.5, car.z - sinA * 5);
  camPos.lerp(desiredCam, 0.08);
  camTarget.lerp(desiredTarget, 0.12);

  let shakeOffX = 0, shakeOffY = 0;
  if (shakeTimer > 0) {
    const s = shakeAmt * (shakeTimer / 18);
    shakeOffX = (Math.random() - 0.5) * s;
    shakeOffY = (Math.random() - 0.5) * s;
    shakeTimer--;
  }
  camera.position.set(camPos.x + shakeOffX, camPos.y + shakeOffY, camPos.z + shakeOffX * 0.5);
  camera.lookAt(camTarget);
}

// ---- Loop ----
function loop() {
  update();
  renderer.render(scene, camera);
  drawHud();
  requestAnimationFrame(loop);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  resizeHud();
});

loop();
