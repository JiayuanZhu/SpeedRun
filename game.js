// ---- Renderer ----
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.setClearColor(0x000510);
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x000510, 150, 450);

const camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.1, 1000);

// ---- Lighting (night / moonlight) ----
const ambientLight = new THREE.AmbientLight(0x223355, 0.4);
scene.add(ambientLight);
const moonLight = new THREE.DirectionalLight(0x4466aa, 0.8);
moonLight.position.set(-100, 200, -50);
moonLight.castShadow = true;
scene.add(moonLight);

// ---- Starfield ----
(function buildStarfield() {
  const pos = [];
  for (let i = 0; i < 3000; i++) {
    const theta = Math.random() * Math.PI * 2;
    const phi   = Math.acos(2 * Math.random() - 1);
    const r     = 800 + Math.random() * 400;
    pos.push(
      r * Math.sin(phi) * Math.cos(theta),
      r * Math.sin(phi) * Math.sin(theta),
      r * Math.cos(phi)
    );
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  scene.add(new THREE.Points(geo,
    new THREE.PointsMaterial({ color: 0xffffff, size: 1.5, sizeAttenuation: true })));
})();

// ---- Track definition (CatmullRom, clockwise) ----
const TRACK_W       = 14;
const TRACK_SAMPLES = 200;

// Control points — Silverstone F1 circuit (TUM dataset, scaled ×2.5).
// t=0 starts at T1 Vale corner.
const SCALE = 2.5;
const trackPoints = [
  new THREE.Vector3(  -24.9*SCALE, 0,  -18.4*SCALE),  // T1  Vale
  new THREE.Vector3(  -14.3*SCALE, 0,   -3.7*SCALE),  // T2  Club
  new THREE.Vector3(    2.0*SCALE, 0,    0.4*SCALE),  // T3  Abbey
  new THREE.Vector3(   14.9*SCALE, 0,    4.6*SCALE),  // T4  Farm
  new THREE.Vector3(   17.7*SCALE, 0,   13.7*SCALE),  // T5  Village
  new THREE.Vector3(    4.0*SCALE, 0,   25.5*SCALE),  // T6  Loop
  new THREE.Vector3(  -10.2*SCALE, 0,   36.4*SCALE),  // T7  Aintree
  new THREE.Vector3(  -19.8*SCALE, 0,   31.2*SCALE),  // T8  Wellington
  new THREE.Vector3(   -9.4*SCALE, 0,   45.1*SCALE),  // T9  Luffield
  new THREE.Vector3(    8.5*SCALE, 0,   47.4*SCALE),  // T10 Woodcote
  new THREE.Vector3(   21.8*SCALE, 0,   39.7*SCALE),  // T11 Copse
  new THREE.Vector3(   24.2*SCALE, 0,   21.8*SCALE),  // T12 Maggotts
  new THREE.Vector3(   25.4*SCALE, 0,    4.7*SCALE),  // T13 Becketts
  new THREE.Vector3(   20.8*SCALE, 0,   -9.1*SCALE),  // T14 Chapel
  new THREE.Vector3(   12.7*SCALE, 0,  -25.2*SCALE),  // T15 Hangar Straight
  new THREE.Vector3(    4.3*SCALE, 0,  -41.3*SCALE),  // T16 Stowe
  new THREE.Vector3(   -8.3*SCALE, 0,  -43.2*SCALE),  // T17 Vale approach
  new THREE.Vector3(  -20.1*SCALE, 0,  -29.9*SCALE),  // T18 Club approach
];
const trackCurve  = new THREE.CatmullRomCurve3(trackPoints, true, 'catmullrom', 0.5);
const CURVE_LENGTH = trackCurve.getLength();

// ---- Track surface ----
function buildTrack() {
  const texSize = 256;
  const tc = document.createElement('canvas');
  tc.width = tc.height = texSize;
  const tctx = tc.getContext('2d');
  tctx.fillStyle = '#222222';
  tctx.fillRect(0, 0, texSize, texSize);
  tctx.strokeStyle = 'rgba(255,255,255,0.06)';
  tctx.lineWidth = 1;
  for (let g = 0; g < texSize; g += 32) {
    tctx.beginPath(); tctx.moveTo(g, 0); tctx.lineTo(g, texSize); tctx.stroke();
    tctx.beginPath(); tctx.moveTo(0, g); tctx.lineTo(texSize, g); tctx.stroke();
  }
  for (let p = 0; p < 2000; p++) {
    const px = Math.random() * texSize, py = Math.random() * texSize;
    const br = Math.random() * 30 + 20;
    tctx.fillStyle = `rgba(${br},${br},${br},0.3)`;
    tctx.fillRect(px, py, 1, 1);
  }
  const roadTex = new THREE.CanvasTexture(tc);
  roadTex.wrapS = roadTex.wrapT = THREE.RepeatWrapping;
  roadTex.repeat.set(2, 20);

  const positions = [], uvs = [], indices = [];
  for (let i = 0; i <= TRACK_SAMPLES; i++) {
    const t   = i / TRACK_SAMPLES;
    const pt  = trackCurve.getPoint(t);
    const tan = trackCurve.getTangent(t);
    const nx  = -tan.z, nz = tan.x;  // left-hand normal in XZ
    const hw  = TRACK_W / 2;
    positions.push(
      pt.x + nx * hw, 0, pt.z + nz * hw,
      pt.x - nx * hw, 0, pt.z - nz * hw
    );
    uvs.push(0, t * 20, 1, t * 20);
  }
  for (let i = 0; i < TRACK_SAMPLES; i++) {
    const a = i*2, b = i*2+1, c = (i+1)*2, d = (i+1)*2+1;
    indices.push(a, b, c,  b, d, c);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv',       new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo,
    new THREE.MeshLambertMaterial({ map: roadTex, color: 0x2a2a2a, emissive: 0x111111 }));
  mesh.receiveShadow = true;
  scene.add(mesh);

  buildRumbleStrips();
  buildCenterLine();
  buildTrackEdgeLines();
  buildRunoffArea();
}

// ---- Rumble strips (red/white alternating on both edges) ----
function buildRumbleStrips() {
  const positions = [], colors = [];
  const hw = TRACK_W / 2, sw = 2.5;  // strip width = 2.5 units
  for (let i = 0; i < TRACK_SAMPLES; i++) {
    const t0 = i / TRACK_SAMPLES;
    const t1 = (i + 1) / TRACK_SAMPLES;
    const p0   = trackCurve.getPoint(t0);
    const p1   = trackCurve.getPoint(t1);
    const tan0 = trackCurve.getTangent(t0);
    const nx0  = -tan0.z, nz0 = tan0.x;
    const tan1 = trackCurve.getTangent(t1);
    const nx1  = -tan1.z, nz1 = tan1.x;

    const isRed = i % 2 === 0;
    const cr = isRed ? 0.933 : 1.0, cg = isRed ? 0.067 : 1.0, cb = isRed ? 0.067 : 1.0;

    // Both left (+nx) and right (-nx) sides
    for (const s of [1, -1]) {
      const ix0 = p0.x + s*nx0*hw,       iz0 = p0.z + s*nz0*hw;
      const ix1 = p1.x + s*nx1*hw,       iz1 = p1.z + s*nz1*hw;
      const ox0 = p0.x + s*nx0*(hw+sw),  oz0 = p0.z + s*nz0*(hw+sw);
      const ox1 = p1.x + s*nx1*(hw+sw),  oz1 = p1.z + s*nz1*(hw+sw);
      positions.push(
        ix0,0.03,iz0, ix1,0.03,iz1, ox0,0.03,oz0,
        ix1,0.03,iz1, ox1,0.03,oz1, ox0,0.03,oz0
      );
      for (let v = 0; v < 6; v++) colors.push(cr, cg, cb);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('color',    new THREE.Float32BufferAttribute(colors, 3));
  scene.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true })));
}

