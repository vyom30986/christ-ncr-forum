/** Tetris-block decorative accents, straight from the design file. */
const SWATCH: Record<string, string> = {
  Y: 'var(--yellow)', G: 'var(--green)', P: 'var(--pink)', B: 'var(--blue)', V: 'var(--purple)',
}

export function Blocks({ rows, size = 22, gap = 3, dim }: { rows: string[]; size?: number; gap?: number; dim?: string }) {
  const cols = rows[0]?.length ?? 0
  return (
    <div className="blocks" style={{ gridTemplateColumns: `repeat(${cols}, ${size}px)`, gridAutoRows: `${size}px`, gap }} aria-hidden>
      {rows.join('').split('').map((ch, i) => {
        const bg = SWATCH[ch]
        return <i key={i} className={bg ? 'on' : ''} style={{ background: bg ?? dim ?? 'transparent', boxShadow: bg ? undefined : 'none' }} />
      })}
    </div>
  )
}

/** The stacked "board" on the login screen. */
export const LOGIN_STACK = [
  '.......Y..', '......YYY.', '..........', 'B.........',
  'BBB....PP.', 'GG..V..PP.', '.GGVVVBBB.', 'PPGGYYBVPP',
]

/** Little piece in the feed header. */
export const HEADER_PIECE = ['..P.', '.PPB', 'YYBB']

export const EMPTY_T = ['V...', 'VVV.', '....', 'YYYY']
export const EMPTY_O = ['G.', 'G.', 'GG']
