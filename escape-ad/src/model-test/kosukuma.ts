import * as THREE from 'three'
import { tuning } from '../game/tuning'
import { COLORS, PARTS } from './constants'

export type AnimName = 'idle' | 'run' | 'jump' | 'death'
export type MatKind = 'standard' | 'toon'

const BASE_Y = 0.26 // 足が y=0（接地影）に来るよう持ち上げる量

interface Skin {
  mesh: THREE.Mesh
  color: string
}

// =============================================================================
// プリミティブ組み＋コード制御アニメーションの「こすくまくん」。
// リグ/外部モデル不要。パーツは別メッシュでグループ化し個別に動かす。
// =============================================================================
export class Kosukuma {
  group = new THREE.Group()
  private rig = new THREE.Group() // lean / squash 用
  private headG = new THREE.Group()
  private earL = new THREE.Group()
  private earR = new THREE.Group()
  private armL = new THREE.Group()
  private armR = new THREE.Group()
  private legL = new THREE.Group()
  private legR = new THREE.Group()

  private skins: Skin[] = []
  private matKind: MatKind = 'standard'

  anim: AnimName = 'idle'
  private t = 0

  // 耳スプリング状態（L/R 共有・対称）
  private earAngle = 0
  private earVel = 0
  private prevRootY = BASE_Y
  private prevRootVel = 0

  constructor() {
    this.build()
    this.group.add(this.rig)
    this.group.position.y = BASE_Y
  }

  // --- 構築 -------------------------------------------------------------
  private ellipsoid(rx: number, ry: number, rz: number, color: string) {
    const geo = new THREE.SphereGeometry(1, 32, 24)
    const mesh = new THREE.Mesh(geo, this.makeMat(color))
    mesh.scale.set(rx, ry, rz)
    this.skins.push({ mesh, color })
    return mesh
  }

  private capsule(r: number, len: number, color: string) {
    const geo = new THREE.CapsuleGeometry(r, len, 8, 16)
    const mesh = new THREE.Mesh(geo, this.makeMat(color))
    this.skins.push({ mesh, color })
    return mesh
  }

  private build() {
    const P = PARTS

    // 胴
    const body = this.ellipsoid(P.body.rx, P.body.ry, P.body.rz, COLORS.body)
    body.position.y = P.body.y
    this.rig.add(body)

    // 頭グループ
    this.headG.position.y = P.head.y
    const head = this.ellipsoid(P.head.rx, P.head.ry, P.head.rz, COLORS.body)
    this.headG.add(head)

    // 目×2 / 頬×2 / 口（頭グループにぶら下げる：頭の中心基準にオフセット）
    const eyeOff = P.eye.y - P.head.y
    for (const sx of [-1, 1]) {
      const eye = this.ellipsoid(P.eye.r, P.eye.r, P.eye.r, COLORS.eye)
      eye.position.set(sx * P.eye.x, eyeOff, P.eye.z)
      this.headG.add(eye)
      const cheek = this.ellipsoid(P.cheek.r, P.cheek.r * 0.7, P.cheek.r, COLORS.cheek)
      cheek.position.set(sx * P.cheek.x, P.cheek.y - P.head.y, P.cheek.z)
      this.headG.add(cheek)
    }
    const mouth = this.ellipsoid(P.mouth.r, P.mouth.r, P.mouth.r, COLORS.mouth)
    mouth.position.set(0, P.mouth.y - P.head.y, P.mouth.z)
    this.headG.add(mouth)

    // 耳×2（ピボットを耳の付け根に置き、メッシュをその先に）
    const earBaseOff = P.ear.y - P.head.y
    const setupEar = (g: THREE.Group, sx: number) => {
      g.position.set(sx * P.ear.x, earBaseOff, P.ear.z)
      const ear = this.ellipsoid(P.ear.r, P.ear.r * 1.15, P.ear.r * 0.85, COLORS.ear)
      g.add(ear)
      const inner = this.ellipsoid(
        P.ear.r * P.ear.innerScale,
        P.ear.r * P.ear.innerScale * 1.1,
        P.ear.r * 0.4,
        COLORS.innerEar,
      )
      inner.position.z = P.ear.r * 0.5
      g.add(inner)
      this.headG.add(g)
    }
    setupEar(this.earL, -1)
    setupEar(this.earR, 1)

    this.rig.add(this.headG)

    // 腕×2
    const setupArm = (g: THREE.Group, sx: number) => {
      g.position.set(sx * P.arm.x, P.arm.y, P.arm.z)
      const arm = this.capsule(P.arm.r, P.arm.len, COLORS.limb)
      arm.position.y = -P.arm.len / 2
      g.add(arm)
      this.rig.add(g)
    }
    setupArm(this.armL, -1)
    setupArm(this.armR, 1)

    // 脚×2
    const setupLeg = (g: THREE.Group, sx: number) => {
      g.position.set(sx * P.leg.x, P.leg.y, P.leg.z)
      const leg = this.capsule(P.leg.r, P.leg.len, COLORS.limb)
      leg.position.y = -P.leg.len / 2
      g.add(leg)
      this.rig.add(g)
    }
    setupLeg(this.legL, -1)
    setupLeg(this.legR, 1)
  }

