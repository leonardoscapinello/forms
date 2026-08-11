export type AnalyticsWorkflowDeliveryStatus =
  | "delivered"
  | "skipped"
  | "failed";

/**
 * Analytics nodes never influence routing or form values. Once the server has
 * authenticated and recorded the attempt, an unavailable provider must not
 * strand the respondent and turn a tracking outage into a lost lead.
 */
export function classifyAnalyticsWorkflowDelivery(
  serverFired: boolean,
  outcome: unknown,
): AnalyticsWorkflowDeliveryStatus {
  if (serverFired) return "delivered";
  return !!outcome && typeof outcome === "object" &&
      (outcome as Record<string, unknown>).skipped === true
    ? "skipped"
    : "failed";
}
