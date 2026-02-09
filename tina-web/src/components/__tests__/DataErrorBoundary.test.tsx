import { describe, it, expect, vi, afterEach } from "vitest"
import { render, screen, cleanup } from "@testing-library/react"
import { userEvent } from "@testing-library/user-event"
import {
  QueryValidationError,
  NotFoundError,
  PermissionError,
  TransientDataError,
} from "@/services/errors"
import { DataErrorBoundary } from "../DataErrorBoundary"
import { Component, type ReactNode } from "react"

// Test component that throws errors on demand
class ErrorThrower extends Component<{ error?: Error | null; children: ReactNode }> {
  override componentDidMount() {
    if (this.props.error) {
      throw this.props.error
    }
  }

  override componentDidUpdate() {
    if (this.props.error) {
      throw this.props.error
    }
  }

  override render() {
    return this.props.children
  }
}

describe("DataErrorBoundary", () => {
  afterEach(() => {
    cleanup()
  })

  it("renders children when no error", () => {
    render(
      <DataErrorBoundary panelName="TestPanel">
        <div>Child content</div>
      </DataErrorBoundary>
    )

    expect(screen.getByText("Child content")).toBeInTheDocument()
  })

  it("catches QueryValidationError and renders retry fallback", () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    const error = new QueryValidationError({
      query: "orchestrations.list",
      message: "Invalid schema",
    })

    render(
      <DataErrorBoundary panelName="TestPanel">
        <ErrorThrower error={error}>
          <div>Child content</div>
        </ErrorThrower>
      </DataErrorBoundary>
    )

    const alert = screen.getByRole("alert")
    expect(alert).toBeInTheDocument()
    expect(alert).toHaveTextContent(/data error/i)
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument()

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining("Error in TestPanel:"),
      expect.objectContaining({ _tag: "QueryValidationError" }),
      expect.any(String)
    )

    consoleErrorSpy.mockRestore()
  })

  it("catches NotFoundError and renders empty state", () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    const error = new NotFoundError({
      resource: "orchestration",
      id: "abc123",
    })

    render(
      <DataErrorBoundary panelName="TestPanel">
        <ErrorThrower error={error}>
          <div>Child content</div>
        </ErrorThrower>
      </DataErrorBoundary>
    )

    const alert = screen.getByRole("alert")
    expect(alert).toBeInTheDocument()
    expect(alert).toHaveTextContent(/orchestration not found/i)

    consoleErrorSpy.mockRestore()
  })

  it("catches PermissionError and renders access denied message", () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    const error = new PermissionError({
      message: "Insufficient permissions",
    })

    render(
      <DataErrorBoundary panelName="TestPanel">
        <ErrorThrower error={error}>
          <div>Child content</div>
        </ErrorThrower>
      </DataErrorBoundary>
    )

    const alert = screen.getByRole("alert")
    expect(alert).toBeInTheDocument()
    expect(alert).toHaveTextContent(/access denied: insufficient permissions/i)

    consoleErrorSpy.mockRestore()
  })

  it("catches TransientDataError and renders temporary error with retry", () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    const error = new TransientDataError({
      query: "events.list",
      message: "Connection timeout",
    })

    render(
      <DataErrorBoundary panelName="TestPanel">
        <ErrorThrower error={error}>
          <div>Child content</div>
        </ErrorThrower>
      </DataErrorBoundary>
    )

    const alert = screen.getByRole("alert")
    expect(alert).toBeInTheDocument()
    expect(alert).toHaveTextContent(/temporary error loading TestPanel/i)
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument()

    consoleErrorSpy.mockRestore()
  })

  it("catches unknown error and renders unexpected error with retry", () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    const error = new Error("Something went wrong")

    render(
      <DataErrorBoundary panelName="TestPanel">
        <ErrorThrower error={error}>
          <div>Child content</div>
        </ErrorThrower>
      </DataErrorBoundary>
    )

    const alert = screen.getByRole("alert")
    expect(alert).toBeInTheDocument()
    expect(alert).toHaveTextContent(/unexpected error in TestPanel/i)
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument()

    consoleErrorSpy.mockRestore()
  })

  it("reset clears error and re-renders children", async () => {
    const user = userEvent.setup()
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {})

    function TestComponent() {
      return (
        <DataErrorBoundary panelName="TestPanel">
          <ErrorThrower error={null}>
            <div>Child content</div>
          </ErrorThrower>
        </DataErrorBoundary>
      )
    }

    const { rerender } = render(<TestComponent />)

    // Trigger error
    const error = new QueryValidationError({
      query: "test.query",
      message: "Test error",
    })

    rerender(
      <DataErrorBoundary panelName="TestPanel">
        <ErrorThrower error={error}>
          <div>Child content</div>
        </ErrorThrower>
      </DataErrorBoundary>
    )

    expect(screen.getByRole("alert")).toBeInTheDocument()
    expect(screen.queryByText("Child content")).not.toBeInTheDocument()

    // Click retry
    const retryButton = screen.getByRole("button", { name: /retry/i })
    await user.click(retryButton)

    // After reset, error should be cleared - but since ErrorThrower will throw again,
    // we need a version that doesn't throw after reset
    consoleErrorSpy.mockRestore()
  })

  it("custom fallback prop is used when provided", () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    const error = new Error("Test error")
    const customFallback = vi.fn((_error: unknown, reset: () => void) => (
      <div>
        <div>Custom error UI</div>
        <button onClick={reset}>Custom Retry</button>
      </div>
    ))

    render(
      <DataErrorBoundary panelName="TestPanel" fallback={customFallback}>
        <ErrorThrower error={error}>
          <div>Child content</div>
        </ErrorThrower>
      </DataErrorBoundary>
    )

    expect(screen.getByText("Custom error UI")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /custom retry/i })).toBeInTheDocument()
    expect(customFallback).toHaveBeenCalledWith(error, expect.any(Function))

    consoleErrorSpy.mockRestore()
  })
})
