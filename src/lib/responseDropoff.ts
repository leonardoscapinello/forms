export type DropoffPage = {
  id: string;
  index: number;
  title: string;
};

export type DropoffPageEvent = {
  response_id: string | null;
  page_id: string | null;
  page_index: number | null;
  event_type: string;
  created_at: string;
};

export type DropoffResponse = {
  response_id: string;
  complete: boolean;
  lastPageIndex?: number | null;
};

export type PageDropoffStat = DropoffPage & {
  reached: number;
  dropoffs: number;
  dropoffPercent: number;
  continued: number;
};

/**
 * Calculates page abandonment from the real page-view sequence. A response is
 * counted as a page drop-off only when that page was its last recorded visit
 * and the response was not completed. `lastPageIndex` is a legacy fallback for
 * responses created before page events were available.
 */
export function calculatePageDropoff(
  pages: DropoffPage[],
  events: DropoffPageEvent[],
  responses: DropoffResponse[],
): PageDropoffStat[] {
  const pageByIndex = new Map(pages.map((page) => [page.index, page]));
  const pageIds = new Set(pages.map((page) => page.id));
  const completed = new Set(responses.filter((response) => response.complete).map((response) => response.response_id));
  const reachedByPage = new Map(pages.map((page) => [page.id, new Set<string>()]));
  const lastVisitByResponse = new Map<string, { pageId: string; at: number }>();

  const orderedEvents = [...events].sort((left, right) => {
    const leftTime = Date.parse(left.created_at);
    const rightTime = Date.parse(right.created_at);
    return (Number.isFinite(leftTime) ? leftTime : 0) - (Number.isFinite(rightTime) ? rightTime : 0);
  });

  for (const event of orderedEvents) {
    if (!event.response_id) continue;
    if (event.event_type === 'form_complete') {
      completed.add(event.response_id);
      continue;
    }
    if (event.event_type !== 'page_view') continue;
    const inferredPage = event.page_id && pageIds.has(event.page_id)
      ? pages.find((page) => page.id === event.page_id)
      : event.page_index !== null
        ? pageByIndex.get(event.page_index)
        : undefined;
    if (!inferredPage) continue;
    reachedByPage.get(inferredPage.id)?.add(event.response_id);
    lastVisitByResponse.set(event.response_id, {
      pageId: inferredPage.id,
      at: Date.parse(event.created_at) || 0,
    });
  }

  // Older rows may have response metadata but no telemetry event. Include them
  // conservatively without inventing visits to intermediate conditional pages.
  for (const response of responses) {
    if (lastVisitByResponse.has(response.response_id)) continue;
    if (typeof response.lastPageIndex !== 'number') continue;
    const page = pageByIndex.get(response.lastPageIndex);
    if (!page) continue;
    reachedByPage.get(page.id)?.add(response.response_id);
    lastVisitByResponse.set(response.response_id, { pageId: page.id, at: 0 });
  }

  const droppedByPage = new Map(pages.map((page) => [page.id, new Set<string>()]));
  for (const [responseId, visit] of lastVisitByResponse) {
    if (!completed.has(responseId)) droppedByPage.get(visit.pageId)?.add(responseId);
  }

  return pages.map((page) => {
    const reached = reachedByPage.get(page.id)?.size || 0;
    const dropoffs = droppedByPage.get(page.id)?.size || 0;
    return {
      ...page,
      reached,
      dropoffs,
      dropoffPercent: reached > 0 ? Math.round((dropoffs / reached) * 100) : 0,
      continued: Math.max(reached - dropoffs, 0),
    };
  });
}
