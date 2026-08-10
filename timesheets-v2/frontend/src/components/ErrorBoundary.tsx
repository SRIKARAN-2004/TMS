import { Component, ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

// The app previously had NO error boundary anywhere - any uncaught error
// thrown during render (a bad API response shape, an undefined field
// accessed as .something, etc.) would unmount the entire React tree and
// leave a blank white page with zero on-screen indication of what went
// wrong. The real error was only ever visible in the browser console,
// which is easy to miss and doesn't help a non-technical user report the
// issue. This catches that class of crash and shows something actionable
// instead of nothing.
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    // eslint-disable-next-line no-console
    console.error('Unhandled error in render tree:', error, info.componentStack)
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 12,
          padding: 24,
          textAlign: 'center',
          fontFamily: 'system-ui, sans-serif',
        }}>
          <h1 style={{ fontSize: 18, fontWeight: 600 }}>Something went wrong</h1>
          <p style={{ color: '#64748b', maxWidth: 480, fontSize: 14 }}>
            {this.state.error.message || 'An unexpected error occurred while rendering this page.'}
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => this.setState({ error: null })}
              style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #cbd5e1', background: 'white', cursor: 'pointer' }}
            >
              Try again
            </button>
            <button
              onClick={() => window.location.reload()}
              style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: '#2563eb', color: 'white', cursor: 'pointer' }}
            >
              Reload page
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