// ---- Dashed centre line ----
function buildCenterLine() {
  const positions = [];
  const hw = 0.3;  // half-width of dashes
  for (let i = 0; i < TRACK_SAMPLES; i++) {
    if (i % 5 !== 0) continue;
    const t0  = i / TRACK_SAMPLES;
    const t1  = Math.min((i + 3) / TRACK_SAMPLES, 1);
    const p0  = trackCurve.getPoint(t0);
    const p1  = trackCurve.getPoint(t1);
    const tan = trackCurve.getTangent(t0);
    const nx  = -tan.z * hw, nz = tan.x * hw;
    positions.push(
      p0.x+nx, 0.03, p0.z+nz,
      p0.x-nx, 0.03, p0.z-nz,
      p1.x+nx, 0.03, p1.z+nz,
      p0.x-nx, 0.03, p0.z-nz,
      p1.x-nx, 0.03, p1.z-nz,
      p1.x+nx, 0.03, p1.z+nz
    );
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  scene.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xffffff })));
}

// ---- Track edge white boundary lines ----
function buildTrackEdgeLines() {
  const positions = [];
  const hw = TRACK_W / 2;
  const lw = 0.5;
  for (let i = 0; i < TRACK_SAMPLES; i++) {
    const t0 = i / TRACK_SAMPLES;
    const t1 = (i + 1) / TRACK_SAMPLES;
    const p0 = trackCurve.getPoint(t0), p1 = trackCurve.getPoint(t1);
    const tan0 = trackCurve.getTangent(t0), tan1 = trackCurve.getTangent(t1);
    const nx0 = -tan0.z, nz0 = tan0.x;
    const nx1 = -tan1.z, nz1 = tan1.x;
    for (const s of [1, -1]) {
      const ix0 = p0.x + s*nx0*(hw-lw), iz0 = p0.z + s*nz0*(hw-lw);
      const ox0 = p0.x + s*nx0*hw,      oz0 = p0.z + s*nz0*hw;
      const ix1 = p1.x + s*nx1*(hw-lw), iz1 = p1.z + s*nz1*(hw-lw);
      const ox1 = p1.x + s*nx1*hw,      oz1 = p1.z + s*nz1*hw;
      positions.push(
        ix0,0.025,iz0, ix1,0.025,iz1, ox0,0.025,oz0,
        ix1,0.025,iz1, ox1,0.025,oz1, ox0,0.025,oz0
      );
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  scene.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xeeeeee })));
}

