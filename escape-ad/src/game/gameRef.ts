import type { World } from './world'

// React 側（手動 AdBlock 発動ボタン等）から現在の World にアクセスするための窓口。
// Engine が start/destroy で出し入れする。
export const gameRef: { world: World | null } = { world: null }
