import { describe, it, expect, afterEach } from "vitest"
import { render, screen, cleanup } from "@testing-library/react"
import { BrowserRouter } from "react-router-dom"
import userEvent from "@testing-library/user-event"
import { AppShell } from "../AppShell"
import styles from "../AppShell.module.scss"

// Wrapper for components that need Router context
const renderWithRouter = (ui: React.ReactElement) => {
  return render(<BrowserRouter>{ui}</BrowserRouter>)
}

describe("AppShell", () => {
  afterEach(() => {
    cleanup()
  })

  it("renders header, sidebar, content outlet, and footer", () => {
    renderWithRouter(<AppShell />)

    // Header should be present
    expect(screen.getByRole("banner")).toBeInTheDocument()

    // Sidebar should be present with navigation role
    expect(screen.getByRole("navigation")).toBeInTheDocument()

    // Main content area should be present
    expect(screen.getByRole("main")).toBeInTheDocument()

    // Footer should be present
    expect(screen.getByRole("contentinfo")).toBeInTheDocument()
  })

  it("passes aria-label for landmark regions", () => {
    renderWithRouter(<AppShell />)

    expect(screen.getByRole("navigation")).toHaveAttribute("aria-label", "Main sidebar")
    expect(screen.getByRole("main")).toHaveAttribute("aria-label", "Page content")
  })

  it("sidebar starts expanded by default", () => {
    renderWithRouter(<AppShell />)

    const sidebar = screen.getByRole("navigation")
    expect(sidebar.className).toContain(styles.sidebar)
    expect(sidebar.className).not.toContain(styles.collapsed)
  })

  it("sidebar collapse toggles width class", async () => {
    const user = userEvent.setup()
    renderWithRouter(<AppShell />)

    const sidebar = screen.getByRole("navigation")
    const collapseButton = screen.getByRole("button", { name: /collapse sidebar/i })

    // Initially expanded
    expect(sidebar.className).not.toContain(styles.collapsed)

    // Click to collapse
    await user.click(collapseButton)
    expect(sidebar.className).toContain(styles.collapsed)

    // Click to expand
    await user.click(collapseButton)
    expect(sidebar.className).not.toContain(styles.collapsed)
  })
})
