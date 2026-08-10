import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { verifySignedState } from './signedState.ts';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const headers = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };

type PublicFormContext = {
  ok: true;
  admin: ReturnType<typeof createClient>;
  formData: any;
};
type Rejected = { ok: false; response: Response };

function reject(status: number, error: string): Rejected {
  return { ok: false, response: new Response(JSON.stringify({ success: false, error }), { status, headers }) };
}

export function isServiceRequest(req: Request): boolean {
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  return !!serviceKey && req.headers.get('authorization') === `Bearer ${serviceKey}`;
}

export async function getPublicFormContext(
  req: Request,
  formId: unknown,
  submissionToken: unknown,
): Promise<PublicFormContext | Rejected> {
  if (typeof formId !== 'string' || !UUID_PATTERN.test(formId)) return reject(400, 'invalid_form_id');
  if (!isServiceRequest(req)) {
    const state = typeof submissionToken === 'string' ? await verifySignedState(submissionToken) : null;
    if (state?.kind !== 'form-submission' || state.formId !== formId) {
      return reject(401, 'invalid_or_expired_token');
    }
  }

  const admin = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  );
  const { data: row } = await admin.from('forms').select('status, data').eq('id', formId).maybeSingle();
  if (!row || (!isServiceRequest(req) && row.status !== 'published')) return reject(404, 'form_not_available');
  return { ok: true, admin, formData: row.data as any };
}

export function interpolateFormText(
  value: unknown,
  answers: Record<string, any>,
  variables: any[],
): string {
  return String(value || '')
    .replace(/\{\{field:([^}]+)\}\}/g, (_match, id) => String(answers[id] ?? ''))
    .replace(/\{\{([^}]+)\}\}/g, (_match, rawKey) => {
      const key = String(rawKey).trim();
      const variable = variables.find((item: any) => item.id === key || item.name === key);
      if (variable) return String(answers[`__var_${variable.name}`] ?? variable.defaultValue ?? '');
      return String(answers[key] ?? '');
    });
}

export function flattenFormElements(elements: any[] = []): any[] {
  return elements.flatMap((element: any) => [
    element,
    ...(element?.type === 'columns'
      ? (element.columnData || []).flatMap((column: any) => flattenFormElements(column?.elements || []))
      : []),
  ]);
}
