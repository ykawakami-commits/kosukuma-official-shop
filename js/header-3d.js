import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

let RAPIER = null;

const MODEL_SRC = 'https://kosukuma-official-shop.pages.dev/assets/3d/konpeito.glb';
const MODEL_SCALE_DESKTOP = 2.2;
const MODEL_SCALE_MOBILE = 0.07;   // スマホ: 微粒

const KONPEITO_PALETTE = [
  { color: '#5cc8e8' },  // 水色（鮮やか）
  { color: '#6dd87a' },  // 緑（鮮やか）
  { color: '#f07aa0' },  // ピンク（鮮やか）
  { color: '#f0a050' },  // オレンジ（鮮やか）
  { color: '#f0d848' },  // 黄色（鮮やか）
  { color: '#e8e0d8' },  // 白（少し温かみ）
];

const DESKTOP_COUNT = 50;
const MOBILE_BREAKPOINT = 768;
const MOBILE_COUNT = 200;

// ── 水中物理（クラゲモード） ──
const SPRING_K = 5.0;            // ソフトバネ — ふわっと戻る（急に引き戻さない）
const SPRING_FAR = 15.0;         // 遠距離バネ — 飛びすぎた時だけ強く引く
const SPRING_FAR_THRESHOLD = 2.0;// この距離超えたらFAR側が効く
const DAMPING = 1.2;             // 低粘性 — 漂い続ける（クラゲ）
const ANGULAR_DAMPING = 0.8;     // 回転もゆっくり減衰（クラゲのヒレ）
const MAX_ANGULAR_SPEED = 3.0;   // 角速度上限
const BALL_RADIUS = 0.8;
const RESTITUTION = 0.15;        // 衝突の弾み
const MOUSE_HIT_RADIUS = 1.5;    // マウスの打撃範囲
const MOUSE_HIT_FORCE = 18.0;    // 打撃インパクト（バネ弱いので下げても飛ぶ）
const MOUSE_BODY_RADIUS = 0.6;
const DRIFT_FORCE = 0.18;        // 水流の揺らぎ（クラゲの漂い感を出す）
const FIXED_DT = 1 / 120;

// ── モバイル重力物理 ──
const MOBILE_BALL_RADIUS = 0.035;
const MOBILE_DAMPING = 0.15;      // ほぼ無抵抗 — 瞬時に反応
const MOBILE_ANGULAR_DAMPING = 0.3;
const MOBILE_RESTITUTION = 0.7;   // 壁で弾む
const MOBILE_GRAVITY = 40.0;      // 超重力 — 微傾きで即ザーッと流れる
const MOBILE_MASS = 0.8;          // 超軽量 — 瞬発力MAX
const MOBILE_COUNT_ADJUSTED = 200; // 微粒たっぷり

let _instance = null;

function rand(a, b) { return a + Math.random() * (b - a); }

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

class Header3D {
  constructor(container) {
    this.container = container;
    this.objects = [];
    this.instancedMeshes = [];
    this.world = null;
    this.mouseBody = null;
    this._accumulator = 0;
    this.isMobile = window.innerWidth <= MOBILE_BREAKPOINT;

    // Mouse state
    this.mouse = new THREE.Vector2(9999, 9999);
    this.mouseWorld = new THREE.Vector3();
    this.lastMouseWorld = new THREE.Vector3();
    this.mouseDelta = new THREE.Vector3();
    this.mouseInited = false;

    this.raycaster = new THREE.Raycaster();
    this.groundPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
    this._planeTarget = new THREE.Vector3();
    this._mat = new THREE.Matrix4();
    this._sc = new THREE.Vector3();
    this._forceVec = new THREE.Vector3();

    this.isVisible = true;
    this.animating = true;
    this.clock = new THREE.Clock();
    this.ready = false;
    this._rafId = 0;
    this._boundAnimate = () => this._tick();

    // Mouse trail state
    this._trail = [];
    this._trailCanvas = null;
    this._trailCtx = null;

    // Gyroscope state (mobile tilt)
    this._gyroX = 0;
    this._gyroY = 0;
    this._gyroRaw = { gamma: 0, beta: 0 };  // 生の角度（world.gravity計算用）
    this._gyroEnabled = false;

    this.init();
    if (!this.ready) return;
    this._initTrailCanvas();
    this.loadModels();
    this.setupEvents();
    this._tick();
  }

  _getRenderSize() {
    if (this.isMobile) {
      return { width: window.innerWidth, height: window.innerHeight };
    }
    const rect = this.container.getBoundingClientRect();
    return { width: rect.width, height: rect.height };
  }

  init() {
    const { width, height } = this._getRenderSize();
    if (width === 0 || height === 0) return;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 100);
    this.camera.position.set(0, 0, 5);

    const canvas = this.container.querySelector('#header-3d-canvas');
    if (!canvas) return;

    this.renderer = new THREE.WebGLRenderer({
      canvas, alpha: true, antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2.0));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;

    this.scene.add(new THREE.AmbientLight(0xfff8f0, 0.4));
    // メインキーライト — シャープなハイライトを作る
    const dir = new THREE.DirectionalLight(0xffffff, 1.5);
    dir.position.set(3, 4, 6);
    this.scene.add(dir);
    // フィルライト — 影を柔らかく
    const fill = new THREE.DirectionalLight(0xe8f0ff, 0.5);
    fill.position.set(-4, -1, 3);
    this.scene.add(fill);
    // リムライト — 輪郭を浮かせる
    const rim = new THREE.DirectionalLight(0xffe0f0, 0.7);
    rim.position.set(0, -3, -3);
    this.scene.add(rim);

