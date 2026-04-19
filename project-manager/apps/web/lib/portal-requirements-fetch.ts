const UPSTREAM_PATH = "/portal/api/project-requirements";
const UPSTREAM_TIMEOUT_MS = 30_000;

function trimTrailingSlashes(value: string): string {
  return value.replace(/\/+$/, "");
}

export type PortalRequirementsData = {
  project_id: number;
  body_json: unknown;
};

export type PortalRequirementsFetchResult =
  | { ok: true; status: number; text: string; contentType: string }
  | { ok: false; reason: "missing_config" }
  | { ok: false; reason: "upstream_unreachable" };

export async function fetchPortalRequirementsRaw(
  cookieHeader: string | null,
  projectId: number,
): Promise<PortalRequirementsFetchResult> {
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

export function parsePortalRequirementsSuccess(text: string): PortalRequirementsData | null {
  try {
    const data = JSON.parse(text) as {
      success?: boolean;
      requirements?: { project_id?: unknown; body_json?: unknown };
    };
    if (!data.success || !data.requirements || typeof data.requirements !== "object") {
      return null;
    }
    const h = data.requirements;
    const pid = typeof h.project_id === "number" ? h.project_id : Number(h.project_id);
    if (!Number.isFinite(pid) || pid <= 0) {
      return null;
    }
    return {
      project_id: pid,
      body_json: h.body_json,
    };
  } catch {
    return null;
  }
}
