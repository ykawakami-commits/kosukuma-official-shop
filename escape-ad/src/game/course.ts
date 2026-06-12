import { DESIGN_HEIGHT } from './tuning'
import type { Course, GroundSpan, Obstacle } from './types'

// =============================================================================
// テストコース（30秒程度）
// 平地 → 穴 → 広告バナー、加えて「✕踏み継ぎの空中ルート」を 1 区間。
// 走行速度 330px/s なら ~10000px で約30秒。
// =============================================================================

const GROUND_Y = Math.round(DESIGN_HEIGHT * 0.78) // 562 付近

export function buildTestCourse(): Course {
  const spans: GroundSpan[] = []
  const obstacles: Obstacle[] = []
  let obstacleId = 0

  let x = 0

  const flat = (len: number) => {
    spans.push({ x0: x, x1: x + len })
    x += len
  }
  const hole = (gap: number) => {
    x += gap
  }
  const push = (o: Omit<Obstacle, 'id' | 'closed' | 'closeAnim'>) => {
    obstacles.push({ ...o, id: obstacleId++, closed: false, closeAnim: 0 })
  }
  /** 地面の上に立つ広告（中心 cx, 高さ h） */
  const banner = (cx: number, h: number, w = 70, label = 'AD') => {
    push({ x: cx - w / 2, y: GROUND_Y - h, w, h, label, floating: false })
  }
  /** 空中に浮かぶ広告（中心 cx, 上端 topY, 高さ h）＝✕踏みの足場。
   *  幅を狭めて天面ほぼ全体が✕踏み判定に収まるようにし、踏み継ぎを成立させる。 */
  const floatBanner = (cx: number, topY: number, h = 92, w = 52, label = 'AD') => {
    push({ x: cx - w / 2, y: topY, w, h, label, floating: true })
  }

  // --- 導入：たっぷり助走 ----------------------------------------------
  flat(1400)

  // --- 小さい穴ひとつ --------------------------------------------------
  hole(190)
  flat(900)

  // --- 低いバナー ------------------------------------------------------
  banner(x - 500, 90)
  flat(700)

  // --- 連続バナー（リズムジャンプ）-------------------------------------
  banner(x - 350, 110)
  banner(x + 250, 130)
  flat(1000)

  // --- 広い穴（2段ジャンプ推奨）----------------------------------------
  hole(300)
  flat(700)

  // --- 穴＋直後にバナー（入力バッファの見せ場）-------------------------
  hole(210)
  banner(x + 120, 120)
  flat(900)

  // =====================================================================
  // ★ 並走ルート区間：地上＝安全 / 空中＝✕踏み継ぎ（上級・高スコア）
  //   地面はずっと続く（安全）。その上空に踏み台となる✕広告を 4 連で配置。
  //   踏むたび2段ジャンプが復活するので、空中を渡り切れる。
  // =====================================================================
  flat(120)
  {
    const top = GROUND_Y - 205 // 踏み台の上端（地上ジャンプ＋2段で届く高さ）
    const step = 340
    const base = x + 220
    for (let i = 0; i < 4; i++) {
      floatBanner(base + i * step, top - (i % 2 === 0 ? 0 : 26))
    }
    flat(step * 4 + 380) // 下は安全な地面（並走ルート）
  }

  // --- 高いバナー2連（2段ジャンプで越える）-----------------------------
  banner(x - 500, 170)
  banner(x + 200, 190)
  flat(1100)

  // --- 連続穴（コヨーテ＆リズム）---------------------------------------
  hole(170)
  flat(360)
  hole(170)
  flat(360)
  hole(200)
  flat(1000)

  // --- 最後の山場：穴→高バナー→穴 -------------------------------------
  banner(x - 600, 150)
  hole(240)
  flat(500)
  banner(x + 60, 160)
  flat(1200)

  const length = x

  return { length, groundY: GROUND_Y, spans, obstacles }
}

/** x に地面があるか（穴判定） */
export function isGroundAt(course: Course, x: number): boolean {
  for (const s of course.spans) {
    if (x >= s.x0 && x <= s.x1) return true
  }
  return false
}
