const UPSTREAM_PATH = "/portal/api/project-hearing-sheet";
const UPSTREAM_TIMEOUT_MS = 30_000;

function trimTrailingSlashes(value: string): string {
  return value.replace(/\/+$/, "");
}

export type PortalHearingSheetData = {
  project_id: number;
  status: "draft" | "finalized" | "archived";
  body_json: unknown;
};

export type PortalHearingSheetFetchResult =
  | { ok: true; status: number; text: string; contentType: string }
  | { ok: false; reason: "missing_config" }
  | { ok: false; reason: "upstream_unreachable" };

export async function fetchPortalHearingSheetRaw(
  cookieHeader: string | null,
  projectId: number,
): Promise<PortalHearingSheetFetchResult> {
  const rawBase = process.env.PORTAL_API_BASE_URL;
  if (!rawBase || rawBase.trim() === "") {
    return { ok: false, reason: "missing_config" };
  }

  const base = trimTrailingSlashes(rawBase.trim());
  const url = `${base}${UPSTREAM_PATH}?project_id=${encodeURIComponent(String(projectId))}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);

  try {
    const upstream = await fetch(url, {
      method: "GET",
      cache: "no-store",
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        ...(cookieHeader ? { Cookie: cookieHeader } : {}),
      },
    });
    const contentType = upstream.headers.get("content-type") ?? "application/json; charset=utf-8";
    const text = await upstream.text();
    return { ok: true, status: upstream.status, text, contentType };
  } catch {
    return { ok: false, reason: "upstream_unreachable" };
  } finally {
    clearTimeout(timeout);
  }
}

export function parsePortalHearingSheetSuccess(text: string): PortalHearingSheetData | null {
  try {
    const data = JSON.parse(text) as {
      success?: boolean;
      hearing_sheet?: { project_id?: unknown; status?: unknown; body_json?: unknown };
    };
    if (!data.success || !data.hearing_sheet || typeof data.hearing_sheet !== "object") {
      return null;
    }
    const h = data.hearing_sheet;
    const pid = typeof h.project_id === "number" ? h.project_id : Number(h.project_id);
    if (!Number.isFinite(pid) || pid <= 0) {
      return null;
    }
    const st = h.status;
    const status =
      st === "draft" || st === "finalized" || st === "archived" ? st : "draft";
    return {
      project_id: pid,
      status,
      body_json: h.body_json,
    };
  } catch {
    return null;
  }
}
