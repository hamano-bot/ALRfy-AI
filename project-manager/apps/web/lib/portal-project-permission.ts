const UPSTREAM_PATH = "/portal/api/project-permission";
const UPSTREAM_TIMEOUT_MS = 10_000;

function trimTrailingSlashes(value: string): string {
  return value.replace(/\/+$/, "");
}

export type ProjectPermissionOk = {
  project_id: number;
  effective_role: string;
  source: string;
  candidates: {
    project_role: string | null;
    resource_role: string | null;
  };
};

export type ProjectPermissionFetchResult =
  | { ok: true; status: number; text: string; contentType: string }
  | { ok: false; reason: "missing_config" }
  | { ok: false; reason: "upstream_unreachable" };

export async function fetchPortalProjectPermissionRaw(
  cookieHeader: string | null,
  projectId: number,
): Promise<ProjectPermissionFetchResult> {
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

export function parseProjectPermissionSuccess(text: string): ProjectPermissionOk | null {
  try {
    const data = JSON.parse(text) as {
      success?: boolean;
      project_id?: number;
      effective_role?: string;
      source?: string;
      candidates?: { project_role?: unknown; resource_role?: unknown };
    };
    if (data.success !== true || typeof data.effective_role !== "string") {
      return null;
    }
    const pidRaw = typeof data.project_id === "number" ? data.project_id : Number(data.project_id);
    const projectId = Number.isFinite(pidRaw) && pidRaw > 0 ? pidRaw : 0;
    const c = data.candidates;
    let projectRole: string | null = null;
    let resourceRole: string | null = null;
    if (c && typeof c === "object") {
      if (typeof c.project_role === "string") {
        projectRole = c.project_role;
      } else if (c.project_role === null) {
        projectRole = null;
      }
      if (typeof c.resource_role === "string") {
        resourceRole = c.resource_role;
      } else if (c.resource_role === null) {
        resourceRole = null;
      }
    }
    return {
      project_id: projectId,
      effective_role: data.effective_role,
      source: typeof data.source === "string" ? data.source : "none",
      candidates: { project_role: projectRole, resource_role: resourceRole },
    };
  } catch {
    return null;
  }
}

export function sourceLabelJa(source: string): string {
  if (source === "resource_members") {
    return "リソース付与";
  }
  if (source === "project_members") {
    return "プロジェクト所属";
  }
  return "なし";
}
