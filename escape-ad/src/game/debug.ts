// ?debug=1 のときだけ true。エンジン描画とパネル表示の共通スイッチ。
const params = new URLSearchParams(
  typeof window !== 'undefined' ? window.location.search : '',
)

export const debugState = {
  enabled: params.get('debug') === '1',
  /** エンジンが毎フレーム書き込む計測値（パネルが読む） */
  fps: 0,
}
