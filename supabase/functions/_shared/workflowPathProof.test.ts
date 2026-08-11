import {
  createWorkflowPathProofWithSecret,
  verifyWorkflowPathProofWithSecret,
} from "./workflowPathProof.ts";

function assert(condition: unknown, message = "assertion_failed"): asserts condition {
  if (!condition) throw new Error(message);
}

Deno.test("workflow proof is bound to form, response, session, node and answers", async () => {
  const secret = "workflow-proof-test-secret-with-entropy";
    const identity = {
      formId: "10000000-0000-4000-8000-000000000001",
      responseId: "20000000-0000-4000-8000-000000000001",
      sessionId: "30000000-0000-4000-8000-000000000001",
      nodeId: "int-first",
      answers: { choice: "yes", __var_score: "7" },
    };
    const proof = await createWorkflowPathProofWithSecret(identity, secret);
    const valid = await verifyWorkflowPathProofWithSecret({
      proof,
      formId: identity.formId,
      responseId: identity.responseId,
      sessionId: identity.sessionId,
      sourceNodeId: identity.nodeId,
      answers: { __var_score: "7", choice: "yes" },
    }, secret);
    assert(valid.ok, "canonical key order must not change the digest");

    const forgedResponse = await verifyWorkflowPathProofWithSecret({
      proof,
      formId: identity.formId,
      responseId: "20000000-0000-4000-8000-000000000099",
      sessionId: identity.sessionId,
      sourceNodeId: identity.nodeId,
      answers: identity.answers,
    }, secret);
    assert(!forgedResponse.ok && forgedResponse.error === "workflow_proof_invalid");

    const forgedAnswers = await verifyWorkflowPathProofWithSecret({
      proof,
      formId: identity.formId,
      responseId: identity.responseId,
      sessionId: identity.sessionId,
      sourceNodeId: identity.nodeId,
      answers: { ...identity.answers, choice: "no" },
    }, secret);
    assert(!forgedAnswers.ok && forgedAnswers.error === "workflow_answers_changed");
});

Deno.test("wait proof fails closed until its server deadline", async () => {
  const secret = "workflow-proof-test-secret-with-entropy";
    const now = Date.now();
    const identity = {
      formId: "10000000-0000-4000-8000-000000000001",
      responseId: "20000000-0000-4000-8000-000000000001",
      sessionId: "30000000-0000-4000-8000-000000000001",
      nodeId: "wt-delay",
      answers: { choice: "yes" },
      notBefore: now + 10_000,
    };
    const proof = await createWorkflowPathProofWithSecret(identity, secret);
    const early = await verifyWorkflowPathProofWithSecret({
      proof,
      formId: identity.formId,
      responseId: identity.responseId,
      sessionId: identity.sessionId,
      sourceNodeId: identity.nodeId,
      answers: identity.answers,
      nowMs: now,
    }, secret);
    assert(!early.ok && early.error === "workflow_wait_not_elapsed");
    const elapsed = await verifyWorkflowPathProofWithSecret({
      proof,
      formId: identity.formId,
      responseId: identity.responseId,
      sessionId: identity.sessionId,
      sourceNodeId: identity.nodeId,
      answers: identity.answers,
      nowMs: now + 10_001,
    }, secret);
    assert(elapsed.ok);
});
