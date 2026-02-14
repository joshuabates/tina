import { NavLink } from "react-router-dom"
import styles from "./PlanListToggle.module.scss"

interface PlanListToggleProps {
  projectId: string
}

export function PlanListToggle({ projectId }: PlanListToggleProps) {
  return (
    <nav className={styles.toggle} aria-label="Plan list view toggle">
      <NavLink
        to={`/projects/${projectId}/plan/tickets`}
        className={({ isActive }) =>
          isActive
            ? `${styles.item} ${styles.itemActive}`
            : styles.item
        }
      >
        Tickets
      </NavLink>
      <NavLink
        to={`/projects/${projectId}/plan/specs`}
        className={({ isActive }) =>
          isActive
            ? `${styles.item} ${styles.itemActive}`
            : styles.item
        }
      >
        Specs
      </NavLink>
    </nav>
  )
}
