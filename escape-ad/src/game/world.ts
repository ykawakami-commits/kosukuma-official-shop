import { DESIGN_HEIGHT, tuning } from './tuning'
import { buildTestCourse, isGroundAt } from './course'
import { Particles } from './particles'
import { audio } from './audio'
import type { EmitState } from '../store'
import type { Course, GamePhase, Obstacle } from './types'

// プレイヤー見た目サイズ（デザインpx）。当たり判定は hitboxScale を掛けたもの。
export const SPRITE_W = 64
export const SPRITE_H = 72

const DEATH_Y = DESIGN_HEIGHT + 160
const COOKIE_R = 26 // Cookie 取得半径への加算

export interface PlayerView {
  x: number
  y: number
  prevX: number
  prevY: number
  stretch: number
  vy: number
  grounded: boolean
}

export interface CameraView {
  x: number
  prevX: number
  y: number
  shakeTimer: number
}

/** ?debug=1 用：直近のゲージ増加内訳 */
export interface GaugeDbg {
  gain: number
  base: number
  just: boolean
  comboBoost: boolean
}

export type Emit = (s: EmitState) => void

export class World {
  course: Course = buildTestCourse()
  particles = new Particles()

  phase: GamePhase = 'ready'

  player: PlayerView = {
    x: 0,
    y: 0,
    prevX: 0,
    prevY: 0,
    stretch: 0,
    vy: 0,
    grounded: true,
  }

  camera: CameraView = { x: 0, prevX: 0, y: 0, shakeTimer: 0 }

  private bufferTimer = 0
  private coyoteTimer = 0
  private jumpsUsed = 0
  private diving = false

  // かすり / スコア
  private grazedIds = new Set<number>()
  grazeScore = 0
  score = 0

  // コンボ
  combo = 0

  // Cookie
  cookiesCollected = 0
  goldenCollected = 0
  private cookieStreak = 0
  private cookieStreakTimer = 0

  // 死亡演出
  private hitstopTimer = 0
  private deathFxDone = false

  // 着地ジュース
  private freezeTimer = 0
  private dipTimer = 0
  private dipAmount = 0

  // AdBlock
  gauge = 0
  adblockActive = false
  adblockTimer = 0

  // テロップ
  telopText = ''
  telopTimer = 0

  // デバッグ計測
  gaugeDbg: GaugeDbg = { gain: 0, base: 0, just: false, comboBoost: false }

  progress = 0

  private last: EmitState | null = null

  constructor(private emit: Emit) {
    this.reset()
  }

  // --- ジャンプ物理（H/t）---------------------------------------------
  private gUp() {
    const t = tuning.jumpTime1
    return (2 * tuning.jumpHeight1) / (t * t)
  }
  private vForHeight(h: number) {
    return Math.sqrt(2 * this.gUp() * h)
  }

  // --- ライフサイクル ---------------------------------------------------
  reset() {
    this.course = buildTestCourse()
    const c = this.course
    const p = this.player
    p.x = 120
    p.y = c.groundY - SPRITE_H / 2
    p.prevX = p.x
    p.prevY = p.y
    p.vy = 0
    p.stretch = 0
    p.grounded = true
    this.bufferTimer = 0
    this.coyoteTimer = 0
    this.jumpsUsed = 0
    this.diving = false
    this.grazedIds.clear()
    this.grazeScore = 0
    this.score = 0
    this.combo = 0
    this.cookiesCollected = 0
    this.goldenCollected = 0
    this.cookieStreak = 0
    this.cookieStreakTimer = 0
    this.hitstopTimer = 0
    this.deathFxDone = false
    this.freezeTimer = 0
    this.dipTimer = 0
    this.dipAmount = 0
    this.gauge = 0
    this.adblockActive = false
    this.adblockTimer = 0
    this.telopText = ''
    this.telopTimer = 0
    this.progress = 0
    this.camera.x = Math.max(0, p.x - tuning.cameraOffsetX)
    this.camera.prevX = this.camera.x
    this.camera.y = 0
    this.camera.shakeTimer = 0
    this.particles.clear()
    this.phase = 'ready'
    this.pushState(true)
  }

