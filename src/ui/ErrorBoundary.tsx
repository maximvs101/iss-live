/**
 * Safety net around the 3D scenes.
 *
 * A WebGL failure — missing driver, lost context, machine without acceleration — must not take
 * the whole application down: the dashboards and the orbital position stay readable without 3D.
 */
import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
  /** Text shown in place of the failing content. */
  fallbackTitle?: string
}

interface State {
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[scene] rendering stopped:', error, info.componentStack)
  }

  render() {
    if (this.state.error) {
      return (
        <div className="scene-error">
          <h2>{this.props.fallbackTitle ?? '3D view unavailable'}</h2>
          <p>
            This browser could not render the scene. The data remains available in the panels on
            the right.
          </p>
          <pre>{this.state.error.message}</pre>
        </div>
      )
    }
    return this.props.children
  }
}
