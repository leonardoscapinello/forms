import { getAuthorizedCaller } from '../_shared/auth.ts';
import {
  decryptStoredResponseRows,
  prepareLegacyResponseEncryption,
} from '../_shared/formResponseCrypto.ts';
import { readLimitedJsonObject } from '../_shared/limitedJsonBody.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'method_not_allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json', Allow: 'POST, OPTIONS' },
    });
  }

  try {
    const caller = await getAuthorizedCaller(req);
    if (!caller.ok) return caller.response;
    const encryptionSecret = Deno.env.get('ENCRYPTION_SECRET') ?? '';
    if (!encryptionSecret) {
      return new Response(JSON.stringify({ error: 'Response decryption unavailable' }), {
        status: 503,
        headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Retry-After': '10' },
      });
    }

    const parsedBody = await readLimitedJsonObject(req, 16 * 1024, corsHeaders);
    if (!parsedBody.ok) return parsedBody.response;
    const body = parsedBody.value;
    const action = typeof body.action === 'string' ? body.action : 'read';
    const { form_id, form_ids, limit = 500, since, fields } = body;

    if (action === 'backfill-encryption') {
      if (!caller.isAdmin) {
        return new Response(JSON.stringify({ error: 'Forbidden' }), {
          status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const requestedLimit = Number(limit);
      const batchSize = Number.isInteger(requestedLimit)
        ? Math.max(1, Math.min(requestedLimit, 50))
        : 25;
      const cursor = typeof body.cursor === 'string' ? body.cursor : '';
      const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      if (cursor && !uuidPattern.test(cursor)) {
        return new Response(JSON.stringify({ error: 'Invalid cursor' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      let migrationQuery = caller.admin
        .from('form_responses')
        .select('id, answers, metadata')
        .order('id', { ascending: true })
        .limit(batchSize + 1);
      if (cursor) migrationQuery = migrationQuery.gt('id', cursor);
      const { data: migrationRows, error: migrationReadError } = await migrationQuery;
      if (migrationReadError) {
        return new Response(JSON.stringify({ error: 'Response encryption backfill failed' }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const selectedRows = ((migrationRows ?? []) as Record<string, unknown>[]).slice(0, batchSize);
      let migrated = 0;
      try {
        for (const row of selectedRows) {
          const prepared = await prepareLegacyResponseEncryption(row, encryptionSecret);
          if (!prepared.needsMigration) continue;
          const { data: acknowledged, error: migrationWriteError } = await caller.admin.rpc(
            'migrate_form_response_encryption',
            {
              p_id: row.id,
              p_expected_answers: row.answers,
              p_expected_metadata: row.metadata ?? null,
              p_encrypted_answers: prepared.encryptedAnswers,
              p_encrypted_metadata: prepared.encryptedMetadata ?? null,
            },
          );
          if (migrationWriteError || acknowledged !== true) {
            throw new Error('response_encryption_backfill_ack_failed');
          }
          migrated += 1;
        }
      } catch (error) {
        console.error(
          'response_encryption_backfill_error',
          error instanceof Error ? error.message : 'unknown_backfill_error',
        );
        return new Response(JSON.stringify({ error: 'Response encryption backfill failed' }), {
          status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const hasMore = (migrationRows?.length ?? 0) > batchSize;
      return new Response(JSON.stringify({
        success: true,
        scanned: selectedRows.length,
        migrated,
        nextCursor: hasMore && selectedRows.length
          ? selectedRows[selectedRows.length - 1].id
          : null,
        hasMore,
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action !== 'read') {
      return new Response(JSON.stringify({ error: 'Invalid action' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!form_id && (!Array.isArray(form_ids) || form_ids.length === 0)) {
      return new Response(JSON.stringify({ error: 'form_id or form_ids is required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const candidateFormIds: unknown[] = typeof form_id === 'string'
      ? [form_id]
      : (Array.isArray(form_ids) ? form_ids : []);
    const requestedFormIds: string[] = [...new Set(
      candidateFormIds
        .filter((id: unknown): id is string => typeof id === 'string'),
    )];
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (requestedFormIds.length === 0
      || requestedFormIds.length > 100
      || requestedFormIds.some((id) => !uuidPattern.test(id))) {
      return new Response(JSON.stringify({ error: 'Invalid form IDs' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const admin = caller.admin;
    if (!caller.isAdmin) {
      const { data: ownedForms } = await admin
        .from('forms')
        .select('id')
        .eq('user_id', caller.userId)
        .in('id', requestedFormIds);

      if ((ownedForms?.length ?? 0) !== requestedFormIds.length) {
        return new Response(JSON.stringify({ error: 'Forbidden' }), {
          status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    const allowedFields = new Set([
      'id', 'form_id', 'response_id', 'answers', 'metadata',
      'total_time_ms', 'pages_visited', 'created_at',
    ]);
    const requestedFields = typeof fields === 'string'
      ? fields.split(',').map((field: string) => field.trim()).filter(Boolean)
      : [];
    const selectFields = requestedFields.length > 0 && requestedFields.every((field: string) => allowedFields.has(field))
      ? requestedFields.join(',')
      : 'id, response_id, answers, metadata, total_time_ms, pages_visited, created_at';
    let query = admin
      .from('form_responses')
      .select(selectFields);

    query = requestedFormIds.length === 1
      ? query.eq('form_id', requestedFormIds[0])
      : query.in('form_id', requestedFormIds);

    if (since) {
      query = query.gte('created_at', since);
    }

    const { data: rows, error } = await query
      .order('created_at', { ascending: false })
      .limit(Math.max(1, Math.min(Number(limit) || 500, 1000)));

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let safeRows: Record<string, unknown>[];
    try {
      safeRows = await decryptStoredResponseRows(
        (rows ?? []) as Record<string, unknown>[],
        encryptionSecret,
      );
    } catch (error) {
      console.error(
        'form-responses-read rejected unreadable encrypted data',
        error instanceof Error ? error.message : 'unknown_decryption_error',
      );
      return new Response(JSON.stringify({ error: 'Response decryption unavailable' }), {
        status: 503,
        headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Retry-After': '10' },
      });
    }

    return new Response(JSON.stringify({ data: safeRows }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown_error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