  start() {
    if (this.phase === 'ready') {
      this.phase = 'playing'
      this.pushState(true)
    }
  }

  press() {
    if (this.phase === 'ready') {
      this.start()
      this.bufferTimer = tuning.jumpBufferMs / 1000
    } else if (this.phase === 'playing') {
      this.bufferTimer = tuning.jumpBufferMs / 1000
    } else if (this.phase === 'dead' || this.phase === 'clear') {
      if (this.deathFxDone || this.phase === 'clear') {
        this.reset()
        this.start()
        this.bufferTimer = tuning.jumpBufferMs / 1000
      }
    }
  }

  /** 下スワイプ＝急降下（空中のみ） */
  dive() {
    if (this.phase !== 'playing') return
    const p = this.player
    if (p.grounded) return
    p.vy = Math.max(p.vy, tuning.diveSpeed)
    this.diving = true
  }

  tryActivateAdblock() {
    if (this.phase === 'playing' && !this.adblockActive && this.gauge >= tuning.gaugeMax) {
      this.activateAdblock()
    }
  }

  // --- 固定タイムステップ更新 ------------------------------------------
  step(dt: number) {
    this.player.prevX = this.player.x
    this.player.prevY = this.player.y
    this.camera.prevX = this.camera.x

    if (this.camera.shakeTimer > 0) this.camera.shakeTimer -= dt
    if (this.telopTimer > 0) this.telopTimer -= dt
    this.animateClosing(dt)

    if (this.phase === 'dead') {
      this.stepDeath(dt)
      this.particles.update(dt)
      return
    }
    if (this.phase !== 'playing') return

    if (this.freezeTimer > 0) {
      this.freezeTimer -= dt
      return
    }

    const p = this.player

    if (this.bufferTimer > 0) this.bufferTimer -= dt
    this.tryJump()

    p.x += tuning.runSpeed * dt

    if (this.adblockActive) {
      this.adblockTimer -= dt
      if (this.adblockTimer <= 0) {
        this.adblockActive = false
        this.adblockTimer = 0
      }
    }

    // 重力（非対称）＋終端速度
    const g = this.gUp() * (p.vy < 0 ? 1 : tuning.fallMultiplier)
    p.vy += g * dt
    if (p.vy > tuning.terminalVelocity) p.vy = tuning.terminalVelocity
    p.y += p.vy * dt

    const wasGrounded = p.grounded
    const impactVy = p.vy
    this.resolveGround()
    if (!wasGrounded && p.grounded) this.onLand(impactVy)

    this.tryJump()

    if (p.grounded) {
      this.coyoteTimer = 0
    } else {
      this.coyoteTimer += dt
      if (this.jumpsUsed === 0 && this.coyoteTimer > tuning.coyoteMs / 1000) {
        this.jumpsUsed = 1
      }
    }

    const recover = Math.max(0, 1 - dt / tuning.squashRecover)
    p.stretch *= recover

    this.updateDip(dt)
    this.updateRetargets(dt)

    if (!this.adblockActive) this.checkObstacles()
    this.collectCookies()

    if (this.cookieStreakTimer > 0) {
      this.cookieStreakTimer -= dt
      if (this.cookieStreakTimer <= 0) this.cookieStreak = 0
    }

    if (this.gauge >= tuning.gaugeMax && tuning.adblockAuto >= 1 && !this.adblockActive) {
      this.activateAdblock()
    }

    if (p.y > DEATH_Y) this.die()

    if (p.x >= this.course.length) {
      this.phase = 'clear'
      this.progress = 100
      this.pushState(true)
    }

    this.camera.x = Math.max(0, p.x - tuning.cameraOffsetX)
    this.particles.update(dt)

    this.progress = Math.min(100, (p.x / this.course.length) * 100)
    this.pushState()
  }

