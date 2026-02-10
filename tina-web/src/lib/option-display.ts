import { Option } from "effect"

export function optionText<A>(
  option: Option.Option<A>,
  onSome: (value: A) => string,
  fallback = "—",
): string {
  return Option.match(option, {
    onNone: () => fallback,
    onSome,
  })
}

export function optionNullableText<A>(
  option: Option.Option<A>,
  onSome: (value: A) => string,
): string | null {
  return Option.match(option, {
    onNone: () => null,
    onSome,
  })
}
