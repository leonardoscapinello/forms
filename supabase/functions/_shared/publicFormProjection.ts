const ADMIN_ONLY_FORM_KEYS = new Set([
  "flowNodePositions",
  "nodePositions",
  "responseCount",
  "completionRate",
  "createdAt",
  "updatedAt",
  "folderId",
  "completionWebhookUrl",
  "googleSheetId",
  "googleSheetUrl",
  "enableSentimentAnalysis",
  "notFoundRedirectUrl",
]);

/** Removes administrative destinations and analytics metadata from the public runtime blob. */
export function omitAdminOnlyPublicFormFields(
  value: Record<string, unknown>,
): Record<string, unknown> {
  const projected = Object.fromEntries(
    Object.entries(value).filter(([key]) => !ADMIN_ONLY_FORM_KEYS.has(key)),
  );

  // Legacy workflow questions predate integrationNodes and may contain a
  // destination URL with a bearer token in its path/query. The public renderer
  // no longer executes these fields, so keep display data but remove delivery.
  if (Array.isArray(projected.questions)) {
    projected.questions = projected.questions.map((question) => {
      if (!question || typeof question !== "object" || Array.isArray(question)) {
        return question;
      }
      const {
        webhookUrl: _webhookUrl,
        webhookMethod: _webhookMethod,
        ...publicQuestion
      } = question as Record<string, unknown>;
      return publicQuestion;
    });
  }

  return projected;
}