// ---- Run-off area (lighter asphalt outside kerbs) ----
function buildRunoffArea() {
  const positions = [];
  const kerbOuter = TRACK_W / 2 + 2.5;
  const runW = 5;
  for (let i = 0; i < TRACK_SAMPLES; i++) {
    const t0 = i / TRACK_SAMPLES;
    const t1 = (i + 1) / TRACK_SAMPLES;
    const p0 = trackCurve.getPoint(t0), p1 = trackCurve.getPoint(t1);
    const tan0 = trackCurve.getTangent(t0), tan1 = trackCurve.getTangent(t1);
    const nx0 = -tan0.z, nz0 = tan0.x;
    const nx1 = -tan1.z, nz1 = tan1.x;
    for (const s of [1, -1]) {
      const ix0 = p0.x + s*nx0*kerbOuter,        iz0 = p0.z + s*nz0*kerbOuter;
      const ox0 = p0.x + s*nx0*(kerbOuter+runW), oz0 = p0.z + s*nz0*(kerbOuter+runW);
      const ix1 = p1.x + s*nx1*kerbOuter,        iz1 = p1.z + s*nz1*kerbOuter;
      const ox1 = p1.x + s*nx1*(kerbOuter+runW), oz1 = p1.z + s*nz1*(kerbOuter+runW);
      positions.push(
        ix0,-0.01,iz0, ix1,-0.01,iz1, ox0,-0.01,oz0,
        ix1,-0.01,iz1, ox1,-0.01,oz1, ox0,-0.01,oz0
      );
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  scene.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0x444444 })));
}

// ---- Ground (night dark green) ----
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(600, 600),
  new THREE.MeshLambertMaterial({ color: 0x0a1a0a })
);
ground.rotation.x = -Math.PI / 2;
ground.position.y = -0.05;
scene.add(ground);
buildTrack();

// ---- Start/finish line ----
(function() {
  const tan0    = trackCurve.getTangent(0);
  const sfAngle = Math.atan2(tan0.z, tan0.x);
  const sfLine  = new THREE.Mesh(
    new THREE.PlaneGeometry(TRACK_W, 3),
    new THREE.MeshLambertMaterial({ color: 0xffffff })
  );
  const sf0 = trackCurve.getPoint(0);
  sfLine.rotation.x = -Math.PI / 2;
  sfLine.rotation.y = -sfAngle - Math.PI / 2;
  sfLine.position.set(sf0.x, 0.01, sf0.z);
  scene.add(sfLine);
})();

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

// Player car GLB
loadGLB('assets/kenney_racing-kit/Models/GLTF%20format/raceCarRed.glb', function(model) {
  model.scale.setScalar(2);
  model.rotation.y = Math.PI;
  carGroup.children.forEach(function(child) {
    if (child.isMesh) child.visible = false;
  });
  carGroup.add(model);
});

// Exhaust point light
const exhaustLight = new THREE.PointLight(0xff6600, 0, 6);
exhaustLight.position.set(-2.2, 0.2, 0);
carGroup.add(exhaustLight);

// ---- AI Cars ----
const AI_CONFIGS = [
  { color: 0xff6600, glb: 'assets/kenney_racing-kit/Models/GLTF%20format/raceCarOrange.glb', startT: 0.04 },
  { color: 0x00aa00, glb: 'assets/kenney_racing-kit/Models/GLTF%20format/raceCarGreen.glb',  startT: 0.08 },
  { color: 0xdddddd, glb: 'assets/kenney_racing-kit/Models/GLTF%20format/raceCarWhite.glb',  startT: 0.12 },
];

const aiCars = AI_CONFIGS.map(function(cfg, idx) {
  const group = new THREE.Group();
  group.add(new THREE.Mesh(
    new THREE.BoxGeometry(3.5, 0.6, 1.8),
    new THREE.MeshLambertMaterial({ color: cfg.color })
  ));
  scene.add(group);

  loadGLB(cfg.glb, function(model) {
    model.scale.setScalar(2);
    model.rotation.y = Math.PI;
    group.children.forEach(function(child) {
      if (child.isMesh) child.visible = false;
    });
    group.add(model);
  });

  return {
    group:  group,
    trackT: cfg.startT,
    speed:  0.55 + idx * 0.03,
  };
});

function updateAICars() {
  aiCars.forEach(function(ai) {
    ai.trackT = (ai.trackT + ai.speed / CURVE_LENGTH) % 1;
    const pt    = trackCurve.getPoint(ai.trackT);
    const tan   = trackCurve.getTangent(ai.trackT);
    const angle = Math.atan2(-tan.z, tan.x);
    ai.group.position.set(pt.x, 0.3, pt.z);
    ai.group.rotation.y = angle - Math.PI / 2;
  });
}

