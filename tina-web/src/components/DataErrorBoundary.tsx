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

  private getErrorDisplay(error: unknown) {
    const taggedError = error as { _tag?: string }

    switch (taggedError._tag) {
      case "QueryValidationError": {
        const queryError = error as QueryValidationError
        return {
          title: "Data error",
          message: `Unable to load data for ${this.props.panelName}`,
          debug: `Query: ${queryError.query}`,
          retry: { onClick: this.reset, disabled: false },
        }
      }

      case "NotFoundError": {
        const notFoundError = error as NotFoundError
        return {
          className: styles.notFound,
          title: `${notFoundError.resource} not found`,
          message: `The requested ${notFoundError.resource.toLowerCase()} does not exist`,
        }
      }

      case "PermissionError": {
        const permissionError = error as PermissionError
        return {
          className: styles.permission,
          title: "Access denied",
          message: permissionError.message,
        }
      }

      case "TransientDataError":
        return {
          className: styles.transient,
          title: "Temporary error",
          message: `Unable to load ${this.props.panelName}`,
          retry: { onClick: this.handleTransientRetry, disabled: this.state.retryDisabled },
        }

      default:
        return {
          title: "Unexpected error",
          message: `Something went wrong in ${this.props.panelName}`,
          retry: { onClick: this.reset, disabled: false },
        }
    }
  }

  private renderDefaultFallback(error: unknown): ReactNode {
    const config = this.getErrorDisplay(error)
    const containerClass = config.className
      ? `${styles.errorContainer} ${config.className}`
      : styles.errorContainer

    return (
      <div role="alert" className={containerClass}>
        <div className={styles.errorTitle}>{config.title}</div>
        <div className={styles.errorMessage}>{config.message}</div>
        {config.debug && <div className={styles.errorDebug}>{config.debug}</div>}
        {config.retry && (
          <button
            className={styles.retryButton}
            onClick={config.retry.onClick}
            disabled={config.retry.disabled}
          >
            Retry
          </button>
        )}
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
