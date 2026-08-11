import { assertEquals } from "jsr:@std/assert@1";
import { classifyAnalyticsWorkflowDelivery } from "./analyticsWorkflowDelivery.ts";

Deno.test("analytics workflow classifies a provider acknowledgement", () => {
  assertEquals(classifyAnalyticsWorkflowDelivery(true, { ok: true }), "delivered");
});

Deno.test("analytics workflow distinguishes an unconfigured provider", () => {
  assertEquals(
    classifyAnalyticsWorkflowDelivery(false, { skipped: true }),
    "skipped",
  );
});

Deno.test("analytics workflow records provider rejection without blocking routing", () => {
  assertEquals(
    classifyAnalyticsWorkflowDelivery(false, { ok: false, status: 503 }),
    "failed",
  );
});
