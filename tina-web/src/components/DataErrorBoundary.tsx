import { Component, type ReactNode, type ErrorInfo } from "react"
import type {
  NotFoundError,
  PermissionError,
  QueryValidationError,
} from "@/services/errors"
import styles from "./DataErrorBoundary.module.scss"

interface Props {
  children: ReactNode
  panelName: string
  fallback?: (error: unknown, reset: () => void) => ReactNode
}

interface State {
  error: unknown | null
  retryDisabled: boolean
}

export class DataErrorBoundary extends Component<Props, State> {
  override state: State = {
    error: null,
    retryDisabled: false,
  }

  private retryTimeoutId: number | null = null

  static getDerivedStateFromError(error: unknown): State {
    return { error, retryDisabled: false }
  }

  override componentDidCatch(error: unknown, errorInfo: ErrorInfo) {
    console.error(
      `Error in ${this.props.panelName}:`,
      error,
      errorInfo.componentStack
    )
  }

  override componentWillUnmount() {
    if (this.retryTimeoutId !== null) {
      clearTimeout(this.retryTimeoutId)
    }
  }

  private reset = () => {
    this.setState({ error: null, retryDisabled: false })
  }

  private handleTransientRetry = () => {
    // Disable button briefly to prevent spam clicking
    this.setState({ retryDisabled: true })
    this.retryTimeoutId = window.setTimeout(() => {
      this.setState({ retryDisabled: false })
      this.reset()
    }, 500)
  }

  private renderDefaultFallback(error: unknown): ReactNode {
    // Check error type by _tag property (Effect Schema tagged errors)
    const taggedError = error as { _tag?: string }

    if (taggedError._tag === "QueryValidationError") {
      const queryError = error as QueryValidationError
      return (
        <div role="alert" className={styles.errorContainer}>
          <div className={styles.errorTitle}>Data error</div>
          <div className={styles.errorMessage}>
            Unable to load data for {this.props.panelName}
          </div>
          <div className={styles.errorDebug}>Query: {queryError.query}</div>
          <button className={styles.retryButton} onClick={this.reset}>
            Retry
          </button>
        </div>
      )
    }

    if (taggedError._tag === "NotFoundError") {
      const notFoundError = error as NotFoundError
      return (
        <div role="alert" className={`${styles.errorContainer} ${styles.notFound}`}>
          <div className={styles.errorTitle}>{notFoundError.resource} not found</div>
          <div className={styles.errorMessage}>
            The requested {notFoundError.resource.toLowerCase()} does not exist
          </div>
        </div>
      )
    }

    if (taggedError._tag === "PermissionError") {
      const permissionError = error as PermissionError
      return (
        <div role="alert" className={`${styles.errorContainer} ${styles.permission}`}>
          <div className={styles.errorTitle}>Access denied</div>
          <div className={styles.errorMessage}>{permissionError.message}</div>
        </div>
      )
    }

    if (taggedError._tag === "TransientDataError") {
      return (
        <div role="alert" className={`${styles.errorContainer} ${styles.transient}`}>
          <div className={styles.errorTitle}>Temporary error</div>
          <div className={styles.errorMessage}>
            Unable to load {this.props.panelName}
          </div>
          <button
            className={styles.retryButton}
            onClick={this.handleTransientRetry}
            disabled={this.state.retryDisabled}
          >
            Retry
          </button>
        </div>
      )
    }

    // Unknown error
    return (
      <div role="alert" className={styles.errorContainer}>
        <div className={styles.errorTitle}>Unexpected error</div>
        <div className={styles.errorMessage}>
          Something went wrong in {this.props.panelName}
        </div>
        <button className={styles.retryButton} onClick={this.reset}>
          Retry
        </button>
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
