import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const hero = document.querySelector('.hero');
if (!hero) throw new Error('hero not found');

/* ── Canvas ラッパー ─────────────────────────────────────── */
const wrap = document.createElement('div');
wrap.id = 'konpeito-canvas';
hero.insertBefore(wrap, hero.firstChild);

/* ── Three.js 初期化 ────────────────────────────────────── */
const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setClearColor(0x000000, 0);
wrap.appendChild(renderer.domElement);

const scene  = new THREE.Scene();
const CAM_Z  = 8;
const FOV    = 60;
const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 100);
camera.position.z = CAM_Z;

/* ライト：柔らかいパステル感 */
scene.add(new THREE.AmbientLight(0xffffff, 1.3));
const sun = new THREE.DirectionalLight(0xfff5f0, 0.8);
sun.position.set(3, 6, 5);
scene.add(sun);
const fill = new THREE.DirectionalLight(0xf0f5ff, 0.4);
fill.position.set(-5, -3, 3);
scene.add(fill);

/* リサイズ */
const resize = () => {
  const w = hero.offsetWidth, h = hero.offsetHeight;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
};
resize();
window.addEventListener('resize', resize);

/* ── パレット（パステル） ───────────────────────────────── */
const PALETTE = [
  0xffc0cb, // ピンク
  0xaee6f5, // 水色
  0xfef08a, // 黄色
  0xbbe4b5, // 緑
  0xffffff, // 白
  0xffd8a8, // オレンジ
  0xe0c8f5, // 薄紫
  0xc8ecd8, // ミントグリーン
];

/* デスクトップ80個、モバイル35個 */
const COUNT = innerWidth < 768 ? 35 : 80;

/* ── パーティクル管理 ───────────────────────────────────── */
const parts = [];

/* ── ワールド空間の半幅・半高さを計算 ─────────────────── */
const worldHalfH = () =>
  Math.tan(THREE.MathUtils.degToRad(FOV / 2)) * CAM_Z;
const worldHalfW = () => worldHalfH() * camera.aspect;

/* ── GLB 読み込み ───────────────────────────────────────── */
new GLTFLoader().load(
  'https://kosukuma-official-shop.pages.dev/assets/3d/konpeito.glb',
  ({ scene: gltf }) => {
    /* モデルの大きさを正規化 */
    const box = new THREE.Box3().setFromObject(gltf);
    const size = box.getSize(new THREE.Vector3()).length();
    const scale = 1 / size; // 1 unit サイズに正規化

    for (let i = 0; i < COUNT; i++) {
      const grp = gltf.clone(true);

      /* パステルカラー適用 */
      const col = new THREE.Color(PALETTE[i % PALETTE.length]);
      grp.traverse(c => {
        if (c.isMesh) {
          c.material = c.material.clone();
          c.material.color = col;
          c.material.roughness = 0.4;
          c.material.metalness = 0.05;
        }
      });

      /* ランダムに画面全体へ散らす */
      const hw = worldHalfW() * 0.98;
      const hh = worldHalfH() * 0.98;
      const ihx = (Math.random() - 0.5) * 2 * hw;
      const ihy = (Math.random() - 0.5) * 2 * hh;
      const bz  = (Math.random() - 0.5) * 3; // 奥行きも少しバラす

      /* サイズ：小〜中でばらつかせる */
      const s = (0.05 + Math.random() * 0.08) * scale;
      grp.scale.setScalar(s);
      grp.position.set(ihx, ihy, bz);
      grp.rotation.set(
        Math.random() * Math.PI * 2,
        Math.random() * Math.PI * 2,
        Math.random() * Math.PI * 2,
      );
      scene.add(grp);

      parts.push({
        mesh: grp,
        ihx, ihy,
        hx: ihx, hy: ihy,
        vx: 0, vy: 0,
        /* ゆっくりふわふわ：speed を小さく */
        phase: Math.random() * Math.PI * 2,
        dp:    Math.random() * Math.PI * 2,
        sp:    0.12 + Math.random() * 0.18,   // ← ゆっくり
        /* 浮遊幅 */
        ampX:  0.15 + Math.random() * 0.20,
        ampY:  0.20 + Math.random() * 0.35,
        /* 自転速度（遅め） */
        rs: new THREE.Vector3(
          (Math.random() - 0.5) * 0.005,
          (Math.random() - 0.5) * 0.007,
          (Math.random() - 0.5) * 0.004,
        ),
      });
    }
  },
  undefined,
  err => console.warn('konpeito.glb load error:', err),
);

/* ── マウス座標（ワールド空間） ─────────────────────────── */
const mw = new THREE.Vector2(Infinity, Infinity);
document.addEventListener('mousemove', e => {
  const r = hero.getBoundingClientRect();
  if (e.clientX < r.left || e.clientX > r.right ||
      e.clientY < r.top  || e.clientY > r.bottom) {
    mw.set(Infinity, Infinity);
    return;
  }
  const ndcX =  ((e.clientX - r.left) / r.width)  * 2 - 1;
  const ndcY = -((e.clientY - r.top)  / r.height) * 2 + 1;
  mw.set(ndcX * worldHalfW(), ndcY * worldHalfH());
});

/* ── アニメーションループ ───────────────────────────────── */
let t = 0;
(function loop() {
  requestAnimationFrame(loop);
  t += 0.016;

  for (const p of parts) {
    /* ゆったり浮遊 */
    const fx = Math.cos(t * p.sp * 0.7 + p.dp)   * p.ampX;
    const fy = Math.sin(t * p.sp       + p.phase) * p.ampY;

    /* マウス反発 */
    const px = p.hx + fx;
    const py = p.hy + fy;
    const dx = px - mw.x;
    const dy = py - mw.y;
    const d2 = dx * dx + dy * dy;
    const R  = 1.8;
    if (d2 < R * R && d2 > 1e-4) {
      const d = Math.sqrt(d2);
      const f = (1 - d / R) * 0.16;
      p.vx += dx / d * f;
      p.vy += dy / d * f;
    }

    /* 初期位置へスプリング */
    p.vx += (p.ihx - p.hx) * 0.02;
    p.vy += (p.ihy - p.hy) * 0.02;

    /* 減衰 */
    p.vx *= 0.82;
    p.vy *= 0.82;

    p.hx += p.vx;
    p.hy += p.vy;

    p.mesh.position.x = p.hx + fx;
    p.mesh.position.y = p.hy + fy;

    /* ゆっくり自転 */
    p.mesh.rotation.x += p.rs.x;
    p.mesh.rotation.y += p.rs.y;
    p.mesh.rotation.z += p.rs.z;
  }

  renderer.render(scene, camera);
})();
