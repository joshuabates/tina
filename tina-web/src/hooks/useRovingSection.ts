import { useCallback } from "react"
import { useFocusable } from "@/hooks/useFocusable"

interface UseRovingSectionOptions {
  sectionId: string
  itemCount: number
  getItemDomId: (index: number) => string | undefined
}

interface RovingItemProps {
  id: string
  tabIndex: 0 | -1
  "data-focused"?: "true"
}

export function useRovingSection({
  sectionId,
  itemCount,
  getItemDomId,
}: UseRovingSectionOptions) {
  const { isSectionFocused, activeIndex } = useFocusable(sectionId, itemCount)

  const isValidActiveIndex =
    isSectionFocused && activeIndex >= 0 && activeIndex < itemCount

  const activeDescendantId = isValidActiveIndex
    ? getItemDomId(activeIndex)
    : undefined

  const isItemFocused = useCallback(
    (index: number) => isSectionFocused && activeIndex === index,
    [activeIndex, isSectionFocused],
  )

  const getItemProps = useCallback(
    (index: number, id: string): RovingItemProps => {
      const focused = isItemFocused(index)
      return {
        id,
        tabIndex: focused ? 0 : -1,
        "data-focused": focused ? "true" : undefined,
      }
    },
    [isItemFocused],
  )

  return {
    activeDescendantId,
    activeIndex,
    isSectionFocused,
    isItemFocused,
    getItemProps,
  }
}