  private stepDeath(dt: number) {
    if (this.deathFxDone) return
    if (this.hitstopTimer > 0) {
      this.hitstopTimer -= dt
      return
    }
    this.camera.shakeTimer = tuning.shakeDurationMs / 1000
    this.particles.explode(this.player.x, this.player.y)
    this.deathFxDone = true
  }

  // --- ジャンプ ---------------------------------------------------------
  private tryJump() {
    if (this.bufferTimer <= 0) return
    const p = this.player
    const coyoteOk = p.grounded || this.coyoteTimer <= tuning.coyoteMs / 1000

    if (this.jumpsUsed === 0 && coyoteOk) {
      p.vy = -this.vForHeight(tuning.jumpHeight1)
      p.grounded = false
      this.jumpsUsed = 1
      p.stretch = tuning.stretchAmount
      this.bufferTimer = 0
      audio.jump()
    } else if (this.jumpsUsed >= 1 && this.jumpsUsed < tuning.maxJumps) {
      p.vy = -this.vForHeight(tuning.jumpHeight1 * tuning.doubleJumpFactor)
      this.jumpsUsed += 1
      p.stretch = tuning.stretchAmount * 0.8
      this.bufferTimer = 0
      if (tuning.airRingEnabled >= 1) {
        this.particles.ring(p.x, p.y + SPRITE_H / 2, 64, 'rgba(180,220,255,0.85)', 3)
      }
      audio.doubleJump()
    }
  }

  private resolveGround() {
    const p = this.player
    const groundTop = this.course.groundY
    const feet = p.y + SPRITE_H / 2
    const overGround = isGroundAt(this.course, p.x)

    if (overGround && p.vy >= 0 && feet >= groundTop) {
      p.y = groundTop - SPRITE_H / 2
      p.vy = 0
      p.grounded = true
      this.jumpsUsed = 0
    } else {
      p.grounded = false
    }
  }

  private onLand(impactVy: number) {
    this.resetCombo() // 着地でコンボ途切れ
    this.diving = false
    const factor = Math.max(0, Math.min(1, impactVy / tuning.squashSpeedRef))
    this.player.stretch = -(tuning.squashMin + (tuning.squashMax - tuning.squashMin) * factor)
    const count = Math.round(
      tuning.dustBaseCount + (tuning.dustMaxCount - tuning.dustBaseCount) * factor,
    )
    this.particles.dust(this.player.x, this.course.groundY, count, factor)
    this.dipAmount = tuning.cameraDipMax * (0.4 + factor * 0.6)
    this.dipTimer = tuning.cameraDipMs / 1000
    if (impactVy > tuning.highFallThreshold && tuning.highFallHitstopMs > 0) {
      this.freezeTimer = tuning.highFallHitstopMs / 1000
    }
    audio.land(factor)
  }

  private resetCombo() {
    if (this.combo > 0) audio.comboBreak()
    this.combo = 0
  }

  private updateDip(dt: number) {
    const total = tuning.cameraDipMs / 1000
    if (this.dipTimer > 0 && total > 0) {
      this.dipTimer -= dt
      const prog = Math.max(0, Math.min(1, 1 - this.dipTimer / total))
      this.camera.y = Math.sin(prog * Math.PI) * this.dipAmount
    } else {
      this.camera.y = 0
    }
  }

  // --- リタゲ広告の追尾 -------------------------------------------------
  private updateRetargets(dt: number) {
    const p = this.player
    for (const o of this.course.obstacles) {
      if (o.type !== 'retarget' || o.closed) continue
      const cx = o.x + o.w / 2
      const cy = o.y + o.h / 2
      if (o.fleeTimer > 0) {
        // 逃走：上＆プレイヤーと反対方向へ素早く
        o.fleeTimer -= dt
        const dir = cx < p.x ? -1 : 1
        o.x += dir * tuning.retargetSpeed * 1.6 * dt
        o.y -= tuning.retargetSpeed * 1.2 * dt
      } else {
        // 追尾：プレイヤーへゆっくり（runSpeed 未満なら走り続ければ逃げ切れる）
        const dx = p.x - cx
        const dy = p.y - cy
        const d = Math.hypot(dx, dy) || 1
        o.x += (dx / d) * tuning.retargetSpeed * dt
        o.y += (dy / d) * tuning.retargetSpeed * dt
      }
    }
  }

