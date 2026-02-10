import type { ReactNode } from "react"
import { cn } from "@/lib/utils"
import { StatPanel } from "@/components/ui/stat-panel"

interface EventSectionProps<T> {
  title: string
  isLoading: boolean
  loadingText: string
  emptyText: string
  items: readonly T[]
  getItemKey: (item: T) => string
  renderItem: (item: T) => ReactNode
  header?: ReactNode
  footer?: ReactNode
  loadingClassName?: string
  emptyClassName?: string
  listClassName?: string
}

const defaultEmptyClass =
  "flex items-center justify-center py-6 text-muted-foreground text-sm"

export function EventSection<T>({
  title,
  isLoading,
  loadingText,
  emptyText,
  items,
  getItemKey,
  renderItem,
  header,
  footer,
  loadingClassName,
  emptyClassName,
  listClassName,
}: EventSectionProps<T>) {
  return (
    <StatPanel title={title}>
      {isLoading ? (
        <div className={cn(defaultEmptyClass, loadingClassName)}>{loadingText}</div>
      ) : items.length === 0 ? (
        <div className={cn(defaultEmptyClass, emptyClassName)}>{emptyText}</div>
      ) : (
        <div className={cn("space-y-3", listClassName)}>
          {header}
          {items.map((item) => (
            <div key={getItemKey(item)}>{renderItem(item)}</div>
          ))}
          {footer}
        </div>
      )}
    </StatPanel>
  )
}