// ---- Scenery helpers ----
// trkPt: world position at parameter t, offset units perpendicular to track.
// Positive offset = left normal side; negative = right normal side.
function trkPt(t, offset) {
  const pt  = trackCurve.getPoint(t);
  const tan = trackCurve.getTangent(t);
  return new THREE.Vector3(pt.x + (-tan.z) * offset, 0, pt.z + tan.x * offset);
}
// trkFacing: Y rotation so asset faces along track (+ extra offset angle)
function trkFacing(t, extra) {
  const tan = trackCurve.getTangent(t);
  return Math.atan2(tan.z, tan.x) + (extra || 0);
}

// ---- Trees ----
loadGLB('assets/kenney_racing-kit/Models/GLTF%20format/treeLarge.glb', function(tmpl) {
  [0.05, 0.17, 0.30, 0.43, 0.56, 0.68, 0.80, 0.93].forEach(function(t) {
    const tree = tmpl.clone();
    tree.scale.setScalar(3);
    const p = trkPt(t, TRACK_W / 2 + 18);
    tree.position.copy(p);
    scene.add(tree);
  });
});

loadGLB('assets/kenney_racing-kit/Models/GLTF%20format/treeSmall.glb', function(tmpl) {
  [0.10, 0.23, 0.36, 0.49, 0.62, 0.75, 0.87, 0.99].forEach(function(t) {
    const st = tmpl.clone();
    st.scale.setScalar(2.5);
    const p = trkPt(t, TRACK_W / 2 + 16);
    st.position.copy(p);
    scene.add(st);
  });
});

// ---- Grandstands (covered) ----
loadGLB('assets/kenney_racing-kit/Models/GLTF%20format/grandStandCovered.glb', function(tmpl) {
  [
    { t: 0.18, off:  26, rot: Math.PI },
    { t: 0.38, off:  26, rot: Math.PI },
    { t: 0.72, off: -26, rot: 0 },
    { t: 0.88, off: -26, rot: 0 },
  ].forEach(function(d) {
    const gs = tmpl.clone();
    gs.scale.setScalar(4);
    gs.position.copy(trkPt(d.t, d.off));
    gs.rotation.y = trkFacing(d.t, d.rot);
    scene.add(gs);
  });
});

// ---- Inner barriers ----
loadGLB('assets/kenney_racing-kit/Models/GLTF%20format/barrierRed.glb', function(tmpl) {
  const COUNT = 36;
  for (let i = 0; i < COUNT; i++) {
    const t       = i / COUNT;
    const barrier = tmpl.clone();
    barrier.scale.setScalar(1.5);
    barrier.position.copy(trkPt(t, -(TRACK_W / 2 + 2)));
    barrier.rotation.y = trkFacing(t);
    scene.add(barrier);
  }
});

// ---- Outer fences ----
loadGLB('assets/kenney_racing-kit/Models/GLTF%20format/fenceStraight.glb', function(tmpl) {
  const COUNT = 30;
  for (let i = 0; i < COUNT; i++) {
    const t     = i / COUNT;
    const fence = tmpl.clone();
    fence.scale.setScalar(2);
    fence.position.copy(trkPt(t, TRACK_W / 2 + 3));
    fence.rotation.y = trkFacing(t);
    scene.add(fence);
  }
});

// ---- Checkered flags at start/finish ----
loadGLB('assets/kenney_racing-kit/Models/GLTF%20format/flagCheckers.glb', function(tmpl) {
  const tan0 = trackCurve.getTangent(0);
  const fa   = Math.atan2(tan0.z, tan0.x);
  [{ off: TRACK_W / 2 + 1, rot: 0 }, { off: -(TRACK_W / 2 + 1), rot: Math.PI }].forEach(function(d) {
    const flag = tmpl.clone();
    flag.scale.setScalar(3);
    flag.position.copy(trkPt(0, d.off));
    flag.rotation.y = fa + d.rot;
    scene.add(flag);
  });
});

// ---- Light posts around track + PointLights ----
loadGLB('assets/kenney_racing-kit/Models/GLTF%20format/lightPostModern.glb', function(tmpl) {
  const postPositions = [
    { t: 0.00, off:  TRACK_W / 2 + 4 },
    { t: 0.00, off: -(TRACK_W / 2 + 4) },
    { t: 0.06, off:  TRACK_W / 2 + 4 },
    { t: 0.06, off: -(TRACK_W / 2 + 4) },
    { t: 0.14, off:  TRACK_W / 2 + 4 },
    { t: 0.22, off: -(TRACK_W / 2 + 4) },
    { t: 0.33, off:  TRACK_W / 2 + 4 },
    { t: 0.45, off: -(TRACK_W / 2 + 4) },
    { t: 0.56, off:  TRACK_W / 2 + 4 },
    { t: 0.67, off: -(TRACK_W / 2 + 4) },
    { t: 0.78, off:  TRACK_W / 2 + 4 },
    { t: 0.89, off: -(TRACK_W / 2 + 4) },
  ];
  postPositions.forEach(function(d) {
    const lp = tmpl.clone();
    lp.scale.setScalar(3);
    const worldPt = trkPt(d.t, d.off);
    lp.position.copy(worldPt);
    lp.rotation.y = trkFacing(d.t, d.off > 0 ? Math.PI : 0);
    scene.add(lp);
    const pl = new THREE.PointLight(0xffcc66, 0.9, 45);
    pl.position.set(worldPt.x, 7, worldPt.z);
    scene.add(pl);
  });
});

