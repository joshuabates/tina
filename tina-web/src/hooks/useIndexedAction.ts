import { useActionRegistration } from "@/hooks/useActionRegistration"

interface UseIndexedActionOptions<T> {
  id: string
  label: string
  key: string
  when: string
  items: readonly T[]
  activeIndex: number
  execute: (item: T, index: number) => void
}

export function useIndexedAction<T>({
  id,
  label,
  key,
  when,
  items,
  activeIndex,
  execute,
}: UseIndexedActionOptions<T>) {
  useActionRegistration({
    id,
    label,
    key,
    when,
    execute: () => {
      const item = items[activeIndex]
      if (!item) return
      execute(item, activeIndex)
    },
  })
}
