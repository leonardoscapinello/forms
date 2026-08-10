import type { PageElement } from '@/types/pageElements';

export function flattenPageElements(elements: PageElement[] = []): PageElement[] {
  return elements.flatMap((element) => [
    element,
    ...(element.type === 'columns'
      ? (element.columnData || []).flatMap((column) => flattenPageElements(column.elements))
      : []),
  ]);
}
