import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const responseHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Content-Type': 'application/json',
};

type AuthorizedCaller = {
  ok: true;
  userId: string;
  isAdmin: boolean;
  admin: ReturnType<typeof createClient>;
};

type RejectedCaller = { ok: false; response: Response };
export type AuthorizationResult = AuthorizedCaller | RejectedCaller;

function reject(status: number, error: string): RejectedCaller {
  return {
    ok: false,
    response: new Response(JSON.stringify({ error }), {
      status,
      headers: responseHeaders,
    }),
  };
}

export async function getAuthorizedCaller(req: Request): Promise<AuthorizationResult> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return reject(401, 'Unauthorized');

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
    || Deno.env.get('SUPABASE_PUBLISHABLE_KEY')
    || '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (!supabaseUrl || !anonKey || !serviceKey) return reject(503, 'Authentication unavailable');

  const caller = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data, error } = await caller.auth.getClaims(authHeader.slice('Bearer '.length));
  const userId = typeof data?.claims?.sub === 'string' ? data.claims.sub : '';
  if (error || !userId) return reject(401, 'Unauthorized');

  const admin = createClient(supabaseUrl, serviceKey);
  const { data: role, error: roleError } = await admin
    .from('user_roles')
    .select('role')
    .eq('user_id', userId)
    .eq('role', 'admin')
    .maybeSingle();
  if (roleError) return reject(503, 'Authorization unavailable');

  return { ok: true, userId, isAdmin: !!role, admin };
}

export async function requireAdmin(req: Request): Promise<AuthorizationResult> {
  const caller = await getAuthorizedCaller(req);
  if (!caller.ok || caller.isAdmin) return caller;
  return reject(403, 'Forbidden');
}

export async function requireFormAccess(req: Request, formId: string): Promise<AuthorizationResult> {
  const caller = await getAuthorizedCaller(req);
  if (!caller.ok || caller.isAdmin) return caller;

  const { data: form, error } = await caller.admin
    .from('forms')
    .select('id')
    .eq('id', formId)
    .eq('user_id', caller.userId)
    .maybeSingle();
  if (error) return reject(503, 'Authorization unavailable');
  if (!form) return reject(403, 'Forbidden');
  return caller;
}
