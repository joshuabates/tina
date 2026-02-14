import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { TeamMember } from "../ui/team-member"

describe("TeamMember", () => {
  it("renders active status with correct styling", () => {
    render(<TeamMember name="executor-1" memberStatus="active" />)

    expect(screen.getByText("executor-1")).toBeInTheDocument()
    expect(screen.getByText("ACTIVE")).toBeInTheDocument()

    // Verify active status styling is applied
    const label = screen.getByText("ACTIVE")
    expect(label).toHaveClass("text-status-complete")
  })

  it("renders idle status with correct styling", () => {
    render(<TeamMember name="executor-2" memberStatus="idle" />)

    expect(screen.getByText("executor-2")).toBeInTheDocument()
    expect(screen.getByText("IDLE")).toBeInTheDocument()

    // Verify idle status styling is applied
    const label = screen.getByText("IDLE")
    expect(label).toHaveClass("opacity-40")
  })

  it("renders shutdown status with low opacity styling", () => {
    render(<TeamMember name="executor-3" memberStatus="shutdown" />)

    expect(screen.getByText("executor-3")).toBeInTheDocument()
    expect(screen.getByText("SHUTDOWN")).toBeInTheDocument()

    // Verify shutdown status styling is applied
    const label = screen.getByText("SHUTDOWN")
    expect(label).toHaveClass("opacity-20")

    // Verify member name has inactive styling
    const memberName = screen.getByText("executor-3")
    expect(memberName).toHaveClass("opacity-50")
  })

  it("renders busy status with correct styling", () => {
    render(<TeamMember name="executor-4" memberStatus="busy" />)

    expect(screen.getByText("executor-4")).toBeInTheDocument()
    expect(screen.getByText("BUSY")).toBeInTheDocument()

    const label = screen.getByText("BUSY")
    expect(label).toHaveClass("text-primary")
  })

  it("renders away status with low opacity styling", () => {
    render(<TeamMember name="executor-5" memberStatus="away" />)

    expect(screen.getByText("executor-5")).toBeInTheDocument()
    expect(screen.getByText("AWAY")).toBeInTheDocument()

    const label = screen.getByText("AWAY")
    expect(label).toHaveClass("opacity-20")

    // Verify member name has inactive styling
    const memberName = screen.getByText("executor-5")
    expect(memberName).toHaveClass("opacity-50")
  })

  describe("connect button", () => {
    it("renders Connect button when onConnect is provided", () => {
      render(
        <TeamMember name="executor-1" memberStatus="active" onConnect={() => {}} />,
      )

      expect(screen.getByRole("button", { name: "Connect" })).toBeInTheDocument()
    })

    it("does not render Connect button when onConnect is not provided", () => {
      render(<TeamMember name="executor-1" memberStatus="active" />)

      expect(screen.queryByRole("button", { name: "Connect" })).not.toBeInTheDocument()
    })

    it("calls onConnect when Connect button is clicked", async () => {
      const user = userEvent.setup()
      const handleConnect = vi.fn()

      render(
        <TeamMember name="executor-1" memberStatus="active" onConnect={handleConnect} />,
      )

      await user.click(screen.getByRole("button", { name: "Connect" }))

      expect(handleConnect).toHaveBeenCalledOnce()
    })
  })
})