// ---- Overhead gantry over start/finish ----
(function() {
  const tan0 = trackCurve.getTangent(0);
  const gry  = -Math.atan2(tan0.z, tan0.x);  // span perpendicular to track
  const _gp0 = trackCurve.getPoint(0);
  loadGLB('assets/kenney_racing-kit/Models/GLTF%20format/overhead.glb', function(model) {
    model.scale.setScalar(4);
    model.position.set(_gp0.x, 5, _gp0.z);
    model.rotation.y = gry;
    scene.add(model);
  });
  loadGLB('assets/kenney_racing-kit/Models/GLTF%20format/overheadLights.glb', function(model) {
    model.scale.setScalar(4);
    model.position.set(_gp0.x, 5.1, _gp0.z);
    model.rotation.y = gry;
    scene.add(model);
  });
})();

// ---- Pits garage (right side of start straight) ----
loadGLB('assets/kenney_racing-kit/Models/GLTF%20format/pitsGarage.glb', function(model) {
  model.scale.setScalar(3);
  model.position.copy(trkPt(0, -(TRACK_W / 2 + 15)));
  model.rotation.y = trkFacing(0, Math.PI / 2);
  scene.add(model);
});

loadGLB('assets/kenney_racing-kit/Models/GLTF%20format/pitsGarage.glb', function(model) {
  model.scale.setScalar(3);
  model.position.copy(trkPt(0.03, -(TRACK_W / 2 + 15)));
  model.rotation.y = trkFacing(0, Math.PI / 2);
  scene.add(model);
});

loadGLB('assets/kenney_racing-kit/Models/GLTF%20format/pitsOffice.glb', function(model) {
  model.scale.setScalar(3);
  model.position.copy(trkPt(0.97, -(TRACK_W / 2 + 15)));
  model.rotation.y = trkFacing(0, Math.PI / 2);
  scene.add(model);
});

// ---- Billboards around track ----
loadGLB('assets/kenney_racing-kit/Models/GLTF%20format/billboard.glb', function(tmpl) {
  [0.12, 0.35, 0.60, 0.83].forEach(function(t) {
    const bb = tmpl.clone();
    bb.scale.setScalar(3);
    bb.position.copy(trkPt(t, TRACK_W / 2 + 8));
    bb.rotation.y = trkFacing(t, -Math.PI / 2);
    scene.add(bb);
  });
});

// ---- Barrier wall at hairpin inner apex ----
loadGLB('assets/kenney_racing-kit/Models/GLTF%20format/barrierWall.glb', function(tmpl) {
  for (let i = 0; i < 6; i++) {
    const t    = 0.60 + i * 0.014;
    const wall = tmpl.clone();
    wall.scale.setScalar(2);
    wall.position.copy(trkPt(t, -(TRACK_W / 2 + 4)));
    wall.rotation.y = trkFacing(t);
    scene.add(wall);
  }
});

// ---- Banner towers ----
loadGLB('assets/kenney_racing-kit/Models/GLTF%20format/bannerTowerGreen.glb', function(tmpl) {
  [0.25, 0.50, 0.75].forEach(function(t) {
    const tower = tmpl.clone();
    tower.scale.setScalar(3);
    tower.position.copy(trkPt(t, TRACK_W / 2 + 28));
    tower.rotation.y = trkFacing(t);
    scene.add(tower);
  });
});

// ---- Countdown lights (5 red spheres above start/finish) ----
(function() {
  const sfPt  = trackCurve.getPoint(0);
  const sfTan = trackCurve.getTangent(0);
  const nx = -sfTan.z, nz = sfTan.x;
  const mat = new THREE.MeshLambertMaterial({ color: 0xff0000, emissive: 0xff0000, emissiveIntensity: 1.0 });
  for (let i = 0; i < 5; i++) {
    const offset = (i - 2) * 2.4;
    const sphere = new THREE.Mesh(new THREE.SphereGeometry(0.35, 12, 8), mat.clone());
    sphere.position.set(
      sfPt.x + sfTan.x * 4 + nx * offset,
      5.5,
      sfPt.z + sfTan.z * 4 + nz * offset
    );
    scene.add(sphere);
    const pl = new THREE.PointLight(0xff2200, 0.6, 10);
    pl.position.copy(sphere.position);
    scene.add(pl);
  }
})();

// ---- Grandstand audience seat colors ----
(function() {
  const gsData = [
    { t: 0.18, off:  26 },
    { t: 0.38, off:  26 },
    { t: 0.72, off: -26 },
    { t: 0.88, off: -26 },
  ];
  const palette = [0xff6600, 0x0055cc, 0x00aa44, 0xffcc00, 0xcc0044, 0x009999];
  gsData.forEach(function(d, gi) {
    const base   = trkPt(d.t, d.off);
    const facing = trkFacing(d.t, d.off > 0 ? Math.PI : 0);
    const fwdX   = Math.cos(facing), fwdZ = Math.sin(facing);
    for (let row = 0; row < 3; row++) {
      const seats = new THREE.Mesh(
        new THREE.BoxGeometry(18, 1.0, 2.5),
        new THREE.MeshLambertMaterial({ color: palette[(gi * 3 + row) % palette.length] })
      );
      seats.position.set(
        base.x + fwdX * (row * 2.8 - 2),
        1.2 + row * 1.6,
        base.z + fwdZ * (row * 2.8 - 2)
      );
      seats.rotation.y = facing;
      scene.add(seats);
    }
  });
})();

