const UPSTREAM_PATH = "/portal/api/my-projects";
const UPSTREAM_TIMEOUT_MS = 10_000;

function trimTrailingSlashes(value: string): string {
  return value.replace(/\/+$/, "");
}

export type PortalMyProjectRow = {
  id: number;
  name: string;
  slug: string | null;
  role: string;
  client_name: string | null;
  site_type: string | null;
  site_type_other: string | null;
  is_renewal: boolean;
  kickoff_date: string | null;
  release_due_date: string | null;
};

/** 一覧表示用（`site_type` の DB 値 → 短い日本語ラベル） */
export const SITE_TYPE_LABEL_JA: Record<string, string> = {
  corporate: "コーポレート",
  ec: "EC",
  member_portal: "会員ポータル",
  internal_portal: "社内ポータル",
  owned_media: "オウンドメディア",
  product_portal: "製品ポータル",
  other: "その他",
};

export function formatSiteTypeLabel(siteType: string | null, siteTypeOther: string | null): string {
  if (!siteType) {
    return "—";
  }
  if (siteType === "other" && siteTypeOther && siteTypeOther.trim() !== "") {
    return `その他（${siteTypeOther.trim()}）`;
  }
  return SITE_TYPE_LABEL_JA[siteType] ?? siteType;
}

export type MyProjectsFetchResult =
  | { ok: true; status: number; text: string; contentType: string }
  | { ok: false; reason: "missing_config" }
  | { ok: false; reason: "upstream_unreachable" };

export async function fetchPortalMyProjectsRaw(cookieHeader: string | null): Promise<MyProjectsFetchResult> {
  const rawBase = process.env.PORTAL_API_BASE_URL;
  if (!rawBase || rawBase.trim() === "") {
    return { ok: false, reason: "missing_config" };
  }

  const base = trimTrailingSlashes(rawBase.trim());
  const url = `${base}${UPSTREAM_PATH}`;
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

export function parseMyProjectsSuccess(text: string): PortalMyProjectRow[] | null {
  try {
    const data = JSON.parse(text) as { success?: boolean; projects?: unknown };
    if (!data.success || !Array.isArray(data.projects)) {
      return null;
    }
    const out: PortalMyProjectRow[] = [];
    for (const p of data.projects) {
      if (!p || typeof p !== "object") {
        continue;
      }
      const o = p as Record<string, unknown>;
      const id = typeof o.id === "number" ? o.id : Number(o.id);
      if (!Number.isFinite(id) || id <= 0) {
        continue;
      }
      const name = typeof o.name === "string" ? o.name : "";
      const role = typeof o.role === "string" ? o.role : "viewer";
      let slug: string | null = null;
      if (typeof o.slug === "string" && o.slug !== "") {
        slug = o.slug;
      }
      const clientName =
        typeof o.client_name === "string" && o.client_name.trim() !== "" ? o.client_name.trim() : null;
      const siteType =
        typeof o.site_type === "string" && o.site_type.trim() !== "" ? o.site_type.trim() : null;
      const siteTypeOther =
        typeof o.site_type_other === "string" && o.site_type_other.trim() !== ""
          ? o.site_type_other.trim()
          : null;
      let isRenewal = false;
      if (typeof o.is_renewal === "boolean") {
        isRenewal = o.is_renewal;
      } else if (typeof o.is_renewal === "number") {
        isRenewal = o.is_renewal === 1;
      }
      const kickoffDate =
        typeof o.kickoff_date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(o.kickoff_date)
          ? o.kickoff_date
          : null;
      const releaseDueDate =
        typeof o.release_due_date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(o.release_due_date)
          ? o.release_due_date
          : null;
      out.push({
        id,
        name,
        slug,
        role,
        client_name: clientName,
        site_type: siteType,
        site_type_other: siteTypeOther,
        is_renewal: isRenewal,
        kickoff_date: kickoffDate,
        release_due_date: releaseDueDate,
      });
    }
    return out;
  } catch {
    return null;
  }
}

export function parsePortalJsonMessage(text: string): string | null {
  try {
    const data = JSON.parse(text) as { message?: unknown };
    return typeof data.message === "string" ? data.message : null;
  } catch {
    return null;
  }
}
