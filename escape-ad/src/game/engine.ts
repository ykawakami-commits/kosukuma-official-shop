import { World, type Emit } from './world'
import { Renderer } from './render'
import { debugState } from './debug'

// =============================================================================
// engine.ts — rAF ループ
// 固定タイムステップ60Hz（accumulator）でロジックを進め、余り時間を alpha として
// 補間レンダリング。これにより 60Hz / 120Hz どちらの端末でも挙動・速度が一致する。
// =============================================================================

const FIXED_DT = 1 / 60
const MAX_FRAME = 0.25 // スパイク保護（タブ復帰など）

export class Engine {
  world: World
  private renderer: Renderer
  private rafId = 0
  private accumulator = 0
  private lastTime = 0
  private running = false

  // FPS 計測
  private fpsAccum = 0
  private fpsFrames = 0

  constructor(
    private canvas: HTMLCanvasElement,
    emit: Emit,
  ) {
    this.world = new World(emit)
    this.renderer = new Renderer(canvas)

    this.onPointerDown = this.onPointerDown.bind(this)
    this.onResize = this.onResize.bind(this)
    this.loop = this.loop.bind(this)
  }

  start() {
    if (this.running) return
    this.running = true
    this.lastTime = performance.now()
    this.canvas.addEventListener('pointerdown', this.onPointerDown)
    window.addEventListener('resize', this.onResize)
    this.rafId = requestAnimationFrame(this.loop)
  }

  destroy() {
    this.running = false
    cancelAnimationFrame(this.rafId)
    this.canvas.removeEventListener('pointerdown', this.onPointerDown)
    window.removeEventListener('resize', this.onResize)
  }

  private onPointerDown(e: PointerEvent) {
    e.preventDefault()
    this.world.press()
  }

  private onResize() {
    this.renderer.resize()
  }

  private loop(now: number) {
    if (!this.running) return
    this.rafId = requestAnimationFrame(this.loop)

    let frame = (now - this.lastTime) / 1000
    this.lastTime = now
    if (frame > MAX_FRAME) frame = MAX_FRAME

    // FPS（実測）
    this.fpsAccum += frame
    this.fpsFrames += 1
    if (this.fpsAccum >= 0.5) {
      debugState.fps = this.fpsFrames / this.fpsAccum
      this.fpsAccum = 0
      this.fpsFrames = 0
    }

    // ヒットストップ（死亡直後100ms）は world.step 内でゲーム進行を凍結する。
    this.accumulator += frame
    let steps = 0
    while (this.accumulator >= FIXED_DT) {
      this.world.step(FIXED_DT)
      this.accumulator -= FIXED_DT
      if (++steps > 5) {
        // 取り戻しすぎ防止（重い端末でも破綻させない）
        this.accumulator = 0
        break
      }
    }

    const alpha = this.accumulator / FIXED_DT
    this.renderer.draw(this.world, alpha)
  }
}
