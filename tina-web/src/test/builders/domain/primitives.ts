import { Option } from "effect"

export const some = Option.some

export function none<A>(): Option.Option<A> {
  return Option.none<A>()
}
