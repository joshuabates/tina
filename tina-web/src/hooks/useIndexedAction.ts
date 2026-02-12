import { useActionRegistration } from "@/hooks/useActionRegistration"

interface UseIndexedActionOptions<T> {
  id: string
  label: string
  key: string
  when: string
  items: readonly T[]
  activeIndex: number
  resolveIndex?: () => number | null | undefined
  execute: (item: T, index: number) => void
}

export function useIndexedAction<T>({
  id,
  label,
  key,
  when,
  items,
  activeIndex,
  resolveIndex,
  execute,
}: UseIndexedActionOptions<T>) {
  useActionRegistration({
    id,
    label,
    key,
    when,
    execute: () => {
      const resolvedIndex = resolveIndex?.()
      const index =
        typeof resolvedIndex === "number" && Number.isInteger(resolvedIndex)
          ? resolvedIndex
          : activeIndex

      if (index < 0 || index >= items.length) return

      const item = items[index]
      if (!item) return
      execute(item, index)
    },
  })
}
