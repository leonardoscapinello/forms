import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SHEETS_API = "https://sheets.googleapis.com/v4/spreadsheets";
const DRIVE_API = "https://www.googleapis.com/drive/v3/files";

/** Refresh the access token using the stored refresh token */
async function refreshAccessToken(
  supabase: any,
  settingsId: string,
  cfg: any
): Promise<string> {
  if (!cfg.refreshToken) throw new Error("No refresh token available");

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      refresh_token: cfg.refreshToken,
      grant_type: "refresh_token",
    }),
  });

  const data = await res.json();
  if (!res.ok || !data.access_token) {
    throw new Error(`Token refresh failed: ${JSON.stringify(data)}`);
  }

  // Update stored token
  const updatedConfig = {
    ...cfg,
    accessToken: data.access_token,
    tokenExpiry: new Date(
      Date.now() + (data.expires_in || 3600) * 1000
    ).toISOString(),
  };

  await supabase
    .from("integration_settings")
    .update({ config: updatedConfig })
    .eq("id", settingsId);

  return data.access_token;
}

/** Get a valid access token, refreshing if needed */
async function getAccessToken(supabase: any): Promise<string> {
  const { data: settings } = await supabase
    .from("integration_settings")
    .select("id, config")
    .eq("integration_type", "google_oauth")
    .eq("is_active", true)
    .maybeSingle();

  if (!settings) throw new Error("Google OAuth não configurado");

  const cfg = settings.config as any;
  if (!cfg.accessToken) throw new Error("Google OAuth não autenticado");

  // Check if token is expired
  if (cfg.tokenExpiry && new Date(cfg.tokenExpiry) < new Date()) {
    return refreshAccessToken(supabase, settings.id, cfg);
  }

  return cfg.accessToken;
}

/** Extract input fields from form data — mirrors FormResponses logic */
function extractFieldHeaders(formData: any): string[] {
  const headers: string[] = [];
  for (const page of formData.pages || []) {
    for (const el of page.elements || []) {
      if (el.type?.startsWith("input_")) {
        headers.push(
          el.label ||
            el.placeholder ||
            el.type.replace("input_", "").replace(/_/g, " ")
        );
      }
    }
  }
  return headers;
}

/** Resolve cell value from answers */
function resolveCellValue(answers: any, fieldId: string): string {
  const val = answers?.[fieldId];
  if (val === undefined || val === null || val === "") return "";
  if (typeof val === "boolean") return val ? "Sim" : "Não";
  if (Array.isArray(val)) return val.join(", ");
  if (typeof val === "object") {
    if (val.full_number) return val.full_number;
    const parts = Object.values(val).filter(
      (v) => v && typeof v === "string"
    );
    return parts.length > 0 ? parts.join(", ") : JSON.stringify(val);
  }
  return String(val);
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return (
    d.toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "2-digit",
    }) +
    " " +
    d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
  );
}

