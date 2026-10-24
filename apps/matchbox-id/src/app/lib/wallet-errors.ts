/** True when a wallet error (or any error in its cause chain) is a user rejection. */
export function isUserRejection(error: unknown): boolean {
  let current: unknown = error
  for (let depth = 0; depth < 8 && current !== null; depth++) {
    if (typeof current !== "object" || current === undefined) return false
    if (
      Reflect.get(current, "name") === "UserRejectedRequestError" ||
      Reflect.get(current, "code") === 4001
    ) {
      return true
    }
    current = Reflect.get(current, "cause") ?? null
  }
  return false
}
