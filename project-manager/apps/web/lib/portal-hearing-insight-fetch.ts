const UPSTREAM_TIMEOUT_MS = 60_000;

function withTimeoutSignal(ms: number): AbortSignal {
  const ac = new AbortController();
  setTimeout(() => ac.abort(), ms);
  return ac.signal;
}

function trimTrailingSlashes(value: string): string {
  return value.replace(/\/+$/, "");
}

function requireCronSecretHeaders(): HeadersInit {
  const s = process.env.HEARING_INSIGHT_CRON_SECRET?.trim();
  if (!s) {
    throw new Error("HEARING_INSIGHT_CRON_SECRET が未設定です。");
  }
  return {
    Accept: "application/json",
    "X-Cron-Secret": s,
  };
}

export async function portalFetchHearingInsightBatchState(): Promise<{ last_run_at: string | null }> {
  const rawBase = process.env.PORTAL_API_BASE_URL;
  if (!rawBase || rawBase.trim() === "") {
    throw new Error("PORTAL_API_BASE_URL が未設定です。");
  }
  const base = trimTrailingSlashes(rawBase.trim());
  const url = `${base}/portal/api/hearing-insight-batch-state`;
  const res = await fetch(url, {
    method: "GET",
    cache: "no-store",
    signal: withTimeoutSignal(UPSTREAM_TIMEOUT_MS),
    headers: requireCronSecretHeaders(),
  });
  const text = await res.text();
  const j = JSON.parse(text) as { success?: boolean; last_run_at?: string | null };
  if (!res.ok || !j.success) {
    throw new Error(`batch-state: HTTP ${res.status}`);
  }
  return { last_run_at: j.last_run_at ?? null };
}

export async function portalPatchHearingInsightBatchState(lastRunAt: string): Promise<void> {
  const rawBase = process.env.PORTAL_API_BASE_URL;
  if (!rawBase || rawBase.trim() === "") {
    throw new Error("PORTAL_API_BASE_URL が未設定です。");
  }
  const base = trimTrailingSlashes(rawBase.trim());
  const url = `${base}/portal/api/hearing-insight-batch-state`;
  const res = await fetch(url, {
    method: "PATCH",
    cache: "no-store",
    signal: withTimeoutSignal(UPSTREAM_TIMEOUT_MS),
    headers: {
      ...requireCronSecretHeaders(),
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify({ last_run_at: lastRunAt }),
  });
  const text = await res.text();
  const j = JSON.parse(text) as { success?: boolean };
  if (!res.ok || !j.success) {
    throw new Error(`patch batch-state: HTTP ${res.status} ${text}`);
  }
}

export type HearingInsightExportRow = {
  project_id: number;
  item_id: string;
  resolved_template_id: string;
  category: string;
  heading: string;
  question: string;
  excluded_reason: string | null;
  ingested_at?: string;
  sheet_updated_at?: string;
};

export async function portalFetchHearingInsightExport(
  templateId: string,
  since: string,
): Promise<HearingInsightExportRow[]> {
  const rawBase = process.env.PORTAL_API_BASE_URL;
  if (!rawBase || rawBase.trim() === "") {
    throw new Error("PORTAL_API_BASE_URL が未設定です。");
  }
  const base = trimTrailingSlashes(rawBase.trim());
  const sp = new URLSearchParams({ template_id: templateId, since });
  const url = `${base}/portal/api/hearing-insight-export?${sp.toString()}`;
  const res = await fetch(url, {
    method: "GET",
    cache: "no-store",
    signal: withTimeoutSignal(UPSTREAM_TIMEOUT_MS),
    headers: requireCronSecretHeaders(),
  });
  const text = await res.text();
  const j = JSON.parse(text) as { success?: boolean; rows?: HearingInsightExportRow[] };
  if (!res.ok || !j.success || !Array.isArray(j.rows)) {
    throw new Error(`hearing-insight-export: HTTP ${res.status}`);
  }
  return j.rows;
}

export async function portalFetchHearingTemplateDefinitionCron(templateId: string): Promise<{
  version: number;
  body_json: Record<string, unknown>;
}> {
  const rawBase = process.env.PORTAL_API_BASE_URL;
  if (!rawBase || rawBase.trim() === "") {
    throw new Error("PORTAL_API_BASE_URL が未設定です。");
  }
  const base = trimTrailingSlashes(rawBase.trim());
  const url = `${base}/portal/api/hearing-template-definition?${new URLSearchParams({ template_id: templateId })}`;
  const res = await fetch(url, {
    method: "GET",
    cache: "no-store",
    signal: withTimeoutSignal(UPSTREAM_TIMEOUT_MS),
    headers: requireCronSecretHeaders(),
  });
  const text = await res.text();
  const j = JSON.parse(text) as {
    success?: boolean;
    version?: number;
    body_json?: Record<string, unknown>;
  };
  if (!res.ok || !j.success || typeof j.body_json !== "object" || j.body_json === null) {
    throw new Error(`hearing-template-definition: HTTP ${res.status}`);
  }
  return { version: typeof j.version === "number" ? j.version : 1, body_json: j.body_json };
}

export async function portalPatchHearingTemplateDefinition(payload: {
  template_id: string;
  expected_version: number;
  body_json: Record<string, unknown>;
}): Promise<void> {
  const rawBase = process.env.PORTAL_API_BASE_URL;
  if (!rawBase || rawBase.trim() === "") {
    throw new Error("PORTAL_API_BASE_URL が未設定です。");
  }
  const base = trimTrailingSlashes(rawBase.trim());
  const url = `${base}/portal/api/patch-hearing-template-definition`;
  const res = await fetch(url, {
    method: "PATCH",
    cache: "no-store",
    signal: withTimeoutSignal(UPSTREAM_TIMEOUT_MS),
    headers: {
      ...requireCronSecretHeaders(),
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify({
      template_id: payload.template_id,
      expected_version: payload.expected_version,
      body_json: payload.body_json,
    }),
  });
  const text = await res.text();
  const j = JSON.parse(text) as { success?: boolean };
  if (!res.ok || !j.success) {
    throw new Error(`patch-hearing-template-definition: HTTP ${res.status} ${text}`);
  }
}
