import { Component, type ErrorInfo, type ReactNode } from 'react'

type State = { error: Error | null }

/** Last line of defence: a readable screen instead of a blank page. */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null }
  static getDerivedStateFromError(error: Error): State { return { error } }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error('Christ NCR Forum crashed', error, info.componentStack) }
  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="screen" style={{ padding: 24, gap: 14, justifyContent: 'center' }}>
        <div className="brand" style={{ fontSize: 36 }}>CU <span className="slash">FORUM</span></div>
        <div className="h2">Something broke on this screen</div>
        <div className="meta" style={{ lineHeight: 1.5 }}>Reload to pick up where you were. If it keeps happening, tell an admin what you were doing.</div>
        <code style={{ fontSize: 12, color: 'var(--meta)', wordBreak: 'break-word' }}>{this.state.error.message}</code>
        <div className="row" style={{ gap: 10 }}>
          <button className="btn btn-primary sm" onClick={() => location.reload()}>Reload</button>
          <a className="btn" href="/">Go to the feed</a>
        </div>
      </div>
    )
  }
}
