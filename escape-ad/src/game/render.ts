import { DESIGN_HEIGHT, tuning } from './tuning'
import { debugState } from './debug'
import { SPRITE_W, SPRITE_H, World } from './world'
import type { Obstacle } from './types'

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
  private cssH = 0
  private dpr = 1
  private scale = 1
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
    this.cssH = cssH
    this.scale = cssH / DESIGN_HEIGHT
  }

  draw(world: World, alpha: number) {
    const ctx = this.ctx
    const { scale, dpr } = this
    const p = world.player

    const camX = lerp(world.camera.prevX, world.camera.x, alpha)
    const px = lerp(p.prevX, p.x, alpha)
    const py = lerp(p.prevY, p.y, alpha)

    if (world.camera.shakeTimer > 0) {
      const ratio = world.camera.shakeTimer / (tuning.shakeDurationMs / 1000)
      const mag = tuning.shakeMagnitude * ratio
      this.shakeX = (Math.random() * 2 - 1) * mag
      this.shakeY = (Math.random() * 2 - 1) * mag
    } else {
      this.shakeX = 0
      this.shakeY = 0
    }

    // ワールド→ピクセル変換（カメラ追従 + シェイク + マイクロディップ）
    const a = dpr * scale
    const e = (-camX * scale + this.shakeX) * dpr
    const f = (this.shakeY + world.camera.y * scale) * dpr
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

    if (debugState.enabled) this.drawHitboxes(world, px, py)

    // --- 画面固定（screen px）---
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    if (world.adblockActive) this.drawAdblockOverlay(world)
    this.drawTelop(world)
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
      ctx.fillStyle = '#5a4632'
      ctx.fillRect(x0, top, w, bottom - top)
      ctx.fillStyle = '#7ec850'
      ctx.fillRect(x0, top, w, 14)
      ctx.fillStyle = '#5fa83a'
      ctx.fillRect(x0, top + 14, w, 6)
    }
  }

  private drawObstacles(world: World, left: number, right: number) {
    const ctx = this.ctx
    const gray = world.adblockActive
    for (const o of world.course.obstacles) {
      if (o.x + o.w < left || o.x > right) continue
      if (o.closed && o.closeAnim >= 1) continue

      // 閉じる演出：縮みながらポン
      const s = o.closed ? 1 - o.closeAnim : 1
      if (s <= 0.02) continue

      const cx = o.x + o.w / 2
      const signH = Math.min(o.h * 0.62, o.h - 8)
      const signTop = o.y - 4

      // 支柱 / ハンガー
      ctx.fillStyle = gray ? '#5b6070' : '#3a3f4d'
      if (o.floating) {
        ctx.fillRect(cx - 3, o.y - 18, 6, 18) // 上に短いハンガー
      } else {
        ctx.fillRect(cx - 4, o.y, 8, o.h)
      }

      ctx.save()
      ctx.translate(cx, signTop + signH / 2)
      ctx.scale(s, s)

      // 看板本体
      ctx.fillStyle = gray ? '#888d99' : '#ff4d4d'
      roundRect(ctx, -o.w / 2, -signH / 2, o.w, signH, 8)
      ctx.fill()
      ctx.fillStyle = gray ? '#c8ccd4' : '#ffffff'
      ctx.font = 'bold 26px system-ui, sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(o.label, 0, 0)
      ctx.restore()

      // ✕ボタン（右上・別判定。閉じてない時のみ）
      if (!o.closed && !gray) this.drawCloseButton(o)
    }
  }

  private drawCloseButton(o: Obstacle) {
    const ctx = this.ctx
    const x0 = o.x + o.w - 24
    const y0 = o.y - 22
    ctx.fillStyle = '#ffffff'
    roundRect(ctx, x0, y0, 28, 28, 7)
    ctx.fill()
    ctx.strokeStyle = '#e23a3a'
    ctx.lineWidth = 3.5
    ctx.lineCap = 'round'
    const pad = 8
    ctx.beginPath()
    ctx.moveTo(x0 + pad, y0 + pad)
    ctx.lineTo(x0 + 28 - pad, y0 + 28 - pad)
    ctx.moveTo(x0 + 28 - pad, y0 + pad)
    ctx.lineTo(x0 + pad, y0 + 28 - pad)
    ctx.stroke()
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
    const sx = 1 - stretch // 横1.25×縦0.75（squash=-0.25）になるよう対称に
    const feetY = py + SPRITE_H / 2

    ctx.save()
    ctx.translate(px, feetY)
    ctx.scale(sx, sy)
    ctx.translate(0, -SPRITE_H / 2)

    const stride = p.grounded ? Math.sin(px / 26) * 7 : 4
    ctx.fillStyle = '#b07a45'
    ctx.fillRect(-14, SPRITE_H / 2 - 6, 10, 12 + stride)
    ctx.fillRect(6, SPRITE_H / 2 - 6, 10, 12 - stride)

    ctx.fillStyle = '#caa275'
    ctx.beginPath()
    ctx.arc(-18, -SPRITE_H / 2 + 14, 12, 0, Math.PI * 2)
    ctx.arc(18, -SPRITE_H / 2 + 14, 12, 0, Math.PI * 2)
    ctx.fill()

    ctx.fillStyle = '#f4e4c6'
    roundRect(ctx, -SPRITE_W / 2 + 4, -SPRITE_H / 2 + 6, SPRITE_W - 8, SPRITE_H - 10, 24)
    ctx.fill()

    ctx.fillStyle = '#ffc7b0'
    ctx.beginPath()
    ctx.arc(-16, 2, 6, 0, Math.PI * 2)
    ctx.arc(16, 2, 6, 0, Math.PI * 2)
    ctx.fill()

    ctx.fillStyle = '#3a2a1c'
    ctx.beginPath()
    ctx.arc(-10, -6, 4.2, 0, Math.PI * 2)
    ctx.arc(10, -6, 4.2, 0, Math.PI * 2)
    ctx.fill()

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
    for (const r of world.particles.rings) {
      ctx.globalAlpha = Math.max(0, Math.min(1, r.life / r.maxLife))
      ctx.strokeStyle = r.color
      ctx.lineWidth = r.width
      ctx.beginPath()
      ctx.arc(r.x, r.y, r.r, 0, Math.PI * 2)
      ctx.stroke()
    }
    ctx.globalAlpha = 1
  }

  private drawHitboxes(world: World, px: number, py: number) {
    const ctx = this.ctx
    const hw = (SPRITE_W / 2) * tuning.hitboxScale
    const hh = (SPRITE_H / 2) * tuning.hitboxScale
    const m = tuning.grazeMargin
    ctx.strokeStyle = 'rgba(80,255,200,0.9)'
    ctx.lineWidth = 1.5
    ctx.strokeRect(px - hw - m, py - hh - m, (hw + m) * 2, (hh + m) * 2)
    ctx.strokeStyle = 'rgba(255,70,70,0.95)'
    ctx.lineWidth = 2
    ctx.strokeRect(px - hw, py - hh, hw * 2, hh * 2)
    // ✕判定ボックス（甘め）
    ctx.strokeStyle = 'rgba(120,180,255,0.9)'
    for (const o of world.course.obstacles) {
      if (o.closed) continue
      const bx = o.x + o.w - 24
      const by = o.y - 22
      const exHw = 14 * tuning.xHitboxScale
      const exHh = 14 * tuning.xHitboxScale
      ctx.strokeRect(bx + 14 - exHw, by + 14 - exHh, exHw * 2, exHh * 2)
    }
  }

  private drawAdblockOverlay(world: World) {
    const ctx = this.ctx
    const remain = world.adblockTimer
    const warn = remain < 1 // 終了1秒前に点滅警告
    const blink = warn ? 0.5 + 0.5 * Math.sin(remain * 30) : 1
    // 「きれいなページ」風の白いベール
    ctx.fillStyle = `rgba(255,255,255,${0.12 * blink})`
    ctx.fillRect(0, 0, this.cssW, this.cssH)
    // バッジ
    ctx.fillStyle = warn ? `rgba(255,90,90,${blink})` : 'rgba(90,200,150,0.95)'
    ctx.font = 'bold 20px system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    ctx.fillText(`AdBlock  ${remain.toFixed(1)}s`, this.cssW / 2, 44)
  }

  private drawTelop(world: World) {
    if (world.telopTimer <= 0 || !world.telopText) return
    const ctx = this.ctx
    ctx.globalAlpha = Math.min(1, world.telopTimer / 0.4)
    ctx.fillStyle = '#fff7e6'
    ctx.font = 'bold 28px system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.lineWidth = 5
    ctx.strokeStyle = 'rgba(0,0,0,0.5)'
    ctx.strokeText(world.telopText, this.cssW / 2, this.cssH * 0.32)
    ctx.fillText(world.telopText, this.cssW / 2, this.cssH * 0.32)
    ctx.globalAlpha = 1
  }

  private drawDebugText(world: World) {
    const ctx = this.ctx
    ctx.fillStyle = 'rgba(0,0,0,0.55)'
    ctx.fillRect(8, 8, 176, 110)
    ctx.fillStyle = '#9bffd6'
    ctx.font = '12px ui-monospace, monospace'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'top'
    ctx.fillText(`FPS  ${debugState.fps.toFixed(0)}`, 16, 14)
    ctx.fillText(`phase ${world.phase}`, 16, 32)
    ctx.fillText(`prog  ${world.progress.toFixed(1)}%`, 16, 50)
    ctx.fillText(`graze ${world.grazeScore}  sc ${world.score}`, 16, 68)
    ctx.fillText(
      `gauge ${world.gauge.toFixed(0)}${world.adblockActive ? ' AB' : ''}`,
      16,
      86,
    )
  }
}
