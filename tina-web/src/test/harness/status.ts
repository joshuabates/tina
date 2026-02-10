import { screen, within } from "@testing-library/react"
import { expect } from "vitest"
import { statusLabel, toStatusBadgeStatus } from "@/components/ui/status-styles"

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function expectedStatusLabel(rawStatus: string): string {
  return statusLabel(toStatusBadgeStatus(rawStatus))
}

export function expectStatusLabelVisible(
  rawStatus: string,
  container?: HTMLElement,
) {
  const query = container ? within(container) : screen
  const label = expectedStatusLabel(rawStatus)
  expect(query.getByText(new RegExp(`^${escapeRegExp(label)}$`, "i"))).toBeInTheDocument()
}

export function expectStatusLabelUpperVisible(
  rawStatus: string,
  container?: HTMLElement,
) {
  const query = container ? within(container) : screen
  const label = expectedStatusLabel(rawStatus).toUpperCase()
  expect(query.getByText(new RegExp(`^${escapeRegExp(label)}$`))).toBeInTheDocument()
}

export function expectElementStatusText(
  element: Element | null,
  rawStatus: string,
) {
  expect(element).toBeTruthy()
  expect(element as HTMLElement).toHaveTextContent(expectedStatusLabel(rawStatus))
}

export function expectContainerToContainStatusLabel(
  container: HTMLElement,
  rawStatus: string,
) {
  expect(container).toHaveTextContent(expectedStatusLabel(rawStatus))
}
