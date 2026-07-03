// fx/hero-3d.js — 3Dこんぺいとうヒーロー（Three.js + Rapier）
//
// header-3d.js からの移植。演出（水中クラゲ物理 / マウス打撃 / トレイル /
// カーソルライト / ジャイロ）はそのまま、「枠」だけ新レイアウトに合わせて正した版。
//
// 旧実装の事故と、この版での是正:
// - canvas を position:fixed・100vw×100dvh・z-index:9999 で購入導線を覆っていた
//   → 描画サイズは常に .hero-fx の clientWidth/clientHeight。fixed も z-index 操作もしない。
//     3D は .hero > .hero-fx（z-index: var(--z-fx)=1）の中だけに閉じる。
// - JS内 768px と CSS(640) のブレークポイント食い違いで 641〜768px 帯が消えた
//   → ブレークポイントの唯一の情報源は ./motion.js（BP.mobile=640 / isMobile / onBreakpointChange）。
// - iOS で初回ロード時にジャイロ許可ポップアップを自動表示していた
//   → 自動ポップアップ廃止。#gyro-btn を出し、ボタンタップ時に初めて requestPermission()。
// - リサイズで物理の壁を作り直していなかった
//   → モバイルは壁を新寸法で再構築、デスクトップはバネのアンカー(basePosition)を再フィット。
// - 画面外に出てもデスクトップしか止めていなかった
//   → 両モードとも IntersectionObserver で .hero が画面外なら rAF と物理を完全停止。

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { isMobile, onBreakpointChange } from './motion.js';

// 旧実装と同じ相対パス（先頭 /assets/...）
const MODEL_SRC = '/assets/3d/konpeito.glb';
const MODEL_SCALE_DESKTOP = 1.5;   // 2.2→1.5: 「巨大な謎オブジェ」でなく「こんぺいとうの山」に見えるサイズ
const MODEL_SCALE_MOBILE = 0.1;    // スマホ: 微粒（紙吹雪感を保ちつつ視認できる下限）

const KONPEITO_PALETTE = [
  { color: '#5cc8e8' },  // 水色（鮮やか）
  { color: '#6dd87a' },  // 緑（鮮やか）
  { color: '#f07aa0' },  // ピンク（鮮やか）
  { color: '#f0a050' },  // オレンジ（鮮やか）
  { color: '#f0d848' },  // 黄色（鮮やか）
  { color: '#e8e0d8' },  // 白（少し温かみ）
];

const DESKTOP_COUNT = 90;   // 粒を小さくした分、数で密度を出す（InstancedMeshなので描画コスト増は僅少）
const MOBILE_COUNT = 70;    // モバイルは最大70に削減

// ── 水中物理（クラゲモード / デスクトップ） ──
const SPRING_K = 5.0;             // ソフトバネ — ふわっと戻る（急に引き戻さない）
const SPRING_FAR = 15.0;          // 遠距離バネ — 飛びすぎた時だけ強く引く
const SPRING_FAR_THRESHOLD = 2.0; // この距離超えたらFAR側が効く
const DAMPING = 1.2;              // 低粘性 — 漂い続ける（クラゲ）
const ANGULAR_DAMPING = 0.8;      // 回転もゆっくり減衰（クラゲのヒレ）
const MAX_ANGULAR_SPEED = 3.0;    // 角速度上限
const BALL_RADIUS = 0.8;
const RESTITUTION = 0.15;         // 衝突の弾み
const MOUSE_HIT_RADIUS = 1.5;     // マウスの打撃範囲
const MOUSE_HIT_FORCE = 18.0;     // 打撃インパクト
const MOUSE_BODY_RADIUS = 0.6;
const DRIFT_FORCE = 0.18;         // 水流の揺らぎ（クラゲの漂い感）
const FIXED_DT = 1 / 120;

// ── モバイル重力物理 ──
const MOBILE_BALL_RADIUS = 0.035;
const MOBILE_DAMPING = 0.15;       // ほぼ無抵抗 — 瞬時に反応
const MOBILE_ANGULAR_DAMPING = 0.3;
const MOBILE_RESTITUTION = 0.7;    // 壁で弾む
const MOBILE_GRAVITY = 40.0;       // 超重力 — 微傾きで即ザーッと流れる
const MOBILE_MASS = 0.8;           // 超軽量 — 瞬発力MAX

