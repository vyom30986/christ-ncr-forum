import { useTheme } from '../hooks/useTheme'
import { MoonIcon, SunIcon } from './Icons'

/** Light / dark switch. Shows the mode you will switch *to*. */
export function ThemeToggle({ label }: { label?: boolean }) {
  const { dark, toggle } = useTheme()
  return (
    <button
      className="btn themetoggle"
      data-tour="theme"
      onClick={toggle}
      aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
      title={dark ? 'Light mode' : 'Dark mode'}
      style={label ? undefined : { width: 44, padding: 0 }}
    >
      {dark ? <SunIcon /> : <MoonIcon />}
      {label && <span>{dark ? 'Light mode' : 'Dark mode'}</span>}
    </button>
  )
}
