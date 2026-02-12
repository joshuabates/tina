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