function formatDuration(ms: number | null): string {
  if (!ms) return "";
  const secs = Math.round(ms / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  return `${mins}m ${secs % 60}s`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const body = await req.json();
    const { action, formId, formTitle, headers, spreadsheetId } = body;

    const accessToken = await getAccessToken(supabase);

    if (action === "create") {
      // Create a new spreadsheet
      const createRes = await fetch(SHEETS_API, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          properties: {
            title: `Respostas — ${formTitle || "Formulário"}`,
          },
          sheets: [
            {
              properties: { title: "Respostas", index: 0 },
            },
          ],
        }),
      });

      const sheet = await createRes.json();
      if (!createRes.ok) {
        throw new Error(
          `Sheets API error [${createRes.status}]: ${JSON.stringify(sheet)}`
        );
      }

      const spreadsheetId = sheet.spreadsheetId;
      const spreadsheetUrl = sheet.spreadsheetUrl;

      // Write header row
      if (headers && headers.length > 0) {
        await fetch(
          `${SHEETS_API}/${spreadsheetId}/values/Respostas!A1:append?valueInputOption=RAW`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              values: [headers],
            }),
          }
        );
      }

      return new Response(
        JSON.stringify({ spreadsheetId, spreadsheetUrl }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (action === "sync") {
      if (!spreadsheetId || !formId)
        throw new Error("spreadsheetId and formId required");

      // Fetch form data to get field structure
      const { data: formRow } = await supabase
        .from("forms")
        .select("data")
        .eq("id", formId)
        .single();

      const formData = formRow?.data as any;
      const inputElements: { id: string; label: string }[] = [];
      for (const page of formData?.pages || []) {
        for (const el of page.elements || []) {
          if (el.type?.startsWith("input_")) {
            inputElements.push({
              id: el.id,
              label:
                el.label ||
                el.placeholder ||
                el.type.replace("input_", "").replace(/_/g, " "),
            });
          }
        }
      }

      // Extract variables
      const formVariables: { name: string }[] = (formData?.variables || []).map((v: any) => ({ name: v.name }));

      // Extract tracked params (default UTMs if not configured)
      const defaultParams = [
        { key: 'utm_source', label: 'UTM Source', enabled: true },
        { key: 'utm_medium', label: 'UTM Medium', enabled: true },
        { key: 'utm_campaign', label: 'UTM Campaign', enabled: true },
        { key: 'utm_content', label: 'UTM Content', enabled: true },
        { key: 'utm_term', label: 'UTM Term', enabled: true },
      ];
      const trackedParams: { key: string; label: string }[] = (formData?.trackedParams || defaultParams)
        .filter((p: any) => p.enabled && p.key)
        .map((p: any) => ({ key: p.key, label: p.label || p.key }));

      // Fetch responses
      const { data: responses } = await supabase
        .from("form_responses")
        .select(
          "id, response_id, answers, metadata, total_time_ms, pages_visited, created_at"
        )
        .eq("form_id", formId)
        .order("created_at", { ascending: true })
        .limit(1000);

      if (!responses || responses.length === 0) {
        return new Response(
          JSON.stringify({ success: true, rowsWritten: 0 }),
          {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      // Clear existing data (keep header)
      await fetch(
        `${SHEETS_API}/${spreadsheetId}/values/Respostas!A2:ZZ?`,
        {
          method: "DELETE",
          headers: { Authorization: `Bearer ${accessToken}` },
        }
      );

      // Build header row
      const headerRow = [
        "#",
        "ID",
        "Status",
        "Entrada",
        "Envio",
        "Duração",
        ...inputElements.map((f) => f.label),
        ...formVariables.map((v) => `⚡ ${v.name}`),
        ...trackedParams.map((p) => `🔗 ${p.label}`),
      ];

      // Build data rows
      const dataRows = responses.map((row: any, idx: number) => {
        const isComplete =
          row.metadata?.status === "complete" ||
          !!row.metadata?.submitted_at;
        const responseHash = row.metadata?.response_hash || (row.response_id || '').slice(0, 8).toUpperCase();
        return [
          idx + 1,
          responseHash,
          isComplete ? "Completa" : "Parcial",
          formatDate(row.metadata?.landed_at || row.created_at),
          row.metadata?.submitted_at
            ? formatDate(row.metadata.submitted_at)
            : "",
          formatDuration(row.total_time_ms),
          ...inputElements.map((f) =>
            resolveCellValue(row.answers, f.id)
          ),
          ...formVariables.map((v) => {
            const val = row.answers?.[`__var_${v.name}`];
            return val !== undefined && val !== null ? String(val) : '';
          }),
          ...trackedParams.map((p) => {
            const val = row.answers?.[`__param_${p.key}`];
            return val !== undefined && val !== null ? String(val) : '';
          }),
        ];
      });

      // Write all rows (header + data)
      const allRows = [headerRow, ...dataRows];

      await fetch(
        `${SHEETS_API}/${spreadsheetId}/values/Respostas!A1?valueInputOption=RAW`,
        {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            values: allRows,
          }),
        }
      );

      return new Response(
        JSON.stringify({ success: true, rowsWritten: dataRows.length }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    return new Response(
      JSON.stringify({ error: `Unknown action: ${action}` }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err: any) {
    console.error("google-sheets-sync error:", err);
    return new Response(
      JSON.stringify({ error: err.message || "Erro interno" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
