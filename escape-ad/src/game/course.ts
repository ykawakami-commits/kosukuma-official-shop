import { DESIGN_HEIGHT } from './tuning'
import type { Course, GroundSpan, Obstacle } from './types'

// =============================================================================
// テストコース（30秒程度）
// 平地 → 穴 → バナー障害物 を、ジャンプの楽しさを確かめる配置で並べる。
// 走行速度 330px/s なら ~10000px で約30秒。
// =============================================================================

const GROUND_Y = Math.round(DESIGN_HEIGHT * 0.78) // 562 付近

export function buildTestCourse(): Course {
  const spans: GroundSpan[] = []
  const obstacles: Obstacle[] = []
  let obstacleId = 0

  // カーソル。地面を継ぎ足しながら、間に穴やバナーを置いていく。
  let x = 0

  /** 長さ len の平地を足す */
  const flat = (len: number) => {
    spans.push({ x0: x, x1: x + len })
    x += len
  }
  /** 幅 gap の穴をあける（地面を置かずに進める） */
  const hole = (gap: number) => {
    x += gap
  }
  /** 直近の地面の上にバナー障害物を置く（中心 cx, 高さ h） */
  const banner = (cx: number, h: number, w = 70, label = 'AD') => {
    obstacles.push({
      id: obstacleId++,
      x: cx - w / 2,
      y: GROUND_Y - h,
      w,
      h,
      label,
    })
  }

  // --- 導入：たっぷり助走（操作に慣れる）---------------------------------
  flat(1400)

  // --- 小さい穴ひとつ（1段ジャンプで届く）-------------------------------
  hole(190)
  flat(900)

  // --- 低いバナー（軽いジャンプ）---------------------------------------
  banner(x - 500, 90)
  flat(700)

  // --- 連続バナー（リズムジャンプ）-------------------------------------
  banner(x - 350, 110)
  banner(x + 250, 130)
  flat(1000)

  // --- 広い穴（2段ジャンプ推奨）----------------------------------------
  hole(300)
  flat(700)

  // --- 穴＋直後にバナー（着地即ジャンプ＝入力バッファの見せ場）---------
  hole(210)
  banner(x + 120, 120)
  flat(900)

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

  // ゴールまでの距離は最後の地面の右端
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
