import styles from "./ModeEmptyState.module.scss"

export function SessionsModePage() {
  return (
    <section data-testid="sessions-mode-page" className={styles.page}>
      <h1 className={styles.title}>Sessions</h1>
      <p className={styles.description}>
        No active sessions for this project.
      </p>
      <button type="button" className={styles.action}>
        Start session
      </button>
    </section>
  )
}
