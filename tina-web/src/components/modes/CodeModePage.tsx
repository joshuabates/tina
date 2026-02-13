import styles from "./ModeEmptyState.module.scss"

export function CodeModePage() {
  return (
    <section data-testid="code-mode-page" className={styles.page}>
      <h1 className={styles.title}>Code</h1>
      <p className={styles.description}>
        No workspace opened.
      </p>
      <button type="button" className={styles.action}>
        Open project root
      </button>
    </section>
  )
}
