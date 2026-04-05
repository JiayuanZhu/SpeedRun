// ---- Renderer ----
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1a1a2e);
scene.fog = new THREE.Fog(0x1a1a2e, 100, 350);

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
  const mesh = new THREE.Mesh(
    new THREE.ShapeGeometry(shape, SEG),
    new THREE.MeshLambertMaterial({ color: 0x444444 })
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

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(400, 400),
  new THREE.MeshLambertMaterial({ color: 0x2d6a2d })
);
ground.rotation.x = -Math.PI / 2;
ground.position.y = -0.05;
scene.add(ground);
buildTrack();

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

// ---- Input ----
const keys = {};
document.addEventListener('keydown', e => { keys[e.code] = true; if (e.code === 'Space') e.preventDefault(); });
document.addEventListener('keyup',   e => { keys[e.code] = false; });

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

function drawHud() {
  hctx.clearRect(0, 0, hud.width, hud.height);
  const spd = Math.sqrt(car.vx*car.vx + car.vz*car.vz);
  const kmh = (spd * 60 * 3.6 * 4).toFixed(0);

  // ---- Speed / track status (top-left) ----
  hctx.fillStyle = 'rgba(0,0,0,0.55)';
  hctx.fillRect(10, 10, 200, 56);
  hctx.fillStyle = '#fff';
  hctx.font = 'bold 14px monospace';
  hctx.fillText(`Speed: ${kmh} km/h`, 20, 32);
  hctx.fillStyle = car.onTrack ? '#0f0' : '#f80';
  hctx.fillText(car.onTrack ? 'ON TRACK' : 'OFF TRACK', 20, 52);

  // ---- Lap panel (top-right) ----
  const now = performance.now();
  const currentLap = lapState.lapStart > 0 ? now - lapState.lapStart : 0;
  const lapLabel = lapState.lap === 0 ? 'LAP --/3'
    : lapState.finished ? 'FINISHED'
    : `LAP ${lapState.lap}/${lapState.maxLaps}`;

  const lx = hud.width - 250;
  hctx.fillStyle = 'rgba(0,0,0,0.6)';
  hctx.fillRect(lx, 10, 240, 100);

  hctx.fillStyle = '#ff0';
  hctx.font = 'bold 22px monospace';
  hctx.fillText(lapLabel, lx + 12, 38);

  hctx.fillStyle = '#fff';
  hctx.font = '14px monospace';
  hctx.fillText(`Current: ${fmtTime(lapState.lapStart > 0 ? currentLap : null)}`, lx + 12, 60);
  hctx.fillText(`Last:    ${fmtTime(lapState.lastLap)}`, lx + 12, 78);
  hctx.fillStyle = '#0f0';
  hctx.fillText(`Best:    ${fmtTime(lapState.bestLap)}`, lx + 12, 96);

  // ---- Checkpoint dots ----
  hctx.fillStyle = 'rgba(0,0,0,0.5)';
  hctx.fillRect(lx, 112, 240, 22);
  for (let i = 0; i < CP_ANGLES.length; i++) {
    const passed = lapState.lap > 0
      ? (i < lapState.nextCp || (lapState.nextCp === 0 && lapState.lap > 0))
      : i < lapState.nextCp;
    hctx.beginPath();
    hctx.arc(lx + 20 + i * 55, 123, 7, 0, Math.PI * 2);
    hctx.fillStyle = passed ? '#0f0' : '#444';
    hctx.fill();
    hctx.strokeStyle = '#888';
    hctx.lineWidth = 1;
    hctx.stroke();
  }

  // ---- DRIFT text ----
  if (car.drifting) {
    hctx.save();
    hctx.font = 'bold 36px monospace';
    hctx.fillStyle = `rgba(255,220,0,${0.7 + 0.3 * Math.sin(Date.now()/80)})`;
    hctx.shadowColor = '#f80';
    hctx.shadowBlur = 20;
    hctx.textAlign = 'center';
    hctx.fillText('DRIFT', hud.width/2, hud.height - 50);
    hctx.restore();
  }

  // ---- Flash message (BEST LAP / FINISHED) ----
  if (lapState.flashTimer > 0) {
    const alpha = Math.min(1, lapState.flashTimer / 40);
    hctx.save();
    hctx.textAlign = 'center';
    hctx.font = 'bold 52px monospace';
    hctx.fillStyle = `rgba(255,255,0,${alpha})`;
    hctx.shadowColor = '#f80';
    hctx.shadowBlur = 30;
    hctx.fillText(lapState.flash, hud.width/2, hud.height/2 - 20);
    if (lapState.finished && lapState.lastLap !== null) {
      hctx.font = 'bold 24px monospace';
      hctx.fillStyle = `rgba(255,255,255,${alpha})`;
      hctx.shadowBlur = 0;
      hctx.fillText(`Best lap: ${fmtTime(lapState.bestLap)}`, hud.width/2, hud.height/2 + 30);
    }
    hctx.restore();
  }

  // ---- Controls hint ----
  hctx.fillStyle = 'rgba(0,0,0,0.45)';
  hctx.fillRect(10, hud.height - 80, 260, 68);
  hctx.fillStyle = '#aaa';
  hctx.font = '12px monospace';
  hctx.textAlign = 'left';
  hctx.fillText('WASD / Arrows  — drive', 18, hud.height - 60);
  hctx.fillText('Space          — handbrake / drift', 18, hud.height - 44);
  hctx.fillText('S while moving — brake', 18, hud.height - 28);
}

// ---- Update ----
function update() {
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

  // ---- Update mesh ----
  // Visual body tilt toward drift direction (roll)
  const rollAngle = -latVel * car.driftFactor * 0.4;
  carGroup.position.set(car.x, 0.3, car.z);
  carGroup.rotation.set(0, car.angle - Math.PI / 2, rollAngle, 'YXZ');

  // ---- Camera follow ----
  const camDist = 14 + spd * 4;
  const camH    = 5  + spd * 2;
  const bx = car.x - cosA * camDist;
  const bz = car.z + sinA * camDist;
  const desiredCam    = new THREE.Vector3(bx, camH, bz);
  const desiredTarget = new THREE.Vector3(car.x + cosA * 5, 0.5, car.z - sinA * 5);
  camPos.lerp(desiredCam, 0.08);
  camTarget.lerp(desiredTarget, 0.12);
  camera.position.copy(camPos);
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
