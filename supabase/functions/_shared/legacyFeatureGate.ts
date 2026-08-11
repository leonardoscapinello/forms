/** Legacy execution paths are opt-in so an unset or malformed environment never enables them. */
export function isExplicitlyEnabled(value: unknown): boolean {
  return value === "true";
}
