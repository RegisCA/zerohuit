export type Level = 'easy' | 'medium' | 'hard'

export interface LevelSpec {
  rows: number
  cols: number
  mines: number
}

export const LEVELS: Record<Level, LevelSpec> = {
  easy: { rows: 9, cols: 9, mines: 10 },
  medium: { rows: 14, cols: 24, mines: 52 },
  hard: { rows: 16, cols: 30, mines: 99 },
}

export type CellState = 'hidden' | 'revealed' | 'flagged'

export interface Cell {
  mine: boolean
  /** Number of mines in the 8 surrounding cells. */
  adj: number
  state: CellState
}

export type Status = 'ready' | 'playing' | 'won' | 'lost'

export interface GameState {
  level: Level
  rows: number
  cols: number
  mines: number
  cells: Cell[]
  status: Status
  /** Index of the mine that ended the game, if lost. */
  exploded: number | null
}

export type Rng = () => number

export function newGame(level: Level): GameState {
  const { rows, cols, mines } = LEVELS[level]
  return {
    level,
    rows,
    cols,
    mines,
    cells: Array.from({ length: rows * cols }, () => ({ mine: false, adj: 0, state: 'hidden' as const })),
    status: 'ready',
    exploded: null,
  }
}

export function neighbors(i: number, rows: number, cols: number): number[] {
  const r = Math.floor(i / cols)
  const c = i % cols
  const out: number[] = []
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue
      const nr = r + dr
      const nc = c + dc
      if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) out.push(nr * cols + nc)
    }
  }
  return out
}

/**
 * Place mines anywhere except the first tapped cell and its neighbours, so the
 * first tap always opens an area.
 */
function placeMines(game: GameState, safe: number, rng: Rng): Cell[] {
  const { rows, cols, mines } = game
  const total = rows * cols
  let excluded = new Set([safe, ...neighbors(safe, rows, cols)])
  if (total - excluded.size < mines) excluded = new Set([safe])

  const candidates: number[] = []
  for (let i = 0; i < total; i++) if (!excluded.has(i)) candidates.push(i)
  // Partial Fisher–Yates: the first `mines` entries become the mines.
  for (let k = 0; k < mines; k++) {
    const j = k + Math.floor(rng() * (candidates.length - k))
    ;[candidates[k], candidates[j]] = [candidates[j], candidates[k]]
  }

  const cells = game.cells.map((c) => ({ ...c, mine: false, adj: 0 }))
  for (let k = 0; k < mines; k++) cells[candidates[k]].mine = true
  for (let i = 0; i < total; i++) {
    if (cells[i].mine) for (const n of neighbors(i, rows, cols)) cells[n].adj++
  }
  return cells
}

/** Reveal cells starting at each index, flooding through zeros. Mutates `cells`. */
function flood(cells: Cell[], start: number[], rows: number, cols: number): void {
  const stack = [...start]
  while (stack.length) {
    const i = stack.pop()!
    const cell = cells[i]
    if (cell.state !== 'hidden') continue
    cell.state = 'revealed'
    if (!cell.mine && cell.adj === 0) {
      for (const n of neighbors(i, rows, cols)) if (cells[n].state === 'hidden') stack.push(n)
    }
  }
}

function finish(game: GameState, cells: Cell[]): GameState {
  const hit = cells.findIndex((c) => c.mine && c.state === 'revealed')
  if (hit !== -1) {
    // Show every mine; leave flags in place so wrong ones can be marked.
    for (const c of cells) if (c.mine && c.state === 'hidden') c.state = 'revealed'
    return { ...game, cells, status: 'lost', exploded: hit }
  }
  const cleared = cells.every((c) => c.mine || c.state === 'revealed')
  if (cleared) {
    for (const c of cells) if (c.mine) c.state = 'flagged'
    return { ...game, cells, status: 'won' }
  }
  return { ...game, cells, status: 'playing' }
}

/**
 * Tap on a cell: reveals a hidden cell, or "chords" a revealed number whose
 * flag count matches (reveals all its unflagged neighbours).
 */
export function reveal(game: GameState, i: number, rng: Rng = Math.random): GameState {
  if (game.status === 'won' || game.status === 'lost') return game
  const { rows, cols } = game

  if (game.status === 'ready') {
    const cells = placeMines(game, i, rng)
    flood(cells, [i], rows, cols)
    return finish(game, cells)
  }

  const target = game.cells[i]
  if (target.state === 'flagged') return game

  if (target.state === 'revealed') {
    if (target.adj === 0) return game
    const around = neighbors(i, rows, cols)
    const flags = around.filter((n) => game.cells[n].state === 'flagged').length
    const hidden = around.filter((n) => game.cells[n].state === 'hidden')
    if (flags !== target.adj || hidden.length === 0) return game
    const cells = game.cells.map((c) => ({ ...c }))
    flood(cells, hidden, rows, cols)
    return finish(game, cells)
  }

  const cells = game.cells.map((c) => ({ ...c }))
  flood(cells, [i], rows, cols)
  return finish(game, cells)
}

export function toggleFlag(game: GameState, i: number): GameState {
  if (game.status !== 'playing') return game
  const cell = game.cells[i]
  if (cell.state === 'revealed') return game
  const cells = game.cells.slice()
  cells[i] = { ...cell, state: cell.state === 'flagged' ? 'hidden' : 'flagged' }
  return { ...game, cells }
}

export function flagCount(game: GameState): number {
  return game.cells.reduce((n, c) => n + (c.state === 'flagged' ? 1 : 0), 0)
}

export type CellView = 'active' | 'settled' | 'overflagged'

/**
 * Which cells still matter, judged only from what the player can see (flags
 * are trusted, mines are never peeked at):
 * - a revealed number is settled once none of its neighbours are still hidden;
 * - a flag is settled once every revealed number touching it is settled;
 * - a number with more flags around it than its value is overflagged.
 * Hidden cells are always active.
 */
export function cellViews(game: GameState): CellView[] {
  const { rows, cols, cells } = game
  const views: CellView[] = new Array(cells.length).fill('active')

  cells.forEach((cell, i) => {
    if (cell.state !== 'revealed' || cell.mine) return
    let hidden = 0
    let flags = 0
    for (const n of neighbors(i, rows, cols)) {
      if (cells[n].state === 'hidden') hidden++
      else if (cells[n].state === 'flagged') flags++
    }
    if (flags > cell.adj) views[i] = 'overflagged'
    else if (hidden === 0) views[i] = 'settled'
  })

  cells.forEach((cell, i) => {
    if (cell.state !== 'flagged') return
    const touching = neighbors(i, rows, cols).filter((n) => cells[n].state === 'revealed' && !cells[n].mine)
    if (touching.length > 0 && touching.every((n) => views[n] === 'settled')) views[i] = 'settled'
  })

  return views
}
