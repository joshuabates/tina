import { useMemo } from "react"
import { useAppShellHeader } from "@/components/AppShellHeaderContext"
import styles from "./ModeEmptyState.module.scss"

export function DesignModePage() {
  const shellHeader = useMemo(
    () => <span className={styles.shellTitle}>Design</span>,
    [],
  )
  useAppShellHeader(shellHeader)

  return (
    <section data-testid="design-mode-page" className={styles.page}>
      <p className={styles.description}>
        No design workspace yet.
      </p>
      <button type="button" className={styles.action}>
        Create/Open design
      </button>
    </section>
  )
}