  // --- 障害物 -----------------------------------------------------------
  private xBox(o: Obstacle) {
    const bw = 28
    const bh = 28
    const x0 = o.x + o.w - 24
    const y0 = o.y - 22
    return { x0, y0, bw, bh, cx: x0 + bw / 2, cy: y0 + bh / 2 }
  }

  private requiredHits(o: Obstacle): number {
    if (o.type === 'video') return tuning.videoHits
    if (o.type === 'retarget') return tuning.retargetHits
    if (o.type === 'noclose') return Infinity
    return 1
  }

  private checkObstacles() {
    const p = this.player
    const hw = (SPRITE_W / 2) * tuning.hitboxScale
    const hh = (SPRITE_H / 2) * tuning.hitboxScale
    const feet = p.y + hh
    const prevFeet = p.prevY + hh
    const m = tuning.grazeMargin

    for (const o of this.course.obstacles) {
      if (o.closed) continue
      if (o.x + o.w < p.x - 240 || o.x > p.x + 240) continue

      // --- ✕踏み（noclose 以外）---
      if (o.type !== 'noclose') {
        const b = this.xBox(o)
        const exHw = (b.bw / 2) * tuning.xHitboxScale
        const exHh = (b.bh / 2) * tuning.xHitboxScale
        const overX = p.x + hw > b.cx - exHw && p.x - hw < b.cx + exHw
        const stomp =
          p.vy > 0 && overX && prevFeet <= b.y0 + 6 && feet >= b.y0 - exHh
        if (stomp) {
          const justClose = Math.abs(p.x - b.cx) <= exHw * tuning.justCloseFraction
          this.onStomp(o, b.cx, b.y0, justClose)
          continue
        }
      }

      // --- 本体接触＝死亡 ---
      const hit =
        p.x + hw > o.x && p.x - hw < o.x + o.w && p.y + hh > o.y && p.y - hh < o.y + o.h
      if (hit) {
        this.die()
        return
      }

      // --- かすり ---
      if (!this.grazedIds.has(o.id)) {
        const graze =
          p.x + hw + m > o.x &&
          p.x - hw - m < o.x + o.w &&
          p.y + hh + m > o.y &&
          p.y - hh - m < o.y + o.h
        if (graze) {
          this.grazedIds.add(o.id)
          this.grazeScore += tuning.grazeScore
          this.addGauge(tuning.grazeGaugeGain, false)
          const gx = p.x < o.x ? o.x : o.x + o.w
          this.particles.graze(gx, Math.max(o.y, p.y))
          audio.graze()
        }
      }
    }
  }

  private onStomp(o: Obstacle, cx: number, topY: number, justClose: boolean) {
    const p = this.player
    this.combo += 1
    const mult = Math.min(tuning.comboMax, this.combo)
    const wasDiving = this.diving
    this.diving = false

    let bounce = tuning.stompBounceVel
    if (justClose) bounce *= tuning.justBounceMult
    if (wasDiving) bounce *= tuning.diveBounceMult
    p.vy = -bounce
    p.grounded = false
    this.jumpsUsed = 0 // ✕踏み継ぎで空中を渡れる
    p.stretch = tuning.stretchAmount * 0.6

    o.hits += 1
    let gain = tuning.stompGaugeGain
    if (justClose) gain += tuning.justGaugeBonus
    this.addGauge(gain, true)

    audio.stomp(this.combo)
    if (justClose) {
      audio.justClose()
      this.particles.gold(cx, topY)
      this.telop(`JUST CLOSE!  x${mult}`)
    }

    if (o.hits >= this.requiredHits(o)) {
      o.closed = true
      o.closeAnim = 0
      this.score += Math.round(tuning.stompScore * mult)
      this.particles.pop(cx, topY)
      if (!justClose) this.telop(this.combo >= 2 ? `広告を閉じた！ x${mult}` : '広告を閉じた！')
    } else {
      // 部分ヒット（閉じきっていない）
      this.score += Math.round(tuning.stompScore * 0.4 * mult)
      this.particles.pop(cx, topY)
      if (o.type === 'video') {
        o.muted = true
        audio.videoMute()
        if (!justClose) this.telop('ミュート…')
      } else if (o.type === 'retarget') {
        o.fleeTimer = 1.0
        audio.scream()
        if (!justClose) this.telop('逃げた！')
      }
    }
  }

