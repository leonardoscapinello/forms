export type ElementLookup = Record<string, string>; // elementId → label

const FIELD_FALLBACK_LABEL = 'Campo';

export function formatFieldTokensForDisplay(text: string, elementLookup?: ElementLookup): string {
  if (!text) return text;
  return text.replace(/\{\{field:([^}]+)\}\}/g, (_raw, elementId: string) => {
    const normalizedId = elementId.trim();
    const label = elementLookup?.[normalizedId];
    return `{{${label || FIELD_FALLBACK_LABEL}}}`;
  });
}
