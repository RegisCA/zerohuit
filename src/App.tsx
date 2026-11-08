import { useEffect, useState } from 'react'
import { Board, type TapMode } from './components/Board'
import { flagCount, type Level } from './game/engine'
import { formatTime, useGame } from './hooks/useGame'
import { useTheme, type ThemePref } from './hooks/useTheme'

const LEVEL_LABELS: Record<Level, string> = { easy: 'Easy', medium: 'Medium', hard: 'Hard' }
const MODE_KEY = 'zerohuit:mode'

function usePortrait(): boolean {
  const query = '(orientation: portrait)'
  const [portrait, setPortrait] = useState(() => window.matchMedia(query).matches)
  useEffect(() => {
    const mq = window.matchMedia(query)
    const on = () => setPortrait(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return portrait
}

export default function App() {
  const { game, totalMs, undos, bestMs, lastWasBest, canUndo, penaltyTick, onReveal, onFlag, undo, restart } =
    useGame()
  const [theme, setTheme] = useTheme()
  const [mode, setMode] = useState<TapMode>(() => {
    try {
      return localStorage.getItem(MODE_KEY) === 'flag' ? 'flag' : 'reveal'
    } catch {
      return 'reveal'
    }
  })
  const [pendingLevel, setPendingLevel] = useState<Level | null>(null)
  const portrait = usePortrait()

  useEffect(() => {
    try {
      localStorage.setItem(MODE_KEY, mode)
    } catch {
      // ignore
    }
  }, [mode])

  const requestNew = (level: Level) => {
    if (game.status === 'playing') setPendingLevel(level)
    else restart(level)
  }

  const minesLeft = game.mines - flagCount(game)
  const over = game.status === 'won' || game.status === 'lost'
  // Wide boards rotate to stay large when the screen is taller than wide.
  const transposed = portrait ? game.cols > game.rows : game.rows > game.cols

  const themes: [ThemePref, string, string][] = [
    ['system', '◐', 'System theme'],
    ['light', '☀', 'Light theme'],
    ['dark', '☾', 'Dark theme'],
  ]

  return (
    <div className="app">
      <header className="bar">
        <div className="bar__group">
          <h1 className="wordmark">ZEROHUIT</h1>
          <div className="stat" title="Unmarked mines">
            <span className="mark mark--inline" />
            <span className={minesLeft < 0 ? 'stat__value stat__value--neg' : 'stat__value'}>{minesLeft}</span>
          </div>
          <div className="stat" title="Time">
            <span className="stat__value">{formatTime(totalMs)}</span>
            {penaltyTick > 0 && (
              <span key={penaltyTick} className="penalty">
                +15s
              </span>
            )}
          </div>
        </div>

        <div className="bar__group">
          <button type="button" className="btn btn--undo" onClick={undo} disabled={!canUndo} title="Undo (+15s)">
            ↶ Undo
          </button>

          {over ? (
            <div className={`result result--${game.status}`} role="status">
              <span className="result__title">{game.status === 'won' ? 'Cleared' : 'Not this time'}</span>
              {game.status === 'won' && lastWasBest && <span className="badge">Best</span>}
              {game.status === 'won' && !lastWasBest && bestMs !== undefined && (
                <span className="result__sub">best {formatTime(bestMs)}</span>
              )}
              {undos > 0 && (
                <span className="result__sub">
                  {undos} undo{undos > 1 ? 's' : ''}
                </span>
              )}
            </div>
          ) : (
            <div className="seg" role="group" aria-label="Tap action">
              <button
                type="button"
                className={`seg__btn ${mode === 'reveal' ? 'seg__btn--on' : ''}`}
                onClick={() => setMode('reveal')}
              >
                Open
              </button>
              <button
                type="button"
                className={`seg__btn ${mode === 'flag' ? 'seg__btn--on' : ''}`}
                onClick={() => setMode('flag')}
              >
                <span className="mark mark--inline" /> Mark
              </button>
            </div>
          )}

          <div className="seg" role="group" aria-label="Difficulty">
            {(Object.keys(LEVEL_LABELS) as Level[]).map((l) => (
              <button
                key={l}
                type="button"
                className={`seg__btn ${game.level === l ? 'seg__btn--on' : ''}`}
                onClick={() => requestNew(l)}
              >
                {LEVEL_LABELS[l]}
              </button>
            ))}
          </div>

          <div className="seg" role="group" aria-label="Theme">
            {themes.map(([t, icon, label]) => (
              <button
                key={t}
                type="button"
                className={`seg__btn seg__btn--icon ${theme === t ? 'seg__btn--on' : ''}`}
                onClick={() => setTheme(t)}
                title={label}
                aria-label={label}
              >
                {icon}
              </button>
            ))}
          </div>

          <button type="button" className="btn btn--primary" onClick={() => requestNew(game.level)}>
            New
          </button>
        </div>
      </header>

      <main className="main">
        <Board game={game} mode={mode} transposed={transposed} onReveal={onReveal} onFlag={onFlag} />

        {pendingLevel && (
          <div className="overlay" onClick={() => setPendingLevel(null)}>
            <div className="card" role="alertdialog" onClick={(e) => e.stopPropagation()}>
              <h2>Abandon this game?</h2>
              <p className="card__sub">Start a new {LEVEL_LABELS[pendingLevel].toLowerCase()} board instead.</p>
              <div className="card__actions">
                <button type="button" className="btn btn--ghost" onClick={() => setPendingLevel(null)}>
                  Keep playing
                </button>
                <button
                  type="button"
                  className="btn btn--primary"
                  onClick={() => {
                    restart(pendingLevel)
                    setPendingLevel(null)
                  }}
                >
                  New game
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
