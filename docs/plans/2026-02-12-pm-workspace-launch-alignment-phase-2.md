# PM Workspace + Launch UX Realignment Phase 2: Modalization

> **For Claude:** Use tina:executing-plans to implement this plan.

**Plan Baseline:** 1f99c67054d1c27d553f597bf69cd83babe2f8ce

**Goal:** Move create/edit flows for tickets and designs into modals. Introduce launch modal entry from workspace. Keep detail page routes as-is for backward compatibility.

**Architecture:** Phase 1 established a unified workspace shell with segmented `Tickets | Designs` toggle. Currently, create forms render inline in list pages (anti-pattern per design doc) and edit forms render inline in detail pages. This phase extracts all form flows into modal dialogs.

Key architectural decisions:
1. **New `FormDialog` component** parallel to `QuicklookDialog` — NOT an extension of it. QuicklookDialog is read-only (no submit, Space-to-close). FormDialog needs form-appropriate behavior: configurable width, cancel/submit footer, Escape-only keyboard (Space must work for typing).
2. **New `useFormDialogKeyboard` hook** — Escape-only, no Space. Reuses `useFocusTrap` from existing hooks.
3. **Shared form styles** in `FormDialog.module.scss` — currently duplicated across `TicketListPage.module.scss` and `DesignListPage.module.scss`.
4. **Launch modal** adapted from existing `LaunchOrchestrationPage.tsx` — same fields for now (design, node, feature, phases, preset). Phase 5 will rewrite with auto-node, derived phases, and full policy editor.

**Key files:**
- `tina-web/src/hooks/useFormDialogKeyboard.ts` — New Escape-only keyboard hook
- `tina-web/src/components/FormDialog.tsx` — New form modal component
- `tina-web/src/components/FormDialog.module.scss` — Shared form modal styles
- `tina-web/src/components/pm/CreateTicketModal.tsx` — Ticket creation modal
- `tina-web/src/components/pm/CreateDesignModal.tsx` — Design creation modal
- `tina-web/src/components/pm/EditTicketModal.tsx` — Ticket edit modal
- `tina-web/src/components/pm/EditDesignModal.tsx` — Design edit modal
- `tina-web/src/components/pm/LaunchModal.tsx` — Launch orchestration modal
- `tina-web/src/components/pm/PmShell.tsx` — Add Launch button to workspace header
- `tina-web/src/components/pm/TicketListPage.tsx` — Replace inline form with modal
- `tina-web/src/components/pm/DesignListPage.tsx` — Replace inline form with modal
- `tina-web/src/components/pm/TicketDetailPage.tsx` — Replace inline form with modal
- `tina-web/src/components/pm/DesignDetailPage.tsx` — Replace inline form with modal

### Complexity Budget

| Metric | Limit |
|--------|-------|
| Max lines per file | 400 |
| Max function length | 50 lines |
| Max total implementation lines | 1200 |

---

## Tasks

### Task 1: Create useFormDialogKeyboard hook and FormDialog component with tests

**Files:**
- `tina-web/src/hooks/useFormDialogKeyboard.ts`
- `tina-web/src/components/FormDialog.tsx`
- `tina-web/src/components/FormDialog.module.scss`
- `tina-web/src/components/__tests__/FormDialog.test.tsx`

**Model:** opus

**review:** full

**Depends on:** none

Create the modal infrastructure for form dialogs. Write tests first (TDD), then implement.

**Steps:**

1. Write the test file for FormDialog:

```tsx
// tina-web/src/components/__tests__/FormDialog.test.tsx
import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { FormDialog } from "../FormDialog"

describe("FormDialog", () => {
  const onClose = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("renders title and children", () => {
    render(
      <FormDialog title="Create Ticket" onClose={onClose}>
        <p>Form content</p>
      </FormDialog>,
    )

    expect(screen.getByRole("dialog")).toBeInTheDocument()
    expect(screen.getByText("Create Ticket")).toBeInTheDocument()
    expect(screen.getByText("Form content")).toBeInTheDocument()
  })

  it("has correct ARIA attributes", () => {
    render(
      <FormDialog title="Edit Design" onClose={onClose}>
        <p>Content</p>
      </FormDialog>,
    )

    const dialog = screen.getByRole("dialog")
    expect(dialog).toHaveAttribute("aria-modal", "true")
    expect(dialog).toHaveAttribute("aria-labelledby")
  })

  it("closes on Escape key", async () => {
    const user = userEvent.setup()
    render(
      <FormDialog title="Test" onClose={onClose}>
        <p>Content</p>
      </FormDialog>,
    )

    await user.keyboard("{Escape}")
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it("does NOT close on Space key (needed for form inputs)", async () => {
    const user = userEvent.setup()
    render(
      <FormDialog title="Test" onClose={onClose}>
        <input type="text" data-testid="text-input" />
      </FormDialog>,
    )

    const input = screen.getByTestId("text-input")
    await user.click(input)
    await user.keyboard(" ")
    expect(onClose).not.toHaveBeenCalled()
  })

  it("closes on backdrop click", async () => {
    const user = userEvent.setup()
    render(
      <FormDialog title="Test" onClose={onClose}>
        <p>Content</p>
      </FormDialog>,
    )

    const backdrop = screen.getByRole("dialog").parentElement!
    await user.click(backdrop)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it("does NOT close when clicking inside the modal", async () => {
    const user = userEvent.setup()
    render(
      <FormDialog title="Test" onClose={onClose}>
        <p>Content</p>
      </FormDialog>,
    )

    await user.click(screen.getByText("Content"))
    expect(onClose).not.toHaveBeenCalled()
  })

  it("renders close button", () => {
    render(
      <FormDialog title="Test" onClose={onClose}>
        <p>Content</p>
      </FormDialog>,
    )

    expect(screen.getByRole("button", { name: /close/i })).toBeInTheDocument()
  })
})
```