  /** ゲージ加算（コンボ中ブースト込み）。debug 内訳も更新 */
  private addGauge(base: number, fromStomp: boolean) {
    const comboBoost = this.combo >= 2
    let gain = base
    if (comboBoost) gain *= tuning.comboGaugeMult
    this.gauge = Math.min(tuning.gaugeMax, this.gauge + gain)
    this.gaugeDbg = { gain, base, just: fromStomp, comboBoost }
  }

  private animateClosing(dt: number) {
    for (const o of this.course.obstacles) {
      if (o.closed && o.closeAnim < 1) o.closeAnim = Math.min(1, o.closeAnim + dt / 0.18)
    }
  }

  // --- Cookie -----------------------------------------------------------
  private collectCookies() {
    const p = this.player
    const r = SPRITE_W / 2 + COOKIE_R
    for (const ck of this.course.cookies) {
      if (ck.collected) continue
      if (Math.abs(ck.x - p.x) > 220) continue
      const dx = ck.x - p.x
      const dy = ck.y - p.y
      if (dx * dx + dy * dy <= r * r) {
        ck.collected = true
        this.cookiesCollected += 1
        if (ck.golden) this.goldenCollected += 1
        this.cookieStreak += 1
        this.cookieStreakTimer = 1.2
        this.particles.gold(ck.x, ck.y)
        audio.cookie(this.cookieStreak, ck.golden)
        if (ck.golden) this.telop('ゴールデンCookie!')
        this.pushState()
      }
    }
  }

  private activateAdblock() {
    this.adblockActive = true
    this.adblockTimer = tuning.adblockDurationSec
    this.gauge = 0
    this.telop('AdBlock!')
    audio.adblock()
    this.pushState(true)
  }

  private die() {
    if (this.phase === 'dead') return
    this.resetCombo()
    this.phase = 'dead'
    this.hitstopTimer = tuning.hitstopMs / 1000
    this.deathFxDone = false
    audio.death()
    this.pushState(true)
  }

  private telop(text: string) {
    this.telopText = text
    this.telopTimer = 1.0
  }

  // --- emit -------------------------------------------------------------
  private snapshot(): EmitState {
    return {
      phase: this.phase,
      progress: this.progress,
      grazeScore: this.grazeScore,
      score: this.score,
      gauge: this.gauge,
      gaugeReady: this.gauge >= tuning.gaugeMax && !this.adblockActive,
      adblockActive: this.adblockActive,
      adblockRemaining: this.adblockTimer,
      cookies: this.cookiesCollected,
      golden: this.goldenCollected,
      goldenTotal: this.course.goldenTotal,
    }
  }

  private pushState(force = false) {
    const s = this.snapshot()
    const l = this.last
    const changed =
      force ||
      !l ||
      l.phase !== s.phase ||
      Math.abs(l.progress - s.progress) > 0.6 ||
      l.grazeScore !== s.grazeScore ||
      l.score !== s.score ||
      Math.abs(l.gauge - s.gauge) >= 2 ||
      l.gaugeReady !== s.gaugeReady ||
      l.adblockActive !== s.adblockActive ||
      Math.round(l.adblockRemaining) !== Math.round(s.adblockRemaining) ||
      l.cookies !== s.cookies ||
      l.golden !== s.golden
    if (changed) {
      this.last = s
      this.emit(s)
    }
  }
}
