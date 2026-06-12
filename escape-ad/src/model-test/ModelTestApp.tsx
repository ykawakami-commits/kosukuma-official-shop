import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { Kosukuma, type AnimName, type MatKind } from './kosukuma'
import { COMPARE_CAMERA, COLORS } from './constants'
import { tuning } from '../game/tuning'

const ANIMS: AnimName[] = ['idle', 'run', 'jump', 'death']

/** y=0 に置くソフトな接地影（CanvasTextureのラジアルグラデ）*/
function makeContactShadow(): THREE.Mesh {
  const size = 256
  const cv = document.createElement('canvas')
  cv.width = cv.height = size
  const c = cv.getContext('2d')!
  const g = c.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  g.addColorStop(0, 'rgba(60,50,30,0.32)')
  g.addColorStop(0.6, 'rgba(60,50,30,0.12)')
  g.addColorStop(1, 'rgba(60,50,30,0)')
  c.fillStyle = g
  c.fillRect(0, 0, size, size)
  const tex = new THREE.CanvasTexture(cv)
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false })
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 3.2), mat)
  mesh.rotation.x = -Math.PI / 2
  mesh.position.y = 0.001
  return mesh
}

export function ModelTestApp() {
  const mountRef = useRef<HTMLDivElement>(null)
  const kumaRef = useRef<Kosukuma | null>(null)
  const camRef = useRef<THREE.PerspectiveCamera | null>(null)
  const controlsRef = useRef<OrbitControls | null>(null)

  const [anim, setAnim] = useState<AnimName>('idle')
  const [mat, setMat] = useState<MatKind>('standard')
  const [refOpacity, setRefOpacity] = useState(0)
  const [refMissing, setRefMissing] = useState(false)
  const [earK, setEarK] = useState(tuning.earSpringK)
  const [earD, setEarD] = useState(tuning.earSpringDamp)

  // --- three セットアップ（マウント時1回）---
  useEffect(() => {
    const mount = mountRef.current!
    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setSize(mount.clientWidth, mount.clientHeight)
    mount.appendChild(renderer.domElement)

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(COLORS.ground)

    const camera = new THREE.PerspectiveCamera(
      40,
      mount.clientWidth / mount.clientHeight,
      0.1,
      100,
    )
    camera.position.set(...COMPARE_CAMERA.position)
    camRef.current = camera

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.target.set(...COMPARE_CAMERA.target)
    controls.update()
    controlsRef.current = controls

    // --- ライティング（やわらかさ最優先・強い影は禁止）---
    scene.add(new THREE.HemisphereLight(0xffffff, 0xddd6c0, 0.95))
    scene.add(new THREE.AmbientLight(0xffffff, 0.35))
    const key = new THREE.DirectionalLight(0xfff4e0, 0.6)
    key.position.set(2.5, 4, 3)
    scene.add(key)
    const fill = new THREE.DirectionalLight(0xe8f0ff, 0.25)
    fill.position.set(-3, 1.5, -2)
    scene.add(fill)

    scene.add(makeContactShadow())

    const kuma = new Kosukuma()
    kumaRef.current = kuma
    scene.add(kuma.group)

    let raf = 0
    let last = performance.now()
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop)
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      kuma.update(dt)
      controls.update()
      renderer.render(scene, camera)
    }
    raf = requestAnimationFrame(loop)

    const onResize = () => {
      const w = mount.clientWidth
      const h = mount.clientHeight
      renderer.setSize(w, h)
      camera.aspect = w / h
      camera.updateProjectionMatrix()
    }
    window.addEventListener('resize', onResize)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', onResize)
      controls.dispose()
      kuma.dispose()
      renderer.dispose()
      mount.removeChild(renderer.domElement)
    }
  }, [])

  // 状態 → モデルへ反映
  useEffect(() => kumaRef.current?.setAnim(anim), [anim])
  useEffect(() => kumaRef.current?.setMaterial(mat), [mat])
  useEffect(() => {
    tuning.earSpringK = earK
  }, [earK])
  useEffect(() => {
    tuning.earSpringDamp = earD
  }, [earD])

  const snapCompare = () => {
    const cam = camRef.current
    const ctrl = controlsRef.current
    if (!cam || !ctrl) return
    cam.position.set(...COMPARE_CAMERA.position)
    ctrl.target.set(...COMPARE_CAMERA.target)
    ctrl.update()
  }

  return (
    <div className="mt-stage">
      <div ref={mountRef} className="mt-canvas" />

      {/* 参考画像の重ね合わせ（並べて比較）*/}
      {!refMissing && (
        <img
          className="mt-ref"
          src="reference/kosukuma-3d.png"
          alt="reference"
          style={{ opacity: refOpacity }}
          onError={() => setRefMissing(true)}
        />
      )}

      <div className="mt-panel">
        <div className="mt-row">
          {ANIMS.map((a) => (
            <button
              key={a}
              className={`mt-btn ${anim === a ? 'on' : ''}`}
              onClick={() => setAnim(a)}
            >
              {a}
            </button>
          ))}
        </div>

        <div className="mt-row">
          <button
            className={`mt-btn ${mat === 'standard' ? 'on' : ''}`}
            onClick={() => setMat('standard')}
          >
            Standard
          </button>
          <button
            className={`mt-btn ${mat === 'toon' ? 'on' : ''}`}
            onClick={() => setMat('toon')}
          >
            Toon
          </button>
          <button className="mt-btn" onClick={snapCompare}>
            比較アングル
          </button>
        </div>

        <label className="mt-slider">
          参考画像 {refMissing ? '(未配置)' : `${Math.round(refOpacity * 100)}%`}
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={refOpacity}
            disabled={refMissing}
            onChange={(e) => setRefOpacity(Number(e.target.value))}
          />
        </label>

        <label className="mt-slider">
          耳ばね剛性 {earK.toFixed(0)}
          <input
            type="range"
            min={20}
            max={400}
            step={5}
            value={earK}
            onChange={(e) => setEarK(Number(e.target.value))}
          />
        </label>
        <label className="mt-slider">
          耳ばね減衰 {earD.toFixed(0)}
          <input
            type="range"
            min={2}
            max={40}
            step={1}
            value={earD}
            onChange={(e) => setEarD(Number(e.target.value))}
          />
        </label>

        {refMissing && (
          <p className="mt-note">
            public/reference/kosukuma-3d.png を置くと半透明で重ねて比較できます
          </p>
        )}
      </div>
    </div>
  )
}
