/**
 * Loading animation: tetrominoes drop onto a 6x8 board, the bottom row
 * fills, flashes and clears, and it starts again. Pure CSS, see
 * `.tl-*` rules in index.css. `size` is the cell size in px.
 */
const PIECES: { cls: string; color: string; cells: [number, number][] }[] = [
  // [col,row] relative to each piece's own box; the CSS places the box.
  { cls: 'tl-p1', color: 'var(--blue)', cells: [[0, 0], [0, 1], [1, 1], [2, 1]] },     // J, lands bottom-left
  { cls: 'tl-p2', color: 'var(--yellow)', cells: [[0, 0], [1, 0], [0, 1], [1, 1]] },   // O, lands bottom-middle
  { cls: 'tl-p3', color: 'var(--pink)', cells: [[1, 0], [0, 1], [1, 1], [0, 2]] },     // S, lands bottom-right
  { cls: 'tl-p4', color: 'var(--green)', cells: [[0, 0], [1, 0], [2, 0], [1, 1]] },    // T, lands on top left
  { cls: 'tl-p5', color: 'var(--purple)', cells: [[0, 0], [0, 1], [0, 2], [0, 3]] },   // I, lands on top right
]

export function TetrisLoader({ size = 18, label, inline }: { size?: number; label?: string; inline?: boolean }) {
  const w = size * 6, h = size * 8
  return (
    <div className={`tl-wrap ${inline ? 'inline' : ''}`} role="status" aria-live="polite" aria-label={label ?? 'Loading'}>
      <div className="tl-board" style={{ width: w, height: h, ['--c' as string]: `${size}px` }}>
        {Array.from({ length: 48 }, (_, i) => <i key={i} className="tl-cell" style={{ left: (i % 6) * size, top: Math.floor(i / 6) * size }} />)}
        {PIECES.map((p) => (
          <div key={p.cls} className={`tl-piece ${p.cls}`}>
            {p.cells.map(([x, y], i) => (
              <i key={i} className="tl-block" style={{ left: x * size, top: y * size, background: p.color }} />
            ))}
          </div>
        ))}
        <div className="tl-flash" />
      </div>
      {label && <div className="tl-label">{label}</div>}
    </div>
  )
}

/** Tiny three-block version for buttons. */
export function TetrisDots() {
  return (
    <span className="tl-dots" aria-hidden>
      <i style={{ background: 'var(--pink)' }} /><i style={{ background: 'var(--blue)' }} /><i style={{ background: 'var(--green)' }} />
    </span>
  )
}
