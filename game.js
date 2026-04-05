// ---- Scene setup ----
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1a1a2e);
scene.fog = new THREE.Fog(0x1a1a2e, 80, 300);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);

// ---- Lighting ----
scene.add(new THREE.AmbientLight(0xffffff, 0.5));
const sun = new THREE.DirectionalLight(0xffffff, 1.0);
sun.position.set(50, 100, 50);
sun.castShadow = true;
scene.add(sun);

// ---- Track: elliptical ring ----
const TRACK_RX = 60;   // semi-axis X
const TRACK_RZ = 35;   // semi-axis Z
const TRACK_WIDTH = 10;
const SEGMENTS = 128;

function buildTrack() {
  const shape = new THREE.Shape();
  // Outer ellipse
  for (let i = 0; i <= SEGMENTS; i++) {
    const t = (i / SEGMENTS) * Math.PI * 2;
    const x = (TRACK_RX + TRACK_WIDTH / 2) * Math.cos(t);
    const y = (TRACK_RZ + TRACK_WIDTH / 2) * Math.sin(t);
    i === 0 ? shape.moveTo(x, y) : shape.lineTo(x, y);
  }
  // Inner ellipse (hole)
  const hole = new THREE.Path();
  for (let i = 0; i <= SEGMENTS; i++) {
    const t = (i / SEGMENTS) * Math.PI * 2;
    const x = (TRACK_RX - TRACK_WIDTH / 2) * Math.cos(t);
    const y = (TRACK_RZ - TRACK_WIDTH / 2) * Math.sin(t);
    i === 0 ? hole.moveTo(x, y) : hole.lineTo(x, y);
  }
  shape.holes.push(hole);

  const geo = new THREE.ShapeGeometry(shape, SEGMENTS);
  const mat = new THREE.MeshLambertMaterial({ color: 0x444444 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.receiveShadow = true;
  scene.add(mesh);

  // Kerb stripes (outer edge)
  buildKerb(TRACK_RX + TRACK_WIDTH / 2, TRACK_RZ + TRACK_WIDTH / 2);
  buildKerb(TRACK_RX - TRACK_WIDTH / 2, TRACK_RZ - TRACK_WIDTH / 2);
}

function buildKerb(rx, rz) {
  const n = 48;
  for (let i = 0; i < n; i++) {
    const t1 = (i / n) * Math.PI * 2;
    const t2 = ((i + 0.5) / n) * Math.PI * 2;
    const tm = (t1 + t2) / 2;
    const geo = new THREE.BoxGeometry(
      Math.abs(rx * Math.cos(t2) - rx * Math.cos(t1)) + 1,
      0.05,
      Math.abs(rz * Math.sin(t2) - rz * Math.sin(t1)) + 1
    );
    const mat = new THREE.MeshLambertMaterial({ color: i % 2 === 0 ? 0xff2222 : 0xffffff });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(rx * Math.cos(tm), 0.025, rz * Math.sin(tm));
    scene.add(mesh);
  }
}

// Ground (grass)
const groundGeo = new THREE.PlaneGeometry(400, 400);
const groundMat = new THREE.MeshLambertMaterial({ color: 0x2d6a2d });
const ground = new THREE.Mesh(groundGeo, groundMat);
ground.rotation.x = -Math.PI / 2;
ground.position.y = -0.05;
ground.receiveShadow = true;
scene.add(ground);

buildTrack();

// Start/finish line
const sfGeo = new THREE.PlaneGeometry(TRACK_WIDTH, 3);
const sfMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
const sfLine = new THREE.Mesh(sfGeo, sfMat);
sfLine.rotation.x = -Math.PI / 2;
sfLine.position.set(TRACK_RX, 0.01, 0);
scene.add(sfLine);

// ---- Car ----
const carGroup = new THREE.Group();

// Body
const bodyGeo = new THREE.BoxGeometry(3.5, 0.6, 1.8);
const bodyMat = new THREE.MeshLambertMaterial({ color: 0xe10600 });
const body = new THREE.Mesh(bodyGeo, bodyMat);
body.castShadow = true;
carGroup.add(body);

// Cockpit
const cockpitGeo = new THREE.BoxGeometry(1.0, 0.5, 1.0);
const cockpitMat = new THREE.MeshLambertMaterial({ color: 0x111111 });
const cockpit = new THREE.Mesh(cockpitGeo, cockpitMat);
cockpit.position.set(0.2, 0.5, 0);
cockpit.castShadow = true;
carGroup.add(cockpit);

// Front wing
const fwGeo = new THREE.BoxGeometry(0.2, 0.1, 2.8);
const fwMat = new THREE.MeshLambertMaterial({ color: 0xcccccc });
const frontWing = new THREE.Mesh(fwGeo, fwMat);
frontWing.position.set(1.9, -0.1, 0);
carGroup.add(frontWing);

// Rear wing
const rwGeo = new THREE.BoxGeometry(0.2, 0.6, 2.2);
const rearWing = new THREE.Mesh(rwGeo, fwMat);
rearWing.position.set(-1.9, 0.3, 0);
carGroup.add(rearWing);

// Wheels (4)
const wheelGeo = new THREE.CylinderGeometry(0.4, 0.4, 0.3, 16);
const wheelMat = new THREE.MeshLambertMaterial({ color: 0x222222 });
const wheelPositions = [
  [1.2,  -0.3,  1.1],
  [1.2,  -0.3, -1.1],
  [-1.2, -0.3,  1.1],
  [-1.2, -0.3, -1.1],
];
for (const [wx, wy, wz] of wheelPositions) {
  const wheel = new THREE.Mesh(wheelGeo, wheelMat);
  wheel.rotation.z = Math.PI / 2;
  wheel.position.set(wx, wy, wz);
  wheel.castShadow = true;
  carGroup.add(wheel);
}

// Start position: top of track ellipse
carGroup.position.set(TRACK_RX, 0.3, 0);
carGroup.rotation.y = Math.PI / 2; // facing along track tangent
scene.add(carGroup);

// ---- Physics state ----
const car = {
  x: TRACK_RX,   // world X
  z: 0,          // world Z (Three.js Z)
  angle: Math.PI / 2, // heading in XZ plane (radians, 0 = +X)
  speed: 0,
};

const MAX_SPEED = 0.8;
const ACCEL = 0.02;
const BRAKE = 0.04;
const FRICTION = 0.97;
const TURN_SPEED = 0.035;

// ---- Input ----
const keys = {};
document.addEventListener('keydown', e => { keys[e.code] = true; });
document.addEventListener('keyup',   e => { keys[e.code] = false; });

// ---- Camera follow state ----
const camOffset = new THREE.Vector3(0, 5, -12); // behind and above
let camPos = new THREE.Vector3();
let camTarget = new THREE.Vector3();

// ---- Game loop ----
function update() {
  const up    = keys['KeyW'] || keys['ArrowUp'];
  const down  = keys['KeyS'] || keys['ArrowDown'];
  const left  = keys['KeyA'] || keys['ArrowLeft'];
  const right = keys['KeyD'] || keys['ArrowRight'];

  // Steering (only when moving)
  if (Math.abs(car.speed) > 0.01) {
    if (left)  car.angle += TURN_SPEED * (car.speed > 0 ? 1 : -1);
    if (right) car.angle -= TURN_SPEED * (car.speed > 0 ? 1 : -1);
  }

  // Acceleration / braking
  if (up)   car.speed = Math.min(car.speed + ACCEL, MAX_SPEED);
  if (down) car.speed = Math.max(car.speed - BRAKE, -MAX_SPEED * 0.4);

  car.speed *= FRICTION;

  // Move
  car.x += Math.cos(car.angle) * car.speed;
  car.z -= Math.sin(car.angle) * car.speed;

  // Update car mesh
  carGroup.position.set(car.x, 0.3, car.z);
  carGroup.rotation.y = car.angle - Math.PI / 2;

  // Third-person follow camera
  // Compute desired camera position: behind and above the car
  const cosA = Math.cos(car.angle);
  const sinA = Math.sin(car.angle);
  const behindX = car.x - cosA * 12;
  const behindZ = car.z + sinA * 12;
  const desiredPos = new THREE.Vector3(behindX, 5, behindZ);
  const lookAt = new THREE.Vector3(car.x + cosA * 4, 0.5, car.z - sinA * 4);

  // Smooth follow
  camPos.lerp(desiredPos, 0.1);
  camTarget.lerp(lookAt, 0.15);

  camera.position.copy(camPos);
  camera.lookAt(camTarget);
}

function render() {
  renderer.render(scene, camera);
}

function loop() {
  update();
  render();
  requestAnimationFrame(loop);
}

// Init camera position
camPos.set(TRACK_RX - 12, 5, 0);
camTarget.set(TRACK_RX, 0.5, 4);
camera.position.copy(camPos);
camera.lookAt(camTarget);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

loop();
