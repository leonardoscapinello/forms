import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

// ── Stringify compound field values ──

function stringifyFieldValue(val: any): string {
  if (Array.isArray(val)) return val.map((v: any) => typeof v === 'object' ? stringifyFieldValue(v) : String(v)).join(', ');
  if (val.ddi && val.number) return `${val.ddi}${String(val.number).replace(/\D/g, '')}`;
  if (val.street !== undefined || val.city !== undefined) {
    return [val.street, val.number, val.complement, val.neighborhood, val.city, val.state, val.zip].filter(Boolean).join(', ');
  }
  if (val.height !== undefined || val.weight !== undefined) {
    return [val.height && `${val.height}cm`, val.weight && `${val.weight}kg`].filter(Boolean).join(' / ');
  }
  if (val.first !== undefined || val.last !== undefined) {
    return [val.first, val.last].filter(Boolean).join(' ');
  }
  return JSON.stringify(val);
}

function resolveAnswerValue(val: any): string {
  if (val === undefined || val === null) return '';
  if (typeof val === 'object') return stringifyFieldValue(val);
  return String(val);
}

// ── Variable interpolation ──

function interpolate(text: string, answers: Record<string, any>, variables: any[]): string {
  if (!text) return '';

  // Handle webhook references: {{webhook:nodeId:path}}
  let result = text.replace(/\{\{webhook:([^:}]+):([^}]+)\}\}/g, (_: string, nodeId: string, path: string) => {
    const data = answers[`__webhook_${nodeId}`];
    if (!data) return '';
    const val = path.split('.').reduce((obj: any, key: string) => obj?.[key], data);
    return val !== undefined && val !== null ? String(val) : '';
  });

  // Handle context: {{ctx.device}}
  result = result.replace(/\{\{ctx\.(\w+)\}\}/g, (_: string, key: string) => {
    const val = answers[`__ctx_${key}`];
    return val !== undefined && val !== null ? String(val) : '';
  });

  // Handle params: {{param.utm_source}}
  result = result.replace(/\{\{param\.([^}]+)\}\}/g, (_: string, key: string) => {
    const val = answers[`__param_${key}`];
    return val !== undefined && val !== null ? String(val) : '';
  });

  // Handle field references: {{field:elementId}}
  result = result.replace(/\{\{field:([^}]+)\}\}/g, (_: string, elementId: string) => {
    return resolveAnswerValue(answers[elementId]);
  });

  // Handle variable references: {{varName}} and plain answer keys
  return result.replace(/\{\{([^}]+)\}\}/g, (_, key: string) => {
    const trimmed = key.trim();
    const varMatch = variables.find((v: any) => v.name === trimmed || v.id === trimmed);
    if (varMatch) {
      const varKey = `__var_${varMatch.name}`;
      return answers[varKey] !== undefined ? resolveAnswerValue(answers[varKey]) : varMatch.defaultValue || '';
    }
    if (answers[trimmed] !== undefined) {
      return resolveAnswerValue(answers[trimmed]);
    }
    return '';
  });
}

// ── Option label resolution for condition evaluation ──

const OPTION_FIELD_TYPES = new Set([
  'input_select', 'input_radio', 'input_quiz_icon', 'input_quiz_image', 'input_multi_select',
]);

/**
 * Given a form element and a raw answer value (option ID), resolves the human-readable label.
 */
function resolveOptionLabelServer(element: any, rawValue: any): string {
  if (!element || !rawValue || !OPTION_FIELD_TYPES.has(element.type)) {
    return rawValue !== undefined && rawValue !== null ? String(rawValue) : '';
  }
  const options = element.options || [];
  if (element.type === 'input_multi_select' && Array.isArray(rawValue)) {
    return rawValue.map((id: string) => {
      const opt = options.find((o: any) => o.id === id);
      return opt ? opt.label : String(id);
    }).join(', ');
  }
  const opt = options.find((o: any) => o.id === rawValue);
  return opt ? opt.label : String(rawValue);
}

// ── Condition evaluator ──