    this._setupEnvMap();

    // カーソル追従ライト（近くの金平糖がふわっと光る）
    this._cursorLight = new THREE.PointLight(0xfff8f0, 0, 8, 1.5);
    this._cursorLight.position.set(0, 0, 2);
    this.scene.add(this._cursorLight);

    // Rapier world: モバイルは重力あり（ジャイロで動的更新）、デスクトップはゼロ重力
    const initGravity = this.isMobile
      ? new RAPIER.Vector3(0, -MOBILE_GRAVITY, 0)  // 初期: 下向き重力（手持ち状態）
      : new RAPIER.Vector3(0, 0, 0);
    this.world = new RAPIER.World(initGravity);
    this.world.timestep = FIXED_DT;

    // Mouse kinematic body (canxerian: kinematicPositionBased)
    const mouseBodyDesc = RAPIER.RigidBodyDesc.kinematicPositionBased()
      .setTranslation(0, 0, -50);
    this.mouseBody = this.world.createRigidBody(mouseBodyDesc);
    this.world.createCollider(
      RAPIER.ColliderDesc.ball(MOUSE_BODY_RADIUS).setRestitution(0.5),
      this.mouseBody
    );

    this.ready = true;
  }

  _initTrailCanvas() {
    const c = document.createElement('canvas');
    c.id = 'header-3d-trail';
    c.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:9;';
    this.container.appendChild(c);
    const rect = this.container.getBoundingClientRect();
    c.width = rect.width * Math.min(window.devicePixelRatio, 2);
    c.height = rect.height * Math.min(window.devicePixelRatio, 2);
    this._trailCanvas = c;
    this._trailCtx = c.getContext('2d');
  }

  _setupEnvMap() {
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const envScene = new THREE.Scene();
    envScene.background = new THREE.Color(0xffffff);
    const envGeo = new THREE.SphereGeometry(5, 16, 16);
    // 明るい白系でクリアな映り込み
    const envMat = new THREE.MeshBasicMaterial({ color: 0xf8f4ef, side: THREE.BackSide });
    envScene.add(new THREE.Mesh(envGeo, envMat));
    envScene.add(new THREE.AmbientLight(0xffffff, 1.2));
    // 環境にもアクセントライトを追加（映り込みにグラデーション）
    const envDir = new THREE.DirectionalLight(0xfff0e0, 0.8);
    envDir.position.set(1, 2, 1);
    envScene.add(envDir);
    this.envMap = pmrem.fromScene(envScene, 0.02).texture;
    this.scene.environment = this.envMap;
    pmrem.dispose();
    // PMREMGenerator後にWebGL stateをリセット
    this.renderer.state.reset();
  }

  _buildKonpeitoMaterials() {
    return KONPEITO_PALETTE.map(({ color }) => {
      return new THREE.MeshPhysicalMaterial({
        color: new THREE.Color(color),
        metalness: 0.0,
        roughness: 0.25,          // 少しマットに — 色が見えるバランス
        clearcoat: 0.6,           // クリアコート控えめ
        clearcoatRoughness: 0.1,
        envMapIntensity: 0.6,     // 環境反射を抑えて固有色を出す
        sheen: 0.2,
        sheenRoughness: 0.5,
        sheenColor: new THREE.Color(color),
      });
    });
  }

  _getVisibleArea() {
    const vFov = this.camera.fov * Math.PI / 180;
    const dist = this.camera.position.z;
    const halfH = Math.tan(vFov / 2) * dist;
    const halfW = halfH * this.camera.aspect;
    return { halfW, halfH };
  }

  _createBoundaryWalls() {
    const { halfW, halfH } = this._getVisibleArea();
    const wallThick = 0.5;
    const wallDepth = 2.0;

    // ナビバーの高さ分だけ上壁を下げる（3D空間座標に変換）
    let topOffset = 0;
    if (!this.isMobile) {
      const navBar = this.container.querySelector('.header');
      if (navBar) {
        const containerRect = this.container.getBoundingClientRect();
        const navHeight = navBar.getBoundingClientRect().height;
        topOffset = (navHeight / containerRect.height) * (halfH * 2);
      }
    }

    const w = halfW;
    const hTop = halfH - topOffset;  // 上壁はナビバー分だけ下げる
    const hBot = halfH;              // 下壁はそのまま

    // 固定ボディ4面（上下左右）
    const wallDefs = [
      { x: 0, y:  hTop + wallThick, hx: w + 1, hy: wallThick, hz: wallDepth },  // 上（ナビバー下端）
      { x: 0, y: -hBot - wallThick, hx: w + 1, hy: wallThick, hz: wallDepth },  // 下
      { x: -w - wallThick, y: 0, hx: wallThick, hy: halfH + 1, hz: wallDepth }, // 左
      { x:  w + wallThick, y: 0, hx: wallThick, hy: halfH + 1, hz: wallDepth }, // 右
    ];

    this._wallBodies = [];
    for (const def of wallDefs) {
      const bodyDesc = RAPIER.RigidBodyDesc.fixed().setTranslation(def.x, def.y, 0);
      const body = this.world.createRigidBody(bodyDesc);
      this.world.createCollider(
        RAPIER.ColliderDesc.cuboid(def.hx, def.hy, def.hz).setRestitution(MOBILE_RESTITUTION),
        body
      );
      this._wallBodies.push(body);
    }
  }

  loadModels() {
    const loader = new GLTFLoader();
    const isMobile = window.innerWidth <= MOBILE_BREAKPOINT;
    const count = isMobile ? MOBILE_COUNT : DESKTOP_COUNT;

    loader.load(MODEL_SRC, (gltf) => {
      const original = gltf.scene;
      const box = new THREE.Box3().setFromObject(original);
      const size = box.getSize(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.y, size.z) || 1;
      const normalizeScale = 1.0 / maxDim;
      const center = box.getCenter(new THREE.Vector3());

      original.updateWorldMatrix(true, true);

      let baseGeo = null;
      original.traverse((child) => {
        if (!child.isMesh || baseGeo) return;
        baseGeo = child.geometry.clone();
        const bakeMat = new THREE.Matrix4();
        bakeMat.copy(child.matrixWorld);
        bakeMat.premultiply(new THREE.Matrix4().makeTranslation(-center.x, -center.y, -center.z));
        bakeMat.premultiply(new THREE.Matrix4().makeScale(normalizeScale, normalizeScale, normalizeScale));
        baseGeo.applyMatrix4(bakeMat);
      });
      if (!baseGeo) return;

      const materials = this._buildKonpeitoMaterials();
      const colorIndices = [];
      for (let i = 0; i < count; i++) colorIndices.push(i % materials.length);
      shuffle(colorIndices);

      const perColor = new Array(materials.length).fill(0);
      for (const ci of colorIndices) perColor[ci]++;

      const instanceCounters = new Array(materials.length).fill(0);
      const colorInstanceMap = [];

      for (let c = 0; c < materials.length; c++) {
        if (perColor[c] === 0) continue;
        const geo = baseGeo.clone();
        const im = new THREE.InstancedMesh(geo, materials[c], perColor[c]);
        im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        im.frustumCulled = false;
        this.scene.add(im);
        this.instancedMeshes.push({ mesh: im, colorIdx: c, count: perColor[c] });
      }

      // Scatter initial positions across visible area (they'll settle via collision pressure)
      const { halfW: hw, halfH: hh } = this._getVisibleArea();

      // Body-to-index lookup for raycast hit
      this._bodyHandleToIdx = new Map();

      for (let i = 0; i < count; i++) {
        const ci = colorIndices[i];
        const meshInfo = this.instancedMeshes.find(info => info.colorIdx === ci);
        colorInstanceMap.push({ meshInfo, localIdx: instanceCounters[ci]++ });

        // Initial position: scattered across visible area, Z very thin
        const bx = rand(-hw * 0.8, hw * 0.8);
        const by = rand(-hh * 0.8, hh * 0.8);
        const bz = rand(-0.05, 0.05);

        // Rapier rigid body — モバイルとデスクトップで物理パラメータ分岐
        const linDamp = this.isMobile ? MOBILE_DAMPING : DAMPING;
        const angDamp = this.isMobile ? MOBILE_ANGULAR_DAMPING : ANGULAR_DAMPING;
        const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
          .setTranslation(bx, by, bz)
          .setLinearDamping(linDamp)
          .setAngularDamping(angDamp);
        const body = this.world.createRigidBody(bodyDesc);

        const ballR = this.isMobile ? MOBILE_BALL_RADIUS : BALL_RADIUS;
        const rest = this.isMobile ? MOBILE_RESTITUTION : RESTITUTION;
        const collider = RAPIER.ColliderDesc.ball(ballR).setRestitution(rest);
        const col_ = this.world.createCollider(collider, body);
        col_.setMass(this.isMobile ? MOBILE_MASS : 3.0);

        const scaleVar = rand(0.85, 1.15);
        const modelScale = this.isMobile ? MODEL_SCALE_MOBILE : MODEL_SCALE_DESKTOP;
        const s = modelScale * scaleVar;

        const quat = new THREE.Quaternion().setFromEuler(
          new THREE.Euler(rand(0, Math.PI * 2), rand(0, Math.PI * 2), rand(0, Math.PI * 2))
        );
        body.setRotation({ x: quat.x, y: quat.y, z: quat.z, w: quat.w }, true);

        this._bodyHandleToIdx.set(body.handle, i);

        this.objects.push({
          body,
          position: new THREE.Vector3(bx, by, bz),
          quat,
          scale: s,
          breathPhase: rand(0, Math.PI * 2),
          driftPhase: rand(0, Math.PI * 20),
          breathSpeed: rand(0.5, 0.9),
          fadeIn: 1,
          fadeComplete: true,
          fadeDelay: 0,
        });
      }
      this._colorInstanceMap = colorInstanceMap;

      // Pre-simulate: 物理を空回しして平衡状態から開始
      this._presimulate();
    }, undefined, (err) => {
      console.warn('[Header3D] Failed to load konpeito:', err);
    });
  }

  setupEvents() {
    // windowレベルで捕捉 — z-index/pointer-events問題を回避
    const onMove = (e) => {
      if (this.isMobile) {
        this.mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
        this.mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
      } else {
        const rect = this.container.getBoundingClientRect();
        const cx = e.clientX, cy = e.clientY;
        if (cx >= rect.left && cx <= rect.right && cy >= rect.top && cy <= rect.bottom) {
          this.mouse.x = ((cx - rect.left) / rect.width) * 2 - 1;
          this.mouse.y = -((cy - rect.top) / rect.height) * 2 + 1;
        } else {
          this.mouse.set(9999, 9999);
          this.mouseInited = false;
        }
      }
    };

    window.addEventListener('pointermove', onMove);
    this._onTouchMove = (e) => {
      if (!e.touches.length) return;
      const t = e.touches[0];
      if (this.isMobile) {
        this.mouse.x = (t.clientX / window.innerWidth) * 2 - 1;
        this.mouse.y = -(t.clientY / window.innerHeight) * 2 + 1;
      } else {
        const rect = this.container.getBoundingClientRect();
        if (t.clientX >= rect.left && t.clientX <= rect.right && t.clientY >= rect.top && t.clientY <= rect.bottom) {
          this.mouse.x = ((t.clientX - rect.left) / rect.width) * 2 - 1;
          this.mouse.y = -((t.clientY - rect.top) / rect.height) * 2 + 1;
        }
      }
    };
    window.addEventListener('touchmove', this._onTouchMove, { passive: true });

    this._onPointerMove = onMove;

    // ジャイロスコープ（スマホ傾き）
    if (this.isMobile && window.DeviceOrientationEvent) {
      this._gyroEventCount = 0;
      this._gyroRequesting = false;  // 二重呼び出し防止フラグ

      // デバッグ表示（URLに ?gyro-debug がある時だけ表示）
      if (location.search.includes('gyro-debug')) {
        this._gyroDebug = document.createElement('div');
        this._gyroDebug.style.cssText = 'position:absolute;top:4px;left:4px;z-index:30;' +
          'background:rgba(0,0,0,0.75);color:#0f0;padding:6px 10px;border-radius:6px;' +
          'font:12px monospace;pointer-events:none;white-space:pre;line-height:1.4;';
        this._gyroDebug.textContent = 'GYRO: init...';
        this.container.appendChild(this._gyroDebug);
      }

      this._onDeviceOrientation = (e) => {
        this._gyroEventCount++;
        if (e.gamma === null && e.beta === null) return;
        if (!this._gyroEnabled) {
          this._gyroEnabled = true;
        }
        this._gyroRaw.gamma = e.gamma ?? 0;
        this._gyroRaw.beta = e.beta ?? 0;
        this._gyroX = Math.max(-1, Math.min(1, (this._gyroRaw.gamma) / 30));
        this._gyroY = Math.max(-1, Math.min(1, (this._gyroRaw.beta - 45) / 30));

        // デバッグ表示更新（10フレームに1回）
        if (this._gyroDebug && this._gyroEventCount % 10 === 0) {
          this._gyroDebug.textContent =
            `GYRO: ON (${this._gyroEventCount})\n` +
            `γ:${this._gyroRaw.gamma.toFixed(1)} β:${this._gyroRaw.beta.toFixed(1)}\n` +
            `gx:${(Math.sin(this._gyroRaw.gamma * Math.PI / 180) * 9.8).toFixed(1)} ` +
            `gy:${(-Math.sin(this._gyroRaw.beta * Math.PI / 180) * 9.8).toFixed(1)}`;
          this._gyroDebug.style.color = '#0f0';
        }
      };

      const startListening = () => {
        window.addEventListener('deviceorientation', this._onDeviceOrientation, { passive: true });
        if (this._gyroDebug) {
          this._gyroDebug.textContent = 'GYRO: listener attached\nwaiting for events...';
          this._gyroDebug.style.color = '#ff0';
        }
        setTimeout(() => {
          if (this._gyroEventCount === 0 && this._gyroDebug) {
            this._gyroDebug.textContent = 'GYRO: NO EVENTS\nsensor may be unavailable';
            this._gyroDebug.style.color = '#f44';
          }
        }, 3000);
      };

      // iOS 13+ はユーザー許可が必要
      if (typeof DeviceOrientationEvent.requestPermission === 'function') {
        if (this._gyroDebug) {
          this._gyroDebug.textContent = 'GYRO: iOS detected\nTAP to enable';
          this._gyroDebug.style.color = '#ff0';
        }
        this._showGyroPrompt();

        // ★ iOS Safari 制約: requestPermission() はユーザージェスチャーの
        //    同期コールスタック内で呼ばないとエラーになる。
        //    async/awaitやアロー関数ラップは不可。
        const self = this;
        const debugEl = this._gyroDebug;
        const promptEl = this._gyroPrompt;

        function onTapForGyro(ev) {
          if (self._gyroRequesting) return;
          self._gyroRequesting = true;

          if (debugEl) {
            debugEl.textContent = 'GYRO: requesting...\n(via ' + ev.type + ')';
            debugEl.style.color = '#ff0';
          }

          DeviceOrientationEvent.requestPermission()
            .then(function(state) {
              if (debugEl) {
                debugEl.textContent = 'GYRO: perm=' + state;
                debugEl.style.color = state === 'granted' ? '#0f0' : '#f44';
              }
              if (state === 'granted') {
                startListening();
              } else {
                self._gyroRequesting = false;
              }
            })
            .catch(function(err) {
              if (debugEl) {
                debugEl.textContent = 'GYRO: ERR\n' + String(err.message || err);
                debugEl.style.color = '#f44';
              }
              self._gyroRequesting = false;
            })
            .finally(function() {
              // ポップアップを閉じる
              if (promptEl) {
                promptEl.style.opacity = '0';
                setTimeout(function() { promptEl.remove(); }, 300);
              }
            });
        }

        // OKボタンにイベント紐づけ（ポップアップ表示後に取得）
        const permitBtn = document.getElementById('gyro-permit-btn');
        if (permitBtn) {
          permitBtn.addEventListener('click', onTapForGyro);
          permitBtn.addEventListener('touchend', onTapForGyro);
        }
      } else {
        // Android / 許可不要ブラウザ
        if (this._gyroDebug) {
          this._gyroDebug.textContent = 'GYRO: no permission needed\nattaching...';
        }
        startListening();
      }
    }

    if (this.isMobile) {
      window.addEventListener('resize', () => this.onResize());
      this.isVisible = true;
    } else {
      this._resizeObserver = new ResizeObserver(() => this.onResize());
      this._resizeObserver.observe(this.container);

      this._intersectionObserver = new IntersectionObserver(
        ([entry]) => {
          const wasVisible = this.isVisible;
          this.isVisible = entry.isIntersecting;
          if (!wasVisible && this.isVisible) this.clock.getDelta();
        },
        { threshold: 0.01 }
      );
      this._intersectionObserver.observe(this.container);
    }
  }

  onResize() {
    if (!this.renderer) return;
    const { width, height } = this._getRenderSize();
    if (width === 0 || height === 0) return;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  // 1ボディに対するバネ+水流+クランプ処理
  _applyForces(o, elapsed) {
    o.body.resetForces(true);
    const pos = o.body.translation();

    if (this.isMobile) {
      // ── モバイル: 地球重力モード ──
      // 壁突き抜け防止: 画面外に出たら強制的に戻す
      const { halfW, halfH } = this._getVisibleArea();
      const margin = 0.05;
      let clamped = false;
      let cx = pos.x, cy = pos.y;
      if (pos.x < -halfW + margin) { cx = -halfW + margin; clamped = true; }
      if (pos.x >  halfW - margin) { cx =  halfW - margin; clamped = true; }
      if (pos.y < -halfH + margin) { cy = -halfH + margin; clamped = true; }
      if (pos.y >  halfH - margin) { cy =  halfH - margin; clamped = true; }
      if (clamped) {
        o.body.setTranslation({ x: cx, y: cy, z: pos.z }, true);
        const vel = o.body.linvel();
        // 壁に当たったら速度を反転＋減衰
        o.body.setLinvel({
          x: pos.x !== cx ? -vel.x * 0.3 : vel.x,
          y: pos.y !== cy ? -vel.y * 0.3 : vel.y,
          z: vel.z
        }, true);
      }
    } else {
      // ── デスクトップ: クラゲモード ──
      if (o.basePosition) {
        const dx = o.basePosition.x - pos.x;
        const dy = o.basePosition.y - pos.y;
        const dz = o.basePosition.z - pos.z;
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

        let k = SPRING_K;
        if (dist > SPRING_FAR_THRESHOLD) {
          const excess = (dist - SPRING_FAR_THRESHOLD) / dist;
          k += SPRING_FAR * excess;
        }
        o.body.addForce({
          x: dx * k,
          y: dy * k,
          z: dz * k * 2.0,
        }, true);
      }

      // 水流の揺らぎ
      const t = (elapsed || 0) + o.driftPhase;
      o.body.addForce({
        x: Math.sin(t * 0.5) * DRIFT_FORCE + Math.sin(t * 0.9 + 2.0) * DRIFT_FORCE * 0.6,
        y: Math.cos(t * 0.4 + 1.0) * DRIFT_FORCE + Math.sin(t * 0.7) * DRIFT_FORCE * 0.4,
        z: 0,
      }, true);

      // ジャイロ（デスクトップでもジャイロがあれば）
      if (this._gyroEnabled) {
        o.body.addForce({
          x: this._gyroX * 1.5,
          y: -this._gyroY * 1.5,
          z: 0,
        }, true);
      }

      // クラゲ漂流回転
      const angDrift = 0.04;
      o.body.addTorque({
        x: Math.sin(t * 0.12 + o.driftPhase * 2) * angDrift,
        y: Math.cos(t * 0.10 + o.driftPhase * 3) * angDrift,
        z: Math.sin(t * 0.08) * angDrift * 0.2,
      }, true);
    }

    // Z軸クランプ
    if (Math.abs(pos.z) > 0.3) {
      const vel = o.body.linvel();
      o.body.setTranslation({ x: pos.x, y: pos.y, z: Math.sign(pos.z) * 0.3 }, true);
      o.body.setLinvel({ x: vel.x, y: vel.y, z: -vel.z * 0.5 }, true);
    }
    // 角速度クランプ
    const avel = o.body.angvel();
    const aspeed = Math.sqrt(avel.x * avel.x + avel.y * avel.y + avel.z * avel.z);
    if (aspeed > MAX_ANGULAR_SPEED) {
      const s = MAX_ANGULAR_SPEED / aspeed;
      o.body.setAngvel({ x: avel.x * s, y: avel.y * s, z: avel.z * s }, true);
    }
  }

  _presimulate() {
    const objs = this.objects;

    // プレシミュ用の一時壁を作成
    this._createBoundaryWalls();

    if (this.isMobile) {
      // モバイル: 重力で自然に底に落として安定させる（world.gravityが効く）
      for (let step = 0; step < 300; step++) {
        for (const o of objs) {
          const pos = o.body.translation();
          if (Math.abs(pos.z) > 0.3) {
            const vel = o.body.linvel();
            o.body.setTranslation({ x: pos.x, y: pos.y, z: Math.sign(pos.z) * 0.3 }, true);
            o.body.setLinvel({ x: vel.x, y: vel.y, z: -vel.z * 0.5 }, true);
          }
        }
        this.world.step();
      }
    } else {
      // デスクトップ: 中心引力+衝突+壁で分散
      const PRESIM_ATTRACTION = 3.0;
      for (let step = 0; step < 600; step++) {
        for (const o of objs) {
          o.body.resetForces(true);
          const pos = o.body.translation();
          const dx = -pos.x, dy = -pos.y, dz = -pos.z;
          const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
          if (dist > 0.01) {
            const f = PRESIM_ATTRACTION / dist;
            o.body.addForce({ x: dx * f, y: dy * f, z: dz * f }, true);
          }
          if (Math.abs(pos.z) > 0.3) {
            const vel = o.body.linvel();
            o.body.setTranslation({ x: pos.x, y: pos.y, z: Math.sign(pos.z) * 0.3 }, true);
            o.body.setLinvel({ x: vel.x, y: vel.y, z: -vel.z * 0.5 }, true);
          }
        }
        this.world.step();
      }
    }

    // プレシミュ用の壁 — モバイルは常設（ヘッダーが箱）、デスクトップは削除
    if (!this.isMobile && this._wallBodies) {
      for (const wb of this._wallBodies) {
        this.world.removeRigidBody(wb);
      }
      this._wallBodies = null;
    }

    // 安定位置をbasePositionとして保存 + 完全静止
    for (const o of objs) {
      const pos = o.body.translation();
      const rot = o.body.rotation();
      o.basePosition = new THREE.Vector3(pos.x, pos.y, pos.z);
      o.position.set(pos.x, pos.y, pos.z);
      o.quat.set(rot.x, rot.y, rot.z, rot.w);
      o.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
      o.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    }
  }

  _tick() {
    if (!this.animating || !this.renderer) return;
    this._rafId = requestAnimationFrame(this._boundAnimate);

    const realDt = Math.min(this.clock.getDelta(), 0.05);
    if (!this.isVisible || this.objects.length === 0) return;

    const elapsed = this.clock.elapsedTime;
    const objs = this.objects;

    // ── モバイル: ジャイロ → world.gravity リアルタイム更新 ──
    if (this.isMobile && this.world) {
      if (this._gyroEnabled) {
        // gamma → 左右傾き, beta → 前後傾き。ラジアン変換して重力ベクトル算出
        // 地球の重力をスマホ画面に投影: sin(angle)で各軸の重力成分を計算
        const gammaRad = this._gyroRaw.gamma * Math.PI / 180;
        const betaRad  = this._gyroRaw.beta  * Math.PI / 180;

        // スマホを普通に持つと beta≈50-70°
        // sin(gamma)→左右の重力成分, sin(beta)→画面下向きの重力成分
        const gx =  Math.sin(gammaRad) * MOBILE_GRAVITY;
        const gy = -Math.sin(betaRad)  * MOBILE_GRAVITY;  // sin: 傾き角に比例して画面下向き重力

        this.world.gravity = { x: gx, y: gy, z: 0 };
      }
      // ジャイロ無効時はデフォルト下向き重力を維持（init時に設定済み）
    }

    // ── Mouse world position (canxerian: pageToWorldCoords) ──
    const mouseActive = this.mouse.x >= -1.5 && this.mouse.x <= 1.5
                     && this.mouse.y >= -1.5 && this.mouse.y <= 1.5;

    if (mouseActive) {
      this.raycaster.setFromCamera(this.mouse, this.camera);
      const hit = this.raycaster.ray.intersectPlane(this.groundPlane, this._planeTarget);
      if (hit) {
        this.mouseWorld.copy(this._planeTarget);
      }

      if (!this.mouseInited) {
        this.lastMouseWorld.copy(this.mouseWorld);
        this.mouseInited = true;
      }

      this.mouseDelta.subVectors(this.mouseWorld, this.lastMouseWorld);
      this._mouseSpeed = this.mouseDelta.length() / Math.max(realDt, 0.001);
      this.lastMouseWorld.copy(this.mouseWorld);

      this.mouseBody.setTranslation({ x: 0, y: 0, z: -50 }, true);
      this._mouseActive = true;

      // カーソルライト追従（速度に応じて明るく）
      if (this._cursorLight) {
        this._cursorLight.position.set(this.mouseWorld.x, this.mouseWorld.y, 2.5);
        const targetIntensity = Math.min(3.0, 0.8 + this._mouseSpeed * 0.15);
        this._cursorLight.intensity += (targetIntensity - this._cursorLight.intensity) * 0.1;
      }
    } else {
      this.mouseBody.setTranslation({ x: 0, y: 0, z: -50 }, true);
      this._mouseActive = false;
      // マウスが出たらライトをフェードアウト
      if (this._cursorLight) {
        this._cursorLight.intensity *= 0.92;
      }
    }

    // ── 120Hz固定タイムステップ accumulator ──
    this._accumulator += realDt;
    const maxSteps = this.isMobile ? 2 : 4;
    let steps = 0;

    while (this._accumulator >= FIXED_DT && steps < maxSteps) {
      for (let i = 0; i < objs.length; i++) {
        this._applyForces(objs[i], elapsed);

        // マウス打撃（移動速度に比例 — 殴る感触）
        if (this._mouseActive && this._mouseSpeed > 0.01) {
          const pos = objs[i].body.translation();
          const dx = pos.x - this.mouseWorld.x;
          const dy = pos.y - this.mouseWorld.y;
          const distSq = dx * dx + dy * dy;
          const r2 = MOUSE_HIT_RADIUS * MOUSE_HIT_RADIUS;

          if (distSq < r2 && distSq > 0.001) {
            const dist = Math.sqrt(distSq);
            const t = 1.0 - dist / MOUSE_HIT_RADIUS;
            // マウス速度 × 距離減衰 × 係数 → 一撃のインパクト
            const impact = t * t * this._mouseSpeed * MOUSE_HIT_FORCE;
            const nx = dx / dist;
            const ny = dy / dist;
            objs[i].body.applyImpulse({ x: nx * impact, y: ny * impact, z: 0 }, true);

            // 打撃で回転トルク（弾かれた方向の直交軸でグルンと回る）
            const spin = impact * 0.8;
            objs[i].body.applyTorqueImpulse({
              x: -ny * spin + (Math.random() - 0.5) * spin * 0.3,
              y:  nx * spin + (Math.random() - 0.5) * spin * 0.3,
              z: (Math.random() - 0.5) * spin * 0.2,
            }, true);
          }
        }
      }
      this.world.step();
      this._accumulator -= FIXED_DT;
      steps++;
    }
    if (this._accumulator > FIXED_DT * maxSteps) this._accumulator = 0;

    // Read final positions/rotations
    for (const o of objs) {
      const pos = o.body.translation();
      const rot = o.body.rotation();
      o.position.set(pos.x, pos.y, pos.z);
      o.quat.set(rot.x, rot.y, rot.z, rot.w);
    }

    // ── Update InstancedMesh ──
    if (this._colorInstanceMap) {
      for (let i = 0; i < objs.length; i++) {
        const o = objs[i];
        const { meshInfo, localIdx } = this._colorInstanceMap[i];

        if (!o.fadeComplete) {
          const ft = Math.max(0, elapsed - o.fadeDelay);
          o.fadeIn = Math.min(1, ft * 2.5);
          if (o.fadeIn >= 1) o.fadeComplete = true;
        }

        const breath = 1.0 + Math.sin(elapsed * o.breathSpeed + o.breathPhase) * 0.012;
        const ease = o.fadeIn * o.fadeIn * (3 - 2 * o.fadeIn);
        const s = (o.fadeComplete ? o.scale : o.scale * ease) * breath;

        this._sc.set(s, s, s);
        this._mat.compose(o.position, o.quat, this._sc);
        meshInfo.mesh.setMatrixAt(localIdx, this._mat);
      }
      for (const info of this.instancedMeshes) {
        info.mesh.instanceMatrix.needsUpdate = true;
      }
    }

    this.renderer.render(this.scene, this.camera);

    // ── Mouse trail ──
    this._updateTrail(realDt);
  }

  _updateTrail(dt) {
    const ctx = this._trailCtx;
    const cvs = this._trailCanvas;
    if (!ctx || !cvs) return;

    const rect = this.container.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio, 2);
    // Resize if needed
    const cw = rect.width * dpr;
    const ch = rect.height * dpr;
    if (Math.abs(cvs.width - cw) > 2 || Math.abs(cvs.height - ch) > 2) {
      cvs.width = cw;
      cvs.height = ch;
    }

    const trail = this._trail;
    const TRAIL_COLORS = [
      'rgba(168, 223, 240, ',  // 水色
      'rgba(245, 176, 197, ',  // ピンク
      'rgba(245, 232, 160, ',  // 黄色
      'rgba(168, 230, 176, ',  // 緑
      'rgba(245, 196, 144, ',  // オレンジ
      'rgba(240, 237, 232, ',  // 白
    ];

    // Spawn new particles when mouse moves
    if (this._mouseActive && this._mouseSpeed > 0.5) {
      // Screen coordinates from normalized mouse
      const sx = (this.mouse.x * 0.5 + 0.5) * cw;
      const sy = (-this.mouse.y * 0.5 + 0.5) * ch;

      const speed = Math.min(this._mouseSpeed, 30);
      const count = Math.ceil(speed * 0.15);  // 速いほど多い

      for (let i = 0; i < count; i++) {
        const colorStr = TRAIL_COLORS[Math.floor(Math.random() * TRAIL_COLORS.length)];
        const baseSize = (4 + speed * 0.6) * dpr;
        trail.push({
          x: sx + (Math.random() - 0.5) * 8 * dpr,
          y: sy + (Math.random() - 0.5) * 8 * dpr,
          size: baseSize * rand(0.5, 1.0),
          alpha: rand(0.3, 0.7),
          color: colorStr,
          life: 1.0,
          decay: rand(0.8, 1.8),  // 秒あたりの減衰
        });
      }
    }

    // Clear
    ctx.clearRect(0, 0, cw, ch);

    // Update & draw
    for (let i = trail.length - 1; i >= 0; i--) {
      const p = trail[i];
      p.life -= p.decay * dt;
      if (p.life <= 0) {
        trail.splice(i, 1);
        continue;
      }

      const ease = p.life * p.life;  // quadratic fade
      const a = p.alpha * ease;
      const r = p.size * (0.5 + ease * 0.5);  // shrink as fading

      // Soft glow circle
      const gradient = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
      gradient.addColorStop(0, p.color + a + ')');
      gradient.addColorStop(0.4, p.color + (a * 0.6) + ')');
      gradient.addColorStop(1, p.color + '0)');

      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fillStyle = gradient;
      ctx.fill();
    }

    // Cursor glow (常にマウス位置に淡いグロー)
    if (this._mouseActive) {
      const sx = (this.mouse.x * 0.5 + 0.5) * cw;
      const sy = (-this.mouse.y * 0.5 + 0.5) * ch;
      const glowR = 30 * dpr;
      const glowGrad = ctx.createRadialGradient(sx, sy, 0, sx, sy, glowR);
      glowGrad.addColorStop(0, 'rgba(252, 250, 210, 0.15)');
      glowGrad.addColorStop(0.5, 'rgba(252, 250, 210, 0.06)');
      glowGrad.addColorStop(1, 'rgba(252, 250, 210, 0)');
      ctx.beginPath();
      ctx.arc(sx, sy, glowR, 0, Math.PI * 2);
      ctx.fillStyle = glowGrad;
      ctx.fill();
    }

    // Cap trail length
    if (trail.length > 200) trail.splice(0, trail.length - 200);
  }

  _showGyroPrompt() {
    // iOS用: 自動表示ポップアップ — ユーザーのタップで requestPermission() を呼ぶ
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;' +
      'background:rgba(0,0,0,0.4);z-index:10000;display:flex;align-items:center;' +
      'justify-content:center;opacity:0;transition:opacity 0.3s ease;';

    const dialog = document.createElement('div');
    dialog.style.cssText = 'background:#fff;border-radius:20px;padding:28px 24px;' +
      'max-width:300px;width:85%;text-align:center;font-family:"Zen Maru Gothic",sans-serif;' +
      'box-shadow:0 8px 32px rgba(0,0,0,0.15);transform:translateY(20px);' +
      'transition:transform 0.3s ease;';

    dialog.innerHTML =
      '<div style="font-size:36px;margin-bottom:12px;">📱</div>' +
      '<div style="font-size:16px;font-weight:700;color:#5A4833;margin-bottom:8px;">スマホを傾けてみて！</div>' +
      '<div style="font-size:13px;color:#8a8278;margin-bottom:20px;line-height:1.6;">' +
        '金平糖がコロコロ転がるよ</div>' +
      '<button id="gyro-permit-btn" style="background:#6B8F5E;color:#fff;border:none;' +
        'border-radius:12px;padding:14px 32px;font-size:15px;font-weight:700;' +
        'font-family:inherit;cursor:pointer;box-shadow:0 3px 0 rgba(0,0,0,0.08);' +
        'width:100%;letter-spacing:0.04em;">OK！</button>' +
      '<div style="margin-top:12px;">' +
        '<button id="gyro-skip-btn" style="background:none;border:none;color:#b0a898;' +
          'font-size:12px;font-family:inherit;cursor:pointer;padding:8px;">あとで</button></div>';

    overlay.appendChild(dialog);
    document.body.appendChild(overlay);
    this._gyroPrompt = overlay;

    // フェードイン
    requestAnimationFrame(() => {
      overlay.style.opacity = '1';
      dialog.style.transform = 'translateY(0)';
    });

    // 「あとで」ボタン
    const skipBtn = dialog.querySelector('#gyro-skip-btn');
    skipBtn.addEventListener('click', () => {
      overlay.style.opacity = '0';
      setTimeout(() => overlay.remove(), 300);
    });
  }

  dispose() {
    this.animating = false;
    if (this._rafId) cancelAnimationFrame(this._rafId);
    if (this._onPointerMove) window.removeEventListener('pointermove', this._onPointerMove);
    if (this._onTouchMove) window.removeEventListener('touchmove', this._onTouchMove);
    if (this._onDeviceOrientation) window.removeEventListener('deviceorientation', this._onDeviceOrientation);
    if (this._resizeObserver) this._resizeObserver.disconnect();
    if (this._intersectionObserver) this._intersectionObserver.disconnect();
    if (this._gyroPrompt) { this._gyroPrompt.remove(); this._gyroPrompt = null; }

    for (const info of this.instancedMeshes) {
      info.mesh.geometry.dispose();
      info.mesh.material.dispose();
      this.scene.remove(info.mesh);
    }
    this.instancedMeshes.length = 0;
    this.objects.length = 0;

    if (this.world) {
      this.world.free();
      this.world = null;
    }

    if (this._trailCanvas) {
      this._trailCanvas.remove();
      this._trailCanvas = null;
      this._trailCtx = null;
      this._trail.length = 0;
    }
    if (this._cursorLight) {
      this.scene.remove(this._cursorLight);
      this._cursorLight.dispose();
      this._cursorLight = null;
    }
    if (this.envMap) {
      this.envMap.dispose();
      this.envMap = null;
    }
    if (this.renderer) {
      this.renderer.dispose();
      this.renderer.forceContextLoss();
      this.renderer = null;
    }
    _instance = null;
  }
}

export async function initHeader3D() {
  if (_instance) return;
  const container = document.getElementById('header-3d-wrap');
  if (!container) return;

  try {
    const testCanvas = document.createElement('canvas');
    const gl = testCanvas.getContext('webgl2') || testCanvas.getContext('webgl');
    if (!gl) return;
  } catch { return; }

  try {
    const mod = await import('https://esm.sh/@dimforge/rapier3d-compat@0.12.0');
    RAPIER = mod.default || mod;
    await RAPIER.init();
  } catch (e) {
    console.warn('[Header3D] Failed to load Rapier:', e);
    return;
  }

  _instance = new Header3D(container);
}
