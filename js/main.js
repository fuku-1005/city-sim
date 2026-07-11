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

  // --- 地面グリッド ---
  const groundGeometry = new THREE.PlaneGeometry(MAP_LENGTH, MAP_LENGTH);
  const groundMaterial = new THREE.MeshLambertMaterial({ color: 0x2e5233 });
  const ground = new THREE.Mesh(groundGeometry, groundMaterial);
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);

  const gridHelper = new THREE.GridHelper(MAP_LENGTH, GRID_SIZE, 0x88ccaa, 0x557766);
  gridHelper.position.y = 0.01;
  scene.add(gridHelper);

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
  controls.minDistance = 5;
  controls.maxDistance = 60;
  controls.maxPolarAngle = Math.PI / 2 - 0.05;
  controls.update();

  // --- タイルクリック判定 ---
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

  let dragStart = null;

  function onPointerDown(event) {
    if (event.button !== 0) return;
    dragStart = { x: event.clientX, y: event.clientY };
  }

  function onPointerUp(event) {
    if (event.button !== 0 || !dragStart) return;
    const dx = event.clientX - dragStart.x;
    const dy = event.clientY - dragStart.y;
    dragStart = null;
    // ドラッグ（カメラ回転）とクリックを区別する
    if (Math.hypot(dx, dy) > 4) return;

    pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
    pointer.y = -(event.clientY / window.innerHeight) * 2 + 1;

    raycaster.setFromCamera(pointer, camera);
    const intersects = raycaster.intersectObject(ground);
    if (intersects.length === 0) return;

    const { tileX, tileZ } = worldToTile(intersects[0].point);
    if (tileX < 0 || tileX >= GRID_SIZE || tileZ < 0 || tileZ >= GRID_SIZE) return;

    const center = tileToWorldCenter(tileX, tileZ);
    highlight.position.set(center.x, 0.02, center.z);
    highlight.visible = true;

    tileInfoEl.textContent = `タイル: (${tileX}, ${tileZ})`;
  }

  renderer.domElement.addEventListener('pointerdown', onPointerDown);
  renderer.domElement.addEventListener('pointerup', onPointerUp);

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
  }
  animate();
})();
