(() => {
  const GRID_SIZE = 32;
  const TILE_SIZE = 1;
  const MAP_LENGTH = GRID_SIZE * TILE_SIZE;

  const canvas = document.getElementById('app');
  const tileInfoEl = document.getElementById('tile-info');

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1a2233);

  const camera = new THREE.PerspectiveCamera(
    45,
    window.innerWidth / window.innerHeight,
    0.1,
    1000
  );
  camera.position.set(24, 26, 24);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);

  // --- ライティング ---
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
  scene.add(ambientLight);

  const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
  dirLight.position.set(20, 30, 10);
  scene.add(dirLight);

  // --- 地形の起伏（軽量なノイズベースの高低差） ---
  function hash2D(i, j) {
    const s = Math.sin(i * 127.1 + j * 311.7) * 43758.5453;
    return s - Math.floor(s);
  }
  function smoothStep(t) {
    return t * t * (3 - 2 * t);
  }
  function valueNoise2D(x, z) {
    const xi = Math.floor(x);
    const zi = Math.floor(z);
    const xf = x - xi;
    const zf = z - zi;
    const u = smoothStep(xf);
    const v = smoothStep(zf);
    const a = hash2D(xi, zi);
    const b = hash2D(xi + 1, zi);
    const c = hash2D(xi, zi + 1);
    const d = hash2D(xi + 1, zi + 1);
    return a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v;
  }
  const TERRAIN_AMPLITUDE = 0.2;
  function heightAt(worldX, worldZ) {
    const n1 = valueNoise2D(worldX * 0.15, worldZ * 0.15);
    const n2 = valueNoise2D(worldX * 0.05 + 100, worldZ * 0.05 + 100);
    const combined = n1 * 0.6 + n2 * 0.4;
    return (combined - 0.5) * TERRAIN_AMPLITUDE;
  }

  // --- 地面グリッド ---
  const groundGeometry = new THREE.PlaneGeometry(MAP_LENGTH, MAP_LENGTH, GRID_SIZE, GRID_SIZE);
  groundGeometry.rotateX(-Math.PI / 2);
  {
    const posAttr = groundGeometry.attributes.position;
    for (let i = 0; i < posAttr.count; i++) {
      posAttr.setY(i, heightAt(posAttr.getX(i), posAttr.getZ(i)));
    }
    posAttr.needsUpdate = true;
    groundGeometry.computeVertexNormals();
  }
  const groundMaterial = new THREE.MeshLambertMaterial({ color: 0x2e5233 });
  const ground = new THREE.Mesh(groundGeometry, groundMaterial);
  scene.add(ground);

  const gridHelper = new THREE.GridHelper(MAP_LENGTH, GRID_SIZE, 0x88ccaa, 0x557766);
  gridHelper.position.y = 0.01;
  scene.add(gridHelper);

  // --- 地平線（グリッド外側を大きな地面で覆い、フォグで馴染ませる） ---
  const horizonGeometry = new THREE.PlaneGeometry(MAP_LENGTH * 15, MAP_LENGTH * 15);
  horizonGeometry.rotateX(-Math.PI / 2);
  const horizonMaterial = new THREE.MeshLambertMaterial({ color: 0x35583a });
  const horizonGround = new THREE.Mesh(horizonGeometry, horizonMaterial);
  horizonGround.position.y = -0.15;
  scene.add(horizonGround);
  scene.fog = new THREE.Fog(0x1a2233, 45, 220);

  // --- 昼夜サイクル（太陽・月） ---
  const DAY_CYCLE_SECONDS = 90; // 1x速度でのゲーム内1日の実時間
  const SKY_RADIUS = 100;
  let dayTime = 0.3; // 0=深夜, 0.25=朝, 0.5=正午, 0.75=夕方

  const sunMaterial = new THREE.MeshBasicMaterial({ color: 0xfff4cc, fog: false });
  const sunMesh = new THREE.Mesh(new THREE.SphereGeometry(7, 12, 12), sunMaterial);
  scene.add(sunMesh);

  const moonMaterial = new THREE.MeshBasicMaterial({ color: 0xccd6e6, fog: false });
  const moonMesh = new THREE.Mesh(new THREE.SphereGeometry(5, 12, 12), moonMaterial);
  scene.add(moonMesh);

  const DAY_KEYFRAMES = [
    { t: 0.0, sky: 0x0d1128, ambient: 0x445577, ambientI: 0.35, sunColor: 0x2a3a6a, sunI: 0.0 },
    { t: 0.25, sky: 0xffab73, ambient: 0xffddbb, ambientI: 0.6, sunColor: 0xffbb77, sunI: 0.6 },
    { t: 0.5, sky: 0x8ecae6, ambient: 0xffffff, ambientI: 0.7, sunColor: 0xffffff, sunI: 1.0 },
    { t: 0.75, sky: 0xff9d6c, ambient: 0xffcc99, ambientI: 0.6, sunColor: 0xff8f5c, sunI: 0.5 },
    { t: 1.0, sky: 0x0d1128, ambient: 0x445577, ambientI: 0.35, sunColor: 0x2a3a6a, sunI: 0.0 },
  ];

  const colorFrom = new THREE.Color();
  const colorTo = new THREE.Color();

  function updateDayNight() {
    let i = 0;
    while (i < DAY_KEYFRAMES.length - 2 && DAY_KEYFRAMES[i + 1].t < dayTime) i++;
    const a = DAY_KEYFRAMES[i];
    const b = DAY_KEYFRAMES[i + 1];
    const span = b.t - a.t || 1;
    const localT = (dayTime - a.t) / span;
    const ambientI = THREE.MathUtils.lerp(a.ambientI, b.ambientI, localT);
    const sunI = THREE.MathUtils.lerp(a.sunI, b.sunI, localT);

    scene.background.lerpColors(colorFrom.setHex(a.sky), colorTo.setHex(b.sky), localT);
    scene.fog.color.copy(scene.background);
    ambientLight.color.lerpColors(colorFrom.setHex(a.ambient), colorTo.setHex(b.ambient), localT);
    ambientLight.intensity = ambientI;

    const sunAngle = dayTime * Math.PI * 2 - Math.PI / 2;
    const sunHeight = Math.sin(sunAngle);
    const sunX = SKY_RADIUS * Math.cos(sunAngle);
    const sunY = SKY_RADIUS * sunHeight;
    const sunZ = SKY_RADIUS * 0.3;
    sunMesh.position.set(sunX, sunY, sunZ);
    sunMesh.visible = sunHeight > -0.05;

    const moonAngle = sunAngle + Math.PI;
    const moonHeight = Math.sin(moonAngle);
    moonMesh.position.set(
      SKY_RADIUS * Math.cos(moonAngle),
      SKY_RADIUS * moonHeight,
      -SKY_RADIUS * 0.3
    );
    moonMesh.visible = moonHeight > -0.05;

    dirLight.position.copy(sunMesh.position);
    dirLight.color.lerpColors(colorFrom.setHex(a.sunColor), colorTo.setHex(b.sunColor), localT);
    dirLight.intensity = sunI * 0.9 + 0.1; // 夜でも街灯代わりに最低限の明るさ

    const nightFactor = THREE.MathUtils.clamp(1 - sunI * 1.3, 0, 1);
    streetlightGroups.forEach(({ light }) => {
      light.intensity = nightFactor * 0.9;
    });
  }

  // --- カメラ操作 ---
  const controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 0, 0);
  controls.enableDamping = true;
  controls.dampingFactor = 0.1;
  controls.mouseButtons = {
    LEFT: THREE.MOUSE.ROTATE,
    MIDDLE: THREE.MOUSE.DOLLY,
    RIGHT: THREE.MOUSE.PAN,
  };
  controls.minDistance = 2;
  controls.maxDistance = 60;
  controls.maxPolarAngle = Math.PI / 2 - 0.05;
  controls.update();

  // --- 矢印キーによるカメラパン／Q・Rによる回転 ---
  const PAN_SPEED = 15; // units / sec
  const PAN_BOUND = MAP_LENGTH / 2 + 5;
  const ROTATE_SPEED = Math.PI / 2; // rad / sec
  const panKeys = {
    ArrowUp: false, ArrowDown: false, ArrowLeft: false, ArrowRight: false,
    KeyW: false, KeyA: false, KeyS: false, KeyD: false,
  };
  const rotateKeys = { KeyQ: false, KeyR: false, KeyE: false, KeyC: false };

  window.addEventListener('keydown', (event) => {
    if (event.code in panKeys) {
      panKeys[event.code] = true;
      event.preventDefault();
    } else if (event.code in rotateKeys) {
      rotateKeys[event.code] = true;
      event.preventDefault();
    }
  });
  window.addEventListener('keyup', (event) => {
    if (event.code in panKeys) panKeys[event.code] = false;
    else if (event.code in rotateKeys) rotateKeys[event.code] = false;
  });

  // --- モバイル用オンスクリーンボタン（同じ panKeys / rotateKeys を操作する） ---
  document.querySelectorAll('[data-pan]').forEach((btn) => {
    const code = btn.dataset.pan;
    const press = (e) => { e.preventDefault(); panKeys[code] = true; };
    const release = (e) => { e.preventDefault(); panKeys[code] = false; };
    btn.addEventListener('pointerdown', press);
    btn.addEventListener('pointerup', release);
    btn.addEventListener('pointerleave', release);
    btn.addEventListener('pointercancel', release);
  });
  document.querySelectorAll('[data-rotate]').forEach((btn) => {
    const code = btn.dataset.rotate;
    const press = (e) => { e.preventDefault(); rotateKeys[code] = true; };
    const release = (e) => { e.preventDefault(); rotateKeys[code] = false; };
    btn.addEventListener('pointerdown', press);
    btn.addEventListener('pointerup', release);
    btn.addEventListener('pointerleave', release);
    btn.addEventListener('pointercancel', release);
  });

  function updateKeyboardRotate(delta) {
    let dtheta = 0;
    let dphi = 0;
    if (rotateKeys.KeyQ) dtheta += ROTATE_SPEED * delta;
    if (rotateKeys.KeyR) dtheta -= ROTATE_SPEED * delta;
    if (rotateKeys.KeyE) dphi -= ROTATE_SPEED * delta; // 見上げる
    if (rotateKeys.KeyC) dphi += ROTATE_SPEED * delta; // 見下ろす
    if (dtheta === 0 && dphi === 0) return;

    const offset = new THREE.Vector3().subVectors(camera.position, controls.target);
    const spherical = new THREE.Spherical().setFromVector3(offset);
    spherical.theta += dtheta;
    spherical.phi = THREE.MathUtils.clamp(
      spherical.phi + dphi,
      controls.minPolarAngle,
      controls.maxPolarAngle
    );
    offset.setFromSpherical(spherical);
    camera.position.copy(controls.target).add(offset);
  }

  function updateArrowPan(delta) {
    let dx = 0;
    let dz = 0;
    if (panKeys.ArrowUp || panKeys.KeyW) dz -= 1;
    if (panKeys.ArrowDown || panKeys.KeyS) dz += 1;
    if (panKeys.ArrowLeft || panKeys.KeyA) dx -= 1;
    if (panKeys.ArrowRight || panKeys.KeyD) dx += 1;
    if (dx === 0 && dz === 0) return;

    const te = camera.matrix.elements;
    const right = new THREE.Vector3(te[0], 0, te[2]);
    const forward = new THREE.Vector3(-te[8], 0, -te[10]);
    if (right.lengthSq() > 0) right.normalize();
    if (forward.lengthSq() > 0) forward.normalize();

    const move = new THREE.Vector3()
      .addScaledVector(right, dx)
      .addScaledVector(forward, -dz);
    if (move.lengthSq() === 0) return;
    move.normalize().multiplyScalar(PAN_SPEED * delta);

    const nextTargetX = THREE.MathUtils.clamp(controls.target.x + move.x, -PAN_BOUND, PAN_BOUND);
    const nextTargetZ = THREE.MathUtils.clamp(controls.target.z + move.z, -PAN_BOUND, PAN_BOUND);
    const appliedX = nextTargetX - controls.target.x;
    const appliedZ = nextTargetZ - controls.target.z;

    controls.target.x += appliedX;
    controls.target.z += appliedZ;
    camera.position.x += appliedX;
    camera.position.z += appliedZ;
  }

  // --- タイルデータ ---
  const RAIL_HEIGHT = 1.5;
  const tileTypes = Array.from({ length: GRID_SIZE }, () => Array(GRID_SIZE).fill('empty'));
  const railTiles = Array.from({ length: GRID_SIZE }, () => Array(GRID_SIZE).fill(false));
  const riverTiles = Array.from({ length: GRID_SIZE }, () => Array(GRID_SIZE).fill(false));
  const roadMeshes = new Map();
  const railGroups = new Map();
  const riverMeshes = new Map();

  const riverMaterial = new THREE.MeshLambertMaterial({ color: 0x2f6fa8, transparent: true, opacity: 0.88 });
  const riverGeometry = new THREE.PlaneGeometry(TILE_SIZE * 1.02, TILE_SIZE * 1.02);

  const roadMaterial = new THREE.MeshLambertMaterial({ color: 0x555555 });
  const roadGeometry = new THREE.BoxGeometry(TILE_SIZE * 0.95, 0.08, TILE_SIZE * 0.95);

  // 街灯（道路に沿って一定間隔で自動設置、夜間に点灯する）
  const STREETLIGHT_SPACING = 3; // 道路何タイルごとに1本
  const MAX_STREETLIGHTS = 40;
  const streetlightPoleMaterial = new THREE.MeshLambertMaterial({ color: 0x333333 });
  const streetlightPoleGeometry = new THREE.CylinderGeometry(0.03, 0.03, 0.9, 6);
  const streetlightBulbMaterial = new THREE.MeshBasicMaterial({ color: 0xfff2b0, fog: false });
  const streetlightBulbGeometry = new THREE.SphereGeometry(0.08, 8, 8);
  const streetlightGroups = new Map();

  function addStreetlight(tileX, tileZ) {
    if (streetlightGroups.size >= MAX_STREETLIGHTS) return;
    const key = tileKey(tileX, tileZ);
    if (streetlightGroups.has(key)) return;
    const center = tileToWorldCenter(tileX, tileZ);
    const lx = center.x + TILE_SIZE * 0.4;
    const lz = center.z + TILE_SIZE * 0.4;

    const group = new THREE.Group();
    const pole = new THREE.Mesh(streetlightPoleGeometry, streetlightPoleMaterial);
    pole.position.y = 0.45;
    group.add(pole);
    const bulb = new THREE.Mesh(streetlightBulbGeometry, streetlightBulbMaterial);
    bulb.position.y = 0.9;
    group.add(bulb);
    group.position.set(lx, 0, lz);
    scene.add(group);

    const light = new THREE.PointLight(0xffdd88, 0, 3.5);
    light.position.set(lx, 0.9, lz);
    scene.add(light);

    streetlightGroups.set(key, { group, light });
  }

  function removeStreetlight(tileX, tileZ) {
    const key = tileKey(tileX, tileZ);
    const entry = streetlightGroups.get(key);
    if (!entry) return;
    scene.remove(entry.group);
    scene.remove(entry.light);
    streetlightGroups.delete(key);
  }

  // 川の上を渡る道路（橋）
  const BRIDGE_HEIGHT = 0.25; // 川の水面より確実に高い位置
  const bridgePillarMaterial = new THREE.MeshLambertMaterial({ color: 0xaaaaa0 });
  const bridgePillarGeometry = new THREE.CylinderGeometry(0.06, 0.06, BRIDGE_HEIGHT, 8);
  const bridgePillars = new Map();

  const railDeckMaterial = new THREE.MeshLambertMaterial({ color: 0x8899aa });
  const railDeckGeometry = new THREE.BoxGeometry(TILE_SIZE * 0.95, 0.15, TILE_SIZE * 0.95);
  const railPillarMaterial = new THREE.MeshLambertMaterial({ color: 0xaaaaa0 });
  const railPillarGeometry = new THREE.CylinderGeometry(0.07, 0.07, RAIL_HEIGHT, 8);
  const RAIL_PILLAR_OFFSET = 0.35;

  const stationGroups = new Map();
  const STATION_RADIUS = 5; // 駅周辺で商業成長が優遇されるタイル数

  // 駅舎：地面から高架デッキを越える高さまで伸びる、ビルのような四角いブロック
  const STATION_BUILDING_HEIGHT = RAIL_HEIGHT + 0.4;
  const stationBuildingMaterial = new THREE.MeshLambertMaterial({ color: 0xff7043 });
  const stationBuildingGeometry = new THREE.BoxGeometry(TILE_SIZE * 0.8, STATION_BUILDING_HEIGHT, TILE_SIZE * 0.8);
  const stationRoofCapMaterial = new THREE.MeshLambertMaterial({ color: 0xb0492a });
  const stationRoofCapGeometry = new THREE.BoxGeometry(TILE_SIZE * 0.9, 0.1, TILE_SIZE * 0.9);

  // 公園：芝生の広場＋木を数本
  const PARK_COST = 500;
  const parkGroups = new Map();
  const parkGroundMaterial = new THREE.MeshLambertMaterial({ color: 0x6fbf73 });
  const parkGroundGeometry = new THREE.BoxGeometry(TILE_SIZE * 0.92, 0.06, TILE_SIZE * 0.92);
  const treeTrunkMaterial = new THREE.MeshLambertMaterial({ color: 0x6d4c2f });
  const treeTrunkGeometry = new THREE.CylinderGeometry(0.035, 0.035, 0.22, 6);
  const treeLeafMaterial = new THREE.MeshLambertMaterial({ color: 0x3f8f4f });
  const treeLeafGeometry = new THREE.SphereGeometry(0.14, 8, 8);
  const TREE_OFFSETS = [
    [-0.25, -0.2], [0.22, -0.15], [-0.05, 0.25],
  ];

  // 行政施設：白系のビル＋青い屋根
  const GOV_COST = 2000;
  const govGroups = new Map();
  const GOV_BUILDING_HEIGHT = 1.1;
  const govBuildingMaterial = new THREE.MeshLambertMaterial({ color: 0xeceff1 });
  const govBuildingGeometry = new THREE.BoxGeometry(TILE_SIZE * 0.75, GOV_BUILDING_HEIGHT, TILE_SIZE * 0.75);
  const govRoofMaterial = new THREE.MeshLambertMaterial({ color: 0x3b6fa0 });
  const govRoofGeometry = new THREE.BoxGeometry(TILE_SIZE * 0.85, 0.1, TILE_SIZE * 0.85);

  const ZONE_TYPES = ['residential', 'commercial', 'industrial'];
  const zoneMeshes = new Map();
  const zoneGeometry = new THREE.PlaneGeometry(TILE_SIZE * 0.9, TILE_SIZE * 0.9);
  const zoneMaterials = {
    residential: new THREE.MeshBasicMaterial({ color: 0x4caf50, transparent: true, opacity: 0.55 }),
    commercial: new THREE.MeshBasicMaterial({ color: 0x2196f3, transparent: true, opacity: 0.55 }),
    industrial: new THREE.MeshBasicMaterial({ color: 0xfdd835, transparent: true, opacity: 0.55 }),
  };

  function tileKey(tileX, tileZ) {
    return `${tileX},${tileZ}`;
  }

  function markRiverTile(tileX, tileZ) {
    if (tileX < 0 || tileX >= GRID_SIZE || tileZ < 0 || tileZ >= GRID_SIZE) return;
    if (riverTiles[tileX][tileZ]) return;
    riverTiles[tileX][tileZ] = true;
    const center = tileToWorldCenter(tileX, tileZ);
    const mesh = new THREE.Mesh(riverGeometry, riverMaterial);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(center.x, heightAt(center.x, center.z) + 0.02, center.z);
    scene.add(mesh);
    riverMeshes.set(tileKey(tileX, tileZ), mesh);
  }

  function generateRiver() {
    const vertical = Math.random() < 0.5;
    const riverWidth = 2;
    let primary = Math.floor(GRID_SIZE / 2) + Math.floor((Math.random() - 0.5) * (GRID_SIZE * 0.4));

    for (let i = 0; i < GRID_SIZE; i++) {
      if (Math.random() < 0.3) primary += Math.random() < 0.5 ? -1 : 1;
      primary = Math.max(1, Math.min(GRID_SIZE - 1 - riverWidth, primary));

      for (let w = 0; w < riverWidth; w++) {
        const x = vertical ? primary + w : i;
        const z = vertical ? i : primary + w;
        markRiverTile(x, z);
      }
    }
  }

  // --- 建物（自動発生・成長） ---
  const buildingLevel = Array.from({ length: GRID_SIZE }, () => Array(GRID_SIZE).fill(0));
  const buildingMeshes = new Map();

  const LEVEL_CAPACITY = {
    residential: { 1: 10, 2: 25, 3: 50 },
    commercial: { 1: 8, 2: 18, 3: 35 },
    industrial: { 1: 12, 2: 24, 3: 45 },
  };
  const BUILDING_HEIGHTS = { 1: 0.6, 2: 1.2, 3: 2.0 };
  const buildingGeometries = {
    1: new THREE.BoxGeometry(TILE_SIZE * 0.7, BUILDING_HEIGHTS[1], TILE_SIZE * 0.7),
    2: new THREE.BoxGeometry(TILE_SIZE * 0.7, BUILDING_HEIGHTS[2], TILE_SIZE * 0.7),
    3: new THREE.BoxGeometry(TILE_SIZE * 0.7, BUILDING_HEIGHTS[3], TILE_SIZE * 0.7),
  };
  // レベルが上がる（＝需要に応えて成長する）ほど、彩度を落とした落ち着いた色調にする
  const buildingMaterials = {
    residential: {
      1: new THREE.MeshLambertMaterial({ color: 0x81c784 }),
      2: new THREE.MeshLambertMaterial({ color: 0x4c8c5a }),
      3: new THREE.MeshLambertMaterial({ color: 0x2f4f3e }),
    },
    commercial: {
      1: new THREE.MeshLambertMaterial({ color: 0x64b5f6 }),
      2: new THREE.MeshLambertMaterial({ color: 0x3a6ea5 }),
      3: new THREE.MeshLambertMaterial({ color: 0x1c3552 }),
    },
    industrial: {
      1: new THREE.MeshLambertMaterial({ color: 0xffe082 }),
      2: new THREE.MeshLambertMaterial({ color: 0xc9a24b }),
      3: new THREE.MeshLambertMaterial({ color: 0x6e5a2e }),
    },
  };

  function setBuilding(tileX, tileZ, zoneType, level) {
    const key = tileKey(tileX, tileZ);
    const existing = buildingMeshes.get(key);
    if (existing) {
      scene.remove(existing);
      buildingMeshes.delete(key);
    }
    buildingLevel[tileX][tileZ] = level;
    if (level === 0) return;

    const center = tileToWorldCenter(tileX, tileZ);
    const mesh = new THREE.Mesh(buildingGeometries[level], buildingMaterials[zoneType][level]);
    mesh.position.set(center.x, BUILDING_HEIGHTS[level] / 2, center.z);
    scene.add(mesh);
    buildingMeshes.set(key, mesh);
  }

  function removeBuilding(tileX, tileZ) {
    setBuilding(tileX, tileZ, null, 0);
  }

  function isAdjacentToRoad(tileX, tileZ) {
    const neighbors = [
      [tileX - 1, tileZ],
      [tileX + 1, tileZ],
      [tileX, tileZ - 1],
      [tileX, tileZ + 1],
    ];
    return neighbors.some(([nx, nz]) => (
      nx >= 0 && nx < GRID_SIZE && nz >= 0 && nz < GRID_SIZE && tileTypes[nx][nz] === 'road'
    ));
  }

  function isAdjacentToRail(tileX, tileZ) {
    const neighbors = [
      [tileX - 1, tileZ],
      [tileX + 1, tileZ],
      [tileX, tileZ - 1],
      [tileX, tileZ + 1],
    ];
    return neighbors.some(([nx, nz]) => (
      nx >= 0 && nx < GRID_SIZE && nz >= 0 && nz < GRID_SIZE && railTiles[nx][nz]
    ));
  }

  // --- 需要・人口・日付・資金 ---
  const hudDateEl = document.getElementById('hud-date');
  const hudFundsEl = document.getElementById('hud-funds');
  const hudIncomeEl = document.getElementById('hud-income');
  const repayBtn = document.getElementById('repay-btn');
  const hudPopulationEl = document.getElementById('hud-population');
  const demandResidentialEl = document.getElementById('demand-residential');
  const demandCommercialEl = document.getElementById('demand-commercial');
  const demandIndustrialEl = document.getElementById('demand-industrial');

  const demand = { residential: 0.5, commercial: 0.5, industrial: 0.5 };
  let population = 0;
  let jobs = 0;
  let commercialJobs = 0;
  let industrialJobs = 0;
  const gameDate = { year: 2024, month: 1 };
  let simSpeed = 1;

  const ROAD_COST = 100;
  const RAIL_COST = ROAD_COST * 5;
  const STATION_COST = 1000;
  const ROAD_UPKEEP = 3;
  const RAIL_UPKEEP = ROAD_UPKEEP * 5;
  const TAX_RESIDENTIAL_PER_CAPITA = 8;
  const TAX_COMMERCIAL_PER_JOB = 12;
  const TAX_INDUSTRIAL_PER_JOB = 10;

  const LOAN_AMOUNT = 20000;
  const LOAN_INTEREST_RATE = 0.02; // 月利
  const LOAN_MIN_PAYMENT = 2000; // 毎月の返済額（元本が着実に減るよう利息より大きくする）

  let funds = 50000;
  let debt = 0;
  let restoringState = false; // セーブデータ復元中は資金/隣接チェックをバイパスする
  let lastTaxIncome = 0;
  let lastMaintenanceExpense = 0;
  let roadCount = 0;
  let railCount = 0;

  function clamp01(v) {
    return Math.max(0.05, Math.min(1, v));
  }

  function takeLoan() {
    funds += LOAN_AMOUNT;
    debt += LOAN_AMOUNT;
    updateHud();
  }

  function recomputeStats() {
    let pop = 0;
    let comJobs = 0;
    let indJobs = 0;
    for (let x = 0; x < GRID_SIZE; x++) {
      for (let z = 0; z < GRID_SIZE; z++) {
        const level = buildingLevel[x][z];
        if (level === 0) continue;
        const type = tileTypes[x][z];
        if (type === 'residential') pop += LEVEL_CAPACITY.residential[level];
        else if (type === 'commercial') comJobs += LEVEL_CAPACITY.commercial[level];
        else if (type === 'industrial') indJobs += LEVEL_CAPACITY.industrial[level];
      }
    }
    population = pop;
    commercialJobs = comJobs;
    industrialJobs = indJobs;
    jobs = comJobs + indJobs;

    demand.residential = clamp01(0.5 + (jobs - population) / 100);
    demand.commercial = clamp01(0.5 + (population - jobs * 0.6) / 150);
    demand.industrial = clamp01(0.55 - (jobs - population) / 200);
  }

  function applyEconomyTick() {
    const income = population * TAX_RESIDENTIAL_PER_CAPITA
      + commercialJobs * TAX_COMMERCIAL_PER_JOB
      + industrialJobs * TAX_INDUSTRIAL_PER_JOB;
    const expense = roadCount * ROAD_UPKEEP + railCount * RAIL_UPKEEP;
    funds += income - expense;
    lastTaxIncome = income;
    lastMaintenanceExpense = expense;

    if (debt > 0) {
      debt += debt * LOAN_INTEREST_RATE;
      const payment = Math.min(debt, LOAN_MIN_PAYMENT);
      debt -= payment;
      funds -= payment;
    }
  }

  function repayLoan() {
    if (debt <= 0 || funds < debt) return;
    funds -= debt;
    debt = 0;
    updateHud();
  }

  function advanceDate() {
    gameDate.month += 1;
    if (gameDate.month > 12) {
      gameDate.month = 1;
      gameDate.year += 1;
    }
  }

  function updateHud() {
    hudDateEl.textContent = `${gameDate.year}年${gameDate.month}月`;
    const debtText = debt > 0 ? `（借入残高: ¥${Math.round(debt).toLocaleString()}）` : '';
    hudFundsEl.textContent = `資金: ¥${Math.round(funds).toLocaleString()}${debtText}`;
    hudFundsEl.classList.toggle('negative', funds < 0);
    hudIncomeEl.textContent = `税収: ¥${Math.round(lastTaxIncome).toLocaleString()}/月（維持費 ¥${Math.round(lastMaintenanceExpense).toLocaleString()}）`;
    repayBtn.classList.toggle('hidden', debt <= 0);
    hudPopulationEl.textContent = `人口: ${population}人`;
    demandResidentialEl.style.width = `${Math.round(demand.residential * 100)}%`;
    demandCommercialEl.style.width = `${Math.round(demand.commercial * 100)}%`;
    demandIndustrialEl.style.width = `${Math.round(demand.industrial * 100)}%`;
  }

  function simulateMonthTick() {
    for (let x = 0; x < GRID_SIZE; x++) {
      for (let z = 0; z < GRID_SIZE; z++) {
        const type = tileTypes[x][z];
        if (!ZONE_TYPES.includes(type)) continue;
        if (!isAdjacentToRoad(x, z)) continue;

        const underRail = railTiles[x][z];
        const level = buildingLevel[x][z];
        const stationBonus = type === 'commercial' && isNearStation(x, z) ? 1.5 : 1;
        const d = demand[type] * stationBonus;
        if (level === 0) {
          // 高架下でもブロック自体は生成される（橋桁に干渉しないLv.1まで）
          if (Math.random() < d * 0.5) setBuilding(x, z, type, 1);
        } else if (level < 3 && !underRail) {
          if (Math.random() < d * 0.15) setBuilding(x, z, type, level + 1);
        }
      }
    }
    recomputeStats();
    applyEconomyTick();
    advanceDate();
    updateHud();
    refreshHeatmapIfVisible();
    saveGame();
  }

  const speedButtons = document.querySelectorAll('.speed-btn');
  speedButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      simSpeed = Number(btn.dataset.speed);
      speedButtons.forEach((b) => b.classList.toggle('active', b === btn));
    });
  });

  document.getElementById('loan-btn').addEventListener('click', takeLoan);
  repayBtn.addEventListener('click', repayLoan);

  const daynightToggleBtn = document.getElementById('daynight-toggle-btn');
  let forcedNight = false;
  daynightToggleBtn.addEventListener('click', () => {
    forcedNight = !forcedNight;
    dayTime = forcedNight ? 0.0 : 0.5;
    updateDayNight();
    daynightToggleBtn.textContent = forcedNight ? '☀️ 昼にする' : '🌙 夜にする';
  });

  document.getElementById('heatmap-toggle-btn').addEventListener('click', toggleHeatmap);

  // --- BGM（音量・ミュート操作、初回操作で再生開始） ---
  const bgmAudio = document.getElementById('bgm-audio');
  const bgmMuteBtn = document.getElementById('bgm-mute-btn');
  const bgmVolumeSlider = document.getElementById('bgm-volume');
  let bgmMuted = false;

  bgmAudio.volume = Number(bgmVolumeSlider.value) / 100;

  function startBgmOnce() {
    bgmAudio.play().catch(() => {});
    window.removeEventListener('pointerdown', startBgmOnce);
    window.removeEventListener('keydown', startBgmOnce);
  }
  window.addEventListener('pointerdown', startBgmOnce);
  window.addEventListener('keydown', startBgmOnce);

  bgmMuteBtn.addEventListener('click', () => {
    bgmMuted = !bgmMuted;
    bgmAudio.muted = bgmMuted;
    bgmMuteBtn.textContent = bgmMuted ? '🔇' : '🔊';
  });

  bgmVolumeSlider.addEventListener('input', () => {
    bgmAudio.volume = Number(bgmVolumeSlider.value) / 100;
    if (bgmAudio.volume === 0) {
      bgmMuted = true;
      bgmAudio.muted = true;
      bgmMuteBtn.textContent = '🔇';
    } else if (bgmMuted) {
      bgmMuted = false;
      bgmAudio.muted = false;
      bgmMuteBtn.textContent = '🔊';
    }
  });

  // --- 設定画面（Escキー／歯車アイコンで開閉、開いている間はゲームを一時停止） ---
  const settingsOverlay = document.getElementById('settings-overlay');
  const settingsBtn = document.getElementById('settings-btn');
  const settingsCloseBtn = document.getElementById('settings-close-btn');
  let speedBeforeSettings = null;

  function isSettingsOpen() {
    return !settingsOverlay.classList.contains('hidden');
  }

  function openSettings() {
    if (isSettingsOpen()) return;
    speedBeforeSettings = simSpeed;
    simSpeed = 0;
    settingsOverlay.classList.remove('hidden');
  }

  function closeSettings() {
    if (!isSettingsOpen()) return;
    settingsOverlay.classList.add('hidden');
    if (speedBeforeSettings !== null) {
      simSpeed = speedBeforeSettings;
      speedBeforeSettings = null;
    }
    document.querySelectorAll('.speed-btn').forEach((b) => {
      b.classList.toggle('active', Number(b.dataset.speed) === simSpeed);
    });
  }

  function toggleSettings() {
    if (isSettingsOpen()) closeSettings();
    else openSettings();
  }

  settingsBtn.addEventListener('click', toggleSettings);
  settingsCloseBtn.addEventListener('click', closeSettings);
  settingsOverlay.addEventListener('click', (event) => {
    if (event.target === settingsOverlay) closeSettings();
  });
  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      toggleSettings();
    }
  });

  document.querySelectorAll('.settings-tab-btn').forEach((tabBtn) => {
    tabBtn.addEventListener('click', () => {
      document.querySelectorAll('.settings-tab-btn').forEach((b) => b.classList.toggle('active', b === tabBtn));
      document.querySelectorAll('.settings-tab-content').forEach((c) => {
        c.classList.toggle('active', c.id === `settings-tab-${tabBtn.dataset.tab}`);
      });
    });
  });

  const saveStatusEl = document.getElementById('save-status');
  document.getElementById('save-btn').addEventListener('click', () => {
    const ok = saveGame();
    saveStatusEl.textContent = ok ? '保存しました' : '保存に失敗しました';
    setTimeout(() => { saveStatusEl.textContent = ''; }, 2500);
  });
  document.getElementById('load-btn').addEventListener('click', () => {
    const ok = loadGame();
    saveStatusEl.textContent = ok ? '読み込みました' : 'セーブデータがありません';
    setTimeout(() => { saveStatusEl.textContent = ''; }, 2500);
  });

  updateHud();

  function addRoad(tileX, tileZ) {
    if (tileTypes[tileX][tileZ] === 'road') return;
    if (funds < ROAD_COST) return;

    const key = tileKey(tileX, tileZ);
    const existingZone = zoneMeshes.get(key);
    if (existingZone) {
      scene.remove(existingZone);
      zoneMeshes.delete(key);
    }
    if (buildingLevel[tileX][tileZ] > 0) removeBuilding(tileX, tileZ);
    if (parkGroups.has(key)) removePark(tileX, tileZ);
    if (govGroups.has(key)) removeGov(tileX, tileZ);

    funds -= ROAD_COST;
    roadCount += 1;
    tileTypes[tileX][tileZ] = 'road';
    const center = tileToWorldCenter(tileX, tileZ);
    const isBridge = riverTiles[tileX][tileZ];
    const roadY = isBridge ? BRIDGE_HEIGHT : 0.04;
    const mesh = new THREE.Mesh(roadGeometry, roadMaterial);
    mesh.position.set(center.x, roadY, center.z);
    scene.add(mesh);
    roadMeshes.set(key, mesh);

    if (isBridge) {
      const pillar = new THREE.Mesh(bridgePillarGeometry, bridgePillarMaterial);
      pillar.position.set(center.x, roadY / 2, center.z);
      scene.add(pillar);
      bridgePillars.set(key, pillar);
    } else if (roadCount % STREETLIGHT_SPACING === 0) {
      addStreetlight(tileX, tileZ);
    }

    updateHud();
  }

  function removeRoad(tileX, tileZ) {
    const key = tileKey(tileX, tileZ);
    const mesh = roadMeshes.get(key);
    if (mesh) {
      scene.remove(mesh);
      roadMeshes.delete(key);
      roadCount -= 1;
    }
    const pillar = bridgePillars.get(key);
    if (pillar) {
      scene.remove(pillar);
      bridgePillars.delete(key);
    }
    removeStreetlight(tileX, tileZ);
    tileTypes[tileX][tileZ] = 'empty';
  }

  function addRail(tileX, tileZ) {
    if (railTiles[tileX][tileZ]) return;
    if (!restoringState && railCount > 0 && !isAdjacentToRail(tileX, tileZ)) return;
    if (funds < RAIL_COST) return;
    railTiles[tileX][tileZ] = true;
    funds -= RAIL_COST;
    railCount += 1;
    // 高架下は建物ブロック自体は残せるが、橋桁に干渉しないようLv.1相当まで下げる
    if (buildingLevel[tileX][tileZ] > 1) {
      setBuilding(tileX, tileZ, tileTypes[tileX][tileZ], 1);
    }
    const center = tileToWorldCenter(tileX, tileZ);
    const group = new THREE.Group();

    const deck = new THREE.Mesh(railDeckGeometry, railDeckMaterial);
    deck.position.set(0, RAIL_HEIGHT, 0);
    group.add(deck);

    const pillarOffsets = [
      [-RAIL_PILLAR_OFFSET, -RAIL_PILLAR_OFFSET],
      [-RAIL_PILLAR_OFFSET, RAIL_PILLAR_OFFSET],
      [RAIL_PILLAR_OFFSET, -RAIL_PILLAR_OFFSET],
      [RAIL_PILLAR_OFFSET, RAIL_PILLAR_OFFSET],
    ];
    pillarOffsets.forEach(([px, pz]) => {
      const pillar = new THREE.Mesh(railPillarGeometry, railPillarMaterial);
      pillar.position.set(px, RAIL_HEIGHT / 2, pz);
      group.add(pillar);
    });

    group.position.set(center.x, 0, center.z);
    scene.add(group);
    railGroups.set(tileKey(tileX, tileZ), group);
    updateHud();
  }

  function removeRail(tileX, tileZ) {
    const key = tileKey(tileX, tileZ);
    const group = railGroups.get(key);
    if (group) {
      scene.remove(group);
      railGroups.delete(key);
      railCount -= 1;
    }
    railTiles[tileX][tileZ] = false;
    if (stationGroups.has(key)) removeStation(tileX, tileZ);
  }

  function addStation(tileX, tileZ) {
    if (!railTiles[tileX][tileZ]) return;
    const key = tileKey(tileX, tileZ);
    if (stationGroups.has(key)) return;
    if (funds < STATION_COST) return;
    funds -= STATION_COST;

    const group = new THREE.Group();

    // 駅舎：地面から高架デッキを越える高さまで届く四角いブロック
    const building = new THREE.Mesh(stationBuildingGeometry, stationBuildingMaterial);
    building.position.set(0, STATION_BUILDING_HEIGHT / 2, 0);
    group.add(building);

    const roofCap = new THREE.Mesh(stationRoofCapGeometry, stationRoofCapMaterial);
    roofCap.position.set(0, STATION_BUILDING_HEIGHT + 0.05, 0);
    group.add(roofCap);

    const center = tileToWorldCenter(tileX, tileZ);
    group.position.set(center.x, 0, center.z);
    scene.add(group);
    stationGroups.set(key, group);

    // 駅の両脇（X方向）に道路を自動生成
    if (tileX - 1 >= 0) addRoad(tileX - 1, tileZ);
    if (tileX + 1 < GRID_SIZE) addRoad(tileX + 1, tileZ);

    updateHud();
  }

  function removeStation(tileX, tileZ) {
    const key = tileKey(tileX, tileZ);
    const group = stationGroups.get(key);
    if (group) {
      scene.remove(group);
      stationGroups.delete(key);
    }
  }

  function addPark(tileX, tileZ) {
    if (tileTypes[tileX][tileZ] !== 'empty' || railTiles[tileX][tileZ]) return;
    const key = tileKey(tileX, tileZ);
    if (parkGroups.has(key) || govGroups.has(key)) return;
    if (funds < PARK_COST) return;
    funds -= PARK_COST;

    const group = new THREE.Group();
    const ground = new THREE.Mesh(parkGroundGeometry, parkGroundMaterial);
    ground.position.y = 0.03;
    group.add(ground);
    TREE_OFFSETS.forEach(([ox, oz]) => {
      const trunk = new THREE.Mesh(treeTrunkGeometry, treeTrunkMaterial);
      trunk.position.set(ox, 0.17, oz);
      group.add(trunk);
      const leaf = new THREE.Mesh(treeLeafGeometry, treeLeafMaterial);
      leaf.position.set(ox, 0.32, oz);
      group.add(leaf);
    });

    const center = tileToWorldCenter(tileX, tileZ);
    group.position.set(center.x, 0, center.z);
    scene.add(group);
    parkGroups.set(key, group);
    updateHud();
  }

  function removePark(tileX, tileZ) {
    const key = tileKey(tileX, tileZ);
    const group = parkGroups.get(key);
    if (group) {
      scene.remove(group);
      parkGroups.delete(key);
    }
  }

  function addGov(tileX, tileZ) {
    if (tileTypes[tileX][tileZ] !== 'empty' || railTiles[tileX][tileZ]) return;
    const key = tileKey(tileX, tileZ);
    if (parkGroups.has(key) || govGroups.has(key)) return;
    if (funds < GOV_COST) return;
    funds -= GOV_COST;

    const group = new THREE.Group();
    const building = new THREE.Mesh(govBuildingGeometry, govBuildingMaterial);
    building.position.y = GOV_BUILDING_HEIGHT / 2;
    group.add(building);
    const roof = new THREE.Mesh(govRoofGeometry, govRoofMaterial);
    roof.position.y = GOV_BUILDING_HEIGHT + 0.05;
    group.add(roof);

    const center = tileToWorldCenter(tileX, tileZ);
    group.position.set(center.x, 0, center.z);
    scene.add(group);
    govGroups.set(key, group);
    updateHud();
  }

  function removeGov(tileX, tileZ) {
    const key = tileKey(tileX, tileZ);
    const group = govGroups.get(key);
    if (group) {
      scene.remove(group);
      govGroups.delete(key);
    }
  }

  function isNearStation(tileX, tileZ) {
    for (const key of stationGroups.keys()) {
      const [sx, sz] = key.split(',').map(Number);
      if (Math.max(Math.abs(sx - tileX), Math.abs(sz - tileZ)) <= STATION_RADIUS) return true;
    }
    return false;
  }

  // --- 地価（シンプル版） ---
  const BASE_LAND_VALUE = 50;

  function computeLandValue(tileX, tileZ) {
    let value = BASE_LAND_VALUE;

    // 駅からの距離ボーナス（近いほど高い）
    let minStationDist = Infinity;
    for (const key of stationGroups.keys()) {
      const [sx, sz] = key.split(',').map(Number);
      const dist = Math.max(Math.abs(sx - tileX), Math.abs(sz - tileZ));
      if (dist < minStationDist) minStationDist = dist;
    }
    if (minStationDist <= 10) value += Math.max(0, 30 - minStationDist * 3);

    // 公園・行政施設の近さボーナス
    for (const key of parkGroups.keys()) {
      const [px, pz] = key.split(',').map(Number);
      const dist = Math.max(Math.abs(px - tileX), Math.abs(pz - tileZ));
      if (dist <= 3) value += Math.max(0, 12 - dist * 4);
    }
    for (const key of govGroups.keys()) {
      const [gx, gz] = key.split(',').map(Number);
      const dist = Math.max(Math.abs(gx - tileX), Math.abs(gz - tileZ));
      if (dist <= 4) value += Math.max(0, 16 - dist * 4);
    }

    // 隣接する高架下：建物ブロックがあればボーナス、未利用ならペナルティ
    const neighbors = [
      [tileX - 1, tileZ], [tileX + 1, tileZ], [tileX, tileZ - 1], [tileX, tileZ + 1],
    ];
    neighbors.forEach(([nx, nz]) => {
      if (nx < 0 || nx >= GRID_SIZE || nz < 0 || nz >= GRID_SIZE) return;
      if (railTiles[nx][nz]) {
        value += buildingLevel[nx][nz] > 0 ? 4 : -2;
      }
    });

    // 工業地帯への近さペナルティ
    let minIndustrialDist = Infinity;
    for (let dx = -3; dx <= 3; dx++) {
      for (let dz = -3; dz <= 3; dz++) {
        const nx = tileX + dx;
        const nz = tileZ + dz;
        if (nx < 0 || nx >= GRID_SIZE || nz < 0 || nz >= GRID_SIZE) continue;
        if (tileTypes[nx][nz] === 'industrial') {
          const dist = Math.max(Math.abs(dx), Math.abs(dz));
          if (dist < minIndustrialDist) minIndustrialDist = dist;
        }
      }
    }
    if (minIndustrialDist <= 3) value -= Math.max(0, (4 - minIndustrialDist) * 8);

    return Math.max(0, Math.round(value));
  }

  // --- 地価ヒートマップ ---
  const heatmapGeometry = new THREE.PlaneGeometry(TILE_SIZE * 0.98, TILE_SIZE * 0.98);
  let heatmapGroup = null;
  let heatmapVisible = false;

  function landValueColor(value) {
    const t = THREE.MathUtils.clamp(value / 120, 0, 1);
    const color = new THREE.Color();
    if (t < 0.5) {
      color.lerpColors(new THREE.Color(0xe53935), new THREE.Color(0xfdd835), t / 0.5);
    } else {
      color.lerpColors(new THREE.Color(0xfdd835), new THREE.Color(0x4caf50), (t - 0.5) / 0.5);
    }
    return color;
  }

  function showHeatmap() {
    heatmapGroup = new THREE.Group();
    for (let x = 0; x < GRID_SIZE; x++) {
      for (let z = 0; z < GRID_SIZE; z++) {
        if (riverTiles[x][z]) continue;
        const material = new THREE.MeshBasicMaterial({
          color: landValueColor(computeLandValue(x, z)),
          transparent: true,
          opacity: 0.55,
          fog: false,
        });
        const mesh = new THREE.Mesh(heatmapGeometry, material);
        mesh.rotation.x = -Math.PI / 2;
        const center = tileToWorldCenter(x, z);
        mesh.position.set(center.x, 0.09, center.z);
        heatmapGroup.add(mesh);
      }
    }
    scene.add(heatmapGroup);
  }

  function hideHeatmap() {
    if (!heatmapGroup) return;
    heatmapGroup.children.forEach((mesh) => mesh.material.dispose());
    scene.remove(heatmapGroup);
    heatmapGroup = null;
  }

  function refreshHeatmapIfVisible() {
    if (!heatmapVisible) return;
    hideHeatmap();
    showHeatmap();
  }

  function toggleHeatmap() {
    heatmapVisible = !heatmapVisible;
    if (heatmapVisible) showHeatmap();
    else hideHeatmap();
    document.getElementById('heatmap-toggle-btn').classList.toggle('active', heatmapVisible);
  }

  function addZone(tileX, tileZ, zoneType) {
    if (riverTiles[tileX][tileZ]) return;
    if (tileTypes[tileX][tileZ] === 'road') return;
    if (tileTypes[tileX][tileZ] === zoneType) return;

    const key = tileKey(tileX, tileZ);
    if (parkGroups.has(key) || govGroups.has(key)) return;
    const existing = zoneMeshes.get(key);
    if (existing) {
      scene.remove(existing);
      zoneMeshes.delete(key);
    }
    if (buildingLevel[tileX][tileZ] > 0) removeBuilding(tileX, tileZ);

    tileTypes[tileX][tileZ] = zoneType;
    const center = tileToWorldCenter(tileX, tileZ);
    const mesh = new THREE.Mesh(zoneGeometry, zoneMaterials[zoneType]);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(center.x, 0.03, center.z);
    scene.add(mesh);
    zoneMeshes.set(key, mesh);
  }

  function removeZone(tileX, tileZ) {
    const key = tileKey(tileX, tileZ);
    const mesh = zoneMeshes.get(key);
    if (mesh) {
      scene.remove(mesh);
      zoneMeshes.delete(key);
    }
    if (buildingLevel[tileX][tileZ] > 0) removeBuilding(tileX, tileZ);
    tileTypes[tileX][tileZ] = 'empty';
  }

  // --- ツールパレット ---
  let currentTool = 'select';
  const toolButtons = document.querySelectorAll('.tool-btn');
  toolButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      currentTool = btn.dataset.tool;
      toolButtons.forEach((b) => b.classList.toggle('active', b === btn));
      controls.enableRotate = currentTool === 'select';
    });
  });

  function applyTool(tileX, tileZ) {
    if (currentTool === 'road') {
      addRoad(tileX, tileZ);
    } else if (currentTool === 'rail') {
      addRail(tileX, tileZ);
    } else if (currentTool === 'station') {
      addStation(tileX, tileZ);
    } else if (currentTool === 'park') {
      addPark(tileX, tileZ);
    } else if (currentTool === 'gov') {
      addGov(tileX, tileZ);
    } else if (ZONE_TYPES.includes(currentTool)) {
      addZone(tileX, tileZ, currentTool);
    } else if (currentTool === 'bulldoze') {
      const key = tileKey(tileX, tileZ);
      if (stationGroups.has(key)) {
        removeStation(tileX, tileZ);
      } else if (parkGroups.has(key)) {
        removePark(tileX, tileZ);
      } else if (govGroups.has(key)) {
        removeGov(tileX, tileZ);
      } else if (railTiles[tileX][tileZ]) {
        removeRail(tileX, tileZ);
      } else if (ZONE_TYPES.includes(tileTypes[tileX][tileZ])) {
        removeZone(tileX, tileZ);
      } else if (tileTypes[tileX][tileZ] === 'road') {
        removeRoad(tileX, tileZ);
      }
    }
  }

  // --- 川（先に生成し、道路・高架の初期配置がそれを考慮できるようにする） ---
  generateRiver();

  // --- 外部接続道路（初期配置） ---
  for (let x = 0; x < 4; x++) {
    addRoad(x, Math.floor(GRID_SIZE / 2));
  }

  // --- 鉄道の入り口（枠外からランダムな位置に自動生成） ---
  const RAIL_ENTRANCE_LENGTH = 4;

  function placeRandomRailEntrance() {
    const edge = ['top', 'bottom', 'left', 'right'][Math.floor(Math.random() * 4)];
    const pos = Math.floor(Math.random() * GRID_SIZE);
    let x;
    let z;
    let stepX;
    let stepZ;
    if (edge === 'top') { x = pos; z = 0; stepX = 0; stepZ = 1; }
    else if (edge === 'bottom') { x = pos; z = GRID_SIZE - 1; stepX = 0; stepZ = -1; }
    else if (edge === 'left') { x = 0; z = pos; stepX = 1; stepZ = 0; }
    else { x = GRID_SIZE - 1; z = pos; stepX = -1; stepZ = 0; }

    for (let i = 0; i < RAIL_ENTRANCE_LENGTH; i++) {
      const tx = x + stepX * i;
      const tz = z + stepZ * i;
      if (tx < 0 || tx >= GRID_SIZE || tz < 0 || tz >= GRID_SIZE) break;
      addRail(tx, tz);
    }
  }

  placeRandomRailEntrance();

  // --- 交通（車・歩行者） ---
  const carColors = [0xe53935, 0x1e88e5, 0xfdd835, 0xf5f5f5, 0x43a047, 0x8e24aa];
  const carGeometry = new THREE.BoxGeometry(0.4, 0.22, 0.62);
  const carMaterials = carColors.map((c) => new THREE.MeshLambertMaterial({ color: c }));

  const pedestrianColors = [0xff6f61, 0x6fa8dc, 0xffd166, 0x8ac926, 0xcdb4db];
  const pedestrianBodyGeometry = new THREE.BoxGeometry(0.14, 0.26, 0.14);
  const pedestrianHeadGeometry = new THREE.SphereGeometry(0.08, 6, 6);
  const pedestrianMaterials = pedestrianColors.map((c) => new THREE.MeshLambertMaterial({ color: c }));
  const pedestrianHeadMaterial = new THREE.MeshLambertMaterial({ color: 0xffdbb0 });

  const TARGET_CARS = 8;
  const TARGET_PEDESTRIANS = 6;
  const CAR_SPEED = 1.6; // タイル / 秒
  const PEDESTRIAN_SPEED = 0.5;
  const cars = [];
  const pedestrians = [];

  function getRoadNeighbors(tileX, tileZ) {
    const candidates = [
      [tileX - 1, tileZ],
      [tileX + 1, tileZ],
      [tileX, tileZ - 1],
      [tileX, tileZ + 1],
    ];
    return candidates.filter(([nx, nz]) => (
      nx >= 0 && nx < GRID_SIZE && nz >= 0 && nz < GRID_SIZE && tileTypes[nx][nz] === 'road'
    ));
  }

  function findRandomRoadStart() {
    const roadTiles = [];
    for (let x = 0; x < GRID_SIZE; x++) {
      for (let z = 0; z < GRID_SIZE; z++) {
        if (tileTypes[x][z] === 'road' && getRoadNeighbors(x, z).length > 0) {
          roadTiles.push([x, z]);
        }
      }
    }
    if (roadTiles.length === 0) return null;
    const [x, z] = roadTiles[Math.floor(Math.random() * roadTiles.length)];
    const neighbors = getRoadNeighbors(x, z);
    const next = neighbors[Math.floor(Math.random() * neighbors.length)];
    return { current: [x, z], next };
  }

  function roadSurfaceY(tileX, tileZ) {
    return riverTiles[tileX][tileZ] ? BRIDGE_HEIGHT : 0.08;
  }

  function createCar() {
    const mesh = new THREE.Mesh(carGeometry, carMaterials[Math.floor(Math.random() * carMaterials.length)]);
    scene.add(mesh);
    return mesh;
  }

  function createPedestrian() {
    const group = new THREE.Group();
    const body = new THREE.Mesh(
      pedestrianBodyGeometry,
      pedestrianMaterials[Math.floor(Math.random() * pedestrianMaterials.length)]
    );
    body.position.y = 0.13;
    group.add(body);
    const head = new THREE.Mesh(pedestrianHeadGeometry, pedestrianHeadMaterial);
    head.position.y = 0.3;
    group.add(head);
    scene.add(group);
    return group;
  }

  function spawnAgent(pool, createMesh, speed, sideOffset) {
    const start = findRandomRoadStart();
    if (!start) return;
    pool.push({
      mesh: createMesh(),
      currentTile: start.current,
      nextTile: start.next,
      progress: Math.random(),
      speed,
      sideOffset,
    });
  }

  function updateAgent(agent, delta) {
    agent.progress += delta * agent.speed;
    while (agent.progress >= 1) {
      const arrivedFrom = agent.currentTile;
      const arrivedAt = agent.nextTile;
      const neighbors = getRoadNeighbors(arrivedAt[0], arrivedAt[1]);
      let candidates = neighbors.filter(([nx, nz]) => !(nx === arrivedFrom[0] && nz === arrivedFrom[1]));
      if (candidates.length === 0) candidates = neighbors;
      if (candidates.length === 0) {
        const restart = findRandomRoadStart();
        if (!restart) return;
        agent.currentTile = restart.current;
        agent.nextTile = restart.next;
        agent.progress = 0;
        continue;
      }
      agent.currentTile = arrivedAt;
      agent.nextTile = candidates[Math.floor(Math.random() * candidates.length)];
      agent.progress -= 1;
    }

    const a = tileToWorldCenter(agent.currentTile[0], agent.currentTile[1]);
    const b = tileToWorldCenter(agent.nextTile[0], agent.nextTile[1]);
    const t = agent.progress;
    const dx = b.x - a.x;
    const dz = b.z - a.z;

    let offsetX = 0;
    let offsetZ = 0;
    if (agent.sideOffset) {
      const len = Math.hypot(dx, dz) || 1;
      offsetX = (-dz / len) * agent.sideOffset;
      offsetZ = (dx / len) * agent.sideOffset;
    }

    const ay = roadSurfaceY(agent.currentTile[0], agent.currentTile[1]);
    const by = roadSurfaceY(agent.nextTile[0], agent.nextTile[1]);

    agent.mesh.position.set(
      a.x + dx * t + offsetX,
      THREE.MathUtils.lerp(ay, by, t),
      a.z + dz * t + offsetZ
    );
    if (dx !== 0 || dz !== 0) {
      agent.mesh.rotation.y = Math.atan2(dx, dz);
    }
  }

  let trafficCheckTimer = 0;
  const TRAFFIC_CHECK_INTERVAL = 3;

  function updateTraffic(delta) {
    trafficCheckTimer += delta;
    if (trafficCheckTimer >= TRAFFIC_CHECK_INTERVAL) {
      trafficCheckTimer = 0;
      const targetCars = Math.min(TARGET_CARS, Math.floor(roadCount / 3));
      const targetPedestrians = Math.min(TARGET_PEDESTRIANS, Math.floor(roadCount / 3));
      if (cars.length < targetCars) spawnAgent(cars, createCar, CAR_SPEED, 0.18);
      if (pedestrians.length < targetPedestrians) spawnAgent(pedestrians, createPedestrian, PEDESTRIAN_SPEED, 0.4);
    }
    cars.forEach((car) => updateAgent(car, delta));
    pedestrians.forEach((ped) => updateAgent(ped, delta));
  }

  // --- 電車（高架網に沿って移動） ---
  const TRAIN_Y = RAIL_HEIGHT + 0.075 + 0.175;
  const trainBodyGeometry = new THREE.BoxGeometry(0.5, 0.35, 0.85);
  const trainBodyMaterial = new THREE.MeshLambertMaterial({ color: 0xf5f5f5 });
  const trainStripeGeometry = new THREE.BoxGeometry(0.52, 0.08, 0.87);
  const trainStripeMaterial = new THREE.MeshLambertMaterial({ color: 0x1565c0 });

  const TARGET_TRAINS = 3;
  const TRAIN_SPEED = 2.5; // タイル / 秒
  const trains = [];

  function getRailNeighbors(tileX, tileZ) {
    const candidates = [
      [tileX - 1, tileZ],
      [tileX + 1, tileZ],
      [tileX, tileZ - 1],
      [tileX, tileZ + 1],
    ];
    return candidates.filter(([nx, nz]) => (
      nx >= 0 && nx < GRID_SIZE && nz >= 0 && nz < GRID_SIZE && railTiles[nx][nz]
    ));
  }

  function findRandomRailStart() {
    const railList = [];
    for (let x = 0; x < GRID_SIZE; x++) {
      for (let z = 0; z < GRID_SIZE; z++) {
        if (railTiles[x][z] && getRailNeighbors(x, z).length > 0) {
          railList.push([x, z]);
        }
      }
    }
    if (railList.length === 0) return null;
    const [x, z] = railList[Math.floor(Math.random() * railList.length)];
    const neighbors = getRailNeighbors(x, z);
    const next = neighbors[Math.floor(Math.random() * neighbors.length)];
    return { current: [x, z], next };
  }

  function createTrain() {
    const group = new THREE.Group();
    const body = new THREE.Mesh(trainBodyGeometry, trainBodyMaterial);
    group.add(body);
    const stripe = new THREE.Mesh(trainStripeGeometry, trainStripeMaterial);
    stripe.position.y = 0.14;
    group.add(stripe);
    scene.add(group);
    return group;
  }

  let trafficCheckTimer2 = 0;

  function updateTrainAgent(agent, delta) {
    agent.progress += delta * agent.speed;
    while (agent.progress >= 1) {
      const arrivedFrom = agent.currentTile;
      const arrivedAt = agent.nextTile;
      const neighbors = getRailNeighbors(arrivedAt[0], arrivedAt[1]);
      let candidates = neighbors.filter(([nx, nz]) => !(nx === arrivedFrom[0] && nz === arrivedFrom[1]));
      if (candidates.length === 0) candidates = neighbors;
      if (candidates.length === 0) {
        const restart = findRandomRailStart();
        if (!restart) return;
        agent.currentTile = restart.current;
        agent.nextTile = restart.next;
        agent.progress = 0;
        continue;
      }
      agent.currentTile = arrivedAt;
      agent.nextTile = candidates[Math.floor(Math.random() * candidates.length)];
      agent.progress -= 1;
    }

    const a = tileToWorldCenter(agent.currentTile[0], agent.currentTile[1]);
    const b = tileToWorldCenter(agent.nextTile[0], agent.nextTile[1]);
    const t = agent.progress;
    const dx = b.x - a.x;
    const dz = b.z - a.z;

    agent.mesh.position.set(a.x + dx * t, TRAIN_Y, a.z + dz * t);
    if (dx !== 0 || dz !== 0) {
      agent.mesh.rotation.y = Math.atan2(dx, dz);
    }
  }

  function updateTrains(delta) {
    trafficCheckTimer2 += delta;
    if (trafficCheckTimer2 >= TRAFFIC_CHECK_INTERVAL) {
      trafficCheckTimer2 = 0;
      const targetTrains = Math.min(TARGET_TRAINS, Math.floor(railCount / 6));
      if (trains.length < targetTrains) {
        const start = findRandomRailStart();
        if (start) {
          trains.push({
            mesh: createTrain(),
            currentTile: start.current,
            nextTile: start.next,
            progress: Math.random(),
            speed: TRAIN_SPEED,
          });
        }
      }
    }
    trains.forEach((train) => updateTrainAgent(train, delta));
  }

  // --- タイルクリック／ドラッグ配置判定 ---
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();

  const highlightGeometry = new THREE.PlaneGeometry(TILE_SIZE, TILE_SIZE);
  const highlightMaterial = new THREE.MeshBasicMaterial({
    color: 0xffee55,
    transparent: true,
    opacity: 0.5,
  });
  const highlight = new THREE.Mesh(highlightGeometry, highlightMaterial);
  highlight.rotation.x = -Math.PI / 2;
  highlight.position.y = 0.02;
  highlight.visible = false;
  scene.add(highlight);

  function worldToTile(point) {
    const half = MAP_LENGTH / 2;
    const tileX = Math.floor((point.x + half) / TILE_SIZE);
    const tileZ = Math.floor((point.z + half) / TILE_SIZE);
    return { tileX, tileZ };
  }

  function tileToWorldCenter(tileX, tileZ) {
    const half = MAP_LENGTH / 2;
    return {
      x: tileX * TILE_SIZE - half + TILE_SIZE / 2,
      z: tileZ * TILE_SIZE - half + TILE_SIZE / 2,
    };
  }

  function pickTile(clientX, clientY) {
    pointer.x = (clientX / window.innerWidth) * 2 - 1;
    pointer.y = -(clientY / window.innerHeight) * 2 + 1;

    raycaster.setFromCamera(pointer, camera);
    const intersects = raycaster.intersectObject(ground);
    if (intersects.length === 0) return null;

    const { tileX, tileZ } = worldToTile(intersects[0].point);
    if (tileX < 0 || tileX >= GRID_SIZE || tileZ < 0 || tileZ >= GRID_SIZE) return null;
    return { tileX, tileZ };
  }

  function showHighlight(tileX, tileZ) {
    const center = tileToWorldCenter(tileX, tileZ);
    highlight.position.set(center.x, 0.02, center.z);
    highlight.visible = true;
  }

  const ZONE_LABELS = { residential: '住宅', commercial: '商業', industrial: '工業' };

  function describeTile(tileX, tileZ) {
    const base = `タイル: (${tileX}, ${tileZ})`;
    const type = tileTypes[tileX][tileZ];
    const parts = [base];
    if (type === 'road') parts.push('道路');
    else if (ZONE_TYPES.includes(type)) {
      const level = buildingLevel[tileX][tileZ];
      parts.push(level > 0 ? `${ZONE_LABELS[type]} Lv.${level}` : `${ZONE_LABELS[type]}（未建築）`);
    }
    if (railTiles[tileX][tileZ]) parts.push('高架');
    if (stationGroups.has(tileKey(tileX, tileZ))) parts.push('駅');
    if (parkGroups.has(tileKey(tileX, tileZ))) parts.push('公園');
    if (govGroups.has(tileKey(tileX, tileZ))) parts.push('行政施設');
    if (riverTiles[tileX][tileZ]) parts.push('川');
    if (!riverTiles[tileX][tileZ]) parts.push(`地価 ¥${computeLandValue(tileX, tileZ)}`);
    return parts.join(' / ');
  }

  let dragStart = null;
  let isPainting = false;
  let lastPaintedKey = null;

  function onPointerDown(event) {
    if (event.button !== 0) return;
    if (currentTool === 'select') {
      dragStart = { x: event.clientX, y: event.clientY };
      return;
    }
    isPainting = true;
    lastPaintedKey = null;
    const tile = pickTile(event.clientX, event.clientY);
    if (tile) {
      applyTool(tile.tileX, tile.tileZ);
      showHighlight(tile.tileX, tile.tileZ);
      lastPaintedKey = tileKey(tile.tileX, tile.tileZ);
    }
  }

  function onPointerMove(event) {
    if (!isPainting) return;
    const tile = pickTile(event.clientX, event.clientY);
    if (!tile) return;
    const key = tileKey(tile.tileX, tile.tileZ);
    if (key === lastPaintedKey) return;
    lastPaintedKey = key;
    applyTool(tile.tileX, tile.tileZ);
    showHighlight(tile.tileX, tile.tileZ);
  }

  function onPointerUp(event) {
    if (event.button !== 0) return;
    if (isPainting) {
      isPainting = false;
      lastPaintedKey = null;
      return;
    }
    if (!dragStart) return;
    const dx = event.clientX - dragStart.x;
    const dy = event.clientY - dragStart.y;
    dragStart = null;
    // ドラッグ（カメラ回転）とクリックを区別する
    if (Math.hypot(dx, dy) > 4) return;

    const tile = pickTile(event.clientX, event.clientY);
    if (!tile) return;
    showHighlight(tile.tileX, tile.tileZ);
    tileInfoEl.textContent = describeTile(tile.tileX, tile.tileZ);
  }

  renderer.domElement.addEventListener('pointerdown', onPointerDown);
  renderer.domElement.addEventListener('pointermove', onPointerMove);
  renderer.domElement.addEventListener('pointerup', onPointerUp);
  renderer.domElement.addEventListener('contextmenu', (e) => e.preventDefault());

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  // HUDの高さは内容量で変わるため、ツールパレットが被らないよう実測して追従させる
  const hudEl = document.getElementById('hud');
  const updateHudBottom = () => {
    document.documentElement.style.setProperty('--hud-bottom', `${hudEl.getBoundingClientRect().bottom}px`);
  };
  new ResizeObserver(updateHudBottom).observe(hudEl);
  updateHudBottom();

  window.addEventListener('beforeunload', saveGame);

  // --- セーブ／ロード（localStorage） ---
  const SAVE_KEY = 'citySimSaveV1';

  function serializeState() {
    return {
      version: 1,
      tileTypes,
      railTiles,
      riverTiles,
      buildingLevel,
      stations: Array.from(stationGroups.keys()),
      parks: Array.from(parkGroups.keys()),
      govs: Array.from(govGroups.keys()),
      streetlights: Array.from(streetlightGroups.keys()),
      funds,
      debt,
      gameDate: { year: gameDate.year, month: gameDate.month },
      dayTime,
    };
  }

  function saveGame() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(serializeState()));
      return true;
    } catch (e) {
      return false;
    }
  }

  function clearSceneObjects() {
    roadMeshes.forEach((m) => scene.remove(m));
    roadMeshes.clear();
    railGroups.forEach((g) => scene.remove(g));
    railGroups.clear();
    riverMeshes.forEach((m) => scene.remove(m));
    riverMeshes.clear();
    bridgePillars.forEach((p) => scene.remove(p));
    bridgePillars.clear();
    zoneMeshes.forEach((m) => scene.remove(m));
    zoneMeshes.clear();
    buildingMeshes.forEach((m) => scene.remove(m));
    buildingMeshes.clear();
    stationGroups.forEach((g) => scene.remove(g));
    stationGroups.clear();
    parkGroups.forEach((g) => scene.remove(g));
    parkGroups.clear();
    govGroups.forEach((g) => scene.remove(g));
    govGroups.clear();
    streetlightGroups.forEach(({ group, light }) => {
      scene.remove(group);
      scene.remove(light);
    });
    streetlightGroups.clear();
    cars.forEach((c) => scene.remove(c.mesh));
    cars.length = 0;
    pedestrians.forEach((p) => scene.remove(p.mesh));
    pedestrians.length = 0;
    trains.forEach((t) => scene.remove(t.mesh));
    trains.length = 0;
    if (heatmapVisible) {
      hideHeatmap();
      heatmapVisible = false;
      document.getElementById('heatmap-toggle-btn').classList.remove('active');
    }

    for (let x = 0; x < GRID_SIZE; x++) {
      for (let z = 0; z < GRID_SIZE; z++) {
        tileTypes[x][z] = 'empty';
        railTiles[x][z] = false;
        riverTiles[x][z] = false;
        buildingLevel[x][z] = 0;
      }
    }
    roadCount = 0;
    railCount = 0;
  }

  function applyLoadedState(data) {
    clearSceneObjects();
    restoringState = true;
    funds = Number.MAX_SAFE_INTEGER;

    for (let x = 0; x < GRID_SIZE; x++) {
      for (let z = 0; z < GRID_SIZE; z++) {
        if (data.riverTiles[x][z]) markRiverTile(x, z);
      }
    }

    for (let x = 0; x < GRID_SIZE; x++) {
      for (let z = 0; z < GRID_SIZE; z++) {
        const t = data.tileTypes[x][z];
        if (t === 'road') addRoad(x, z);
        else if (ZONE_TYPES.includes(t)) addZone(x, z, t);
      }
    }

    for (let x = 0; x < GRID_SIZE; x++) {
      for (let z = 0; z < GRID_SIZE; z++) {
        const level = data.buildingLevel[x][z];
        const t = data.tileTypes[x][z];
        if (level > 0 && ZONE_TYPES.includes(t)) setBuilding(x, z, t, level);
      }
    }

    for (let x = 0; x < GRID_SIZE; x++) {
      for (let z = 0; z < GRID_SIZE; z++) {
        if (data.railTiles[x][z]) addRail(x, z);
      }
    }

    (data.stations || []).forEach((key) => {
      const [x, z] = key.split(',').map(Number);
      addStation(x, z);
    });
    (data.parks || []).forEach((key) => {
      const [x, z] = key.split(',').map(Number);
      addPark(x, z);
    });
    (data.govs || []).forEach((key) => {
      const [x, z] = key.split(',').map(Number);
      addGov(x, z);
    });
    (data.streetlights || []).forEach((key) => {
      const [x, z] = key.split(',').map(Number);
      addStreetlight(x, z);
    });

    restoringState = false;
    funds = data.funds;
    debt = data.debt;
    if (data.gameDate) {
      gameDate.year = data.gameDate.year;
      gameDate.month = data.gameDate.month;
    }
    if (typeof data.dayTime === 'number') dayTime = data.dayTime;

    recomputeStats();
    updateDayNight();
    updateHud();
  }

  function loadGame() {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return false;
    let data;
    try {
      data = JSON.parse(raw);
    } catch (e) {
      return false;
    }
    applyLoadedState(data);
    return true;
  }

  let lastFrameTime = performance.now();
  const TICK_INTERVAL = 2; // 1ヶ月あたりの実時間（秒）@ 1x
  let tickAccumulator = 0;

  function animate() {
    requestAnimationFrame(animate);
    const now = performance.now();
    const delta = (now - lastFrameTime) / 1000;
    lastFrameTime = now;

    updateArrowPan(delta);
    updateKeyboardRotate(delta);

    if (simSpeed > 0) {
      tickAccumulator += delta * simSpeed;
      while (tickAccumulator >= TICK_INTERVAL) {
        tickAccumulator -= TICK_INTERVAL;
        simulateMonthTick();
      }

      dayTime = (dayTime + (delta * simSpeed) / DAY_CYCLE_SECONDS) % 1;
      updateDayNight();

      updateTraffic(delta * simSpeed);
      updateTrains(delta * simSpeed);
    }

    controls.update();
    renderer.render(scene, camera);
  }

  loadGame(); // セーブデータがあれば、初期生成したマップを上書きして復元する
  updateDayNight();
  animate();
})();