// プレシミュ回数（モバイルはメインスレッドブロック緩和のため200上限）
const PRESIM_DESKTOP = 600;
const PRESIM_MOBILE = 200;

function rand(a, b) { return a + Math.random() * (b - a); }
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// エラー時のログはここ1箇所だけ（console.log/console.info は使わない）
function warn(msg, e) { console.warn('[hero-3d] ' + msg, e); }

class Hero3D {
  constructor({ hero, heroFx, canvas, mobile, RAPIER }) {
    this.hero = hero;
    this.heroFx = heroFx;
    this.canvas = canvas;
    this.mobile = !!mobile;
    this.RAPIER = RAPIER;

    this.objects = [];
    this.instancedMeshes = [];
    this.world = null;
    this.mouseBody = null;
    this._wallBodies = null;
    this._accumulator = 0;

    // Mouse state（座標は常に .hero-fx 基準に正規化）
    this.mouse = new THREE.Vector2(9999, 9999);
    this.mouseWorld = new THREE.Vector3();
    this.lastMouseWorld = new THREE.Vector3();
    this.mouseDelta = new THREE.Vector3();
    this.mouseInited = false;
    this._mouseActive = false;
    this._mouseSpeed = 0;

    this.raycaster = new THREE.Raycaster();
    this.groundPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
    this._planeTarget = new THREE.Vector3();
    this._mat = new THREE.Matrix4();
    this._sc = new THREE.Vector3();

    this.isVisible = true;
    this.animating = true;
    this._disposed = false;
    this.clock = new THREE.Clock();
    this._rafId = 0;
    this._boundTick = () => this._tick();

    // Mouse trail state
    this._trail = [];
    this._trailCanvas = null;
    this._trailCtx = null;

    // Gyroscope state (mobile tilt)
    this._gyroX = 0;
    this._gyroY = 0;
    this._gyroRaw = { gamma: 0, beta: 0 };
    this._gyroEnabled = false;   // orientation イベントが実際に届いているか
    this._gyroListening = false; // deviceorientation を購読済みか
    this._gyroBtn = null;
    this._gyroHideTimer = 0;

    this.ok = false;
    this._initThree();
    if (!this.ok) return;
    this._initTrailCanvas();
    this._loadModels();
    this._bindEvents();
    this._resume();
  }

  // 描画サイズは常に .hero-fx（fixed も 100vw/100dvh も使わない）
  _size() {
    return { width: this.heroFx.clientWidth, height: this.heroFx.clientHeight };
  }

