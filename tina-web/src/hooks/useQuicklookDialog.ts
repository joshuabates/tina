import { useEffect, useRef } from "react"

const focusableSelector =
  'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'

export function useQuicklookDialog(onClose: () => void) {
  const modalRef = useRef<HTMLDivElement>(null)

  // Handle Escape / Space to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === " ") {
        e.preventDefault()
        onClose()
      }
    }

    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [onClose])

  // Focus modal on mount
  useEffect(() => {
    modalRef.current?.focus()
  }, [])

  // Focus trap
  useEffect(() => {
    const modal = modalRef.current
    if (!modal) return

    const handleTab = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return

      const focusableElements = modal.querySelectorAll<HTMLElement>(
        focusableSelector
      )
      const firstElement = focusableElements[0]
      const lastElement = focusableElements[focusableElements.length - 1]

      if (e.shiftKey) {
        if (document.activeElement === firstElement || document.activeElement === modal) {
          e.preventDefault()
          if (lastElement) {
            lastElement.focus()
          } else {
            modal.focus()
          }
        }
        return
      }

      if (document.activeElement === lastElement) {
        e.preventDefault()
        if (firstElement) {
          firstElement.focus()
        } else {
          modal.focus()
        }
      }
    }

    modal.addEventListener("keydown", handleTab)
    return () => modal.removeEventListener("keydown", handleTab)
  }, [])

  return { modalRef }
}