function evaluateCondition(group: any, answers: Record<string, any>, variables: any[], allElements?: any[]): boolean {
  if (!group) return true;
  const logic = group.logic || 'and';

  const ruleResults = (group.rules || []).map((rule: any) => {
    let actual: any;
    let labelResolved: string | null = null;

    if (rule.subjectType === 'variable') {
      const v = variables.find((vr: any) => vr.id === rule.variableId);
      actual = v ? answers[`__var_${v.name}`] : undefined;
    } else if (rule.subjectType === 'context') {
      actual = answers[`__ctx_${rule.contextKey}`];
    } else if (rule.subjectType === 'param') {
      actual = answers[`__param_${rule.paramKey}`];
    } else {
      actual = answers[rule.questionId];
      // Resolve option ID → label for comparison
      if (allElements) {
        const element = allElements.find((el: any) => el.id === rule.questionId);
        if (element) {
          labelResolved = resolveOptionLabelServer(element, actual);
        }
      }
    }
    const expected = rule.value;
    const actualStr = actual !== undefined && actual !== null ? String(actual) : '';
    const labelStr = labelResolved ?? actualStr;
    const expectedStr = String(expected || '');

    // Helper: check match against both raw and label
    const matchAny = (check: (val: string) => boolean): boolean => {
      return check(actualStr) || (labelStr !== actualStr && check(labelStr));
    };

    switch (rule.operator) {
      case 'equals': return matchAny(v => v === expectedStr);
      case 'not_equals': return actualStr !== expectedStr && labelStr !== expectedStr;
      case 'contains': return matchAny(v => v.toLowerCase().includes(expectedStr.toLowerCase()));
      case 'not_contains':
        return !actualStr.toLowerCase().includes(expectedStr.toLowerCase()) &&
               !labelStr.toLowerCase().includes(expectedStr.toLowerCase());
      case 'greater_than': return parseFloat(actualStr) > parseFloat(expectedStr);
      case 'less_than': return parseFloat(actualStr) < parseFloat(expectedStr);
      case 'is_empty': return actualStr === '';
      case 'is_not_empty': return actualStr !== '';
      default: return true;
    }
  });

  const groupResults = (group.groups || []).map((g: any) => evaluateCondition(g, answers, variables, allElements));
  const all = [...ruleResults, ...groupResults];

  return logic === 'and' ? all.every(Boolean) : all.some(Boolean);
}

// ── Variable operation executor ──

function executeVariableOp(op: any, answers: Record<string, any>, variables: any[]): Record<string, any> {
  const updated = { ...answers };
  for (const operation of op.operations || []) {
    const v = variables.find((vr: any) => vr.id === operation.variableId);
    if (!v) continue;
    const varKey = `__var_${v.name}`;
    let operandValue: number;
    if (operation.operandType === 'field' && operation.operandFieldId) {
      operandValue = parseFloat(answers[operation.operandFieldId] || '0');
    } else {
      operandValue = parseFloat(interpolate(operation.operand, answers, variables) || '0');
    }
    const current = parseFloat(updated[varKey] || '0');
    switch (operation.op) {
      case 'set': updated[varKey] = operandValue; break;
      case 'add': updated[varKey] = current + operandValue; break;
      case 'subtract': updated[varKey] = current - operandValue; break;
      case 'multiply': updated[varKey] = current * operandValue; break;
      case 'divide': updated[varKey] = operandValue !== 0 ? current / operandValue : current; break;
    }
  }
  return updated;
}

// ── Workflow walker ──