// ---- Physics state ----
const _st0 = trackCurve.getTangent(0);
const _sp0 = trackCurve.getPoint(0);
const car = {
  x:          _sp0.x,
  z:          _sp0.z,
  angle:      Math.atan2(-_st0.z, _st0.x),  // heading matching curve direction
  vx:         0,
  vz:         0,
  angularVel: 0,
  driftFactor: 0,
  drifting:   false,
  onTrack:    true,
};

// Tuning
const MASS          = 1.0;
const ACCEL_FORCE   = 0.06;
const BRAKE_FORCE   = 0.12;
const HANDBRAKE_F   = 0.04;
const MAX_SPEED     = 1.4;
const GRIP_FRIC     = 0.94;
const GRASS_FRIC    = 0.80;
const GRIP_LAT      = 0.18;
const DRIFT_LAT     = 0.015;
const TURN_BASE     = 0.055;
const TURN_DRIFT    = 0.072;
const ANG_DAMP      = 0.78;
const DRIFT_BUILDUP = 0.12;
const DRIFT_DECAY   = 0.08;

// ---- Curve-based collision detection ----
let playerNearestT       = 0;
let playerDistFromCenter = 0;

function findNearestT(x, z, cachedT) {
  let bestT = cachedT, bestD2 = Infinity;
  const STEPS = 40, RANGE = 0.12;
  for (let i = -STEPS; i <= STEPS; i++) {
    const t  = ((cachedT + i * RANGE / STEPS) % 1 + 1) % 1;
    const pt = trackCurve.getPoint(t);
    const dx = x - pt.x, dz = z - pt.z;
    const d2 = dx*dx + dz*dz;
    if (d2 < bestD2) { bestD2 = d2; bestT = t; }
  }
  return { t: bestT, dist: Math.sqrt(bestD2) };
}

function isOnTrack(x, z) {
  const { t, dist } = findNearestT(x, z, playerNearestT);
  playerNearestT       = t;
  playerDistFromCenter = dist;
  return dist < TRACK_W / 2 + 1;
}

function resolveTrackBoundary() {
  // Re-evaluate at post-integration position
  const { t, dist } = findNearestT(car.x, car.z, playerNearestT);
  playerNearestT       = t;
  playerDistFromCenter = dist;
  if (dist <= TRACK_W / 2) return false;

  const pt  = trackCurve.getPoint(t);
  const tan = trackCurve.getTangent(t);
  const nx  = -tan.z, nz = tan.x;
  const dx  = car.x - pt.x, dz = car.z - pt.z;
  const side = (dx * nx + dz * nz) >= 0 ? 1 : -1;

  // Push back to just inside the edge
  car.x = pt.x + nx * side * (TRACK_W / 2 - 0.1);
  car.z = pt.z + nz * side * (TRACK_W / 2 - 0.1);

  // Inward-pointing normal (toward track centre from this wall)
  const nnx = -side * nx, nnz = -side * nz;
  const dot = car.vx * nnx + car.vz * nnz;
  if (dot < 0) {   // velocity has outward component → reflect
    car.vx -= 2 * dot * nnx;
    car.vz -= 2 * dot * nnz;
  }
  car.vx *= 0.35; car.vz *= 0.35;
  shakeTimer = 18; shakeAmt = 0.45;
  return true;
}

// ---- Checkpoint + lap system ----
// t-values around the curve; last entry (0.0) is the start/finish line.
const CP_T_VALUES = [0.25, 0.5, 0.75, 0.0];
const CP_RADIUS   = 8;

const lapState = {
  lap:       0,
  maxLaps:   3,
  nextCp:    0,
  lapStart:  0,
  bestLap:   null,
  lastLap:   null,
  finished:  false,
  flash:     '',
  flashTimer: 0,
};

function cpWorld(t) {
  const pt = trackCurve.getPoint(t);
  return { x: pt.x, z: pt.z };
}

function updateLap() {
  if (lapState.finished) return;

  const cp = cpWorld(CP_T_VALUES[lapState.nextCp]);
  const dx = car.x - cp.x, dz = car.z - cp.z;
  if (dx*dx + dz*dz < CP_RADIUS * CP_RADIUS) {
    if (lapState.nextCp === CP_T_VALUES.length - 1) {
      const now = performance.now();
      if (lapState.lapStart > 0) {
        const lapTime = now - lapState.lapStart;
        lapState.lastLap = lapTime;
        if (lapState.bestLap === null || lapTime < lapState.bestLap) {
          lapState.bestLap  = lapTime;
          lapState.flash     = 'BEST LAP!';
          lapState.flashTimer = 180;
        }
        lapState.lap++;
        if (lapState.lap >= lapState.maxLaps) {
          lapState.finished  = true;
          lapState.flash     = 'FINISHED!';
          lapState.flashTimer = 9999;
        }
      } else {
        lapState.lap = 1;
      }
      lapState.lapStart = now;
    }
    lapState.nextCp = (lapState.nextCp + 1) % CP_T_VALUES.length;
  }

  if (lapState.flashTimer > 0) lapState.flashTimer--;
}

