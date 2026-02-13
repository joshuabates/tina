import styles from "./ModeEmptyState.module.scss"

export function DesignModePage() {
  return (
    <section data-testid="design-mode-page" className={styles.page}>
      <h1 className={styles.title}>Design</h1>
      <p className={styles.description}>
        No design workspace yet.
      </p>
      <button type="button" className={styles.action}>
        Create/Open design
      </button>
    </section>
  )
}