  // --- マテリアル -------------------------------------------------------
  private makeMat(color: string): THREE.Material {
    const c = new THREE.Color(color)
    if (this.matKind === 'toon') {
      return new THREE.MeshToonMaterial({ color: c })
    }
    // マットなソフビ感：roughness 高め / metalness 0
    return new THREE.MeshStandardMaterial({ color: c, roughness: 0.95, metalness: 0 })
  }

  setMaterial(kind: MatKind) {
    if (kind === this.matKind) return
    this.matKind = kind
    for (const s of this.skins) {
      const old = s.mesh.material as THREE.Material
      s.mesh.material = this.makeMat(s.color)
      old.dispose()
    }
  }

  // --- アニメーション ---------------------------------------------------
  setAnim(name: AnimName) {
    this.anim = name
    this.t = 0
  }

  update(dt: number) {
    this.t += dt

    // 毎フレーム素の姿勢へリセットしてからアニメで上書き
    this.rig.scale.set(1, 1, 1)
    this.rig.rotation.set(0, 0, 0)
    this.armL.rotation.set(0, 0, 0)
    this.armR.rotation.set(0, 0, 0)
    this.legL.rotation.set(0, 0, 0)
    this.legR.rotation.set(0, 0, 0)
    this.group.visible = true
    let rootY = BASE_Y

    if (this.anim === 'idle') {
      rootY = BASE_Y + Math.sin(this.t * 2) * 0.04
    } else if (this.anim === 'run') {
      const f = 9
      const sw = Math.sin(this.t * f)
      this.legL.rotation.x = sw * 0.7
      this.legR.rotation.x = -sw * 0.7
      this.armL.rotation.x = -sw * 0.6
      this.armR.rotation.x = sw * 0.6
      rootY = BASE_Y + Math.abs(Math.sin(this.t * f)) * 0.14
      this.rig.rotation.x = 0.08 // わずかな前傾
    } else if (this.anim === 'jump') {
      const T = 1.4
      const phase = (this.t % T) / T
      if (phase < 0.7) {
        const ap = phase / 0.7
        rootY = BASE_Y + Math.sin(ap * Math.PI) * 1.3
        const vy = Math.cos(ap * Math.PI) // +上昇 → 0頂点 → -下降
        const stretch = tuning.stretchAmount * Math.max(0, vy)
        this.rig.scale.y = 1 + stretch
        this.rig.scale.x = 1 - stretch * 0.6
        this.rig.scale.z = 1 - stretch * 0.6
        this.legL.rotation.x = -0.5
        this.legR.rotation.x = -0.5
      } else {
        const lp = (phase - 0.7) / 0.3
        const sq = tuning.squashMax * (1 - lp)
        this.rig.scale.y = 1 - sq
        this.rig.scale.x = 1 + sq * 0.8
        this.rig.scale.z = 1 + sq * 0.8
      }
    } else if (this.anim === 'death') {
      const dp = Math.min(1, this.t / 0.35)
      const sq = 0.55 * dp
      this.rig.scale.y = 1 - sq
      this.rig.scale.x = 1 + sq
      this.rig.scale.z = 1 + sq
      rootY = BASE_Y
      // ビヨンと潰れて点滅
      if (dp >= 1) this.group.visible = Math.floor(this.t * 10) % 2 === 0
    }

    this.group.position.y = rootY

    // 耳スプリング：本体の上下加速度を入力に「ぷるん」と遅れて揺れる
    const rootVel = (rootY - this.prevRootY) / Math.max(dt, 1e-4)
    const rootAcc = (rootVel - this.prevRootVel) / Math.max(dt, 1e-4)
    this.prevRootY = rootY
    this.prevRootVel = rootVel

    const force = -tuning.earSpringK * this.earAngle - tuning.earSpringDamp * this.earVel
    this.earVel += force * dt - rootAcc * 0.012
    this.earAngle += this.earVel * dt
    const a = Math.max(-0.8, Math.min(0.8, this.earAngle))
    // 左右が少し開きつつ前後に揺れる
    this.earL.rotation.x = a
    this.earR.rotation.x = a
    this.earL.rotation.z = 0.15 + a * 0.2
    this.earR.rotation.z = -0.15 - a * 0.2
  }

  dispose() {
    for (const s of this.skins) {
      s.mesh.geometry.dispose()
      ;(s.mesh.material as THREE.Material).dispose()
    }
  }
}
