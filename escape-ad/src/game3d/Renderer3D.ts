import * as THREE from 'three'
import { CFG, COURSE, createSim } from './sim'
import { SFX, unlockAudio, setMutedGetter } from './audio3d'
import { use3DStore } from './store'

// =============================================================================
// Renderer3D — 命令的 Three.js 層（escape-ad-3d プロトタイプの描画/演出/入力を移植）。
// React の再レンダリングと分離し、rAF ループ内で sim(固定タイムステップ)を回す。
// HUD 表示用の値だけ store へ push する。物理状態 state は store に入れず ref で保持。
// =============================================================================

type ObsRec = {
  o: any
  group: THREE.Group
  panel?: THREE.Group
  xmark?: THREE.Mesh
  warn?: THREE.Mesh
}
type Part = { m: THREE.Mesh; vx: number; vy: number; vz: number; life: number }

const ROAD_W = 7
const WORLD_LEN = COURSE.goalD + 120
const DT = 1 / CFG.fps

export class Renderer3D {
  private renderer: THREE.WebGLRenderer
  private scene: THREE.Scene
  private camera: THREE.PerspectiveCamera
  private hemi: THREE.HemisphereLight
  private fill: THREE.PointLight

  private sim = createSim(CFG, COURSE)
  private state: any = null
  private phase: 'title' | 'play' | 'dead' | 'clear' = 'title'

  // こすくまくん
  private kosu = new THREE.Group()
  private creamMat = new THREE.MeshStandardMaterial({ color: 0xf2eac2, roughness: 0.95, metalness: 0 })
  private body!: THREE.Mesh
  private earL = new THREE.Group()
  private earR = new THREE.Group()
  private armL!: THREE.Mesh
  private armR!: THREE.Mesh
  private legLP = new THREE.Group()
  private legRP = new THREE.Group()
  private blob!: THREE.Mesh

  private adMats: THREE.MeshBasicMaterial[] = []
  private obsMeshes: ObsRec[] = []
  private parts: Part[] = []

  private NIGHT_SKY = new THREE.Color('#171233')
  private NIGHT_FOG = new THREE.Color('#1b1440')
  private CALM_SKY = new THREE.Color('#cfe3f7')
  private CALM_FOG = new THREE.Color('#d8e9fa')

  // ランタイム
  private seed = 20260612
  private AD_TOTAL = 0
  private tapQueued = false
  private gauge = 0
  private adblockLeft = 0
  private adblockFx = 0
  private hitstop = 0
  private shake = 0
  private deathTimer = 0
  private bestPct = 0
  private runStartT = 0
  private grazeCount = 0
  private stompCount = 0
  private deathCount = 0
  private squash = 1
  private squashV = 0
  private earVel = 0
  private earAng = 0
  private acc = 0
  private last = performance.now()
  private rafId = 0
  private barTick = 0
  private comboTimer = 0
  private toastTimer = 0

