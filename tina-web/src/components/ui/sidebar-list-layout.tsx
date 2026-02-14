import type { HTMLAttributes, ReactNode } from "react"
import { cn } from "@/lib/utils"
import styles from "./sidebar-list-layout.module.scss"

interface SidebarListLayoutProps extends HTMLAttributes<HTMLDivElement> {
  title: string
  children?: ReactNode
  footer?: ReactNode
  headerClassName?: string
  bodyClassName?: string
  bodyProps?: HTMLAttributes<HTMLDivElement>
  footerClassName?: string
}

function SidebarListLayout({
  title,
  children,
  footer,
  className,
  headerClassName,
  bodyClassName,
  bodyProps,
  footerClassName,
  ...props
}: SidebarListLayoutProps) {
  const {
    className: bodyPropsClassName,
    ...restBodyProps
  } = bodyProps ?? {}

  return (
    <div className={cn(styles.root, className)} {...props}>
      <div className={cn(styles.header, headerClassName)}>{title}</div>
      <div className={cn(styles.body, bodyClassName, bodyPropsClassName)} {...restBodyProps}>
        {children}
      </div>
      {footer ? (
        <div className={cn(styles.footer, footerClassName)}>
          {footer}
        </div>
      ) : null}
    </div>
  )
}

export { SidebarListLayout }
export type { SidebarListLayoutProps }