2. Run tests — they should fail (components don't exist yet):

Run: `cd /Users/joshua/Projects/tina && npx vitest run tina-web/src/components/__tests__/FormDialog.test.tsx 2>&1 | tail -20`

Expected: Tests fail with import errors.

3. Create the `useFormDialogKeyboard` hook:

```ts
// tina-web/src/hooks/useFormDialogKeyboard.ts
import { useEffect } from "react"

export function useFormDialogKeyboard(onClose: () => void) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault()
        onClose()
      }
    }

    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [onClose])
}
```

4. Create the `FormDialog` component:

```tsx
// tina-web/src/components/FormDialog.tsx
import { useId, useRef, type ReactNode } from "react"
import { useFocusTrap } from "@/hooks/useFocusTrap"
import { useFormDialogKeyboard } from "@/hooks/useFormDialogKeyboard"
import styles from "./FormDialog.module.scss"

interface FormDialogProps {
  title: string
  onClose: () => void
  children: ReactNode
  maxWidth?: number
}

export function FormDialog({
  title,
  onClose,
  children,
  maxWidth,
}: FormDialogProps) {
  const titleId = useId()
  const modalRef = useRef<HTMLDivElement>(null)

  useFormDialogKeyboard(onClose)
  useFocusTrap(modalRef)

  return (
    <div className={styles.backdrop} onClick={onClose}>
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={styles.modal}
        style={maxWidth ? { maxWidth: `${maxWidth}px` } : undefined}
        onClick={(event) => event.stopPropagation()}
      >
        <div className={styles.header}>
          <h2 id={titleId} className={styles.title}>
            {title}
          </h2>
          <button
            type="button"
            className={styles.closeButton}
            onClick={onClose}
            aria-label="Close dialog"
          >
            x
          </button>
        </div>
        <div className={styles.content}>{children}</div>
      </div>
    </div>
  )
}
```

5. Create `FormDialog.module.scss` — shared form styles extracted from list page stylesheets:

```scss
// tina-web/src/components/FormDialog.module.scss
@use '../styles/tokens' as *;

.backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 50;
}

.modal {
  background: hsl(var(--background));
  border: 1px solid hsl(var(--border));
  border-radius: 8px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
  max-width: 600px;
  width: 90%;
  max-height: 80vh;
  overflow: auto;
  outline: none;
}

.header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px 20px;
  border-bottom: 1px solid hsl(var(--border));
  position: sticky;
  top: 0;
  background: hsl(var(--background));
  z-index: 1;
}

.title {
  font-size: 16px;
  font-weight: 600;
  margin: 0;
  flex: 1;
}

.closeButton {
  background: none;
  border: none;
  font-size: 24px;
  line-height: 1;
  cursor: pointer;
  color: hsl(var(--muted-foreground));
  padding: 0;
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  transition: background-color 0.2s;

  &:hover {
    background: hsl(var(--muted));
    color: hsl(var(--foreground));
  }

  &:focus-visible {
    outline: 2px solid hsl(var(--ring));
    outline-offset: 2px;
  }
}

.content {
  padding: 20px;
}

// Shared form field styles (extracted from list page stylesheets)
.formField {
  margin-bottom: 8px;
}

.formLabel {
  display: block;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: $text-muted;
  margin-bottom: 4px;
}

.formInput {
  width: 100%;
  padding: 6px 10px;
  font-size: 13px;
  border: 1px solid $border-color;
  border-radius: 4px;
  background: $bg-primary;
  color: $text-primary;

  &:focus {
    outline: 2px solid $ring-color;
    outline-offset: 1px;
  }
}

.formTextarea {
  width: 100%;
  min-height: 80px;
  padding: 8px 10px;
  font-size: 13px;
  line-height: 1.6;
  border: 1px solid $border-color;
  border-radius: 4px;
  background: $bg-primary;
  color: $text-primary;
  resize: vertical;

  &:focus {
    outline: 2px solid $ring-color;
    outline-offset: 1px;
  }
}

.formActions {
  display: flex;
  gap: 8px;
  margin-top: 12px;
}

.cancelButton {
  font-size: 12px;
  padding: 4px 12px;
  border-radius: 4px;
  border: 1px solid $border-color;
  background: $bg-card;
  color: $text-muted;
  cursor: pointer;

  &:hover {
    background: hsl(var(--accent) / 0.08);
  }
}

.submitButton {
  font-size: 12px;
  padding: 4px 12px;
  border-radius: 4px;
  border: 1px solid $accent;
  background: $accent;
  color: $accent-foreground;
  cursor: pointer;

  &:hover {
    opacity: 0.9;
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
}

.errorMessage {
  margin-top: 8px;
  font-size: 12px;
  color: hsl(var(--destructive, 0 84% 60%));
}
```

6. Re-run tests to verify all pass:

Run: `cd /Users/joshua/Projects/tina && npx vitest run tina-web/src/components/__tests__/FormDialog.test.tsx 2>&1 | tail -20`

Expected: All 7 FormDialog tests pass.

---

### Task 2: Create CreateTicketModal and update TicketListPage

**Files:**
- `tina-web/src/components/pm/CreateTicketModal.tsx`
- `tina-web/src/components/pm/TicketListPage.tsx`
- `tina-web/src/components/__tests__/TicketListPage.test.tsx`

**Model:** opus

**review:** full

**Depends on:** 1

Extract the inline `TicketCreateForm` from `TicketListPage.tsx` into a `CreateTicketModal` component, then update `TicketListPage` to open the modal instead of showing an inline form. Update existing tests.

**Steps:**

1. Update the create form test in `TicketListPage.test.tsx`. The form now renders inside a modal dialog. Update the "create form" describe block:

Replace the existing `describe("create form", ...)` block with:

```tsx
  describe("create form modal", () => {
    it("opens modal when Create Ticket button is clicked", async () => {
      const user = userEvent.setup()
      renderApp("/pm?project=p1")

      await user.click(screen.getByRole("button", { name: /create ticket/i }))

      expect(screen.getByRole("dialog")).toBeInTheDocument()
      expect(screen.getByText("Create Ticket")).toBeInTheDocument()
    })

    it("shows design link dropdown with project designs in modal", async () => {
      const user = userEvent.setup()
      renderApp("/pm?project=p1")

      await user.click(screen.getByRole("button", { name: /create ticket/i }))

      const dialog = screen.getByRole("dialog")
      const designSelect = within(dialog).getByLabelText(/design/i)
      expect(designSelect).toBeInTheDocument()
      expect(designSelect.tagName).toBe("SELECT")

      const options = within(designSelect as HTMLElement).getAllByRole("option")
      expect(options).toHaveLength(3) // None + 2 designs
      expect(options[0]).toHaveTextContent("None")
      expect(options[1]).toHaveTextContent("ALPHA-D1")
      expect(options[2]).toHaveTextContent("ALPHA-D2")
    })

    it("shows assignee text input in modal", async () => {
      const user = userEvent.setup()
      renderApp("/pm?project=p1")

      await user.click(screen.getByRole("button", { name: /create ticket/i }))

      const dialog = screen.getByRole("dialog")
      const assigneeInput = within(dialog).getByLabelText(/assignee/i)
      expect(assigneeInput).toBeInTheDocument()
      expect(assigneeInput).toHaveAttribute("type", "text")
    })

    it("closes modal when close button is clicked", async () => {
      const user = userEvent.setup()
      renderApp("/pm?project=p1")

      await user.click(screen.getByRole("button", { name: /create ticket/i }))
      expect(screen.getByRole("dialog")).toBeInTheDocument()

      await user.click(screen.getByRole("button", { name: /close/i }))
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    })
  })
```

2. Run tests — modal tests should fail since CreateTicketModal doesn't exist yet:

Run: `cd /Users/joshua/Projects/tina && npx vitest run tina-web/src/components/__tests__/TicketListPage.test.tsx 2>&1 | tail -20`

Expected: The "create form modal" tests fail.

3. Create `CreateTicketModal.tsx`:

```tsx
// tina-web/src/components/pm/CreateTicketModal.tsx
import { useState } from "react"
import { useMutation } from "convex/react"
import { api } from "@convex/_generated/api"
import { FormDialog } from "@/components/FormDialog"
import type { DesignSummary } from "@/schemas"
import type { Id } from "@convex/_generated/dataModel"
import styles from "@/components/FormDialog.module.scss"

interface CreateTicketModalProps {
  projectId: string
  designs: readonly DesignSummary[]
  onClose: () => void
  onCreated: (ticketId: string) => void
}

export function CreateTicketModal({
  projectId,
  designs,
  onClose,
  onCreated,
}: CreateTicketModalProps) {
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [priority, setPriority] = useState("medium")
  const [designId, setDesignId] = useState("")
  const [assignee, setAssignee] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const createTicket = useMutation(api.tickets.createTicket)

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!title.trim()) return

    setSubmitting(true)
    setError(null)
    try {
      const ticketId = await createTicket({
        projectId: projectId as Id<"projects">,
        title: title.trim(),
        description: description.trim(),
        priority,
        ...(designId ? { designId: designId as Id<"designs"> } : {}),
        ...(assignee.trim() ? { assignee: assignee.trim() } : {}),
      })
      onCreated(ticketId as unknown as string)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create ticket")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <FormDialog title="Create Ticket" onClose={onClose}>
      <form onSubmit={handleSubmit} data-testid="ticket-create-form">
        <div className={styles.formField}>
          <label className={styles.formLabel} htmlFor="ticket-title">Title</label>
          <input
            id="ticket-title"
            className={styles.formInput}
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Ticket title"
            autoFocus
          />
        </div>
        <div className={styles.formField}>
          <label className={styles.formLabel} htmlFor="ticket-description">Description</label>
          <textarea
            id="ticket-description"
            className={styles.formTextarea}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Ticket description"
          />
        </div>
        <div className={styles.formField}>
          <label className={styles.formLabel} htmlFor="ticket-priority">Priority</label>
          <select
            id="ticket-priority"
            className={styles.formInput}
            value={priority}
            onChange={(e) => setPriority(e.target.value)}
          >
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="urgent">Urgent</option>
          </select>
        </div>
        <div className={styles.formField}>
          <label className={styles.formLabel} htmlFor="ticket-design">Design Link</label>
          <select
            id="ticket-design"
            className={styles.formInput}
            value={designId}
            onChange={(e) => setDesignId(e.target.value)}
          >
            <option value="">None</option>
            {designs.map((d) => (
              <option key={d._id} value={d._id}>
                {d.designKey}: {d.title}
              </option>
            ))}
          </select>
        </div>
        <div className={styles.formField}>
          <label className={styles.formLabel} htmlFor="ticket-assignee">Assignee</label>
          <input
            id="ticket-assignee"
            className={styles.formInput}
            type="text"
            value={assignee}
            onChange={(e) => setAssignee(e.target.value)}
            placeholder="Assignee name"
          />
        </div>
        {error && <div className={styles.errorMessage}>{error}</div>}
        <div className={styles.formActions}>
          <button
            type="submit"
            className={styles.submitButton}
            disabled={!title.trim() || submitting}
          >
            {submitting ? "Creating..." : "Create"}
          </button>
          <button
            type="button"
            className={styles.cancelButton}
            onClick={onClose}
          >
            Cancel
          </button>
        </div>
      </form>
    </FormDialog>
  )
}
```

4. Update `TicketListPage.tsx` — remove `TicketCreateForm`, import `CreateTicketModal`, use modal:

Remove the entire `TicketCreateForm` function (lines 16-143). Replace the inline form rendering with the modal. The updated component keeps the same `showCreateForm` state but renders `CreateTicketModal` instead of `TicketCreateForm`:

Replace:
```tsx
      {showCreateForm && (
        <TicketCreateForm
          projectId={projectId}
          designs={designs}
          onCancel={() => setShowCreateForm(false)}
          onCreated={handleCreated}
        />
      )}
```

With:
```tsx
      {showCreateForm && (
        <CreateTicketModal
          projectId={projectId}
          designs={designs}
          onClose={() => setShowCreateForm(false)}
          onCreated={handleCreated}
        />
      )}
```

Add import at top:
```tsx
import { CreateTicketModal } from "./CreateTicketModal"
```

Remove the `TicketCreateForm` function entirely (lines 16-143).

5. Run tests:

Run: `cd /Users/joshua/Projects/tina && npx vitest run tina-web/src/components/__tests__/TicketListPage.test.tsx 2>&1 | tail -20`

Expected: All TicketListPage tests pass, including the new modal tests.

---

### Task 3: Create CreateDesignModal and update DesignListPage

**Files:**
- `tina-web/src/components/pm/CreateDesignModal.tsx`
- `tina-web/src/components/pm/DesignListPage.tsx`
- `tina-web/src/components/__tests__/DesignListPage.test.tsx`

**Model:** opus

**review:** full

**Depends on:** 1

Extract the inline `DesignCreateForm` from `DesignListPage.tsx` into a `CreateDesignModal` component.

**Steps:**

1. Update `DesignListPage.test.tsx` — update the "create form" tests to expect a modal dialog. Find the existing create form test block and update it. The test currently clicks "Create Design", then checks for `design-create-form` testid. Update to check for `role="dialog"`:

Replace the existing `describe("create form", ...)` block with:

```tsx
  describe("create form modal", () => {
    it("opens modal when Create Design button is clicked", async () => {
      const user = userEvent.setup()
      renderApp("/pm?project=p1")

      await user.click(screen.getByRole("tab", { name: /designs/i }))
      await user.click(screen.getByRole("button", { name: /create design/i }))

      expect(screen.getByRole("dialog")).toBeInTheDocument()
      expect(screen.getByText("Create Design")).toBeInTheDocument()
    })

    it("shows title and content inputs in modal", async () => {
      const user = userEvent.setup()
      renderApp("/pm?project=p1")

      await user.click(screen.getByRole("tab", { name: /designs/i }))
      await user.click(screen.getByRole("button", { name: /create design/i }))

      const dialog = screen.getByRole("dialog")
      expect(within(dialog).getByLabelText(/title/i)).toBeInTheDocument()
      expect(within(dialog).getByLabelText(/content/i)).toBeInTheDocument()
    })

    it("submit button disabled when title is empty", async () => {
      const user = userEvent.setup()
      renderApp("/pm?project=p1")

      await user.click(screen.getByRole("tab", { name: /designs/i }))
      await user.click(screen.getByRole("button", { name: /create design/i }))

      const dialog = screen.getByRole("dialog")
      expect(within(dialog).getByRole("button", { name: /^create$/i })).toBeDisabled()
    })

    it("closes modal on cancel", async () => {
      const user = userEvent.setup()
      renderApp("/pm?project=p1")

      await user.click(screen.getByRole("tab", { name: /designs/i }))
      await user.click(screen.getByRole("button", { name: /create design/i }))
      expect(screen.getByRole("dialog")).toBeInTheDocument()

      await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: /cancel/i }))
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    })
  })
```

2. Run tests — should fail:

Run: `cd /Users/joshua/Projects/tina && npx vitest run tina-web/src/components/__tests__/DesignListPage.test.tsx 2>&1 | tail -20`

Expected: New modal tests fail.

3. Create `CreateDesignModal.tsx`:

```tsx
// tina-web/src/components/pm/CreateDesignModal.tsx
import { useState } from "react"
import { useMutation } from "convex/react"
import { api } from "@convex/_generated/api"
import { FormDialog } from "@/components/FormDialog"
import type { Id } from "@convex/_generated/dataModel"
import styles from "@/components/FormDialog.module.scss"

interface CreateDesignModalProps {
  projectId: string
  onClose: () => void
  onCreated: (designId: string) => void
}

export function CreateDesignModal({
  projectId,
  onClose,
  onCreated,
}: CreateDesignModalProps) {
  const [title, setTitle] = useState("")
  const [markdown, setMarkdown] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const createDesign = useMutation(api.designs.createDesign)

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!title.trim()) return

    setSubmitting(true)
    setError(null)
    try {
      const designId = await createDesign({
        projectId: projectId as Id<"projects">,
        title: title.trim(),
        markdown: markdown.trim(),
      })
      onCreated(designId as unknown as string)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create design")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <FormDialog title="Create Design" onClose={onClose}>
      <form onSubmit={handleSubmit} data-testid="design-create-form">
        <div className={styles.formField}>
          <label className={styles.formLabel} htmlFor="design-title">Title</label>
          <input
            id="design-title"
            className={styles.formInput}
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Design title"
            autoFocus
          />
        </div>
        <div className={styles.formField}>
          <label className={styles.formLabel} htmlFor="design-markdown">Content</label>
          <textarea
            id="design-markdown"
            className={styles.formTextarea}
            value={markdown}
            onChange={(e) => setMarkdown(e.target.value)}
            placeholder="Design content (markdown)"
          />
        </div>
        {error && <div className={styles.errorMessage}>{error}</div>}
        <div className={styles.formActions}>
          <button
            type="submit"
            className={styles.submitButton}
            disabled={!title.trim() || submitting}
          >
            {submitting ? "Creating..." : "Create"}
          </button>
          <button
            type="button"
            className={styles.cancelButton}
            onClick={onClose}
          >
            Cancel
          </button>
        </div>
      </form>
    </FormDialog>
  )
}
```

4. Update `DesignListPage.tsx` — remove `DesignCreateForm`, import `CreateDesignModal`, use modal:

Remove the entire `DesignCreateForm` function (lines 15-93). Replace inline form with modal:

Replace:
```tsx
      {showCreateForm && (
        <DesignCreateForm
          projectId={projectId}
          onCancel={() => setShowCreateForm(false)}
          onCreated={handleCreated}
        />
      )}
```

With:
```tsx
      {showCreateForm && (
        <CreateDesignModal
          projectId={projectId}
          onClose={() => setShowCreateForm(false)}
          onCreated={handleCreated}
        />
      )}
```

Add import at top:
```tsx
import { CreateDesignModal } from "./CreateDesignModal"
```

Remove the `DesignCreateForm` function entirely (lines 15-93).

Also remove now-unused imports: `useMutation` from `convex/react`, `api` from `@convex/_generated/api`, `Id` from `@convex/_generated/dataModel`.

5. Run tests:

Run: `cd /Users/joshua/Projects/tina && npx vitest run tina-web/src/components/__tests__/DesignListPage.test.tsx 2>&1 | tail -20`

Expected: All DesignListPage tests pass.

---

### Task 4: Create EditTicketModal and update TicketDetailPage

**Files:**
- `tina-web/src/components/pm/EditTicketModal.tsx`
- `tina-web/src/components/pm/TicketDetailPage.tsx`

**Model:** opus

**review:** full

**Depends on:** 1

Extract the inline `TicketEditForm` from `TicketDetailPage.tsx` into an `EditTicketModal` component.

**Steps:**

1. Create `EditTicketModal.tsx`:

```tsx
// tina-web/src/components/pm/EditTicketModal.tsx
import { useState } from "react"
import { Option } from "effect"
import { useMutation } from "convex/react"
import { api } from "@convex/_generated/api"
import { FormDialog } from "@/components/FormDialog"
import type { TicketSummary, DesignSummary } from "@/schemas"
import type { Id } from "@convex/_generated/dataModel"
import styles from "@/components/FormDialog.module.scss"

interface EditTicketModalProps {
  ticket: TicketSummary
  designs: readonly DesignSummary[]
  onClose: () => void
  onSaved: () => void
}

export function EditTicketModal({
  ticket,
  designs,
  onClose,
  onSaved,
}: EditTicketModalProps) {
  const [title, setTitle] = useState(ticket.title)
  const [description, setDescription] = useState(ticket.description)
  const [priority, setPriority] = useState(ticket.priority)
  const [assignee, setAssignee] = useState(
    Option.isSome(ticket.assignee) ? ticket.assignee.value : "",
  )
  const [estimate, setEstimate] = useState(
    Option.isSome(ticket.estimate) ? ticket.estimate.value : "",
  )
  const [designId, setDesignId] = useState(
    Option.isSome(ticket.designId) ? ticket.designId.value : "",
  )
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const updateTicket = useMutation(api.tickets.updateTicket)

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!title.trim()) return

    setSubmitting(true)
    setError(null)
    try {
      const payload: {
        ticketId: Id<"tickets">
        title: string
        description: string
        priority: string
        designId?: Id<"designs">
        clearDesignId?: boolean
        assignee?: string
        estimate?: string
      } = {
        ticketId: ticket._id as Id<"tickets">,
        title: title.trim(),
        description: description.trim(),
        priority,
        ...(assignee.trim() ? { assignee: assignee.trim() } : {}),
        ...(estimate.trim() ? { estimate: estimate.trim() } : {}),
      }
      if (designId) {
        payload.designId = designId as Id<"designs">
      } else if (Option.isSome(ticket.designId)) {
        payload.clearDesignId = true
      }
      await updateTicket(payload)
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update ticket")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <FormDialog title="Edit Ticket" onClose={onClose}>
      <form onSubmit={handleSubmit} data-testid="ticket-edit-form">
        <div className={styles.formField}>
          <label className={styles.formLabel} htmlFor="edit-title">Title</label>
          <input
            id="edit-title"
            className={styles.formInput}
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>
        <div className={styles.formField}>
          <label className={styles.formLabel} htmlFor="edit-description">Description</label>
          <textarea
            id="edit-description"
            className={styles.formTextarea}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
        <div className={styles.formField}>
          <label className={styles.formLabel} htmlFor="edit-priority">Priority</label>
          <select
            id="edit-priority"
            className={styles.formInput}
            value={priority}
            onChange={(e) => setPriority(e.target.value)}
          >
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="urgent">Urgent</option>
          </select>
        </div>
        <div className={styles.formField}>
          <label className={styles.formLabel} htmlFor="edit-assignee">Assignee</label>
          <input
            id="edit-assignee"
            className={styles.formInput}
            type="text"
            value={assignee}
            onChange={(e) => setAssignee(e.target.value)}
            placeholder="Assignee name"
          />
        </div>
        <div className={styles.formField}>
          <label className={styles.formLabel} htmlFor="edit-estimate">Estimate</label>
          <input
            id="edit-estimate"
            className={styles.formInput}
            type="text"
            value={estimate}
            onChange={(e) => setEstimate(e.target.value)}
            placeholder="e.g. 2h, 1d"
          />
        </div>
        <div className={styles.formField}>
          <label className={styles.formLabel} htmlFor="edit-design">Design Link</label>
          <select
            id="edit-design"
            className={styles.formInput}
            value={designId}
            onChange={(e) => setDesignId(e.target.value)}
          >
            <option value="">None</option>
            {designs.map((d) => (
              <option key={d._id} value={d._id}>
                {d.designKey}: {d.title}
              </option>
            ))}
          </select>
        </div>
        {error && <div className={styles.errorMessage}>{error}</div>}
        <div className={styles.formActions}>
          <button
            type="submit"
            className={styles.submitButton}
            disabled={!title.trim() || submitting}
          >
            {submitting ? "Saving..." : "Save"}
          </button>
          <button
            type="button"
            className={styles.cancelButton}
            onClick={onClose}
          >
            Cancel
          </button>
        </div>
      </form>
    </FormDialog>
  )
}
```

2. Update `TicketDetailPage.tsx`:

Remove the `TicketEditForm` function (lines 50-207). Replace inline form rendering with modal.

Add import at top:
```tsx
import { EditTicketModal } from "./EditTicketModal"
```

Replace the inline form block (lines 333-340):
```tsx
      {editing && (
        <TicketEditForm
          ticket={ticket}
          designs={designs}
          onCancel={() => setEditing(false)}
          onSaved={() => setEditing(false)}
        />
      )}
```

With:
```tsx
      {editing && (
        <EditTicketModal
          ticket={ticket}
          designs={designs}
          onClose={() => setEditing(false)}
          onSaved={() => setEditing(false)}
        />
      )}
```

Remove now-unused imports: `Option` from `effect` is still needed for the display logic. Remove the `TicketEditForm` function entirely. The `useMutation` for `updateTicket` is no longer needed in TicketDetailPage since it moved to EditTicketModal — but `transitionTicket` mutation is still used, so keep `useMutation` import.

3. Run tests:

Run: `cd /Users/joshua/Projects/tina && npx vitest run tina-web/src/components/__tests__/TicketListPage.test.tsx 2>&1 | tail -20`

Expected: Tests pass (detail page route tests should still work).

---

### Task 5: Create EditDesignModal and update DesignDetailPage

**Files:**
- `tina-web/src/components/pm/EditDesignModal.tsx`
- `tina-web/src/components/pm/DesignDetailPage.tsx`

**Model:** opus

**review:** full

**Depends on:** 1

Extract the inline `EditForm` from `DesignDetailPage.tsx` into an `EditDesignModal` component.

**Steps:**

1. Create `EditDesignModal.tsx`:

```tsx
// tina-web/src/components/pm/EditDesignModal.tsx
import { useState } from "react"
import { FormDialog } from "@/components/FormDialog"
import type { DesignSummary } from "@/schemas"
import styles from "@/components/FormDialog.module.scss"

interface EditDesignModalProps {
  design: DesignSummary
  onClose: () => void
  onSave: (title: string, markdown: string) => void
}

export function EditDesignModal({
  design,
  onClose,
  onSave,
}: EditDesignModalProps) {
  const [title, setTitle] = useState(design.title)
  const [markdown, setMarkdown] = useState(design.markdown)

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    onSave(title.trim(), markdown.trim())
  }

  return (
    <FormDialog title="Edit Design" onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <div className={styles.formField}>
          <label className={styles.formLabel} htmlFor="design-edit-title">
            Title
          </label>
          <input
            id="design-edit-title"
            className={styles.formInput}
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            autoFocus
          />
        </div>
        <div className={styles.formField}>
          <label className={styles.formLabel} htmlFor="design-edit-content">
            Content
          </label>
          <textarea
            id="design-edit-content"
            className={styles.formTextarea}
            value={markdown}
            onChange={(e) => setMarkdown(e.target.value)}
          />
        </div>
        <div className={styles.formActions}>
          <button
            type="submit"
            className={styles.submitButton}
            disabled={!title.trim()}
          >
            Save
          </button>
          <button
            type="button"
            className={styles.cancelButton}
            onClick={onClose}
          >
            Cancel
          </button>
        </div>
      </form>
    </FormDialog>
  )
}
```

2. Update `DesignDetailPage.tsx`:

Remove the `EditForm` function (lines 50-111). Replace inline form rendering with modal.

Add import at top:
```tsx
import { EditDesignModal } from "./EditDesignModal"
```

Replace the inline form block (lines 213-221):
```tsx
      {editing ? (
        <EditForm
          design={design}
          onSave={handleSave}
          onCancel={() => setEditing(false)}
        />
      ) : (
        <pre className={styles.markdownBody}>{design.markdown}</pre>
      )}
```

With:
```tsx
      <pre className={styles.markdownBody}>{design.markdown}</pre>
      {editing && (
        <EditDesignModal
          design={design}
          onClose={() => setEditing(false)}
          onSave={handleSave}
        />
      )}
```

Note: The markdown body is now always visible since the edit form is in a modal overlay. The `EditForm` function is removed entirely.

Also remove the `useState` import for `useState` if it's only used for `editing` — actually, `editing` and `transitioning` state are still needed. Keep all imports.

3. Run tests:

Run: `cd /Users/joshua/Projects/tina && npx vitest run tina-web/src/components/__tests__/DesignListPage.test.tsx 2>&1 | tail -20`

Expected: Tests pass.

---

### Task 6: Create LaunchModal and add launch button to workspace header

**Files:**
- `tina-web/src/components/pm/LaunchModal.tsx`
- `tina-web/src/components/pm/PmShell.tsx`
- `tina-web/src/components/pm/PmShell.module.scss`
- `tina-web/src/components/__tests__/PmShell.test.tsx`

**Model:** opus

**review:** full

**Depends on:** 1

Create a launch modal adapted from the existing `LaunchOrchestrationPage` and add a "Launch" button to the workspace header next to the segmented control.

**Steps:**

1. Add test for launch button in PmShell tests. Add the following test to the existing `describe("PmShell - unified workspace", ...)` block in `PmShell.test.tsx`:

```tsx
  it("renders Launch button in workspace header", () => {
    renderApp("/pm?project=p1", {
      ...defaultStates,
      "designs.list": querySuccess([]),
      "nodes.list": querySuccess([]),
    })

    expect(screen.getByRole("button", { name: /launch/i })).toBeInTheDocument()
  })

  it("opens launch modal when Launch button is clicked", async () => {
    const user = userEvent.setup()
    renderApp("/pm?project=p1", {
      ...defaultStates,
      "designs.list": querySuccess([]),
      "nodes.list": querySuccess([]),
    })

    await user.click(screen.getByRole("button", { name: /launch/i }))
    expect(screen.getByRole("dialog")).toBeInTheDocument()
    expect(screen.getByText("Launch Orchestration")).toBeInTheDocument()
  })
```

Add `"nodes.list": querySuccess([])` to `defaultStates` at top of file.

2. Run tests — should fail:

Run: `cd /Users/joshua/Projects/tina && npx vitest run tina-web/src/components/__tests__/PmShell.test.tsx 2>&1 | tail -20`

Expected: Launch button tests fail.

3. Create `LaunchModal.tsx` — adapted from LaunchOrchestrationPage with same fields:

```tsx
// tina-web/src/components/pm/LaunchModal.tsx
import { useState } from "react"
import { useMutation } from "convex/react"
import { useTypedQuery } from "@/hooks/useTypedQuery"
import { DesignListQuery, NodeListQuery } from "@/services/data/queryDefs"
import { api } from "@convex/_generated/api"
import { isAnyQueryLoading, firstQueryError } from "@/lib/query-state"
import { generateIdempotencyKey } from "@/lib/utils"
import { FormDialog } from "@/components/FormDialog"
import type { Id } from "@convex/_generated/dataModel"
import formStyles from "@/components/FormDialog.module.scss"
import styles from "./LaunchModal.module.scss"

type PolicyPreset = "balanced" | "strict" | "fast"

function kebabCase(str: string): string {
  return str
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
}

interface LaunchModalProps {
  projectId: string
  onClose: () => void
}

export function LaunchModal({ projectId, onClose }: LaunchModalProps) {
  const [selectedDesignId, setSelectedDesignId] = useState("")
  const [selectedNodeId, setSelectedNodeId] = useState("")
  const [featureName, setFeatureName] = useState("")
  const [totalPhases, setTotalPhases] = useState("3")
  const [selectedPreset, setSelectedPreset] = useState<PolicyPreset>("balanced")
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<{ orchestrationId: string } | null>(null)

  const designsResult = useTypedQuery(DesignListQuery, { projectId })
  const nodesResult = useTypedQuery(NodeListQuery, {})
  const launch = useMutation(api.controlPlane.launchOrchestration)

  const loading = isAnyQueryLoading(designsResult, nodesResult)
  const queryError = !loading ? firstQueryError(designsResult, nodesResult) : null
  if (queryError) throw queryError

  const designs = designsResult.status === "success" ? designsResult.data : []
  const allNodes = nodesResult.status === "success" ? nodesResult.data : []
  const onlineNodes = allNodes.filter((n) => n.status === "online")

  const branchName = featureName ? `tina/${kebabCase(featureName)}` : ""

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError(null)
    setSubmitting(true)

    if (!featureName.trim()) {
      setError("Feature name is required")
      setSubmitting(false)
      return
    }

    if (!selectedDesignId || !selectedNodeId) {
      setError("Please select a design and node")
      setSubmitting(false)
      return
    }

    if (!totalPhases || Number(totalPhases) < 1) {
      setError("Total phases must be at least 1")
      setSubmitting(false)
      return
    }

    try {
      const idempotencyKey = generateIdempotencyKey()
      const { orchestrationId } = await launch({
        projectId: projectId as Id<"projects">,
        designId: selectedDesignId as Id<"designs">,
        nodeId: selectedNodeId as Id<"nodes">,
        feature: featureName.trim(),
        branch: branchName.trim(),
        totalPhases: Number(totalPhases),
        policyPreset: selectedPreset,
        requestedBy: "web-ui",
        idempotencyKey,
      })
      setResult({ orchestrationId: orchestrationId as string })
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to launch orchestration")
    } finally {
      setSubmitting(false)
    }
  }

  const presets: PolicyPreset[] = ["balanced", "strict", "fast"]

  return (
    <FormDialog title="Launch Orchestration" onClose={onClose} maxWidth={640}>
      {result ? (
        <div className={styles.successBanner}>
          Orchestration launched: <code>{result.orchestrationId}</code>
        </div>
      ) : (
        <form onSubmit={handleSubmit} data-testid="launch-form">
          {loading && <div className={formStyles.formField}>Loading...</div>}

          {!loading && (
            <>
              <div className={formStyles.formField}>
                <label className={formStyles.formLabel} htmlFor="launch-design">Design</label>
                <select
                  id="launch-design"
                  className={formStyles.formInput}
                  value={selectedDesignId}
                  onChange={(e) => setSelectedDesignId(e.target.value)}
                >
                  <option value="">Select a design</option>
                  {designs.map((d) => (
                    <option key={d._id} value={d._id}>{d.title}</option>
                  ))}
                </select>
              </div>

              <div className={formStyles.formField}>
                <label className={formStyles.formLabel} htmlFor="launch-node">Node</label>
                <select
                  id="launch-node"
                  className={formStyles.formInput}
                  value={selectedNodeId}
                  onChange={(e) => setSelectedNodeId(e.target.value)}
                >
                  <option value="">Select a node</option>
                  {onlineNodes.map((node) => (
                    <option key={node._id} value={node._id}>
                      {node.name} ({node.os})
                    </option>
                  ))}
                </select>
              </div>

              <div className={formStyles.formField}>
                <label className={formStyles.formLabel} htmlFor="launch-feature">Feature Name</label>
                <input
                  id="launch-feature"
                  className={formStyles.formInput}
                  type="text"
                  value={featureName}
                  onChange={(e) => setFeatureName(e.target.value)}
                  placeholder="e.g., Dark Mode Support"
                  autoFocus
                />
                {branchName && <span className={styles.hint}>Branch: {branchName}</span>}
              </div>

              <div className={formStyles.formField}>
                <label className={formStyles.formLabel} htmlFor="launch-phases">Total Phases</label>
                <input
                  id="launch-phases"
                  className={formStyles.formInput}
                  type="number"
                  min="1"
                  max="10"
                  value={totalPhases}
                  onChange={(e) => setTotalPhases(e.target.value)}
                />
              </div>

              <div className={formStyles.formField}>
                <label className={formStyles.formLabel}>Policy Preset</label>
                <div className={styles.presetButtons}>
                  {presets.map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      className={`${styles.presetButton}${selectedPreset === preset ? ` ${styles.active}` : ""}`}
                      onClick={() => setSelectedPreset(preset)}
                    >
                      {preset.charAt(0).toUpperCase() + preset.slice(1)}
                    </button>
                  ))}
                </div>
              </div>

              {error && <div className={formStyles.errorMessage}>{error}</div>}

              <div className={formStyles.formActions}>
                <button
                  type="submit"
                  className={formStyles.submitButton}
                  disabled={!featureName.trim() || !selectedDesignId || !selectedNodeId || submitting}
                >
                  {submitting ? "Launching..." : "Launch"}
                </button>
                <button
                  type="button"
                  className={formStyles.cancelButton}
                  onClick={onClose}
                >
                  Cancel
                </button>
              </div>
            </>
          )}
        </form>
      )}
    </FormDialog>
  )
}
```

4. Create `LaunchModal.module.scss` — only modal-specific styles (preset buttons, hints):

```scss
// tina-web/src/components/pm/LaunchModal.module.scss
@use '../../styles/tokens' as *;

.presetButtons {
  display: flex;
  gap: 8px;
}

.presetButton {
  font-size: 12px;
  padding: 4px 12px;
  border-radius: 4px;
  border: 1px solid $border-color;
  background: $bg-card;
  color: $text-primary;
  cursor: pointer;
  text-transform: capitalize;

  &:hover {
    background: hsl(var(--accent) / 0.08);
  }

  &.active {
    background: $accent;
    color: $accent-foreground;
    border-color: $accent;
  }
}

.hint {
  display: block;
  font-size: 11px;
  color: $text-muted;
  margin-top: 4px;
  font-family: $font-mono;
}

.successBanner {
  font-size: 12px;
  color: hsl(var(--primary, 214 100% 50%));
  padding: 8px 12px;
  border: 1px solid hsl(var(--primary, 214 100% 50%) / 0.3);
  border-radius: 4px;
  background: hsl(var(--primary, 214 100% 50%) / 0.08);
  font-family: $font-mono;

  code {
    font-weight: 600;
  }
}
```

5. Update `PmShell.tsx` — add Launch button and modal to workspace header:

Add imports at top of PmShell.tsx:
```tsx
import { LaunchModal } from "./LaunchModal"
```

Update `WorkspaceContent` to include launch button and modal state. The current `WorkspaceContent` takes `{ projectName }`. Change signature to `{ projectId, projectName }` (it already takes `projectId` in the existing code based on what I read — checking again: actually it only takes `projectName`). Add `projectId` prop:

Replace the `WorkspaceContent` function:

```tsx
function WorkspaceContent({ projectId, projectName }: { projectId: string; projectName: string }) {
  const [activeTab, setActiveTab] = useState<TabMode>("tickets")
  const [showLaunchModal, setShowLaunchModal] = useState(false)

  return (
    <>
      <div className={styles.workspaceHeader}>
        <h2 className={styles.projectTitle}>{projectName}</h2>
        <div className={styles.segmentedControl} role="tablist" aria-label="PM workspace tabs">
          <button
            role="tab"
            aria-selected={activeTab === "tickets"}
            className={`${styles.segment}${activeTab === "tickets" ? ` ${styles.segmentActive}` : ""}`}
            onClick={() => setActiveTab("tickets")}
          >
            Tickets
          </button>
          <button
            role="tab"
            aria-selected={activeTab === "designs"}
            className={`${styles.segment}${activeTab === "designs" ? ` ${styles.segmentActive}` : ""}`}
            onClick={() => setActiveTab("designs")}
          >
            Designs
          </button>
        </div>
        <button
          className={styles.launchButton}
          onClick={() => setShowLaunchModal(true)}
        >
          Launch
        </button>
      </div>
      <div role="tabpanel">
        {activeTab === "tickets" ? <TicketListPage /> : <DesignListPage />}
      </div>
      {showLaunchModal && (
        <LaunchModal
          projectId={projectId}
          onClose={() => setShowLaunchModal(false)}
        />
      )}
    </>
  )
}
```

Update the call site in `PmWorkspace` to pass `projectId`:

Replace:
```tsx
  return <WorkspaceContent projectName={projectName} />
```

With:
```tsx
  return <WorkspaceContent projectId={projectId} projectName={projectName} />
```

6. Add launch button style to `PmShell.module.scss`:

Add after the `.segmentActive` block:

```scss
.launchButton {
  margin-left: auto;
  font-size: 12px;
  padding: 4px 12px;
  border-radius: 4px;
  border: 1px solid $accent;
  background: $accent;
  color: $accent-foreground;
  cursor: pointer;

  &:hover {
    opacity: 0.9;
  }
}
```

7. Run PmShell tests:

Run: `cd /Users/joshua/Projects/tina && npx vitest run tina-web/src/components/__tests__/PmShell.test.tsx 2>&1 | tail -20`

Expected: All tests pass including new launch button tests.

---

### Task 7: Run full test suite and fix regressions

**Files:**
- (any files needing fixes)

**Model:** opus

**review:** full

**Depends on:** 2, 3, 4, 5, 6

Run the complete tina-web test suite. Fix any regressions from the modalization changes.

**Steps:**

1. Run full web test suite:

Run: `cd /Users/joshua/Projects/tina && npx vitest run --reporter=verbose 2>&1 | tail -50`

Expected: All tests pass. Common regressions to watch for:
- Tests that reference `ticket-create-form` or `design-create-form` testids may need to find them inside a `dialog` element now
- Tests that check for inline form behavior may need updates for modal behavior
- Any import errors from removed inline form functions

2. Run TypeScript type check:

Run: `cd /Users/joshua/Projects/tina && npx tsc --noEmit --project tina-web/tsconfig.json 2>&1 | tail -20`

Expected: No type errors.

3. Clean up unused form styles from list page stylesheets. In `TicketListPage.module.scss`, the following classes are now unused since the form moved to FormDialog: `.createForm`, `.formField`, `.formLabel`, `.formInput`, `.formTextarea`, `.formActions`, `.cancelButton`, `.submitButton`, `.errorMessage`. Remove them (lines 146-243). Similarly for `DesignListPage.module.scss` (lines 107-205).

4. Re-run tests after cleanup:

Run: `cd /Users/joshua/Projects/tina && npx vitest run --reporter=verbose 2>&1 | tail -30`

Expected: All tests still pass.

---

## Phase Estimates

| Task | Description | Estimate |
|------|-------------|----------|
| 1 | Create FormDialog infrastructure (hook + component + styles + tests) | 8 min |
| 2 | Create CreateTicketModal + update TicketListPage + update tests | 6 min |
| 3 | Create CreateDesignModal + update DesignListPage + update tests | 6 min |
| 4 | Create EditTicketModal + update TicketDetailPage | 5 min |
| 5 | Create EditDesignModal + update DesignDetailPage | 4 min |
| 6 | Create LaunchModal + add workspace entry + PmShell tests | 8 min |
| 7 | Full test suite + style cleanup + fix regressions | 5 min |
| **Total** | | **~42 min** |

## Lint Report

| Rule | Status |
|------|--------|
| model-tag | pass |
| review-tag | pass |
| depends-on | pass |
| plan-baseline | pass |
| complexity-budget | pass |
| phase-estimates | pass |
| file-list | pass |
| run-command | pass |
| expected-output | pass |

**Result:** pass
