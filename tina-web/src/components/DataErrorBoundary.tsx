import { Component, type ReactNode, type ErrorInfo } from "react"
import type {
  NotFoundError,
  PermissionError,
} from "@/services/errors"

interface Props {
  children: ReactNode
  panelName: string
  fallback?: (error: unknown, reset: () => void) => ReactNode
}

interface State {
  error: unknown | null
}

export class DataErrorBoundary extends Component<Props, State> {
  override state: State = {
    error: null,
  }

  static getDerivedStateFromError(error: unknown): State {
    return { error }
  }

  override componentDidCatch(error: unknown, errorInfo: ErrorInfo) {
    console.error(
      `Error in ${this.props.panelName}:`,
      error,
      errorInfo.componentStack
    )
  }

  private reset = () => {
    this.setState({ error: null })
  }

  private renderDefaultFallback(error: unknown): ReactNode {
    // Check error type by _tag property (Effect Schema tagged errors)
    const taggedError = error as { _tag?: string }

    if (taggedError._tag === "QueryValidationError") {
      return (
        <div role="alert">
          <div>Data error</div>
          <button onClick={this.reset}>Retry</button>
        </div>
      )
    }

    if (taggedError._tag === "NotFoundError") {
      const notFoundError = error as NotFoundError
      return (
        <div role="alert">
          <div>{notFoundError.resource} not found</div>
        </div>
      )
    }

    if (taggedError._tag === "PermissionError") {
      const permissionError = error as PermissionError
      return (
        <div role="alert">
          <div>Access denied: {permissionError.message}</div>
        </div>
      )
    }

    if (taggedError._tag === "TransientDataError") {
      return (
        <div role="alert">
          <div>Temporary error loading {this.props.panelName}</div>
          <button onClick={this.reset}>Retry</button>
        </div>
      )
    }

    // Unknown error
    return (
      <div role="alert">
        <div>Unexpected error in {this.props.panelName}</div>
        <button onClick={this.reset}>Retry</button>
      </div>
    )
  }

  override render() {
    if (this.state.error) {
      if (this.props.fallback) {
        return this.props.fallback(this.state.error, this.reset)
      }
      return this.renderDefaultFallback(this.state.error)
    }

    return this.props.children
  }
}