  _initThree() {
    const { width, height } = this._size();
    if (!width || !height) return;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 100);
    this.camera.position.set(0, 0, 5);

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas, alpha: true, antialias: true,
      powerPreference: 'high-performance',
    });
    // updateStyle=false: 表示サイズは CSS(width/height:100%)に任せ、描画バッファのみ設定
    this.renderer.setSize(width, height, false);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;

    this.scene.add(new THREE.AmbientLight(0xfff8f0, 0.4));
    // メインキーライト — シャープなハイライト
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

    // カーソル追従ライト
    this._cursorLight = new THREE.PointLight(0xfff8f0, 0, 8, 1.5);
    this._cursorLight.position.set(0, 0, 2);
    this.scene.add(this._cursorLight);

    // Rapier world: モバイルは下向き重力（ジャイロで動的更新）、デスクトップはゼロ重力
    const R = this.RAPIER;
    const initGravity = this.mobile
      ? new R.Vector3(0, -MOBILE_GRAVITY, 0)
      : new R.Vector3(0, 0, 0);
    this.world = new R.World(initGravity);
    this.world.timestep = FIXED_DT;

    // Mouse kinematic body（旧実装踏襲。常に遠方に置く保険ボディ）
    const mouseBodyDesc = R.RigidBodyDesc.kinematicPositionBased().setTranslation(0, 0, -50);
    this.mouseBody = this.world.createRigidBody(mouseBodyDesc);
    this.world.createCollider(
      R.ColliderDesc.ball(MOUSE_BODY_RADIUS).setRestitution(0.5),
      this.mouseBody
    );

    this.ok = true;
  }

  _initTrailCanvas() {
    const c = document.createElement('canvas');
    c.setAttribute('aria-hidden', 'true');
    // z-index は付けない。DOM順で #hero-3d-canvas の後に置くことで上に描画。
    // .hero-fx（z-index:1）の中に閉じるので購入導線を覆わない。
    c.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;';
    this.heroFx.appendChild(c);
    this._trailCanvas = c;
    this._trailCtx = c.getContext('2d');
    this._resizeTrailCanvas();
  }

  _resizeTrailCanvas() {
    const c = this._trailCanvas;
    if (!c) return;
    const dpr = Math.min(window.devicePixelRatio, 2);
    const { width, height } = this._size();
    c.width = Math.max(1, Math.round(width * dpr));
    c.height = Math.max(1, Math.round(height * dpr));
  }

  _setupEnvMap() {
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const envScene = new THREE.Scene();
    envScene.background = new THREE.Color(0xffffff);
    const envGeo = new THREE.SphereGeometry(5, 16, 16);
    const envMat = new THREE.MeshBasicMaterial({ color: 0xf8f4ef, side: THREE.BackSide });
    envScene.add(new THREE.Mesh(envGeo, envMat));
    envScene.add(new THREE.AmbientLight(0xffffff, 1.2));
    const envDir = new THREE.DirectionalLight(0xfff0e0, 0.8);
    envDir.position.set(1, 2, 1);
    envScene.add(envDir);
    this.envMap = pmrem.fromScene(envScene, 0.02).texture;
    this.scene.environment = this.envMap;
    envGeo.dispose();
    envMat.dispose();
    pmrem.dispose();
    this.renderer.state.reset();
  }

  _buildKonpeitoMaterials() {
    return KONPEITO_PALETTE.map(({ color }) => new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(color),
      metalness: 0.0,
      roughness: 0.25,
      clearcoat: 0.6,
      clearcoatRoughness: 0.1,
      envMapIntensity: 0.6,
      sheen: 0.2,
      sheenRoughness: 0.5,
      sheenColor: new THREE.Color(color),
    }));
  }

  _getVisibleArea() {
    const vFov = this.camera.fov * Math.PI / 180;
    const dist = this.camera.position.z;
    const halfH = Math.tan(vFov / 2) * dist;
    const halfW = halfH * this.camera.aspect;
    return { halfW, halfH };
  }

  _createBoundaryWalls() {
    const R = this.RAPIER;
    const { halfW, halfH } = this._getVisibleArea();
    const wallThick = 0.5;
    const wallDepth = 2.0;
    const w = halfW;
    const h = halfH;

    // .hero-fx の可視領域そのものが箱。旧実装のナビバー分オフセットは
    // 新レイアウト（ヘッダーは .hero の外）では不要なので廃止。
    const wallDefs = [
      { x: 0, y:  h + wallThick, hx: w + 1, hy: wallThick, hz: wallDepth }, // 上
      { x: 0, y: -h - wallThick, hx: w + 1, hy: wallThick, hz: wallDepth }, // 下
      { x: -w - wallThick, y: 0, hx: wallThick, hy: h + 1, hz: wallDepth }, // 左
      { x:  w + wallThick, y: 0, hx: wallThick, hy: h + 1, hz: wallDepth }, // 右
    ];

    this._wallBodies = [];
    for (const def of wallDefs) {
      const bodyDesc = R.RigidBodyDesc.fixed().setTranslation(def.x, def.y, 0);
      const body = this.world.createRigidBody(bodyDesc);
      this.world.createCollider(
        R.ColliderDesc.cuboid(def.hx, def.hy, def.hz).setRestitution(MOBILE_RESTITUTION),
        body
      );
      this._wallBodies.push(body);
    }
  }

  _removeWalls() {
    if (!this._wallBodies) return;
    for (const wb of this._wallBodies) this.world.removeRigidBody(wb);
    this._wallBodies = null;
  }

  _loadModels() {
    const R = this.RAPIER;
    const loader = new GLTFLoader();
    const count = this.mobile ? MOBILE_COUNT : DESKTOP_COUNT;

    loader.load(MODEL_SRC, (gltf) => {
      if (this._disposed) return;
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

      // 色別に InstancedMesh をバッチ生成
      for (let c = 0; c < materials.length; c++) {
        if (perColor[c] === 0) { materials[c].dispose(); continue; }
        const geo = baseGeo.clone();
        const im = new THREE.InstancedMesh(geo, materials[c], perColor[c]);
        im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        im.frustumCulled = false;
        this.scene.add(im);
        this.instancedMeshes.push({ mesh: im, colorIdx: c, count: perColor[c] });
      }
      baseGeo.dispose();

      const { halfW: hw, halfH: hh } = this._getVisibleArea();
      this._bodyHandleToIdx = new Map();

      for (let i = 0; i < count; i++) {
        const ci = colorIndices[i];
        const meshInfo = this.instancedMeshes.find((info) => info.colorIdx === ci);
        colorInstanceMap.push({ meshInfo, localIdx: instanceCounters[ci]++ });

        const bx = rand(-hw * 0.8, hw * 0.8);
        const by = rand(-hh * 0.8, hh * 0.8);
        const bz = rand(-0.05, 0.05);

        const linDamp = this.mobile ? MOBILE_DAMPING : DAMPING;
        const angDamp = this.mobile ? MOBILE_ANGULAR_DAMPING : ANGULAR_DAMPING;
        const bodyDesc = R.RigidBodyDesc.dynamic()
          .setTranslation(bx, by, bz)
          .setLinearDamping(linDamp)
          .setAngularDamping(angDamp);
        const body = this.world.createRigidBody(bodyDesc);

        const ballR = this.mobile ? MOBILE_BALL_RADIUS : BALL_RADIUS;
        const rest = this.mobile ? MOBILE_RESTITUTION : RESTITUTION;
        const col_ = this.world.createCollider(
          R.ColliderDesc.ball(ballR).setRestitution(rest),
          body
        );
        col_.setMass(this.mobile ? MOBILE_MASS : 3.0);

        const scaleVar = rand(0.85, 1.15);
        const modelScale = this.mobile ? MODEL_SCALE_MOBILE : MODEL_SCALE_DESKTOP;
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

      this._presimulate();
    }, undefined, () => {
      // GLBロード失敗時は静かに何もしない（静的グラデーションのまま）
    });
  }

  _bindEvents() {
    // マウス/タッチ座標は常に .hero-fx 矩形基準に正規化（モード分岐なし）
    const setFromClient = (cx, cy) => {
      const rect = this.heroFx.getBoundingClientRect();
      if (cx >= rect.left && cx <= rect.right && cy >= rect.top && cy <= rect.bottom) {
        this.mouse.x = ((cx - rect.left) / rect.width) * 2 - 1;
        this.mouse.y = -((cy - rect.top) / rect.height) * 2 + 1;
      } else {
        this.mouse.set(9999, 9999);
        this.mouseInited = false;
      }
    };

    this._onPointerMove = (e) => setFromClient(e.clientX, e.clientY);
    window.addEventListener('pointermove', this._onPointerMove);

    this._onTouchMove = (e) => {
      if (!e.touches.length) return;
      const t = e.touches[0];
      setFromClient(t.clientX, t.clientY);
    };
    window.addEventListener('touchmove', this._onTouchMove, { passive: true });

    // ── ジャイロ（モバイルのみ・自動ポップアップ禁止） ──
    this._setupGyroButton();

    // リサイズ: renderer/カメラ更新 + 物理境界を新寸法で作り直し
    this._resizeObserver = new ResizeObserver(() => this._onResize());
    this._resizeObserver.observe(this.heroFx);

    // 可視性: .hero が画面外なら rAF と物理を完全停止（両モード）
    this._intersectionObserver = new IntersectionObserver(
      ([entry]) => this._onIntersect(entry.isIntersecting),
      { threshold: 0 }
    );
    this._intersectionObserver.observe(this.hero);
  }

  // ── ジャイロ: DeviceOrientationEvent があるなら #gyro-btn を出し、
  //    タップされたら初めて requestPermission()（iOS）。自動ポップアップはしない。
  _setupGyroButton() {
    if (!this.mobile) return;
    if (typeof window.DeviceOrientationEvent === 'undefined') return;

    const btn = document.getElementById('gyro-btn');
    if (!btn) return;
    this._gyroBtn = btn;

    this._onDeviceOrientation = (e) => {
      if (e.gamma === null && e.beta === null) return;
      this._gyroEnabled = true;
      this._gyroRaw.gamma = e.gamma ?? 0;
      this._gyroRaw.beta = e.beta ?? 0;
      this._gyroX = clamp(this._gyroRaw.gamma / 30, -1, 1);
      this._gyroY = clamp((this._gyroRaw.beta - 45) / 30, -1, 1);
    };

    this._onGyroTap = () => {
      // iOS 13+ は requestPermission がユーザージェスチャーの同期スタック内で必要
      if (typeof DeviceOrientationEvent.requestPermission === 'function') {
        DeviceOrientationEvent.requestPermission()
          .then((state) => {
            if (this._disposed) return;
            if (state === 'granted') this._enableGyro();
            else this._denyGyro();
          })
          .catch(() => { if (!this._disposed) this._denyGyro(); });
      } else {
        // Android など許可不要ブラウザ
        this._enableGyro();
      }
    };
    btn.addEventListener('click', this._onGyroTap);

    // 発見の報酬として表示（押し付けない）
    btn.hidden = false;
    btn.classList.add('show');
  }

  _enableGyro() {
    if (!this._gyroListening) {
      this._gyroListening = true;
      window.addEventListener('deviceorientation', this._onDeviceOrientation, { passive: true });
    }
    const btn = this._gyroBtn;
    if (btn) {
      btn.textContent = 'ころがして あそんでね';
      this._gyroHideTimer = window.setTimeout(() => this._fadeOutGyroBtn(), 2000);
    }
  }

  _denyGyro() {
    // 通常重力（init時の下向き）で続行
    const btn = this._gyroBtn;
    if (btn) {
      btn.textContent = 'きょかがなかったよ';
      this._gyroHideTimer = window.setTimeout(() => this._fadeOutGyroBtn(), 2000);
    }
  }

  _fadeOutGyroBtn() {
    const btn = this._gyroBtn;
    if (!btn) return;
    btn.style.transition = 'opacity 0.4s ease';
    btn.style.opacity = '0';
    this._gyroHideTimer = window.setTimeout(() => {
      btn.classList.remove('show');
      btn.hidden = true;
    }, 420);
  }

  _onResize() {
    if (this._disposed || !this.renderer) return;
    const { width, height } = this._size();
    if (!width || !height) return;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
    this._resizeTrailCanvas();

    // 物理境界を新しい寸法で作り直す（旧実装はこれをしていなかった）
    if (this.mobile) {
      this._rebuildWalls();
    } else {
      this._refitBasePositions();
    }
  }

  _rebuildWalls() {
    if (!this.world) return;
    this._removeWalls();
    this._createBoundaryWalls();
  }

  // デスクトップは常設の壁を持たない（旧実装踏襲）。バネのアンカーを
  // 新しい可視領域に収め直して、リサイズで粒が画面外へ引かれないようにする。
  _refitBasePositions() {
    const { halfW, halfH } = this._getVisibleArea();
    const mx = halfW * 0.9, my = halfH * 0.9;
    for (const o of this.objects) {
      if (!o.basePosition) continue;
      o.basePosition.x = clamp(o.basePosition.x, -mx, mx);
      o.basePosition.y = clamp(o.basePosition.y, -my, my);
    }
  }

  _onIntersect(visible) {
    if (visible === this.isVisible) return;
    this.isVisible = visible;
    if (visible) {
      this._resume();
    } else if (this._rafId) {
      // 物理も rAF も完全停止（次tickは走らせない）
      cancelAnimationFrame(this._rafId);
      this._rafId = 0;
    }
  }

  _resume() {
    if (this._rafId || !this.animating || this._disposed || !this.isVisible) return;
    this.clock.getDelta(); // 停止中に溜まった時間を捨てる（大ジャンプ防止）
    this._accumulator = 0;
    this._rafId = requestAnimationFrame(this._boundTick);
  }

  // 1ボディに対するバネ+水流+クランプ処理
  _applyForces(o, elapsed) {
    o.body.resetForces(true);
    const pos = o.body.translation();

    if (this.mobile) {
      // ── モバイル: 地球重力モード。画面外に出たら押し戻す ──
      const { halfW, halfH } = this._getVisibleArea();
      const margin = 0.05;
      let cx = pos.x, cy = pos.y;
      let clamped = false;
      if (pos.x < -halfW + margin) { cx = -halfW + margin; clamped = true; }
      if (pos.x >  halfW - margin) { cx =  halfW - margin; clamped = true; }
      if (pos.y < -halfH + margin) { cy = -halfH + margin; clamped = true; }
      if (pos.y >  halfH - margin) { cy =  halfH - margin; clamped = true; }
      if (clamped) {
        o.body.setTranslation({ x: cx, y: cy, z: pos.z }, true);
        const vel = o.body.linvel();
        o.body.setLinvel({
          x: pos.x !== cx ? -vel.x * 0.3 : vel.x,
          y: pos.y !== cy ? -vel.y * 0.3 : vel.y,
          z: vel.z,
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
        o.body.addForce({ x: dx * k, y: dy * k, z: dz * k * 2.0 }, true);
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
        o.body.addForce({ x: this._gyroX * 1.5, y: -this._gyroY * 1.5, z: 0 }, true);
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
    // プレシミュ用の壁（モバイルは常設、デスクトップは終了後に撤去）
    this._createBoundaryWalls();

    if (this.mobile) {
      // モバイル: 重力で自然に底へ落として安定（200ステップ上限）
      for (let step = 0; step < PRESIM_MOBILE; step++) {
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
      for (let step = 0; step < PRESIM_DESKTOP; step++) {
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

    // デスクトップは壁を撤去（バネで漂わせる）。モバイルは箱として常設。
    if (!this.mobile) this._removeWalls();

    // 安定位置を basePosition として保存 + 完全静止
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
    this._rafId = 0;
    if (!this.animating || this._disposed || !this.renderer) return;
    if (!this.isVisible) return; // 停止（_resume で再開）
    this._rafId = requestAnimationFrame(this._boundTick);

    const realDt = Math.min(this.clock.getDelta(), 0.05);
    if (this.objects.length === 0) return; // GLB未ロード

    const elapsed = this.clock.elapsedTime;
    const objs = this.objects;

    // ── モバイル: ジャイロ → world.gravity リアルタイム更新 ──
    if (this.mobile && this.world && this._gyroEnabled) {
      const gammaRad = this._gyroRaw.gamma * Math.PI / 180;
      const betaRad = this._gyroRaw.beta * Math.PI / 180;
      const gx = Math.sin(gammaRad) * MOBILE_GRAVITY;
      const gy = -Math.sin(betaRad) * MOBILE_GRAVITY;
      this.world.gravity = { x: gx, y: gy, z: 0 };
    }

    // ── マウスのワールド座標 ──
    const mouseActive = this.mouse.x >= -1.5 && this.mouse.x <= 1.5
                     && this.mouse.y >= -1.5 && this.mouse.y <= 1.5;

    if (mouseActive) {
      this.raycaster.setFromCamera(this.mouse, this.camera);
      const hit = this.raycaster.ray.intersectPlane(this.groundPlane, this._planeTarget);
      if (hit) this.mouseWorld.copy(this._planeTarget);

      if (!this.mouseInited) {
        this.lastMouseWorld.copy(this.mouseWorld);
        this.mouseInited = true;
      }

      this.mouseDelta.subVectors(this.mouseWorld, this.lastMouseWorld);
      this._mouseSpeed = this.mouseDelta.length() / Math.max(realDt, 0.001);
      this.lastMouseWorld.copy(this.mouseWorld);

      this.mouseBody.setTranslation({ x: 0, y: 0, z: -50 }, true);
      this._mouseActive = true;

      if (this._cursorLight) {
        this._cursorLight.position.set(this.mouseWorld.x, this.mouseWorld.y, 2.5);
        const targetIntensity = Math.min(3.0, 0.8 + this._mouseSpeed * 0.15);
        this._cursorLight.intensity += (targetIntensity - this._cursorLight.intensity) * 0.1;
      }
    } else {
      this.mouseBody.setTranslation({ x: 0, y: 0, z: -50 }, true);
      this._mouseActive = false;
      if (this._cursorLight) this._cursorLight.intensity *= 0.92;
    }

    // ── 120Hz固定タイムステップ accumulator ──
    this._accumulator += realDt;
    const maxSteps = this.mobile ? 2 : 4;
    let steps = 0;

    while (this._accumulator >= FIXED_DT && steps < maxSteps) {
      for (let i = 0; i < objs.length; i++) {
        this._applyForces(objs[i], elapsed);

        // マウス打撃（移動速度に比例）
        if (this._mouseActive && this._mouseSpeed > 0.01) {
          const pos = objs[i].body.translation();
          const dx = pos.x - this.mouseWorld.x;
          const dy = pos.y - this.mouseWorld.y;
          const distSq = dx * dx + dy * dy;
          const r2 = MOUSE_HIT_RADIUS * MOUSE_HIT_RADIUS;

          if (distSq < r2 && distSq > 0.001) {
            const dist = Math.sqrt(distSq);
            const t = 1.0 - dist / MOUSE_HIT_RADIUS;
            const impact = t * t * this._mouseSpeed * MOUSE_HIT_FORCE;
            const nx = dx / dist;
            const ny = dy / dist;
            objs[i].body.applyImpulse({ x: nx * impact, y: ny * impact, z: 0 }, true);

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

    // 最終位置/回転を読み出し
    for (const o of objs) {
      const pos = o.body.translation();
      const rot = o.body.rotation();
      o.position.set(pos.x, pos.y, pos.z);
      o.quat.set(rot.x, rot.y, rot.z, rot.w);
    }

    // ── InstancedMesh 更新 ──
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
      for (const info of this.instancedMeshes) info.mesh.instanceMatrix.needsUpdate = true;
    }

    this.renderer.render(this.scene, this.camera);

    this._updateTrail(realDt);
  }

  _updateTrail(dt) {
    const ctx = this._trailCtx;
    const cvs = this._trailCanvas;
    if (!ctx || !cvs) return;

    const dpr = Math.min(window.devicePixelRatio, 2);
    const { width, height } = this._size();
    const cw = Math.max(1, Math.round(width * dpr));
    const ch = Math.max(1, Math.round(height * dpr));
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

    // マウス移動で粒子スポーン
    if (this._mouseActive && this._mouseSpeed > 0.5) {
      const sx = (this.mouse.x * 0.5 + 0.5) * cw;
      const sy = (-this.mouse.y * 0.5 + 0.5) * ch;
      const speed = Math.min(this._mouseSpeed, 30);
      const count = Math.ceil(speed * 0.15);

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
          decay: rand(0.8, 1.8),
        });
      }
    }

    ctx.clearRect(0, 0, cw, ch);

    for (let i = trail.length - 1; i >= 0; i--) {
      const p = trail[i];
      p.life -= p.decay * dt;
      if (p.life <= 0) { trail.splice(i, 1); continue; }

      const ease = p.life * p.life;
      const a = p.alpha * ease;
      const r = p.size * (0.5 + ease * 0.5);

      const gradient = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
      gradient.addColorStop(0, p.color + a + ')');
      gradient.addColorStop(0.4, p.color + (a * 0.6) + ')');
      gradient.addColorStop(1, p.color + '0)');

      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fillStyle = gradient;
      ctx.fill();
    }

    // カーソルの淡いグロー
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

    if (trail.length > 200) trail.splice(0, trail.length - 200);
  }

  dispose() {
    this._disposed = true;
    this.animating = false;
    if (this._rafId) { cancelAnimationFrame(this._rafId); this._rafId = 0; }

    if (this._onPointerMove) window.removeEventListener('pointermove', this._onPointerMove);
    if (this._onTouchMove) window.removeEventListener('touchmove', this._onTouchMove);
    if (this._onDeviceOrientation) window.removeEventListener('deviceorientation', this._onDeviceOrientation);
    if (this._resizeObserver) this._resizeObserver.disconnect();
    if (this._intersectionObserver) this._intersectionObserver.disconnect();

    // ジャイロボタンを元の隠し状態へ戻す
    if (this._gyroHideTimer) { clearTimeout(this._gyroHideTimer); this._gyroHideTimer = 0; }
    if (this._gyroBtn) {
      if (this._onGyroTap) this._gyroBtn.removeEventListener('click', this._onGyroTap);
      this._gyroBtn.classList.remove('show');
      this._gyroBtn.hidden = true;
      this._gyroBtn.style.opacity = '';
      this._gyroBtn.style.transition = '';
      this._gyroBtn.textContent = 'かたむけてあそぶ';
      this._gyroBtn = null;
    }

    for (const info of this.instancedMeshes) {
      info.mesh.geometry.dispose();
      info.mesh.material.dispose();
      this.scene.remove(info.mesh);
    }
    this.instancedMeshes.length = 0;
    this.objects.length = 0;

    if (this.world) { this.world.free(); this.world = null; }

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
    if (this.envMap) { this.envMap.dispose(); this.envMap = null; }
    if (this.renderer) {
      this.renderer.dispose();
      this.renderer.forceContextLoss();
      this.renderer = null;
    }
  }
}

// ── モジュールレベル: 単一インスタンス管理 + ブレークポイント再init ──
let _instance = null;
let _rapierPromise = null;
let _bpBound = false;
let _currentMobile = null;
let _bootToken = 0;

function hasWebGL() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch { return false; }
}

function loadRapier() {
  if (_rapierPromise) return _rapierPromise;
  // セルフホスト版（外部CDN依存の排除 — サプライチェーン防御 + CSPをselfに絞れる）
  _rapierPromise = import('/assets/vendor/rapier3d-compat.es.js')
    .then((mod) => {
      const R = mod.default || mod;
      return R.init().then(() => R);
    })
    .catch((e) => {
      warn('Rapier load failed', e);
      _rapierPromise = null; // 再試行できるように
      return null;
    });
  return _rapierPromise;
}

async function boot(mobile) {
  const token = ++_bootToken;
  const RAPIER = await loadRapier();
  if (!RAPIER) return;
  if (token !== _bootToken || _instance) return; // 新しい boot に追い越された/既存あり

  const hero = document.querySelector('.hero');
  const heroFx = hero && hero.querySelector('.hero-fx');
  let canvas = document.getElementById('hero-3d-canvas');
  if (!hero || !heroFx || !canvas) return;

  // dispose() が forceContextLoss() した canvas は再利用できない
  // （lost contextのままthree.jsが能力取得で死ぬ）— 毎boot新品に差し替える
  const fresh = canvas.cloneNode(false);
  canvas.replaceWith(fresh);
  canvas = fresh;

  // three.js は WebGLコンテキストが「作れるのに能力が取れない」環境
  // （ソフトウェアレンダリング・ヘッドレス等）でコンストラクタ内からthrowする。
  // 演出の失敗でページを壊さない — 静的ヒーローのまま静かに諦める。
  let inst;
  try {
    inst = new Hero3D({ hero, heroFx, canvas, mobile, RAPIER });
  } catch (e) {
    warn('Hero3D init failed', e);
    return;
  }
  if (inst.ok) _instance = inst;
}

export function initHero3D({ mobile } = {}) {
  if (typeof window === 'undefined') return;
  if (!hasWebGL()) return; // WebGL不可なら静かに何もしない（静的ヒーローのまま）

  _currentMobile = mobile === undefined ? isMobile() : !!mobile;

  // ブレークポイント（motion.js が唯一の情報源 = BP.mobile=640）を購読。
  // モバイル⇔デスクトップが切り替わったら dispose → 新モードで再init。
  if (!_bpBound) {
    _bpBound = true;
    onBreakpointChange(() => {
      const now = isMobile();
      if (now === _currentMobile) return;
      _currentMobile = now;
      if (_instance) { _instance.dispose(); _instance = null; }
      boot(now);
    });
  }

  boot(_currentMobile);
}