  // store actions（安定参照）
  private ui = use3DStore.getState()

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
    })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.setSize(window.innerWidth, window.innerHeight)
    this.renderer.outputColorSpace = THREE.SRGBColorSpace

    this.scene = new THREE.Scene()
    this.scene.background = this.NIGHT_SKY.clone()
    this.scene.fog = new THREE.Fog(this.NIGHT_FOG.clone(), 18, 95)
    this.camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 160)

    this.hemi = new THREE.HemisphereLight(0x8a7bd8, 0x141021, 0.85)
    this.scene.add(this.hemi)
    const key = new THREE.DirectionalLight(0xfff3e0, 0.7)
    key.position.set(4, 9, 6)
    this.scene.add(key)
    this.fill = new THREE.PointLight(0xff5d9e, 0.5, 30)
    this.scene.add(this.fill)

    setMutedGetter(() => use3DStore.getState().muted)

    this.buildKosukuma()
    this.buildWorld()
    this.buildObstacles()
    this.buildParticles()
    this.ui.setAdTotal(this.AD_TOTAL)

    this.onTap = this.onTap.bind(this)
    this.onKey = this.onKey.bind(this)
    this.onResize = this.onResize.bind(this)
    this.frame = this.frame.bind(this)

    window.addEventListener('pointerdown', this.onTap)
    window.addEventListener('keydown', this.onKey)
    window.addEventListener('resize', this.onResize)
    this.rafId = requestAnimationFrame(this.frame)
  }

  dispose() {
    cancelAnimationFrame(this.rafId)
    window.removeEventListener('pointerdown', this.onTap)
    window.removeEventListener('keydown', this.onKey)
    window.removeEventListener('resize', this.onResize)
    clearTimeout(this.comboTimer)
    clearTimeout(this.toastTimer)
    this.renderer.dispose()
  }

  // ---------- 乱数（広告配置を毎回同じに） ----------
  private rnd() {
    this.seed = (this.seed * 1664525 + 1013904223) >>> 0
    return this.seed / 4294967296
  }

  // ---------- テクスチャ ----------
  private srgb(t: THREE.CanvasTexture) {
    t.colorSpace = THREE.SRGBColorSpace
    return t
  }
  private makeAdTexture(i: number, big: boolean) {
    const AD_WORDS = [
      ['激安!!', '今だけ99%OFF'],
      ['今すぐ\nクリック', '▼'],
      ['残り3名', '急いで！'],
      ['副業で\n月50万', '※個人の感想です'],
      ['無料!!!', '(無料とは言ってない)'],
      ['あなたが\n100万人目', 'の訪問者です'],
      ['ヤセる', '飲むだけ'],
      ['PR', '広告'],
      ['閉じる→', '←こっちが閉じる'],
      ['おめでとう\nございます', 'タップで受取'],
    ]
    const AD_COLORS = ['#ff2e63', '#ffd400', '#21e6c1', '#ff7a00', '#b026ff', '#1f8bff', '#ff4fa3', '#9dff00']
    const s = big ? 512 : 256
    const c = document.createElement('canvas')
    c.width = s
    c.height = s
    const x = c.getContext('2d')!
    const col = AD_COLORS[i % AD_COLORS.length]
    const g = x.createLinearGradient(0, 0, s, s)
    g.addColorStop(0, col)
    g.addColorStop(1, '#11041f')
    x.fillStyle = g
    x.fillRect(0, 0, s, s)
    x.strokeStyle = '#fff'
    x.lineWidth = s * 0.03
    x.strokeRect(s * 0.03, s * 0.03, s * 0.94, s * 0.94)
    x.strokeStyle = col === '#ffd400' ? '#ff2e63' : '#ffd400'
    x.setLineDash([s * 0.06, s * 0.04])
    x.lineWidth = s * 0.015
    x.strokeRect(s * 0.07, s * 0.07, s * 0.86, s * 0.86)
    x.setLineDash([])
    const w = AD_WORDS[i % AD_WORDS.length]
    x.fillStyle = '#fff'
    x.textAlign = 'center'
    x.textBaseline = 'middle'
    x.shadowColor = '#000'
    x.shadowBlur = s * 0.04
    const lines = w[0].split('\n')
    x.font = '900 ' + (s * 0.21) / Math.max(1, lines.length * 0.8) + 'px sans-serif'
    lines.forEach((L, li) => x.fillText(L, s / 2, s * 0.4 + (li - (lines.length - 1) / 2) * s * 0.22))
    x.shadowBlur = 0
    x.fillStyle = '#ffe'
    x.font = '700 ' + s * 0.07 + 'px sans-serif'
    x.fillText(w[1], s / 2, s * 0.72)
    x.fillStyle = '#ffd400'
    x.fillRect(s * 0.22, s * 0.8, s * 0.56, s * 0.13)
    x.fillStyle = '#5b3a00'
    x.font = '900 ' + s * 0.075 + 'px sans-serif'
    x.fillText('今すぐGET ▶', s / 2, s * 0.868)
    x.fillStyle = '#fff3'
    x.fillRect(s * 0.9, s * 0.045, s * 0.06, s * 0.06)
    x.fillStyle = '#fff'
    x.font = '700 ' + s * 0.05 + 'px sans-serif'
    x.fillText('×', s * 0.93, s * 0.078)
    return this.srgb(new THREE.CanvasTexture(c))
  }
  private makeWindowTexture() {
    const c = document.createElement('canvas')
    c.width = 128
    c.height = 256
    const x = c.getContext('2d')!
    x.fillStyle = '#1b1830'
    x.fillRect(0, 0, 128, 256)
    for (let j = 0; j < 16; j++)
      for (let i = 0; i < 6; i++) {
        const lit = this.rnd() < 0.34
        x.fillStyle = lit ? (this.rnd() < 0.5 ? '#ffe7a8' : '#ffd986') : '#0d0b1c'
        if (lit && this.rnd() < 0.5) x.fillStyle = '#9fd8ff'
        x.fillRect(8 + i * 20, 8 + j * 15, 12, 9)
      }
    const t = this.srgb(new THREE.CanvasTexture(c))
    t.wrapS = t.wrapT = THREE.RepeatWrapping
    return t
  }
  private makeXTexture() {
    const c = document.createElement('canvas')
    c.width = 128
    c.height = 128
    const x = c.getContext('2d')!
    x.fillStyle = '#fff'
    x.fillRect(0, 0, 128, 128)
    x.strokeStyle = '#d4145a'
    x.lineWidth = 8
    x.strokeRect(4, 4, 120, 120)
    x.strokeStyle = '#222'
    x.lineWidth = 14
    x.lineCap = 'round'
    x.beginPath()
    x.moveTo(36, 36)
    x.lineTo(92, 92)
    x.moveTo(92, 36)
    x.lineTo(36, 92)
    x.stroke()
    return this.srgb(new THREE.CanvasTexture(c))
  }
  private makeSkipTexture() {
    const c = document.createElement('canvas')
    c.width = 1024
    c.height = 256
    const x = c.getContext('2d')!
    const g = x.createLinearGradient(0, 0, 1024, 0)
    g.addColorStop(0, '#21e6c1')
    g.addColorStop(1, '#1f8bff')
    x.fillStyle = g
    x.fillRect(0, 0, 1024, 256)
    x.fillStyle = '#08131f'
    x.font = '900 150px sans-serif'
    x.textAlign = 'center'
    x.textBaseline = 'middle'
    x.fillText('スキップ ▶▶', 512, 138)
    return this.srgb(new THREE.CanvasTexture(c))
  }

  // ---------- こすくまくん ----------
  private ball(r: number, sx?: number, sy?: number, sz?: number, mat?: THREE.Material) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(r, 20, 16), mat || this.creamMat)
    m.scale.set(sx || 1, sy || 1, sz || 1)
    return m
  }
  private buildKosukuma() {
    const darkMat = new THREE.MeshStandardMaterial({ color: 0x3a3530, roughness: 0.9 })
    this.body = this.ball(0.34, 1, 1.08, 0.95)
    this.body.position.y = 0.36
    this.kosu.add(this.body)
    const head = this.ball(0.3, 1.05, 1.0, 0.97)
    head.position.y = 0.86
    this.kosu.add(head)
    this.earL.position.set(-0.2, 1.1, 0)
    this.earR.position.set(0.2, 1.1, 0)
    this.earL.add(this.ball(0.105))
    this.earR.add(this.ball(0.105))
    this.kosu.add(this.earL, this.earR)
    const eyeL = this.ball(0.028, 1, 1, 1, darkMat),
      eyeR = this.ball(0.028, 1, 1, 1, darkMat)
    eyeL.position.set(-0.085, 0.9, -0.27)
    eyeR.position.set(0.085, 0.9, -0.27)
    const mouth = this.ball(0.014, 1.4, 1, 1, darkMat)
    mouth.position.set(0, 0.81, -0.285)
    this.kosu.add(eyeL, eyeR, mouth)
    this.armL = this.ball(0.105, 1, 1.15, 1)
    this.armR = this.ball(0.105, 1, 1.15, 1)
    this.armL.position.set(-0.3, 0.5, -0.1)
    this.armR.position.set(0.3, 0.5, -0.1)
    this.kosu.add(this.armL, this.armR)
    const legL = this.ball(0.115, 1, 1.2, 1),
      legR = this.ball(0.115, 1, 1.2, 1)
    this.legLP.position.set(-0.13, 0.18, 0)
    this.legRP.position.set(0.13, 0.18, 0)
    legL.position.y = -0.07
    legR.position.y = -0.07
    this.legLP.add(legL)
    this.legRP.add(legR)
    this.kosu.add(this.legLP, this.legRP)
    this.blob = new THREE.Mesh(
      new THREE.CircleGeometry(0.34, 20),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35 }),
    )
    this.blob.rotation.x = -Math.PI / 2
    this.scene.add(this.kosu, this.blob)
  }

  // ---------- 世界生成 ----------
  private buildWorld() {
    const scene = this.scene
    // 道路と歩道
    const road = new THREE.Mesh(
      new THREE.PlaneGeometry(ROAD_W, WORLD_LEN + 60),
      new THREE.MeshStandardMaterial({ color: 0x2b2b33, roughness: 1 }),
    )
    road.rotation.x = -Math.PI / 2
    road.position.set(0, 0, -WORLD_LEN / 2 + 30)
    scene.add(road)
    const walkMat = new THREE.MeshStandardMaterial({ color: 0x3a3a44, roughness: 1 })
    for (const sx of [-1, 1]) {
      const w = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.22, WORLD_LEN + 60), walkMat)
      w.position.set(sx * (ROAD_W / 2 + 1.7), 0.11, -WORLD_LEN / 2 + 30)
      scene.add(w)
    }
    const lineMat = new THREE.MeshBasicMaterial({ color: 0xbbbbcc })
    const lineGeo = new THREE.PlaneGeometry(0.14, 2.2)
    const lines = new THREE.InstancedMesh(lineGeo, lineMat, Math.floor(WORLD_LEN / 6))
    let M = new THREE.Object3D()
    for (let i = 0; i < lines.count; i++) {
      M.position.set(0, 0.012, -(i * 6 + 3))
      M.rotation.x = -Math.PI / 2
      M.updateMatrix()
      lines.setMatrixAt(i, M.matrix)
    }
    scene.add(lines)

    // ビル（両側）
    const winTex = this.makeWindowTexture()
    {
      const geo = new THREE.BoxGeometry(1, 1, 1)
      const mat = new THREE.MeshStandardMaterial({ map: winTex, color: 0xffffff, roughness: 0.95 })
      const N = 150
      const inst = new THREE.InstancedMesh(geo, mat, N)
      M = new THREE.Object3D()
      let i = 0
      for (const side of [-1, 1]) {
        let z = 20
        while (z < WORLD_LEN + 40 && i < N) {
          const w = 7 + this.rnd() * 7,
            h = 10 + this.rnd() * 26,
            dep = 8 + this.rnd() * 6
          M.position.set(side * (ROAD_W / 2 + 3.4 + dep / 2), h / 2, -(z + w / 2))
          M.scale.set(dep, h, w)
          M.rotation.set(0, 0, 0)
          M.updateMatrix()
          inst.setMatrixAt(i++, M.matrix)
          z += w + 1.2 + this.rnd() * 2
        }
      }
      inst.count = i
      scene.add(inst)
    }
    // 看板広告群：8デザイン×インスタンス
    const adTexs: THREE.Texture[] = []
    for (let i = 0; i < 8; i++) {
      adTexs.push(this.makeAdTexture(i, false))
      this.adMats.push(new THREE.MeshBasicMaterial({ map: adTexs[i] }))
    }
    {
      const per = 300
      const geo = new THREE.PlaneGeometry(1, 1)
      for (let k = 0; k < 8; k++) {
        const inst = new THREE.InstancedMesh(geo, this.adMats[k], per)
        M = new THREE.Object3D()
        let i = 0
        while (i < per) {
          const side = this.rnd() < 0.5 ? -1 : 1
          const z = 8 + this.rnd() * (WORLD_LEN + 30)
          const s = 0.9 + this.rnd() * 2.6
          const y = 0.8 + this.rnd() * 22
          M.position.set(side * (ROAD_W / 2 + 3.25), y, -z)
          M.scale.set(s, s * (0.6 + this.rnd() * 0.6), 1)
          M.rotation.set(0, side > 0 ? -Math.PI / 2 : Math.PI / 2, 0)
          M.updateMatrix()
          inst.setMatrixAt(i++, M.matrix)
        }
        this.AD_TOTAL += per
        scene.add(inst)
      }
    }
    // 空中フロート広告
    {
      const geo = new THREE.PlaneGeometry(2.6, 1.5)
      const floatAds = new THREE.InstancedMesh(geo, this.adMats[1], 80)
      M = new THREE.Object3D()
      for (let i = 0; i < 80; i++) {
        M.position.set((this.rnd() - 0.5) * 26, 8 + this.rnd() * 18, -(this.rnd() * WORLD_LEN))
        M.rotation.y = (this.rnd() - 0.5) * 1.2
        M.updateMatrix()
        floatAds.setMatrixAt(i, M.matrix)
      }
      this.AD_TOTAL += 80
      scene.add(floatAds)
    }
    // 縦のネオン看板「広告天国」
    {
      const c = document.createElement('canvas')
      c.width = 128
      c.height = 512
      const x = c.getContext('2d')!
      x.fillStyle = '#12041f'
      x.fillRect(0, 0, 128, 512)
      x.fillStyle = '#ff5d7e'
      x.font = '900 86px sans-serif'
      x.textAlign = 'center'
      x.textBaseline = 'middle'
      '広告天国'.split('').forEach((ch, i) => x.fillText(ch, 64, 70 + i * 120))
      x.strokeStyle = '#ffd400'
      x.lineWidth = 8
      x.strokeRect(6, 6, 116, 500)
      const tex = this.srgb(new THREE.CanvasTexture(c))
      const geo = new THREE.BoxGeometry(0.8, 4.4, 0.25)
      const mat = new THREE.MeshBasicMaterial({ map: tex })
      const inst = new THREE.InstancedMesh(geo, mat, 120)
      M = new THREE.Object3D()
      for (let i = 0; i < 120; i++) {
        const side = this.rnd() < 0.5 ? -1 : 1
        M.position.set(side * (ROAD_W / 2 + 2.4), 2.4 + this.rnd() * 9, -(6 + this.rnd() * WORLD_LEN))
        M.rotation.set(0, 0, 0)
        M.updateMatrix()
        inst.setMatrixAt(i, M.matrix)
      }
      this.AD_TOTAL += 120
      scene.add(inst)
    }
    // 電柱
    {
      const geo = new THREE.CylinderGeometry(0.09, 0.11, 7, 6)
      const mat = new THREE.MeshStandardMaterial({ color: 0x55505c, roughness: 1 })
      const inst = new THREE.InstancedMesh(geo, mat, 60)
      M = new THREE.Object3D()
      for (let i = 0; i < 60; i++) {
        const side = i % 2 ? -1 : 1
        M.position.set(side * (ROAD_W / 2 + 1.2), 3.5, -(i * 13 + 6))
        M.updateMatrix()
        inst.setMatrixAt(i, M.matrix)
      }
      scene.add(inst)
    }
  }

  // ---------- 障害物 ----------
  private buildObstacles() {
    const scene = this.scene
    const xTex = this.makeXTexture()
    const popupBigTexs: THREE.Texture[] = []
    for (let i = 0; i < 8; i++) popupBigTexs.push(this.makeAdTexture(i, true))
    for (const o of this.sim.obs) {
      const g = new THREE.Group()
      const rec: ObsRec = { o, group: g }
      if (o.t === 'bar') {
        const p = new THREE.Mesh(
          new THREE.BoxGeometry(2.0, o.h, o.w),
          new THREE.MeshBasicMaterial({ map: popupBigTexs[o.id % 8] }),
        )
        p.position.y = o.h / 2
        g.add(p)
        const frame = new THREE.Mesh(
          new THREE.BoxGeometry(2.1, 0.08, o.w + 0.04),
          new THREE.MeshBasicMaterial({ color: 0xff2e63 }),
        )
        frame.position.y = o.h + 0.02
        g.add(frame)
        g.position.set(0, 0, -o.d)
        this.AD_TOTAL++
      }
      if (o.t === 'popup' || o.t === 'float') {
        const panel = new THREE.Group()
        const p = new THREE.Mesh(
          new THREE.BoxGeometry(1.7, o.h, o.w),
          new THREE.MeshBasicMaterial({ map: popupBigTexs[(o.id * 3 + 1) % 8] }),
        )
        p.position.y = o.h / 2
        panel.add(p)
        const fr = new THREE.Mesh(
          new THREE.BoxGeometry(1.8, o.h + 0.08, o.w + 0.05),
          new THREE.MeshBasicMaterial({ color: 0xff2e63, wireframe: true }),
        )
        fr.position.y = o.h / 2
        panel.add(fr)
        const xm = new THREE.Mesh(
          new THREE.BoxGeometry(0.6, 0.1, o.w + 0.12),
          new THREE.MeshBasicMaterial({ map: xTex }),
        )
        xm.position.y = o.h + 0.05
        panel.add(xm)
        g.add(panel)
        rec.panel = panel
        rec.xmark = xm
        if (o.t === 'float') {
          g.position.set(0, o.y, -o.d)
          panel.position.y = 0
        } else {
          g.position.set(0, 0, -o.d)
          panel.position.y = -o.h - 0.3
          const warn = new THREE.Mesh(
            new THREE.PlaneGeometry(2.2, o.w + 0.6),
            new THREE.MeshBasicMaterial({ color: 0xff2e63, transparent: true, opacity: 0 }),
          )
          warn.rotation.x = -Math.PI / 2
          warn.position.y = 0.02
          g.add(warn)
          rec.warn = warn
        }
        this.AD_TOTAL++
      }
      if (o.t === 'truck') {
        const truck = new THREE.Group()
        const bodyM = new THREE.Mesh(
          new THREE.BoxGeometry(2.2, 1.9, o.len - 1.0),
          new THREE.MeshBasicMaterial({ map: popupBigTexs[(o.id * 5 + 2) % 8] }),
        )
        bodyM.position.set(0, 1.45, 0.4)
        truck.add(bodyM)
        const cab = new THREE.Mesh(
          new THREE.BoxGeometry(2.0, 1.1, 1.1),
          new THREE.MeshStandardMaterial({ color: 0xdddde6, roughness: 0.6 }),
        )
        cab.position.set(0, 0.75, -(o.len / 2 - 0.6))
        truck.add(cab)
        const wMat = new THREE.MeshStandardMaterial({ color: 0x111114 })
        for (const wz of [-(o.len / 2 - 0.8), o.len / 2 - 0.9])
          for (const wx of [-0.95, 0.95]) {
            const wh = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.25, 12), wMat)
            wh.rotation.z = Math.PI / 2
            wh.position.set(wx, 0.32, wz)
            truck.add(wh)
          }
        const lamp = new THREE.Mesh(
          new THREE.BoxGeometry(1.6, 0.12, 0.1),
          new THREE.MeshBasicMaterial({ color: 0xffd400 }),
        )
        lamp.position.set(0, 2.46, 0.4)
        truck.add(lamp)
        g.add(truck)
        this.AD_TOTAL += 2
      }
      if (o.t === 'pit') {
        const hole = new THREE.Mesh(
          new THREE.PlaneGeometry(ROAD_W - 0.4, o.w),
          new THREE.MeshBasicMaterial({ color: 0x000000 }),
        )
        hole.rotation.x = -Math.PI / 2
        hole.position.set(0, 0.015, -(o.d + o.w / 2))
        g.add(hole)
        const bgeo = new THREE.BoxGeometry(2.4, 0.5, 0.12)
        const c = document.createElement('canvas')
        c.width = 128
        c.height = 32
        const x = c.getContext('2d')!
        for (let i = 0; i < 8; i++) {
          x.fillStyle = i % 2 ? '#ffd400' : '#222'
          x.fillRect(i * 16, 0, 16, 32)
        }
        const bmat = new THREE.MeshBasicMaterial({ map: this.srgb(new THREE.CanvasTexture(c)) })
        for (const ed of [o.d - 0.25, o.d + o.w + 0.25]) {
          for (const sx of [-2, 0, 2]) {
            const b = new THREE.Mesh(bgeo, bmat)
            b.position.set(sx, 0.45, -ed)
            g.add(b)
          }
        }
      }
      scene.add(g)
      this.obsMeshes.push(rec)
    }
    // ゴール：巨大スキップゲート
    const skip = new THREE.Mesh(
      new THREE.PlaneGeometry(9, 2.2),
      new THREE.MeshBasicMaterial({ map: this.makeSkipTexture(), transparent: false }),
    )
    skip.position.set(0, 3.4, -(COURSE.goalD + 2))
    scene.add(skip)
    const pillarMat = new THREE.MeshBasicMaterial({ color: 0x21e6c1 })
    for (const sx of [-4.6, 4.6]) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.4, 4.6, 0.4), pillarMat)
      p.position.set(sx, 2.3, -(COURSE.goalD + 2))
      scene.add(p)
    }
  }

  // ---------- パーティクル ----------
  private buildParticles() {
    const geo = new THREE.SphereGeometry(0.05, 6, 5)
    for (let i = 0; i < 60; i++) {
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true }))
      m.visible = false
      this.scene.add(m)
      this.parts.push({ m, vx: 0, vy: 0, vz: 0, life: 0 })
    }
  }
  private burst(x: number, y: number, z: number, color: string, n: number, spd: number) {
    let c = 0
    for (const p of this.parts) {
      if (p.life > 0) continue
      p.m.visible = true
      ;(p.m.material as THREE.MeshBasicMaterial).color.set(color)
      ;(p.m.material as THREE.MeshBasicMaterial).opacity = 1
      p.m.position.set(x, y, z)
      p.vx = (this.rnd() - 0.5) * spd
      p.vy = this.rnd() * spd * 0.9
      p.vz = (this.rnd() - 0.5) * spd
      p.life = 0.5 + this.rnd() * 0.3
      if (++c >= n) break
    }
  }
  private updateParts(dt: number) {
    for (const p of this.parts) {
      if (p.life <= 0) continue
      p.life -= dt
      p.vy -= 9 * dt
      p.m.position.x += p.vx * dt
      p.m.position.y += p.vy * dt
      p.m.position.z += p.vz * dt
      ;(p.m.material as THREE.MeshBasicMaterial).opacity = Math.max(0, p.life * 2)
      if (p.life <= 0) p.m.visible = false
    }
  }

  // ---------- 進行 ----------
  private resetRun() {
    this.state = this.sim.newState()
    this.gauge = 0
    this.adblockLeft = 0
    this.hitstop = 0
    this.shake = 0
    this.squash = 1
    this.squashV = 0
    this.earAng = 0
    this.earVel = 0
    this.grazeCount = 0
    this.stompCount = 0
    this.runStartT = performance.now()
    for (const r of this.obsMeshes) {
      if (r.o.t === 'popup' && r.panel) {
        r.panel.position.y = -r.o.h - 0.3
        if (r.warn) (r.warn.material as THREE.MeshBasicMaterial).opacity = 0
      }
      r.group.visible = true
      if (r.panel) r.panel.visible = true
      if (r.o.t === 'truck') r.group.position.set(0, 0, 0)
    }
    this.setAdblockVisual(false)
  }
  private showToast(t: string, ms?: number) {
    this.ui.showToast(t)
    clearTimeout(this.toastTimer)
    this.toastTimer = window.setTimeout(() => this.ui.hideToast(), ms || 1400)
  }

  // ---------- 入力 ----------
  private onTap(e?: PointerEvent) {
    if (e && (e.target as HTMLElement)?.closest?.('[data-ui]')) return
    unlockAudio()
    if (this.phase === 'title') {
      this.resetRun()
      this.setPhase('play')
      this.showToast('広告地獄へようこそ', 1200)
      return
    }
    if (this.phase === 'play') {
      this.tapQueued = true
      return
    }
    if (this.phase === 'dead' && this.deathTimer <= 0) {
      this.resetRun()
      this.setPhase('play')
      return
    }
    if (this.phase === 'clear') {
      this.resetRun()
      this.setPhase('play')
      return
    }
  }
  private onKey(e: KeyboardEvent) {
    if (e.repeat) return
    if (e.code === 'Space' || e.code === 'ArrowUp') this.onTap()
  }
  private onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(window.innerWidth, window.innerHeight)
  }
  private setPhase(p: 'title' | 'play' | 'dead' | 'clear') {
    this.phase = p
    this.ui.setPhase(p)
  }

  // ---------- AdBlock 表示 ----------
  private setAdblockVisual(on: boolean) {
    for (const m of this.adMats) m.color.set(on ? 0x40405a : 0xffffff)
    this.hemi.intensity = on ? 1.15 : 0.85
    this.ui.setAdblockFlash(on)
  }
  private maybeAdblock() {
    if (this.adblockLeft <= 0 && this.gauge >= CFG.gaugeMax) {
      this.gauge = 0
      this.adblockLeft = CFG.adblockT
      SFX.adblk()
      this.setAdblockVisual(true)
      this.showToast('AdBlock 発動！広告が黙った', 1500)
    }
  }

  // ---------- イベント ----------
  private handleEvents(evs: string[]) {
    const state = this.state
    for (const e of evs) {
      if (e === 'jump') {
        SFX.jump()
        this.squashV = 4.5
      }
      if (e === 'djump') {
        SFX.djump()
        this.squashV = 4.5
        this.burst(0, state.y + 0.2, -state.d, '#9dd6ff', 8, 2.5)
      }
      if (e === 'land') {
        SFX.land()
        this.squashV = -6.5
        this.burst(0, 0.06, -state.d, '#cfc9b5', 8, 2.2)
      }
      if (e === 'stomp') {
        this.stompCount++
        SFX.stomp(state.combo)
        this.squashV = 5
        this.burst(0, state.y, -state.d, '#ffd400', 12, 3.2)
        this.gauge = Math.min(CFG.gaugeMax, this.gauge + 1.4)
        this.ui.showCombo(state.combo)
        clearTimeout(this.comboTimer)
        this.comboTimer = window.setTimeout(() => this.ui.hideCombo(), 900)
        this.shake = Math.max(this.shake, 0.1)
      }
      if (e === 'comboend') {
        /* noop */
      }
      if (e === 'graze') {
        this.grazeCount++
        SFX.graze()
        this.gauge = Math.min(CFG.gaugeMax, this.gauge + 1)
        this.burst(0, state.y + 0.5, -state.d, '#21e6c1', 5, 1.8)
        this.showToast('かすった！ +AdBlock', 700)
      }
      if (e === 'death') {
        this.deathCount++
        SFX.death()
        this.hitstop = 0.13
        this.shake = 0.5
        this.deathTimer = 0.55
        this.burst(0, state.y + 0.4, -state.d, '#ff2e63', 20, 4.5)
        this.setPhase('dead')
        const pct = Math.min(99, Math.floor((state.d / COURSE.goalD) * 100))
        this.bestPct = Math.max(this.bestPct, pct)
        setTimeout(() => {
          this.ui.setLpPct(pct)
          this.ui.setScreenReady(true)
        }, 420)
      }
      if (e === 'clear') {
        SFX.clear()
        this.setPhase('clear')
        const t = (performance.now() - this.runStartT) / 1000
        this.ui.setClear({
          timeS: t,
          deaths: this.deathCount,
          stomps: this.stompCount,
          grazes: this.grazeCount,
        })
        setTimeout(() => this.ui.setScreenReady(true), 300)
      }
    }
  }

  // ---------- メインループ（固定タイムステップ）----------
  private frame(now: number) {
    this.rafId = requestAnimationFrame(this.frame)
    let dt = (now - this.last) / 1000
    this.last = now
    if (dt > 0.25) dt = 0.25

    if (this.hitstop > 0) {
      this.hitstop -= dt
    } else if (this.phase === 'play') {
      this.acc += dt
      while (this.acc >= DT) {
        this.acc -= DT
        const evs = this.sim.step(this.state, this.tapQueued)
        this.tapQueued = false
        // AdBlock 中の死亡は pit 以外を巻き戻す（sim 外の簡易処理）
        if (this.adblockLeft > 0 && !this.state.alive && this.state.y > CFG.pitDeathY) {
          this.state.alive = true
          const i = evs.indexOf('death')
          if (i >= 0) evs.splice(i, 1)
        }
        this.handleEvents(evs)
        if (this.adblockLeft > 0) {
          this.adblockLeft -= DT
          if (this.adblockLeft <= 0) this.setAdblockVisual(false)
        }
        this.maybeAdblock()
        if (this.phase !== 'play') break
      }
    }
    if (this.deathTimer > 0) this.deathTimer -= dt

    // ---- 演出更新 ----
    const s = this.state || { d: 0, y: 0, vy: 0, f: 0, combo: 0, onGround: true }
    this.squashV += (1 - this.squash) * 60 * dt
    this.squashV *= Math.pow(0.0008, dt)
    this.squash += this.squashV * dt
    const targetEar = THREE.MathUtils.clamp(-s.vy * 0.05, -0.9, 0.9)
    this.earVel += (targetEar - this.earAng) * 70 * dt
    this.earVel *= Math.pow(0.0015, dt)
    this.earAng += this.earVel * dt

    this.kosu.position.set(0, s.y, -s.d)
    this.kosu.scale.set(1 / Math.sqrt(this.squash), this.squash, 1 / Math.sqrt(this.squash))
    this.earL.rotation.x = this.earAng
    this.earR.rotation.x = this.earAng
    const runT = now * 0.018
    if (s.onGround) {
      this.legLP.rotation.x = Math.sin(runT) * 0.9
      this.legRP.rotation.x = -Math.sin(runT) * 0.9
      this.armL.position.y = 0.5 + Math.sin(runT) * 0.03
      this.armR.position.y = 0.5 - Math.sin(runT) * 0.03
      this.body.position.y = 0.36 + Math.abs(Math.sin(runT)) * 0.03
      this.kosu.rotation.x = 0.07
    } else {
      this.legLP.rotation.x = 0.5
      this.legRP.rotation.x = -0.3
      this.kosu.rotation.x = THREE.MathUtils.clamp(-s.vy * 0.012, -0.25, 0.3)
    }
    this.blob.position.set(0, 0.018, -s.d)
    const bs = THREE.MathUtils.clamp(1 - s.y * 0.18, 0.25, 1)
    this.blob.scale.set(bs, bs, 1)
    let overPit = false
    for (const o of this.sim.obs) {
      if (o.t === 'pit' && s.d > o.z0 && s.d < o.z1) {
        overPit = true
        break
      }
    }
    this.blob.visible = !overPit

    // ポップアップせり上がり・✕踏みクローズ・トラック移動
    const isClosed = (id: number) => {
      if (!this.state) return false
      return id < 30
        ? !!((this.state.closed >> id) & 1)
        : !!((this.state.closedHi >> (id - 30)) & 1)
    }
    const closeFx = (r: ObsRec) => {
      r.panel!.visible = false
      this.burst(0, (r.o.y || 0) + r.o.h * 0.7, -r.o.d, '#ffffff', 10, 3.5)
    }
    for (const r of this.obsMeshes) {
      const o = r.o
      if (o.t === 'popup') {
        const h = this.sim.popupVisibleH(o, s.d)
        r.panel!.position.y = -o.h - 0.3 + (h / o.h) * (o.h + 0.3)
        if (r.warn) {
          const inWarn = s.d > o.appearD && h <= 0.01
          ;(r.warn.material as THREE.MeshBasicMaterial).opacity = inWarn
            ? 0.35 + 0.3 * Math.sin(now * 0.03)
            : 0
        }
        if (r.panel!.visible && isClosed(o.id)) closeFx(r)
      }
      if (o.t === 'float') {
        if (r.panel!.visible && isClosed(o.id)) closeFx(r)
        if (r.panel!.visible) r.group.position.y = o.y + Math.sin(now * 0.004 + o.id) * 0.06
      }
      if (o.t === 'truck') {
        const b = this.sim.truckBox(o, s.f || 0)
        r.group.position.set(0, 0, -((b.z0 + b.z1) / 2))
      }
    }

    // カメラ
    const fpv = use3DStore.getState().fpv
    this.kosu.visible = !fpv
    let cx = 0,
      cy: number,
      cz: number
    const lx = 0
    let ly: number,
      lz: number
    if (fpv) {
      cy = s.y + 1.45
      cz = -s.d - 0.1
      ly = s.y + 1.1
      lz = -s.d - 8
    } else {
      cy = 2.9 + s.y * 0.25
      cz = -s.d + 6.4
      ly = 1.15 + s.y * 0.5
      lz = -s.d - 5
    }
    if (this.shake > 0) {
      this.shake -= dt * 1.6
      cx += (this.rnd() - 0.5) * this.shake * 0.6
      cy += (this.rnd() - 0.5) * this.shake * 0.6
    }
    this.camera.position.set(cx, cy, cz)
    this.camera.lookAt(lx, ly, lz)
    this.fill.position.set(0, s.y + 2, -s.d - 3)

    // AdBlock 環境光ブレンド
    const tgt = this.adblockLeft > 0 ? 1 : 0
    this.adblockFx += (tgt - this.adblockFx) * Math.min(1, dt * 4)
    ;(this.scene.background as THREE.Color).copy(this.NIGHT_SKY).lerp(this.CALM_SKY, this.adblockFx)
    ;(this.scene.fog as THREE.Fog).color.copy(this.NIGHT_FOG).lerp(this.CALM_FOG, this.adblockFx)

    this.updateParts(dt)

    // HUD（連続値は間引いて push）
    if (this.state && ++this.barTick % 3 === 0) {
      const prog = Math.min(100, (this.state.d / COURSE.goalD) * 100)
      this.ui.setBars(prog, (this.gauge / CFG.gaugeMax) * 100)
    }

    this.renderer.render(this.scene, this.camera)
  }
}
