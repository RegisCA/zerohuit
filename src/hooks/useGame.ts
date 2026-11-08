import { useCallback, useEffect, useRef, useState } from 'react'
import { LEVELS, newGame, reveal, toggleFlag, type GameState, type Level } from '../game/engine'

const GAME_KEY = 'zerohuit:game'
const BEST_KEY = 'zerohuit:best'

/** Time added to the clock for each undo. */
export const UNDO_PENALTY_MS = 15_000
const HISTORY_LIMIT = 200

interface Saved {
  game: GameState
  /** Milliseconds played before the current run of the clock (penalties included). */
  elapsed: number
  undos: number
}

/** Best times keyed by board shape, so changing a level's size starts fresh. */
type BestTimes = Record<string, number>

export function bestKey(level: Level): string {
  const { rows, cols, mines } = LEVELS[level]
  return `${level}:${cols}x${rows}:${mines}`
}

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
  if (saved?.game?.cells?.length) return { ...saved, undos: saved.undos ?? 0 }
  return { game: newGame('medium'), elapsed: 0, undos: 0 }
}

function loadBest(): BestTimes {
  const raw = load<Record<string, number>>(BEST_KEY) ?? {}
  // v1 stored times by level name; Easy and Hard kept their shape.
  const out: BestTimes = {}
  for (const [k, v] of Object.entries(raw)) {
    if (k === 'easy' || k === 'hard') out[bestKey(k)] = v
    else if (k.includes(':')) out[k] = v
  }
  return out
}

export function useGame() {
  const [saved, setSaved] = useState<Saved>(initial)
  const { game, elapsed, undos } = saved
  const [best, setBest] = useState<BestTimes>(loadBest)
  const [now, setNow] = useState(() => Date.now())
  /** Wall-clock time the clock last (re)started, or null while stopped. */
  const runningSince = useRef<number | null>(null)
  /** Earlier states for undo. Kept in memory only; a reload clears it. */
  const history = useRef<GameState[]>([])
  const [historySize, setHistorySize] = useState(0)
  const [lastWasBest, setLastWasBest] = useState(false)
  /** Bumped on every undo so the UI can flash the penalty. */
  const [penaltyTick, setPenaltyTick] = useState(0)

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
        setNow(Date.now())
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

  useEffect(() => save(GAME_KEY, saved), [saved])

  const totalMs = elapsed + (runningSince.current !== null ? Math.max(0, now - runningSince.current) : 0)

  // Moves are computed outside the state updater: reveal() is random on the
  // first tap and the clock ref is mutated, neither of which may run twice.
  const savedRef = useRef<Saved>(saved)
  savedRef.current = saved

  /** Fold the running clock into `elapsed` and stop it. */
  const freeze = (s: Saved): number => {
    let el = s.elapsed
    if (runningSince.current !== null) {
      el += Date.now() - runningSince.current
      runningSince.current = null
    }
    return el
  }

  const apply = useCallback((next: (g: GameState) => GameState) => {
    const s = savedRef.current
    const g = next(s.game)
    if (g === s.game) return
    // The first tap can't be wrong (it's always safe), so it isn't undoable.
    if (s.game.status === 'playing') {
      history.current.push(s.game)
      if (history.current.length > HISTORY_LIMIT) history.current.shift()
      setHistorySize(history.current.length)
    }
    const el = g.status !== 'playing' ? freeze(s) : s.elapsed
    savedRef.current = { ...s, game: g, elapsed: el }
    setSaved(savedRef.current)
  }, [])

  const undo = useCallback(() => {
    const s = savedRef.current
    const prev = history.current.pop()
    if (!prev || s.game.status === 'won') {
      if (prev) history.current.push(prev)
      return
    }
    setHistorySize(history.current.length)
    // Keep the clock running if we're mid-game; the effect restarts it after a loss.
    let el = s.elapsed + UNDO_PENALTY_MS
    if (runningSince.current !== null) {
      el += Date.now() - runningSince.current
      runningSince.current = Date.now()
    }
    savedRef.current = { game: prev, elapsed: el, undos: s.undos + 1 }
    setSaved(savedRef.current)
    setPenaltyTick((t) => t + 1)
  }, [])

  // Record best time on a win.
  const recorded = useRef<GameState | null>(null)
  useEffect(() => {
    if (game.status !== 'won' || recorded.current === game) return
    recorded.current = game
    const key = bestKey(game.level)
    const prev = best[key]
    const isBest = prev === undefined || elapsed < prev
    setLastWasBest(isBest)
    if (isBest) {
      const next = { ...best, [key]: elapsed }
      setBest(next)
      save(BEST_KEY, next)
    }
  }, [game, elapsed, best])

  const onReveal = useCallback((i: number) => apply((g) => reveal(g, i)), [apply])
  const onFlag = useCallback((i: number) => apply((g) => toggleFlag(g, i)), [apply])
  const restart = useCallback((level: Level) => {
    runningSince.current = null
    history.current = []
    setHistorySize(0)
    setLastWasBest(false)
    setSaved({ game: newGame(level), elapsed: 0, undos: 0 })
  }, [])

  const canUndo = historySize > 0 && game.status !== 'won'
  const bestMs: number | undefined = best[bestKey(game.level)]

  return { game, totalMs, undos, bestMs, lastWasBest, canUndo, penaltyTick, onReveal, onFlag, undo, restart }
}

export function formatTime(ms: number): string {
  const s = Math.floor(ms / 1000)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}
