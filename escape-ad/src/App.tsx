import { GameCanvas } from './components/GameCanvas'
import { Overlay } from './components/Overlay'
import { DebugPanel } from './components/DebugPanel'
import { debugState } from './game/debug'

export default function App() {
  return (
    <div className="stage">
      <GameCanvas />
      <Overlay />
      {debugState.enabled && <DebugPanel />}
    </div>
  )
}
