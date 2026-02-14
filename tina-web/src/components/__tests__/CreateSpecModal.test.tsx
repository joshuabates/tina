import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { CreateDesignModal } from "../pm/CreateDesignModal"

const mockCreateFn = vi.fn()

vi.mock("convex/react", async (importOriginal) => {
  const mod = await importOriginal<typeof import("convex/react")>()
  return {
    ...mod,
    useMutation: () => mockCreateFn,
  }
})

describe("CreateDesignModal", () => {
  const onClose = vi.fn()
  const onCreated = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    mockCreateFn.mockResolvedValue("design-1")
  })

  function renderModal() {
    return render(
      <CreateDesignModal
        projectId="p1"
        onClose={onClose}
        onCreated={onCreated}
      />,
    )
  }

  describe("complexity preset selector", () => {
    it("renders complexity radio buttons with simple, standard, complex options", () => {
      renderModal()

      const selector = screen.getByTestId("complexity-selector")
      expect(within(selector).getByLabelText(/simple/i)).toBeInTheDocument()
      expect(within(selector).getByLabelText(/standard/i)).toBeInTheDocument()
      expect(within(selector).getByLabelText(/complex/i)).toBeInTheDocument()
    })

    it("defaults to standard complexity", () => {
      renderModal()

      const standardRadio = screen.getByRole("radio", { name: /standard/i })
      expect(standardRadio).toBeChecked()
    })

    it("allows switching complexity preset", async () => {
      const user = userEvent.setup()
      renderModal()

      const simpleRadio = screen.getByRole("radio", { name: /simple/i })
      await user.click(simpleRadio)
      expect(simpleRadio).toBeChecked()
      expect(screen.getByRole("radio", { name: /standard/i })).not.toBeChecked()
    })

    it("submits selected complexity preset", async () => {
      const user = userEvent.setup()
      renderModal()

      await user.click(screen.getByRole("radio", { name: /complex/i }))
      await user.type(screen.getByLabelText(/title/i), "My Design")
      await user.click(screen.getByRole("button", { name: /^create$/i }))

      expect(mockCreateFn).toHaveBeenCalledWith(
        expect.objectContaining({
          complexityPreset: "complex",
          title: "My Design",
        }),
      )
    })
  })

  describe("markdown file import", () => {
    it("renders an import markdown button", () => {
      renderModal()
      expect(screen.getByRole("button", { name: /import markdown/i })).toBeInTheDocument()
    })

    it("has a hidden file input for markdown files", () => {
      renderModal()
      const fileInput = screen.getByTestId("markdown-file-input") as HTMLInputElement
      expect(fileInput).toBeInTheDocument()
      expect(fileInput.type).toBe("file")
      expect(fileInput.accept).toBe(".md,.markdown,.txt")
    })

    it("populates content textarea when a file is imported", async () => {
      const user = userEvent.setup()
      renderModal()

      const fileContent = "# My Design\n\nSome content here"
      const file = new File([fileContent], "design.md", { type: "text/plain" })
      file.text = () => Promise.resolve(fileContent)

      const fileInput = screen.getByTestId("markdown-file-input")
      await user.upload(fileInput, file)

      const textarea = screen.getByLabelText(/content/i) as HTMLTextAreaElement
      expect(textarea.value).toBe(fileContent)
    })

    it("extracts title from markdown h1 when title is empty", async () => {
      const user = userEvent.setup()
      renderModal()

      const fileContent = "# Authentication Flow\n\nDesign doc content"
      const file = new File([fileContent], "auth.md", { type: "text/plain" })
      file.text = () => Promise.resolve(fileContent)

      const fileInput = screen.getByTestId("markdown-file-input")
      await user.upload(fileInput, file)

      const titleInput = screen.getByLabelText(/title/i) as HTMLInputElement
      expect(titleInput.value).toBe("Authentication Flow")
    })

    it("does not overwrite existing title when importing file", async () => {
      const user = userEvent.setup()
      renderModal()

      await user.type(screen.getByLabelText(/title/i), "Existing Title")

      const fileContent = "# New Title\n\nContent"
      const file = new File([fileContent], "doc.md", { type: "text/plain" })
      file.text = () => Promise.resolve(fileContent)

      const fileInput = screen.getByTestId("markdown-file-input")
      await user.upload(fileInput, file)

      const titleInput = screen.getByLabelText(/title/i) as HTMLInputElement
      expect(titleInput.value).toBe("Existing Title")
    })
  })

  describe("form submission", () => {
    it("submits with default complexity when no change is made", async () => {
      const user = userEvent.setup()
      renderModal()

      await user.type(screen.getByLabelText(/title/i), "Test Design")
      await user.click(screen.getByRole("button", { name: /^create$/i }))

      expect(mockCreateFn).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Test Design",
          complexityPreset: "standard",
        }),
      )
    })

    it("calls onCreated with design ID on success", async () => {
      const user = userEvent.setup()
      mockCreateFn.mockResolvedValue("design-123")
      renderModal()

      await user.type(screen.getByLabelText(/title/i), "Test")
      await user.click(screen.getByRole("button", { name: /^create$/i }))

      expect(onCreated).toHaveBeenCalledWith("design-123")
    })

    it("displays error message on mutation failure", async () => {
      const user = userEvent.setup()
      mockCreateFn.mockRejectedValue(new Error("Server error"))
      renderModal()

      await user.type(screen.getByLabelText(/title/i), "Test")
      await user.click(screen.getByRole("button", { name: /^create$/i }))

      expect(screen.getByText("Server error")).toBeInTheDocument()
    })
  })
})
