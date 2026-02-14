import { useMemo } from "react"
import { useAppShellHeader } from "@/components/AppShellHeaderContext"
import styles from "./ModeEmptyState.module.scss"

export function CodeModePage() {
  const shellHeader = useMemo(
    () => <span className={styles.shellTitle}>Code</span>,
    [],
  )
  useAppShellHeader(shellHeader)

  return (
    <section data-testid="code-mode-page" className={styles.page}>
      <p className={styles.description}>
        No workspace opened.
      </p>
      <button type="button" className={styles.action}>
        Open project root
      </button>
    </section>
  )
}
