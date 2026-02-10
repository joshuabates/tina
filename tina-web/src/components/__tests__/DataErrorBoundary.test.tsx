import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import { userEvent } from "@testing-library/user-event"
import {
  QueryValidationError,
  NotFoundError,
  PermissionError,
  TransientDataError,
} from "@/services/errors"
import { DataErrorBoundary } from "../DataErrorBoundary"
import type { ReactNode } from "react"

function ErrorThrower({ error, children }: { error?: Error | null; children: ReactNode }) {
  if (error) throw error
  return children
}

function suppressConsoleError() {
  return vi.spyOn(console, "error").mockImplementation(() => {})
}

function renderBoundary(ui: ReactNode, fallback?: (error: unknown, reset: () => void) => ReactNode) {
  return render(
    <DataErrorBoundary panelName="TestPanel" fallback={fallback}>
      {ui}
    </DataErrorBoundary>,
  )
}

function renderThrowing(error: Error) {
  return renderBoundary(
    <ErrorThrower error={error}>
      <div>Child content</div>
    </ErrorThrower>,
  )
}

describe("DataErrorBoundary", () => {
  it("renders children when no error", () => {
    renderBoundary(<div>Child content</div>)
    expect(screen.getByText("Child content")).toBeInTheDocument()
  })

  it.each([
    {
      label: "QueryValidationError",
      error: new QueryValidationError({ query: "orchestrations.list", message: "Invalid schema" }),
      title: /data error/i,
      message: /unable to load data for TestPanel/i,
      debug: /query: orchestrations\.list/i,
      retry: true,
    },
    {
      label: "NotFoundError",
      error: new NotFoundError({ resource: "orchestration", id: "abc123" }),
      title: /orchestration not found/i,
      message: /does not exist/i,
      retry: false,
    },
    {
      label: "PermissionError",
      error: new PermissionError({ message: "Insufficient permissions" }),
      title: /access denied/i,
      message: /insufficient permissions/i,
      retry: false,
    },
    {
      label: "TransientDataError",
      error: new TransientDataError({ query: "events.list", message: "Connection timeout" }),
      title: /temporary error/i,
      message: /unable to load TestPanel/i,
      retry: true,
    },
    {
      label: "unknown error",
      error: new Error("Something went wrong"),
      title: /unexpected error/i,
      message: /something went wrong in TestPanel/i,
      retry: true,
    },
  ])("renders fallback for $label", ({ error, title, message, debug, retry }) => {
    const consoleErrorSpy = suppressConsoleError()
    try {
      renderThrowing(error)

      const alert = screen.getByRole("alert")
      expect(alert).toHaveTextContent(title)
      expect(alert).toHaveTextContent(message)

      if (debug) expect(alert).toHaveTextContent(debug)
      expect(screen.queryByRole("button", { name: /retry/i }) !== null).toBe(retry)
    } finally {
      consoleErrorSpy.mockRestore()
    }
  })

  it("logs tagged errors with panel context", () => {
    const consoleErrorSpy = suppressConsoleError()
    try {
      renderThrowing(
        new QueryValidationError({ query: "orchestrations.list", message: "Invalid schema" }),
      )

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining("Error in TestPanel:"),
        expect.objectContaining({ _tag: "QueryValidationError" }),
        expect.any(String),
      )
    } finally {
      consoleErrorSpy.mockRestore()
    }
  })

  it("custom fallback prop is used when provided", () => {
    const consoleErrorSpy = suppressConsoleError()
    try {
      const error = new Error("Test error")
      const customFallback = vi.fn((_error: unknown, reset: () => void) => (
        <div>
          <div>Custom error UI</div>
          <button onClick={reset}>Custom Retry</button>
        </div>
      ))

      renderBoundary(
        <ErrorThrower error={error}>
          <div>Child content</div>
        </ErrorThrower>,
        customFallback,
      )

      expect(screen.getByText("Custom error UI")).toBeInTheDocument()
      expect(screen.getByRole("button", { name: /custom retry/i })).toBeInTheDocument()
      expect(customFallback).toHaveBeenCalledWith(error, expect.any(Function))
    } finally {
      consoleErrorSpy.mockRestore()
    }
  })

  it("retry button in QueryValidationError resets boundary", async () => {
    const user = userEvent.setup()
    const consoleErrorSpy = suppressConsoleError()

    let shouldThrow = true
    function ToggleableErrorThrower() {
      if (shouldThrow) {
        throw new QueryValidationError({
          query: "orchestrations.list",
          message: "Invalid schema",
        })
      }
      return <div>Child content recovered</div>
    }

    try {
      const { rerender } = renderBoundary(<ToggleableErrorThrower />)

      expect(screen.getByRole("alert")).toBeInTheDocument()
      expect(screen.getByText(/data error/i)).toBeInTheDocument()

      shouldThrow = false
      await user.click(screen.getByRole("button", { name: /retry/i }))

      rerender(
        <DataErrorBoundary panelName="TestPanel">
          <ToggleableErrorThrower />
        </DataErrorBoundary>,
      )

      expect(screen.getByText("Child content recovered")).toBeInTheDocument()
      expect(screen.queryByRole("alert")).not.toBeInTheDocument()
    } finally {
      consoleErrorSpy.mockRestore()
    }
  })
})
