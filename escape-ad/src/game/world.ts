import { DESIGN_HEIGHT, tuning } from './tuning'
import { buildTestCourse, isGroundAt } from './course'
import { Particles } from './particles'
import type { Course, GamePhase } from './types'

// プレイヤー見た目サイズ（デザインpx）。当たり判定は hitboxScale を掛けたもの。
export const SPRITE_W = 64
export const SPRITE_H = 72

const DEATH_Y = DESIGN_HEIGHT + 160

export interface PlayerView {
  x: number
  y: number
  prevX: number
  prevY: number
  stretch: number // +で縦伸び / -で潰れ
  vy: number
  grounded: boolean
}

export interface CameraView {
  x: number
  prevX: number
  y: number
  shakeTimer: number
}

export type Emit = (s: {
  phase: GamePhase
  progress: number
  grazeScore: number
}) => void

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

  // 入力・ジャンプ状態
  private bufferTimer = 0 // 入力バッファ残り (s)
  private coyoteTimer = 0 // 接地からの経過 (s)
  private jumpsUsed = 0

  // かすり
  private grazedIds = new Set<number>()
  grazeScore = 0

  // 死亡演出
  private hitstopTimer = 0
  private deathFxDone = false

  progress = 0

  constructor(private emit: Emit) {
    this.reset()
  }

  // --- ライフサイクル ---------------------------------------------------
  reset() {
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
    this.grazedIds.clear()
    this.grazeScore = 0
    this.hitstopTimer = 0
    this.deathFxDone = false
    this.progress = 0
    this.camera.x = Math.max(0, p.x - tuning.cameraOffsetX)
    this.camera.prevX = this.camera.x
    this.camera.shakeTimer = 0
    this.particles.clear()
    this.phase = 'ready'
    this.pushState()
  }

  start() {
    if (this.phase === 'ready') {
      this.phase = 'playing'
      this.pushState()
    }
  }

  /** タップ。状態に応じて開始 / ジャンプ / リスタート */
  press() {
    if (this.phase === 'ready') {
      this.start()
      this.bufferTimer = tuning.jumpBufferMs / 1000 // 開始タップでそのままジャンプ
    } else if (this.phase === 'playing') {
      this.bufferTimer = tuning.jumpBufferMs / 1000
    } else if (this.phase === 'dead' || this.phase === 'clear') {
      // 演出が一段落していれば即リスタート
      if (this.deathFxDone || this.phase === 'clear') {
        this.reset()
        this.start()
        this.bufferTimer = tuning.jumpBufferMs / 1000
      }
    }
  }

  // --- 固定タイムステップ更新 ------------------------------------------
  step(dt: number) {
    // 補間用に前状態を保存
    this.player.prevX = this.player.x
    this.player.prevY = this.player.y
    this.camera.prevX = this.camera.x

    if (this.camera.shakeTimer > 0) this.camera.shakeTimer -= dt

    if (this.phase === 'dead') {
      this.stepDeath(dt)
      this.particles.update(dt)
      return
    }
    if (this.phase !== 'playing') return

    const p = this.player

    // 1) 入力バッファ減衰
    if (this.bufferTimer > 0) this.bufferTimer -= dt

    // 2) 接地状態の前ジャンプ（バッファ済みの空中/地上ジャンプを即発火）
    this.tryJump()

    // 3) 水平移動（自動で右へ）
    p.x += tuning.runSpeed * dt

    // 4) 重力（上昇/下降で非対称）
    const g = tuning.gravityUp * (p.vy < 0 ? 1 : tuning.fallMultiplier)
    p.vy += g * dt
    if (tuning.maxFallSpeed > 0 && p.vy > tuning.maxFallSpeed) {
      p.vy = tuning.maxFallSpeed
    }
    p.y += p.vy * dt

    // 5) 地面との衝突 / 着地
    const wasGrounded = p.grounded
    this.resolveGround()
    if (!wasGrounded && p.grounded) this.onLand()

    // 6) 着地直後のバッファ発火（着地と同フレームでジャンプ）
    this.tryJump()

    // 7) コヨーテ：接地中は0、空中で加算。期限切れで地上ジャンプを消費扱いに
    if (p.grounded) {
      this.coyoteTimer = 0
    } else {
      this.coyoteTimer += dt
      if (this.jumpsUsed === 0 && this.coyoteTimer > tuning.coyoteMs / 1000) {
        this.jumpsUsed = 1
      }
    }

    // 8) スクワッシュ&ストレッチの復帰
    const recover = Math.max(0, 1 - dt / tuning.squashRecover)
    p.stretch *= recover

    // 9) 障害物（当たり / かすり）
    this.checkObstacles()

    // 10) 穴に落ちて死亡
    if (p.y > DEATH_Y) this.die()

    // 11) ゴール
    if (p.x >= this.course.length) {
      this.phase = 'clear'
      this.progress = 100
      this.pushState()
    }

    // 12) カメラ追従
    this.camera.x = Math.max(0, p.x - tuning.cameraOffsetX)

    // 13) パーティクル
    this.particles.update(dt)

    // 進捗（%）
    const prog = Math.min(100, (p.x / this.course.length) * 100)
    if (Math.abs(prog - this.progress) > 0.4) {
      this.progress = prog
      this.pushState()
    } else {
      this.progress = prog
    }
  }

  private stepDeath(dt: number) {
    if (this.deathFxDone) return
    if (this.hitstopTimer > 0) {
      this.hitstopTimer -= dt
      return // ヒットストップ中は完全停止
    }
    // ヒットストップ明け → シェイク + 爆発を一度だけ
    this.camera.shakeTimer = tuning.shakeDurationMs / 1000
    this.particles.explode(this.player.x, this.player.y)
    this.deathFxDone = true
  }

  // --- 内部ヘルパ -------------------------------------------------------
  private tryJump() {
    if (this.bufferTimer <= 0) return
    const p = this.player
    const coyoteOk = p.grounded || this.coyoteTimer <= tuning.coyoteMs / 1000

    if (this.jumpsUsed === 0 && coyoteOk) {
      p.vy = -tuning.jumpVelocity
      p.grounded = false
      this.jumpsUsed = 1
      p.stretch = tuning.stretchAmount
      this.bufferTimer = 0
    } else if (this.jumpsUsed >= 1 && this.jumpsUsed < tuning.maxJumps) {
      p.vy = -tuning.jumpVelocity * tuning.doubleJumpFactor
      this.jumpsUsed += 1
      p.stretch = tuning.stretchAmount * 0.8
      this.bufferTimer = 0
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

  private onLand() {
    this.player.stretch = -tuning.squashAmount
    this.particles.dust(this.player.x, this.course.groundY)
  }

  private checkObstacles() {
    const p = this.player
    const hw = (SPRITE_W / 2) * tuning.hitboxScale
    const hh = (SPRITE_H / 2) * tuning.hitboxScale
    const m = tuning.grazeMargin

    for (const o of this.course.obstacles) {
      // x が遠いものはスキップ
      if (o.x + o.w < p.x - 200 || o.x > p.x + 200) continue

      const hit =
        p.x + hw > o.x &&
        p.x - hw < o.x + o.w &&
        p.y + hh > o.y &&
        p.y - hh < o.y + o.h
      if (hit) {
        this.die()
        return
      }

      if (!this.grazedIds.has(o.id)) {
        const graze =
          p.x + hw + m > o.x &&
          p.x - hw - m < o.x + o.w &&
          p.y + hh + m > o.y &&
          p.y - hh - m < o.y + o.h
        if (graze) {
          this.grazedIds.add(o.id)
          this.grazeScore += tuning.grazeScore
          // 接触側の角あたりで火花
          const gx = p.x < o.x ? o.x : o.x + o.w
          this.particles.graze(gx, Math.max(o.y, p.y))
          this.pushState()
        }
      }
    }
  }

  private die() {
    if (this.phase === 'dead') return
    this.phase = 'dead'
    this.hitstopTimer = tuning.hitstopMs / 1000
    this.deathFxDone = false
    this.pushState()
  }

  private pushState() {
    this.emit({
      phase: this.phase,
      progress: this.progress,
      grazeScore: this.grazeScore,
    })
  }
}
