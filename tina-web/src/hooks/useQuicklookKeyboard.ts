import { useEffect } from "react"

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName.toLowerCase()
  if (tag === "input" || tag === "textarea") return true
  if (target.contentEditable === "true" || target.isContentEditable) return true
  return false
}

export function useQuicklookKeyboard(onClose: () => void) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault()
        onClose()
        return
      }

      if (event.key === " " && !isEditableTarget(event.target)) {
        event.preventDefault()
        onClose()
      }
    }

    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [onClose])
}
