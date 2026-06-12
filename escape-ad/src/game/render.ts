import { DESIGN_HEIGHT, tuning } from './tuning'
import { debugState } from './debug'
import { SPRITE_W, SPRITE_H, World } from './world'

const lerp = (a: number, b: number, t: number) => a + (b - a) * t

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const rr = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + rr, y)
  ctx.arcTo(x + w, y, x + w, y + h, rr)
  ctx.arcTo(x + w, y + h, x, y + h, rr)
  ctx.arcTo(x, y + h, x, y, rr)
  ctx.arcTo(x, y, x + w, y, rr)
  ctx.closePath()
}

export class Renderer {
  private ctx: CanvasRenderingContext2D
  private cssW = 0
  private dpr = 1
  private scale = 1
  // シェイク用の擬似乱数（毎フレーム更新）
  private shakeX = 0
  private shakeY = 0

  constructor(private canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d', { alpha: false })
    if (!ctx) throw new Error('2D context unavailable')
    this.ctx = ctx
    this.resize()
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 3)
    const cssW = this.canvas.clientWidth || window.innerWidth
    const cssH = this.canvas.clientHeight || window.innerHeight
    this.canvas.width = Math.round(cssW * dpr)
    this.canvas.height = Math.round(cssH * dpr)
    this.dpr = dpr
    this.cssW = cssW
    this.scale = cssH / DESIGN_HEIGHT
  }

  draw(world: World, alpha: number) {
    const ctx = this.ctx
    const { scale, dpr } = this
    const p = world.player

    const camX = lerp(world.camera.prevX, world.camera.x, alpha)
    const px = lerp(p.prevX, p.x, alpha)
    const py = lerp(p.prevY, p.y, alpha)

    // シェイク（design px → css px は scale 倍だが見た目はcss基準で十分）
    if (world.camera.shakeTimer > 0) {
      const ratio = world.camera.shakeTimer / (tuning.shakeDurationMs / 1000)
      const mag = tuning.shakeMagnitude * ratio
      this.shakeX = (Math.random() * 2 - 1) * mag
      this.shakeY = (Math.random() * 2 - 1) * mag
    } else {
      this.shakeX = 0
      this.shakeY = 0
    }

    // ワールド座標（design単位）→ ピクセルへの変換行列
    const a = dpr * scale
    const e = (-camX * scale + this.shakeX) * dpr
    const f = this.shakeY * dpr
    ctx.setTransform(a, 0, 0, a, e, f)

    const visW = this.cssW / scale
    const left = camX - 40
    const right = camX + visW + 40

    this.drawBackground(left, right)
    this.drawGround(world, left, right)
    this.drawObstacles(world, left, right)
    this.drawShadow(world, px)
    this.drawPlayer(world, px, py)
    this.drawParticles(world)

    if (debugState.enabled) this.drawHitboxes(px, py)

    // --- 画面固定のデバッグ情報（screen px）---
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    if (debugState.enabled) this.drawDebugText(world)
  }

  private drawBackground(left: number, right: number) {
    const ctx = this.ctx
    const g = ctx.createLinearGradient(0, 0, 0, DESIGN_HEIGHT)
    g.addColorStop(0, '#1a2238')
    g.addColorStop(0.6, '#222c4a')
    g.addColorStop(1, '#2c3a5e')
    ctx.fillStyle = g
    ctx.fillRect(left, -20, right - left, DESIGN_HEIGHT + 240)

    // ゆっくり流れる遠景の丸（パララックス簡易）
    ctx.fillStyle = 'rgba(255,255,255,0.05)'
    const period = 520
    const startN = Math.floor(left / period)
    const endN = Math.ceil(right / period)
    for (let n = startN; n <= endN; n++) {
      const cx = n * period + 140
      ctx.beginPath()
      ctx.arc(cx, 150 + (n % 3) * 60, 70 + (n % 2) * 30, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  private drawGround(world: World, left: number, right: number) {
    const ctx = this.ctx
    const top = world.course.groundY
    const bottom = DESIGN_HEIGHT + 200
    for (const s of world.course.spans) {
      if (s.x1 < left || s.x0 > right) continue
      const x0 = s.x0
      const w = s.x1 - s.x0
      // 土
      ctx.fillStyle = '#5a4632'
      ctx.fillRect(x0, top, w, bottom - top)
      // 草の縁
      ctx.fillStyle = '#7ec850'
      ctx.fillRect(x0, top, w, 14)
      ctx.fillStyle = '#5fa83a'
      ctx.fillRect(x0, top + 14, w, 6)
    }
  }

  private drawObstacles(world: World, left: number, right: number) {
    const ctx = this.ctx
    for (const o of world.course.obstacles) {
      if (o.x + o.w < left || o.x > right) continue
      // 支柱
      ctx.fillStyle = '#3a3f4d'
      ctx.fillRect(o.x + o.w / 2 - 4, o.y, 8, o.h)
      // 看板
      ctx.fillStyle = '#ff4d4d'
      roundRect(ctx, o.x, o.y - 4, o.w, Math.min(o.h * 0.62, o.h - 8), 8)
      ctx.fill()
      ctx.fillStyle = '#ffffff'
      ctx.font = 'bold 26px system-ui, sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(o.label, o.x + o.w / 2, o.y - 4 + Math.min(o.h * 0.62, o.h - 8) / 2)
    }
  }

  private drawShadow(world: World, px: number) {
    const ctx = this.ctx
    const gy = world.course.groundY
    ctx.fillStyle = 'rgba(0,0,0,0.22)'
    const dist = Math.max(0, gy - (world.player.y + SPRITE_H / 2))
    const shrink = Math.max(0.4, 1 - dist / 400)
    ctx.beginPath()
    ctx.ellipse(px, gy + 4, (SPRITE_W / 2) * shrink, 8 * shrink, 0, 0, Math.PI * 2)
    ctx.fill()
  }

  private drawPlayer(world: World, px: number, py: number) {
    const ctx = this.ctx
    const p = world.player
    const stretch = p.stretch
    const sy = 1 + stretch
    const sx = 1 - stretch * 0.5
    const feetY = py + SPRITE_H / 2

    ctx.save()
    ctx.translate(px, feetY)
    ctx.scale(sx, sy)
    ctx.translate(0, -SPRITE_H / 2)

    // 走り脚（接地中のみ動かす）
    const stride = p.grounded ? Math.sin(px / 26) * 7 : 4
    ctx.fillStyle = '#b07a45'
    ctx.fillRect(-14, SPRITE_H / 2 - 6, 10, 12 + stride)
    ctx.fillRect(6, SPRITE_H / 2 - 6, 10, 12 - stride)

    // 耳
    ctx.fillStyle = '#caa275'
    ctx.beginPath()
    ctx.arc(-18, -SPRITE_H / 2 + 14, 12, 0, Math.PI * 2)
    ctx.arc(18, -SPRITE_H / 2 + 14, 12, 0, Math.PI * 2)
    ctx.fill()

    // 体（クリーム色の丸い体）
    ctx.fillStyle = '#f4e4c6'
    roundRect(ctx, -SPRITE_W / 2 + 4, -SPRITE_H / 2 + 6, SPRITE_W - 8, SPRITE_H - 10, 24)
    ctx.fill()

    // 頬
    ctx.fillStyle = '#ffc7b0'
    ctx.beginPath()
    ctx.arc(-16, 2, 6, 0, Math.PI * 2)
    ctx.arc(16, 2, 6, 0, Math.PI * 2)
    ctx.fill()

    // 目
    ctx.fillStyle = '#3a2a1c'
    ctx.beginPath()
    ctx.arc(-10, -6, 4.2, 0, Math.PI * 2)
    ctx.arc(10, -6, 4.2, 0, Math.PI * 2)
    ctx.fill()

    // 口
    ctx.strokeStyle = '#3a2a1c'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(0, 4, 5, 0.15 * Math.PI, 0.85 * Math.PI)
    ctx.stroke()

    ctx.restore()
  }

  private drawParticles(world: World) {
    const ctx = this.ctx
    for (const p of world.particles.list) {
      ctx.globalAlpha = Math.max(0, Math.min(1, p.life / p.maxLife))
      ctx.fillStyle = p.color
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size)
    }
    ctx.globalAlpha = 1
  }

  private drawHitboxes(px: number, py: number) {
    const ctx = this.ctx
    const hw = (SPRITE_W / 2) * tuning.hitboxScale
    const hh = (SPRITE_H / 2) * tuning.hitboxScale
    const m = tuning.grazeMargin
    // グレイズリング
    ctx.strokeStyle = 'rgba(80,255,200,0.9)'
    ctx.lineWidth = 1.5
    ctx.strokeRect(px - hw - m, py - hh - m, (hw + m) * 2, (hh + m) * 2)
    // 当たり判定
    ctx.strokeStyle = 'rgba(255,70,70,0.95)'
    ctx.lineWidth = 2
    ctx.strokeRect(px - hw, py - hh, hw * 2, hh * 2)
  }

  private drawDebugText(world: World) {
    const ctx = this.ctx
    ctx.fillStyle = 'rgba(0,0,0,0.55)'
    ctx.fillRect(8, 8, 168, 92)
    ctx.fillStyle = '#9bffd6'
    ctx.font = '12px ui-monospace, monospace'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'top'
    ctx.fillText(`FPS  ${debugState.fps.toFixed(0)}`, 16, 14)
    ctx.fillText(`phase ${world.phase}`, 16, 32)
    ctx.fillText(`prog  ${world.progress.toFixed(1)}%`, 16, 50)
    ctx.fillText(`graze ${world.grazeScore}`, 16, 68)
  }
}
