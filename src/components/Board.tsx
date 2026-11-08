import { useMemo, useRef } from 'react'
import { cellViews, type GameState } from '../game/engine'

export type TapMode = 'reveal' | 'flag'

interface BoardProps {
  game: GameState
  mode: TapMode
  /** Show the board rotated a quarter turn (rows become columns). */
  transposed: boolean
  onReveal: (i: number) => void
  onFlag: (i: number) => void
}

const LONG_PRESS_MS = 350
const MOVE_TOLERANCE = 12

export function Board({ game, mode, transposed, onReveal, onFlag }: BoardProps) {
  const { rows, cols, cells, status } = game
  const views = useMemo(() => cellViews(game), [game])
  const over = status === 'won' || status === 'lost'

  const dispRows = transposed ? cols : rows
  const dispCols = transposed ? rows : cols

  const press = useRef<{
    index: number
    x: number
    y: number
    timer: number
    fired: boolean
    pointerType: string
  } | null>(null)

  const indexFromTarget = (target: EventTarget | null): number | null => {
    const el = (target as HTMLElement | null)?.closest<HTMLElement>('[data-i]')
    return el ? Number(el.dataset.i) : null
  }

  const cancel = () => {
    if (press.current) window.clearTimeout(press.current.timer)
    press.current = null
  }

  const onPointerDown = (e: React.PointerEvent) => {
    if (over || e.button > 0) return
    const index = indexFromTarget(e.target)
    if (index === null) return
    cancel()
    const p = { index, x: e.clientX, y: e.clientY, timer: 0, fired: false, pointerType: e.pointerType }
    p.timer = window.setTimeout(() => {
      p.fired = true
      // Long press does the opposite of the current tap mode.
      if (mode === 'reveal') onFlag(index)
      else onReveal(index)
      navigator.vibrate?.(15)
    }, LONG_PRESS_MS)
    press.current = p
  }

  const onPointerMove = (e: React.PointerEvent) => {
    const p = press.current
    if (p && Math.hypot(e.clientX - p.x, e.clientY - p.y) > MOVE_TOLERANCE) cancel()
  }

  const onPointerUp = () => {
    const p = press.current
    if (!p) return
    window.clearTimeout(p.timer)
    press.current = null
    if (p.fired) return
    const cell = cells[p.index]
    if (mode === 'flag' && cell.state !== 'revealed') onFlag(p.index)
    else onReveal(p.index)
  }

  const onContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    // Touch long-press also fires contextmenu; that case is handled by the timer.
    if (press.current && press.current.pointerType !== 'mouse') return
    const index = indexFromTarget(e.target)
    if (index !== null && !over) onFlag(index)
  }

  const items = []
  for (let dr = 0; dr < dispRows; dr++) {
    for (let dc = 0; dc < dispCols; dc++) {
      const i = transposed ? dc * cols + dr : dr * cols + dc
      const cell = cells[i]
      const view = views[i]
      let cls = 'cell'
      let content: React.ReactNode = null
      if (cell.state === 'hidden') {
        cls += ' cell--hidden'
      } else if (cell.state === 'flagged') {
        cls += ' cell--flag'
        if (status === 'lost' && !cell.mine) cls += ' cell--wrong'
        else if (view === 'settled') cls += ' cell--settled'
        content = <span className="mark" />
      } else if (cell.mine) {
        cls += i === game.exploded ? ' cell--mine cell--exploded' : ' cell--mine'
        content = <span className="dot" />
      } else {
        cls += ` cell--open n${cell.adj}`
        if (view === 'settled') cls += ' cell--settled'
        if (view === 'overflagged') cls += ' cell--over'
        if (cell.adj > 0) content = <span className="num">{cell.adj}</span>
      }
      items.push(
        <div key={i} className={cls} data-i={i}>
          {content}
        </div>,
      )
    }
  }

  return (
    <div className="board-area">
      <div
        className={`board board--${status}`}
        style={{ '--rows': dispRows, '--cols': dispCols } as React.CSSProperties}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={cancel}
        onPointerLeave={cancel}
        onContextMenu={onContextMenu}
        role="grid"
        aria-label="Board"
      >
        {items}
      </div>
    </div>
  )
}