// ---- Tire marks ----
const MARK_MAX = 2000;
const markPositions = [];
const markGeo  = new THREE.BufferGeometry();
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
  const rx  = x - cosA * 1.5, rz = z + sinA * 1.5;
  const lx  = rx - sinA * 1.0, lz  = rz - cosA * 1.0;
  const rrx = rx + sinA * 1.0, rrz = rz + cosA * 1.0;

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
  vel:  new Float32Array(SMOKE_MAX * 3),
  life: new Float32Array(SMOKE_MAX),
  count: 0,
  head: 0,
};
const smokeGeo     = new THREE.BufferGeometry();
const smokePosAttr = new THREE.BufferAttribute(smokeData.pos, 3);
smokePosAttr.setUsage(THREE.DynamicDrawUsage);
smokeGeo.setAttribute('position', smokePosAttr);
smokeGeo.setDrawRange(0, 0);

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
  smokeData.pos[i*3]   = x; smokeData.pos[i*3+1] = y; smokeData.pos[i*3+2] = z;
  smokeData.vel[i*3]   = (Math.random()-0.5)*0.03;
  smokeData.vel[i*3+1] = 0.02 + Math.random()*0.03;
  smokeData.vel[i*3+2] = (Math.random()-0.5)*0.03;
  smokeData.life[i]    = 1.0;
  smokeData.head++;
  smokeData.count = Math.min(smokeData.count + 1, SMOKE_MAX);
}

function updateSmoke() {
  for (let i = 0; i < SMOKE_MAX; i++) {
    if (smokeData.life[i] <= 0) continue;
    smokeData.life[i]    -= 0.018;
    smokeData.pos[i*3]   += smokeData.vel[i*3];
    smokeData.pos[i*3+1] += smokeData.vel[i*3+1];
    smokeData.pos[i*3+2] += smokeData.vel[i*3+2];
  }
  smokePosAttr.needsUpdate = true;
  smokeGeo.setDrawRange(0, SMOKE_MAX);
  smokePoints.material.opacity = 0.55;
}

// ---- Game state machine ----
let gameState      = 'intro';
let countdownStart = 0;
let raceStartTime  = 0;
let totalRaceTime  = 0;

function startCountdown() {
  if (gameState !== 'intro') return;
  gameState      = 'countdown';
  countdownStart = performance.now();
}

