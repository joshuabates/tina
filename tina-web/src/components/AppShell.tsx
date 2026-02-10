import { useState } from "react"
import { Outlet } from "react-router-dom"
import { AppHeader } from "./ui/app-header"
import { AppStatusBar } from "./ui/app-status-bar"
import styles from "./AppShell.module.scss"

export function AppShell() {
  const [collapsed, setCollapsed] = useState(false)

  const toggleCollapsed = () => {
    setCollapsed((prev) => !prev)
  }

  return (
    <div className={`${styles.appShell} ${collapsed ? styles.collapsed : ""}`}>
      <div className={styles.header}>
        <AppHeader />
      </div>

      <nav
        className={`${styles.sidebar} ${collapsed ? styles.collapsed : ""}`}
        role="navigation"
        aria-label="Main sidebar"
      >
        <button onClick={toggleCollapsed} aria-label="Collapse sidebar">
          {collapsed ? ">" : "<"}
        </button>
      </nav>

      <main className={styles.main} role="main" aria-label="Page content">
        <Outlet />
      </main>

      <div className={styles.footer}>
        <AppStatusBar />
      </div>
    </div>
  )
}
