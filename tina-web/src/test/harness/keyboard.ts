import type { KeyboardService } from "@/services/keyboard-service"

export function dispatchKeyDown(
  target: EventTarget,
  key: string,
  init: Omit<KeyboardEventInit, "key"> = {},
): KeyboardEvent {
  const event = new KeyboardEvent("keydown", {
    key,
    bubbles: true,
    cancelable: true,
    ...init,
  })
  target.dispatchEvent(event)
  return event
}

export async function withAttachedKeyboardService<T>(
  service: KeyboardService,
  run: () => T | Promise<T>,
): Promise<T> {
  service.attach()
  try {
    return await run()
  } finally {
    service.detach()
  }
}