async function walkWorkflow(
  startNodeId: string,
  answers: Record<string, any>,
  formData: any,
  admin: any,
  supabaseUrl: string,
  serviceKey: string,
): Promise<{ updatedAnswers: Record<string, any>; errors: string[] }> {
  const edges = formData.flowEdges || [];
  const variables = formData.variables || [];
  const visited = new Set<string>();
  const errors: string[] = [];
  let currentAnswers = { ...answers };
  let currentNodeId: string | null = startNodeId;

  while (currentNodeId && !visited.has(currentNodeId)) {
    visited.add(currentNodeId);

    // Find outgoing edges
    const outEdges = edges.filter((e: any) => e.source === currentNodeId);
    if (outEdges.length === 0) break;

    let nextNodeId: string | null = null;

    for (const edge of outEdges) {
      const target = edge.target;
      if (!target || target === 'end') continue;
      if (visited.has(target)) continue;

      // Page nodes — skip (pages are client-side only)
      if (target.startsWith('p-')) {
        nextNodeId = target;
        continue;
      }

      // Condition node
      if (target.startsWith('c-')) {
        const condId = target.replace('c-', '');
        const cond = (formData.conditions || []).find((c: any) => c.id === condId);
        if (cond) {
          // Collect all elements for option-label resolution
          const allElements = (formData.pages || []).flatMap((p: any) => p.elements || []);
          let matched = false;
          for (const branch of cond.branches || []) {
            if (evaluateCondition(branch.conditionGroup, currentAnswers, variables, allElements)) {
              const branchEdge = edges.find((e: any) => e.source === target && e.sourceHandle === `branch-${branch.id}`);
              if (branchEdge) {
                nextNodeId = branchEdge.target;
                matched = true;
                break;
              }
            }
          }
          if (!matched) {
            const defaultEdge = edges.find((e: any) => e.source === target && e.sourceHandle === 'default');
            if (defaultEdge) nextNodeId = defaultEdge.target;
          }
        }
        continue;
      }

      // Variable operation node
      if (target.startsWith('vo-')) {
        const voId = target.replace('vo-', '');
        const voNode = (formData.variableOpNodes || []).find((n: any) => n.id === voId);
        if (voNode) {
          currentAnswers = executeVariableOp(voNode, currentAnswers, variables);
        }
        const voOut = edges.find((e: any) => e.source === target);
        if (voOut) nextNodeId = voOut.target;
        continue;
      }

      // Analytics/Pixel node
      if (target.startsWith('an-')) {
        const anId = target.replace('an-', '');
        const anNode = (formData.analyticsNodes || []).find((n: any) => n.id === anId);
        if (anNode) {
          // Fire server-side pixel events
          try {
            const platforms = anNode.platforms || (anNode.platform ? [{ platform: anNode.platform, eventType: anNode.eventType, customEventName: anNode.customEventName, enabled: true }] : []);
            for (const p of platforms) {
              if (!p.enabled) continue;
              await fetch(`${supabaseUrl}/functions/v1/pixel-event`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${serviceKey}` },
                body: JSON.stringify({
                  platform: p.platform,
                  eventName: p.eventType === 'custom' ? p.customEventName : p.eventType,
                  formId: formData.id,
                  responseId: answers.__responseId,
                  triggerType: 'workflow_node',
                }),
              });
            }
          } catch (err) {
            errors.push(`pixel_error: ${err}`);
          }
        }
        const anOut = edges.find((e: any) => e.source === target);
        if (anOut) nextNodeId = anOut.target;
        continue;
      }

      // WhatsApp node
      if (target.startsWith('wa-')) {
        const waId = target.replace('wa-', '');
        const waNode = (formData.whatsappNodes || []).find((n: any) => n.id === waId);
        if (waNode) {
          try {
            const messageText = interpolate(waNode.messageText || '', currentAnswers, variables);
            const recipientNumber = interpolate(waNode.recipientNumber || '', currentAnswers, variables);
            await fetch(`${supabaseUrl}/functions/v1/whatsapp-send`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${serviceKey}` },
              body: JSON.stringify({
                instanceId: waNode.instanceId,
                recipientNumber,
                messageText,
                sendMedia: waNode.sendMedia,
                mediaType: waNode.mediaType,
                mediaUrl: waNode.mediaUrl ? interpolate(waNode.mediaUrl, currentAnswers, variables) : undefined,
                mediaFileName: waNode.mediaFileName,
              }),
            });
          } catch (err) {
            errors.push(`whatsapp_error: ${err}`);
          }
        }
        const waOut = edges.find((e: any) => e.source === target);
        if (waOut) nextNodeId = waOut.target;
        continue;
      }

      // Email node
      if (target.startsWith('em-')) {
        const emId = target.replace('em-', '');
        const emNode = (formData.emailNodes || []).find((n: any) => n.id === emId);
        if (emNode) {
          try {
            await fetch(`${supabaseUrl}/functions/v1/resend-send`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${serviceKey}` },
              body: JSON.stringify({
                instanceId: emNode.instanceId,
                fromEmail: emNode.fromEmail,
                fromName: emNode.fromName,
                toEmail: interpolate(emNode.toEmail || '', currentAnswers, variables),
                subject: interpolate(emNode.subject || '', currentAnswers, variables),
                bodyText: interpolate(emNode.bodyText || '', currentAnswers, variables),
                useHtml: emNode.useHtml,
                bodyHtml: emNode.useHtml ? interpolate(emNode.bodyHtml || '', currentAnswers, variables) : undefined,
              }),
            });
          } catch (err) {
            errors.push(`email_error: ${err}`);
          }
        }
        const emOut = edges.find((e: any) => e.source === target);
        if (emOut) nextNodeId = emOut.target;
        continue;
      }

      // Integration (webhook) node
      if (target.startsWith('int-')) {
        const intId = target.replace('int-', '');
        const intNode = (formData.integrationNodes || []).find((n: any) => n.id === intId);
        if (intNode && intNode.webhookUrl) {
          try {
            const headers: Record<string, string> = { 'Content-Type': 'application/json' };
            for (const h of intNode.webhookHeaders || []) {
              headers[h.key] = interpolate(h.value, currentAnswers, variables);
            }
            let url = interpolate(intNode.webhookUrl, currentAnswers, variables);
            const qParams = (intNode.webhookQueryParams || []).map((q: any) =>
              `${encodeURIComponent(q.key)}=${encodeURIComponent(interpolate(q.value, currentAnswers, variables))}`
            ).join('&');
            if (qParams) url += (url.includes('?') ? '&' : '?') + qParams;

            const bodyParams: Record<string, any> = {};
            for (const bp of intNode.webhookBodyParams || []) {
              bodyParams[bp.key] = interpolate(bp.value, currentAnswers, variables);
            }

            const res = await fetch(url, {
              method: intNode.webhookMethod || 'POST',
              headers,
              body: intNode.webhookMethod === 'GET' ? undefined : JSON.stringify({
                formId: formData.id,
                answers: currentAnswers,
                ...bodyParams,
              }),
            });

            // Map response fields to variables
            if (intNode.responseMappings?.length) {
              try {
                const resBody = await res.json();
                for (const mapping of intNode.responseMappings) {
                  const v = variables.find((vr: any) => vr.id === mapping.variableId);
                  if (v) {
                    const value = mapping.responsePath.split('.').reduce((obj: any, key: string) => obj?.[key], resBody);
                    if (value !== undefined) {
                      currentAnswers[`__var_${v.name}`] = value;
                    }
                  }
                }
              } catch { /* response not JSON */ }
            }
          } catch (err) {
            errors.push(`webhook_error: ${err}`);
          }
        }
        const intOut = edges.find((e: any) => e.source === target);
        if (intOut) nextNodeId = intOut.target;
        continue;
      }

      // A/B Test node
      if (target.startsWith('ab-')) {
        const abId = target.replace('ab-', '');
        const abNode = (formData.abTestNodes || []).find((n: any) => n.id === abId);
        if (abNode && abNode.variants?.length) {
          const totalWeight = abNode.variants.reduce((s: number, v: any) => s + v.weight, 0);
          let random = Math.random() * totalWeight;
          let chosen = abNode.variants[0];
          for (const variant of abNode.variants) {
            random -= variant.weight;
            if (random <= 0) { chosen = variant; break; }
          }
          // Handle ID matches ABTestNode component: `ab-${variant.id}`
          const variantEdge = edges.find((e: any) => e.source === target && e.sourceHandle === `ab-${chosen.id}`);
          if (variantEdge) nextNodeId = variantEdge.target;
        }
        continue;
      }

      // AI node
      if (target.startsWith('ai-')) {
        const aiId = target.replace('ai-', '');
        const aiNode = (formData.aiNodes || []).find((n: any) => n.id === aiId);
        if (aiNode) {
          try {
            // Gather input data from selected sources (serialize objects to readable strings)
            const inputData: Record<string, any> = {};
            for (const sourceId of aiNode.inputSources || []) {
              const val = currentAnswers[sourceId];
              if (val !== undefined && val !== null) {
                const element = (formData.pages || []).flatMap((p: any) => p.elements || []).find((el: any) => el.id === sourceId);
                const label = element?.label || element?.placeholder || sourceId;
                // Serialize objects to readable strings to avoid [object Object]
                if (typeof val === 'object' && val !== null) {
                  inputData[label] = JSON.stringify(val, null, 2);
                } else {
                  inputData[label] = String(val);
                }
              }
            }

            const resolvedPrompt = interpolate(aiNode.prompt || '', currentAnswers, variables);

            const aiResponse = await fetch(`${supabaseUrl}/functions/v1/ai-process`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${serviceKey}` },
              body: JSON.stringify({
                objective: aiNode.objective || 'custom',
                prompt: resolvedPrompt,
                systemPrompt: aiNode.systemPrompt || '',
                inputData,
                model: aiNode.model,
                maxTokens: aiNode.maxTokens || 500,
                temperature: aiNode.temperature ?? 0.7,
              }),
            });

            if (aiResponse.ok) {
              const aiData = await aiResponse.json();
              if (aiData.success && aiData.result && aiNode.outputVariableId) {
                const outVar = variables.find((v: any) => v.id === aiNode.outputVariableId);
                if (outVar) {
                  currentAnswers[`__var_${outVar.name}`] = aiData.result;
                }
              }
            } else {
              await aiResponse.text(); // consume body
              errors.push(`ai_error: status ${aiResponse.status}`);
            }
          } catch (err) {
            errors.push(`ai_error: ${err}`);
          }
        }
        const aiOut = edges.find((e: any) => e.source === target);
        if (aiOut) nextNodeId = aiOut.target;
        continue;
      }

      // Wait node — server-side just passes through (wait is client-side only)
      if (target.startsWith('wt-')) {
        const wtOut = edges.find((e: any) => e.source === target);
        if (wtOut) nextNodeId = wtOut.target;
        continue;
      }

      // Jump node
      if (target.startsWith('jp-')) {
        const jpId = target.replace('jp-', '');
        const jpNode = (formData.jumpNodes || []).find((n: any) => n.id === jpId);
        if (jpNode?.targetPageId) {
          nextNodeId = `p-${jpNode.targetPageId}`;
        }
        continue;
      }

      // Default: follow the edge
      nextNodeId = target;
    }

    currentNodeId = nextNodeId;
  }

  return { updatedAnswers: currentAnswers, errors };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const rawBody = await req.text();
    if (rawBody.length > 500_000) {
      return new Response(JSON.stringify({ success: false, error: 'payload_too_large' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = JSON.parse(rawBody);
    const { formId, answers, responseId, metadata } = body;

    if (!formId || typeof formId !== 'string' || formId.length > 100) {
      return new Response(JSON.stringify({ success: false, error: 'invalid_formId' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!responseId || typeof responseId !== 'string' || responseId.length > 100) {
      return new Response(JSON.stringify({ success: false, error: 'invalid_responseId' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!answers || typeof answers !== 'object' || Array.isArray(answers)) {
      return new Response(JSON.stringify({ success: false, error: 'invalid_answers' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const admin = createClient(supabaseUrl, serviceKey);

    // Load full form data from DB
    const { data: formRow, error: formError } = await admin
      .from('forms')
      .select('id, title, data')
      .eq('id', formId)
      .single();

    if (formError || !formRow) {
      return new Response(JSON.stringify({ success: false, error: 'form_not_found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const formData = {
      ...(formRow.data as Record<string, unknown>),
      id: formRow.id,
      title: formRow.title,
    };

    // Tag answers with response ID for workflow nodes
    const enrichedAnswers = { ...answers, __responseId: responseId };

    // Save the response via form-public-save
    await fetch(`${supabaseUrl}/functions/v1/form-public-save`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({
        kind: 'response',
        action: 'upsert',
        onConflict: 'form_id,response_id',
        payload: {
          form_id: formId,
          response_id: responseId,
          answers,
          metadata: {
            ...metadata,
            status: 'complete',
            submitted_at: new Date().toISOString(),
            execution_mode: 'server_workflow',
          },
          total_time_ms: metadata?.totalTimeMs || null,
          pages_visited: metadata?.pagesVisited || null,
        },
      }),
    });

    // Walk the workflow from the last page node
    const lastPageId = metadata?.lastPageId;
    const startNode = lastPageId ? `p-${lastPageId}` : 'start';

    const { updatedAnswers, errors } = await walkWorkflow(
      startNode,
      enrichedAnswers,
      formData,
      admin,
      supabaseUrl,
      serviceKey,
    );

    // Fire completion webhook if configured
    const completionWebhookUrl = (formData as any).completionWebhookUrl;
    if (completionWebhookUrl) {
      try {
        await fetch(completionWebhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            formId,
            responseId,
            answers: updatedAnswers,
            submittedAt: new Date().toISOString(),
          }),
        });
      } catch (err) {
        errors.push(`completion_webhook_error: ${err}`);
      }
    }

    return new Response(JSON.stringify({
      success: true,
      errors: errors.length > 0 ? errors : undefined,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown_error';
    return new Response(JSON.stringify({ success: false, error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
