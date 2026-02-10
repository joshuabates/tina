import { describe, it, expect, afterEach } from "vitest"
import { render, screen, cleanup } from "@testing-library/react"
import { Panel, PanelHeader, PanelBody, PanelSection } from "../Panel"

describe("Panel", () => {
  afterEach(() => {
    cleanup()
  })

  it("renders Panel component", () => {
    render(<Panel data-testid="panel">Content</Panel>)
    const panel = screen.getByTestId("panel")
    expect(panel).toBeInTheDocument()
    expect(panel).toHaveClass("flex", "flex-col")
  })

  it("renders PanelHeader component", () => {
    render(<PanelHeader data-testid="header">Header</PanelHeader>)
    const header = screen.getByTestId("header")
    expect(header).toBeInTheDocument()
    expect(header).toHaveClass("px-3", "py-2", "font-medium", "text-sm", "border-b")
    expect(header).toHaveTextContent("Header")
  })

  it("renders PanelBody component", () => {
    render(<PanelBody data-testid="body">Body</PanelBody>)
    const body = screen.getByTestId("body")
    expect(body).toBeInTheDocument()
    expect(body).toHaveClass("flex-1")
    expect(body).not.toHaveClass("overflow-y-auto")
  })

  it("renders PanelBody with scrollable prop", () => {
    render(<PanelBody data-testid="body" scrollable>Body</PanelBody>)
    const body = screen.getByTestId("body")
    expect(body).toHaveClass("flex-1", "overflow-y-auto")
  })

  it("renders PanelSection component", () => {
    render(
      <PanelSection data-testid="section" label="Section Label">
        Content
      </PanelSection>
    )
    const section = screen.getByTestId("section")
    expect(section).toBeInTheDocument()
    expect(section).toHaveClass("px-3", "py-2")

    const label = screen.getByText("Section Label")
    expect(label).toBeInTheDocument()
    expect(label).toHaveClass("text-xs", "font-medium", "text-muted-foreground", "mb-1")

    expect(screen.getByText("Content")).toBeInTheDocument()
  })

  it("composes Panel correctly", () => {
    render(
      <Panel data-testid="panel">
        <PanelHeader>Header</PanelHeader>
        <PanelBody scrollable>
          <PanelSection label="Section 1">Content 1</PanelSection>
          <PanelSection label="Section 2">Content 2</PanelSection>
        </PanelBody>
      </Panel>
    )

    const panel = screen.getByTestId("panel")
    expect(panel).toBeInTheDocument()

    expect(screen.getByText("Header")).toBeInTheDocument()
    expect(screen.getByText("Section 1")).toBeInTheDocument()
    expect(screen.getByText("Content 1")).toBeInTheDocument()
    expect(screen.getByText("Section 2")).toBeInTheDocument()
    expect(screen.getByText("Content 2")).toBeInTheDocument()
  })

  it("forwards ref to Panel", () => {
    const ref = { current: null as HTMLDivElement | null }
    render(<Panel ref={ref}>Content</Panel>)
    expect(ref.current).toBeInstanceOf(HTMLDivElement)
  })

  it("forwards ref to PanelHeader", () => {
    const ref = { current: null as HTMLDivElement | null }
    render(<PanelHeader ref={ref}>Header</PanelHeader>)
    expect(ref.current).toBeInstanceOf(HTMLDivElement)
  })

  it("forwards ref to PanelBody", () => {
    const ref = { current: null as HTMLDivElement | null }
    render(<PanelBody ref={ref}>Body</PanelBody>)
    expect(ref.current).toBeInstanceOf(HTMLDivElement)
  })

  it("forwards ref to PanelSection", () => {
    const ref = { current: null as HTMLDivElement | null }
    render(<PanelSection ref={ref} label="Label">Content</PanelSection>)
    expect(ref.current).toBeInstanceOf(HTMLDivElement)
  })
})
