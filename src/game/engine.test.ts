import { describe, expect, it } from 'vitest'
import { cellViews, flagCount, neighbors, newGame, reveal, toggleFlag, type GameState } from './engine'

/** Deterministic PRNG (mulberry32) so mine layouts are reproducible. */
function seeded(seed: number) {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Build a playing game from an ASCII layout: '*' = mine, '.' = empty. */
function fromLayout(rows: string[]): GameState {
  const game = newGame('easy')
  const r = rows.length
  const c = rows[0].length
  const cells = rows.join('').split('').map((ch) => ({ mine: ch === '*', adj: 0, state: 'hidden' as const }))
  cells.forEach((cell, i) => {
    if (cell.mine) for (const n of neighbors(i, r, c)) cells[n].adj++
  })
  return { ...game, rows: r, cols: c, mines: cells.filter((x) => x.mine).length, cells, status: 'playing' }
}

describe('neighbors', () => {
  it('handles corners, edges and interior', () => {
    expect(neighbors(0, 3, 3).sort()).toEqual([1, 3, 4])
    expect(neighbors(1, 3, 3)).toHaveLength(5)
    expect(neighbors(4, 3, 3)).toHaveLength(8)
  })
})

describe('first reveal', () => {
  it('places the right number of mines and never on or next to the first tap', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const g = reveal(newGame('hard'), 200, seeded(seed))
      expect(g.cells.filter((c) => c.mine)).toHaveLength(99)
      for (const i of [200, ...neighbors(200, g.rows, g.cols)]) expect(g.cells[i].mine).toBe(false)
      expect(g.cells[200].adj).toBe(0)
      expect(g.status).toBe('playing')
    }
  })
})

describe('reveal', () => {
  it('floods through zeros and stops at numbers', () => {
    const g = reveal(fromLayout(['....', '....', '...*']), 0)
    const shown = g.cells.map((c) => (c.state === 'revealed' ? 'R' : '-')).join('')
    expect(shown).toBe('RRRRRRRRRRR-'.slice(0, 12))
    expect(g.status).toBe('won')
  })

  it('loses on a mine and exposes all mines', () => {
    const g = reveal(fromLayout(['*..', '...', '..*']), 0)
    expect(g.status).toBe('lost')
    expect(g.exploded).toBe(0)
    expect(g.cells[8].state).toBe('revealed')
  })

  it('ignores flagged cells', () => {
    const g0 = toggleFlag(fromLayout(['*..', '...', '...']), 0)
    expect(reveal(g0, 0)).toBe(g0)
  })
})

describe('chording', () => {
  it('reveals unflagged neighbours when flags match the number', () => {
    let g = fromLayout(['*..', '...', '...'])
    g = reveal(g, 4) // centre is a 1
    expect(g.cells[4].adj).toBe(1)
    g = toggleFlag(g, 0)
    g = reveal(g, 4)
    expect(g.status).toBe('won')
  })

  it('does nothing when flag count does not match', () => {
    let g = fromLayout(['*.*', '...', '...'])
    g = reveal(g, 4)
    g = toggleFlag(g, 0)
    const before = g
    expect(reveal(g, 4)).toBe(before)
  })

  it('a wrong flag makes the chord hit a mine', () => {
    let g = fromLayout(['*..', '...', '...'])
    g = reveal(g, 4)
    g = toggleFlag(g, 1)
    g = reveal(g, 4)
    expect(g.status).toBe('lost')
  })
})

describe('flags', () => {
  it('toggles and counts', () => {
    let g = fromLayout(['*..', '...', '...'])
    g = toggleFlag(g, 0)
    expect(flagCount(g)).toBe(1)
    g = toggleFlag(g, 0)
    expect(flagCount(g)).toBe(0)
  })

  it('auto-flags every mine on a win', () => {
    const g = reveal(fromLayout(['*..', '...', '...']), 8)
    expect(g.status).toBe('won')
    expect(g.cells[0].state).toBe('flagged')
  })
})

describe('cellViews', () => {
  it('settles numbers with no hidden neighbours and the flags they touch', () => {
    let g = fromLayout(['*...', '*...', '*..*'])
    g = reveal(g, 2) // opens 1,2,3,5,6,7; 8,9,10 stay hidden
    expect(g.status).toBe('playing')
    let v = cellViews(g)
    expect(v[1]).toBe('active') // touches hidden mines
    expect(v[3]).toBe('settled') // zero
    g = toggleFlag(toggleFlag(g, 0), 4)
    v = cellViews(g)
    expect(v[1]).toBe('settled') // all neighbours resolved
    expect(v[5]).toBe('active') // still touches hidden 8, 9, 10
    expect(v[0]).toBe('active') // flag still informs active 5
    expect(v[4]).toBe('active')
  })

  it('marks overflagged numbers', () => {
    let g = fromLayout(['*..', '...', '...'])
    g = reveal(g, 4)
    g = toggleFlag(toggleFlag(g, 0), 1)
    expect(cellViews(g)[4]).toBe('overflagged')
  })

  it('keeps an isolated flag active', () => {
    let g = fromLayout(['*....', '.....', '.....'])
    g = reveal(g, 4)
    expect(cellViews(g).every((x) => x !== 'overflagged')).toBe(true)
  })
})