function getCountdownPhase() {
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
let camPos    = new THREE.Vector3(46, 6, 0);
let camTarget = new THREE.Vector3(60, 0.5, 4);
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
  const startA = Math.PI * 0.75;
  const endA   = Math.PI * 2.25;
  const maxKmh = 280;
  const ratio  = Math.min(kmh / maxKmh, 1);
  const needleA = startA + ratio * (endA - startA);

  hctx.save();
  hctx.beginPath();
  hctx.arc(cx, cy, radius, 0, Math.PI * 2);
  hctx.fillStyle = 'rgba(0,0,0,0.75)';
  hctx.fill();

  const arcW = radius * 0.14;
  hctx.lineWidth = arcW;
  hctx.lineCap   = 'round';
  hctx.beginPath();
  hctx.arc(cx, cy, radius - arcW / 2, startA, endA);
  hctx.strokeStyle = 'rgba(255,255,255,0.08)';
  hctx.stroke();

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

  hctx.lineWidth = 2;
  for (let i = 0; i <= 14; i++) {
    const a     = startA + (i / 14) * (endA - startA);
    const inner = i % 7 === 0 ? radius * 0.70 : (i % 2 === 0 ? radius * 0.76 : radius * 0.80);
    const outer = radius * 0.86;
    hctx.beginPath();
    hctx.moveTo(cx + Math.cos(a) * inner, cy + Math.sin(a) * inner);
    hctx.lineTo(cx + Math.cos(a) * outer, cy + Math.sin(a) * outer);
    hctx.strokeStyle = i % 7 === 0 ? '#fff' : 'rgba(255,255,255,0.4)';
    hctx.stroke();
  }

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

  hctx.beginPath();
  hctx.arc(cx, cy, radius * 0.06, 0, Math.PI * 2);
  hctx.fillStyle = '#fff';
  hctx.fill();

  hctx.textAlign = 'center';
  hctx.font = `bold ${Math.round(radius * 0.30)}px monospace`;
  hctx.fillStyle = '#fff';
  hctx.fillText(Math.round(kmh), cx, cy + radius * 0.18);
  hctx.font = `${Math.round(radius * 0.16)}px monospace`;
  hctx.fillStyle = '#aaa';
  hctx.fillText('km/h', cx, cy + radius * 0.36);

  const gx = cx + radius * 0.35, gy = cy - radius * 0.18;
  hctx.font = `bold ${Math.round(radius * 0.36)}px monospace`;
  hctx.fillStyle = drifting ? '#ffea00' : '#00e5ff';
  hctx.fillText(`${gear}`, gx, gy);
  hctx.font = `${Math.round(radius * 0.14)}px monospace`;
  hctx.fillStyle = '#888';
  hctx.fillText('GEAR', gx, gy + radius * 0.22);

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

  hctx.fillStyle = 'rgba(0,0,0,0.72)';
  hctx.fillRect(0, 0, W, H);

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
    ['Enter',        'Start Race'],
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
  hctx.textAlign    = 'center';
  hctx.textBaseline = 'middle';

  const phase = (cd.elapsed % 1000) / 1000;
  const scale = cd.label === 'GO!' ? 1.0 + (1 - phase) * 0.4 : 1.4 - phase * 0.4;
  const fsize = Math.round(120 * scale);

  hctx.font = `bold ${fsize}px monospace`;
  hctx.fillStyle = 'rgba(0,0,0,0.4)';
  hctx.fillText(cd.label, W/2 + 5, H/2 + 5);
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

  const sR = 80;
  drawSpeedometer(sR + 20, H - sR - 20, sR, kmh, gear, drifting, driftAngleDeg);

  const now          = performance.now();
  const currentLapMs = lapState.lapStart > 0 ? now - lapState.lapStart : 0;
  const lapLabel     = lapState.finished ? 'FINISHED' : `LAP ${lapState.lap}/${lapState.maxLaps}`;
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

  hctx.fillStyle = 'rgba(0,0,0,0.5)';
  hctx.fillRect(lx, 114, 240, 22);
  for (let i = 0; i < CP_T_VALUES.length; i++) {
    const passed = i < lapState.nextCp;
    hctx.beginPath();
    hctx.arc(lx + 25 + i * 55, 125, 7, 0, Math.PI * 2);
    hctx.fillStyle = passed ? '#00e676' : '#333';
    hctx.fill();
    hctx.strokeStyle = '#666';
    hctx.lineWidth = 1;
    hctx.stroke();
  }

  if (!car.onTrack) {
    hctx.save();
    hctx.textAlign = 'center';
    hctx.font = 'bold 20px monospace';
    hctx.fillStyle = `rgba(255,150,0,${0.7 + 0.3 * Math.sin(Date.now()/200)})`;
    hctx.fillText('OFF TRACK', W/2, 40);
    hctx.restore();
  }

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

  const velAngle  = Math.atan2(-car.vz, car.vx);
  const angleDiff = Math.abs(((velAngle - car.angle + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
  const driftDeg  = (angleDiff * 180 / Math.PI);

  drawRacingHud(kmh, gear, car.drifting, driftDeg);

  if (gameState === 'countdown') drawCountdown();
}

// ---- Update ----
function update() {
  if (gameState === 'countdown') {
    const cd = getCountdownPhase();
    if (cd.done) {
      gameState     = 'racing';
      raceStartTime = performance.now();
      lapState.lapStart = raceStartTime;
      lapState.lap  = 1;
    }
  }

  if (gameState !== 'racing') {
    const t      = performance.now() / 4000;
    const orbitX = 60 + Math.cos(t) * 20;
    const orbitZ = Math.sin(t) * 14;
    camPos.lerp(new THREE.Vector3(orbitX, 8, orbitZ), 0.02);
    camTarget.lerp(new THREE.Vector3(60, 0, 0), 0.05);
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

  const fwdVel = car.vx * cosA - car.vz * sinA;

  // ---- Drift factor ----
  const wantDrift = handbrake && spd > 0.15;
  if (wantDrift) {
    car.driftFactor = Math.min(1, car.driftFactor + DRIFT_BUILDUP);
    car.drifting = true;
  } else {
    car.driftFactor = Math.max(0, car.driftFactor - DRIFT_DECAY);
    car.drifting = car.driftFactor > 0.05;
  }

  // ---- Steering ----
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
  car.angle += car.angularVel * (1 + car.driftFactor * 0.8);

  // ---- Acceleration ----
  if (up && fwdVel < MAX_SPEED) {
    car.vx += cosA * ACCEL_FORCE;
    car.vz -= sinA * ACCEL_FORCE;
  }

  // ---- Brake / Reverse ----
  if (down) {
    if (fwdVel > 0.05) {
      car.vx -= cosA * BRAKE_FORCE;
      car.vz += sinA * BRAKE_FORCE;
    } else if (fwdVel > -MAX_SPEED * 0.3) {
      car.vx -= cosA * ACCEL_FORCE * 0.5;
      car.vz += sinA * ACCEL_FORCE * 0.5;
    }
  }
  if (handbrake && spd > 0.01) {
    car.vx -= cosA * HANDBRAKE_F * Math.sign(fwdVel);
    car.vz += sinA * HANDBRAKE_F * Math.sign(fwdVel);
  }

  // ---- Lateral grip ----
  const latX   =  sinA, latZ = cosA;
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

  // ---- Smoke particles ----
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

  // ---- Exhaust flash ----
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
