import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import { RuntimeProvider, useServices } from "../RuntimeProvider"

describe("RuntimeProvider", () => {
  it("renders children", () => {
    render(
      <RuntimeProvider>
        <div>Test Child</div>
      </RuntimeProvider>
    )

    expect(screen.getByText("Test Child")).toBeInTheDocument()
  })

  it("useServices throws when used outside provider", () => {
    function TestComponent() {
      useServices()
      return <div>Test</div>
    }

    expect(() => render(<TestComponent />)).toThrow(
      "useServices must be used within RuntimeProvider"
    )
  })

  it("services are accessible from a child component", () => {
    function TestComponent() {
      const services = useServices()
      return (
        <div>
          <div data-testid="has-action-registry">
            {services.actionRegistry ? "yes" : "no"}
          </div>
          <div data-testid="has-focus-service">
            {services.focusService ? "yes" : "no"}
          </div>
          <div data-testid="has-keyboard-service">
            {services.keyboardService ? "yes" : "no"}
          </div>
          <div data-testid="has-selection-service">
            {services.selectionService ? "yes" : "no"}
          </div>
        </div>
      )
    }

    render(
      <RuntimeProvider>
        <TestComponent />
      </RuntimeProvider>
    )

    expect(screen.getByTestId("has-action-registry")).toHaveTextContent("yes")
    expect(screen.getByTestId("has-focus-service")).toHaveTextContent("yes")
    expect(screen.getByTestId("has-keyboard-service")).toHaveTextContent("yes")
    expect(screen.getByTestId("has-selection-service")).toHaveTextContent("yes")
  })
})
