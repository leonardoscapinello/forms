/**
 * Returns whether a persisted workflow node is disabled for execution.
 *
 * The editor stores canonical canvas ids (for example `em-<id>`), while a
 * few older forms stored only the underlying node id. Accept both shapes so
 * a disabled node cannot be re-enabled accidentally by calling an Edge
 * Function directly.
 */
export function isWorkflowNodeDisabled(
  formData: unknown,
  nodeId: unknown,
  prefixes: string | string[] = [],
): boolean {
  if (!formData || typeof formData !== "object") return false;
  if (typeof nodeId !== "string" || !nodeId.trim()) return false;

  const disabledNodes = (formData as Record<string, unknown>).disabledNodes;
  if (!Array.isArray(disabledNodes)) return false;

  const rawId = nodeId.trim();
  const candidates = new Set<string>([rawId]);
  const normalizedPrefixes = Array.isArray(prefixes) ? prefixes : [prefixes];
  for (const prefix of normalizedPrefixes) {
    const normalizedPrefix = typeof prefix === "string"
      ? prefix.trim().replace(/-+$/g, "")
      : "";
    if (normalizedPrefix) candidates.add(`${normalizedPrefix}-${rawId}`);
  }

  return disabledNodes.some((value) =>
    typeof value === "string" && candidates.has(value.trim())
  );
}
