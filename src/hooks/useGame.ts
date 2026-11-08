import { useCallback, useEffect, useRef, useState } from 'react'
import { newGame, reveal, toggleFlag, type GameState, type Level } from '../game/engine'

const GAME_KEY = 'zerohuit:game'
const BEST_KEY = 'zerohuit:best'

interface Saved {
  game: GameState
  /** Milliseconds played before the current run of the clock. */
  elapsed: number
}

export type BestTimes = Partial<Record<Level, number>>

function load<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

function save(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // ignore persistence failures
  }
}

function initial(): Saved {
  const saved = load<Saved>(GAME_KEY)
  if (saved?.game?.cells?.length) return saved
  return { game: newGame('medium'), elapsed: 0 }
}

export function useGame() {
  const [{ game, elapsed }, setSaved] = useState<Saved>(initial)
  const [best, setBest] = useState<BestTimes>(() => load<BestTimes>(BEST_KEY) ?? {})
  const [now, setNow] = useState(() => Date.now())
  /** Wall-clock time the clock last (re)started, or null while stopped. */
  const runningSince = useRef<number | null>(null)
  const [lastWasBest, setLastWasBest] = useState(false)

  const playing = game.status === 'playing'

  // Start/stop the clock with the game status and page visibility.
  useEffect(() => {
    const stop = () => {
      if (runningSince.current !== null) {
        const since = runningSince.current
        runningSince.current = null
        setSaved((s) => ({ ...s, elapsed: s.elapsed + (Date.now() - since) }))
      }
    }
    const start = () => {
      if (playing && runningSince.current === null && document.visibilityState === 'visible') {
        runningSince.current = Date.now()
      }
    }
    const onVis = () => (document.visibilityState === 'visible' ? start() : stop())

    if (playing) start()
    else stop()
    document.addEventListener('visibilitychange', onVis)
    const id = playing ? window.setInterval(() => setNow(Date.now()), 250) : undefined
    return () => {
      document.removeEventListener('visibilitychange', onVis)
      if (id) window.clearInterval(id)
    }
  }, [playing])

  useEffect(() => save(GAME_KEY, { game, elapsed }), [game, elapsed])

  const totalMs = elapsed + (runningSince.current !== null ? Math.max(0, now - runningSince.current) : 0)

  // Moves are computed outside the state updater: reveal() is random on the
  // first tap and the clock ref is mutated, neither of which may run twice.
  const savedRef = useRef<Saved>({ game, elapsed })
  savedRef.current = { game, elapsed }
  const apply = useCallback((next: (g: GameState) => GameState) => {
    const s = savedRef.current
    const g = next(s.game)
    if (g === s.game) return
    let el = s.elapsed
    if (g.status !== 'playing' && runningSince.current !== null) {
      // Game just ended: freeze the clock at this exact moment.
      el += Date.now() - runningSince.current
      runningSince.current = null
    }
    savedRef.current = { game: g, elapsed: el }
    setSaved(savedRef.current)
  }, [])

  // Record best time on a win.
  const recorded = useRef<GameState | null>(null)
  useEffect(() => {
    if (game.status !== 'won' || recorded.current === game) return
    recorded.current = game
    const prev = best[game.level]
    const isBest = prev === undefined || elapsed < prev
    setLastWasBest(isBest)
    if (isBest) {
      const next = { ...best, [game.level]: elapsed }
      setBest(next)
      save(BEST_KEY, next)
    }
  }, [game, elapsed, best])

  const onReveal = useCallback((i: number) => apply((g) => reveal(g, i)), [apply])
  const onFlag = useCallback((i: number) => apply((g) => toggleFlag(g, i)), [apply])
  const restart = useCallback((level: Level) => {
    runningSince.current = null
    setLastWasBest(false)
    setSaved({ game: newGame(level), elapsed: 0 })
  }, [])

  return { game, totalMs, best, lastWasBest, onReveal, onFlag, restart }
}

export function formatTime(ms: number): string {
  const s = Math.floor(ms / 1000)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}
