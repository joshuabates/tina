import { useId, useRef, type ReactNode } from "react"
import { StatusBadge, type StatusBadgeStatus } from "@/components/ui/status-badge"
import { useFocusTrap } from "@/hooks/useFocusTrap"
import { useQuicklookKeyboard } from "@/hooks/useQuicklookKeyboard"
import styles from "./QuicklookDialog.module.scss"

interface QuicklookDialogProps {
  title: string
  status: StatusBadgeStatus
  onClose: () => void
  children: ReactNode
}

export function QuicklookDialog({
  title,
  status,
  onClose,
  children,
}: QuicklookDialogProps) {
  const titleId = useId()
  const modalRef = useRef<HTMLDivElement>(null)

  useQuicklookKeyboard(onClose)
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
        onClick={(event) => event.stopPropagation()}
      >
        <div className={styles.header}>
          <h2 id={titleId} className={styles.title}>
            {title}
          </h2>
          <StatusBadge status={status} />
          <button
            type="button"
            className={styles.closeButton}
            onClick={onClose}
            aria-label="Close quicklook"
          >
            x
          </button>
        </div>
        <div className={styles.content}>{children}</div>
      </div>
    </div>
  )
}
