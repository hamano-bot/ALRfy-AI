const UPSTREAM_PATH = "/portal/api/project";
const UPSTREAM_TIMEOUT_MS = 30_000;

function trimTrailingSlashes(value: string): string {
  return value.replace(/\/+$/, "");
}

export type PortalProjectParticipant = {
  user_id: number;
  role: string;
  display_name: string | null;
};

const LOOKS_LIKE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** 閲覧 UI 用: 名前のみ（メールは表示しない）。未設定は「ユーザー #id」。 */
export function getParticipantViewLine(p: PortalProjectParticipant): {
  primary: string;
  /** 名前表示時のみ右に #{id} を付ける（フォールバック時は primary に含むので false） */
  showUserIdSuffix: boolean;
} {
  const raw = p.display_name?.trim() ?? "";
  if (raw !== "" && !LOOKS_LIKE_EMAIL.test(raw)) {
    return { primary: raw, showUserIdSuffix: true };
  }
  return { primary: `ユーザー #${p.user_id}`, showUserIdSuffix: false };
}

export type PortalProjectDetail = {
  id: number;
  name: string;
  slug: string | null;
  client_name: string | null;
  site_type: string | null;
  site_type_other: string | null;
  project_category: "new" | "renewal" | "improvement";
  is_renewal: boolean;
  kickoff_date: string | null;
  release_due_date: string | null;
  is_released: boolean;
  renewal_urls: string[];
  redmine_links: {
    redmine_project_id: number;
    redmine_base_url: string | null;
    redmine_project_name: string | null;
  }[];
  misc_links: { label: string; url: string }[];
  participants: PortalProjectParticipant[];
};

export type PortalProjectFetchResult =
  | { ok: true; status: number; text: string; contentType: string }
  | { ok: false; reason: "missing_config" }
  | { ok: false; reason: "upstream_unreachable" };

export async function fetchPortalProjectRaw(
  cookieHeader: string | null,
  projectId: number,
): Promise<PortalProjectFetchResult> {
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

export function parsePortalProjectSuccess(text: string): PortalProjectDetail | null {
  try {
    const data = JSON.parse(text) as { success?: boolean; project?: unknown };
    if (!data.success || !data.project || typeof data.project !== "object") {
      return null;
    }
    const p = data.project as Record<string, unknown>;
    const id = typeof p.id === "number" ? p.id : Number(p.id);
    if (!Number.isFinite(id) || id <= 0) {
      return null;
    }
    const name = typeof p.name === "string" ? p.name : "";
    let slug: string | null = null;
    if (typeof p.slug === "string" && p.slug !== "") {
      slug = p.slug;
    }
    const clientName =
      typeof p.client_name === "string" && p.client_name.trim() !== "" ? p.client_name.trim() : null;
    const siteType =
      typeof p.site_type === "string" && p.site_type.trim() !== "" ? p.site_type.trim() : null;
    const siteTypeOther =
      typeof p.site_type_other === "string" && p.site_type_other.trim() !== ""
        ? p.site_type_other.trim()
        : null;
    const isRenewal = p.is_renewal === true;
    let projectCategory: PortalProjectDetail["project_category"] = isRenewal ? "renewal" : "new";
    if (p.project_category === "new" || p.project_category === "renewal" || p.project_category === "improvement") {
      projectCategory = p.project_category;
    }
    const kickoff =
      typeof p.kickoff_date === "string" && p.kickoff_date !== "" ? p.kickoff_date : null;
    const releaseDue =
      typeof p.release_due_date === "string" && p.release_due_date !== "" ? p.release_due_date : null;
    const isReleased = p.is_released === true || p.is_released === 1;

    const renewalUrls: string[] = [];
    if (Array.isArray(p.renewal_urls)) {
      for (const u of p.renewal_urls) {
        if (typeof u === "string" && u.trim() !== "") {
          renewalUrls.push(u.trim());
        }
      }
    }

    const redmine_links: PortalProjectDetail["redmine_links"] = [];
    if (Array.isArray(p.redmine_links)) {
      for (const row of p.redmine_links) {
        if (!row || typeof row !== "object") {
          continue;
        }
        const o = row as Record<string, unknown>;
        const rid = typeof o.redmine_project_id === "number" ? o.redmine_project_id : Number(o.redmine_project_id);
        if (!Number.isFinite(rid) || rid <= 0) {
          continue;
        }
        let bu: string | null = null;
        if (o.redmine_base_url !== null && o.redmine_base_url !== undefined) {
          if (typeof o.redmine_base_url === "string" && o.redmine_base_url.trim() !== "") {
            bu = o.redmine_base_url.trim();
          }
        }
        let rpn: string | null = null;
        if (o.redmine_project_name !== null && o.redmine_project_name !== undefined) {
          if (typeof o.redmine_project_name === "string" && o.redmine_project_name.trim() !== "") {
            rpn = o.redmine_project_name.trim();
          }
        }
        redmine_links.push({ redmine_project_id: rid, redmine_base_url: bu, redmine_project_name: rpn });
      }
    }

    const misc_links: PortalProjectDetail["misc_links"] = [];
    if (Array.isArray(p.misc_links)) {
      for (const row of p.misc_links) {
        if (!row || typeof row !== "object") {
          continue;
        }
        const o = row as Record<string, unknown>;
        const label = typeof o.label === "string" ? o.label.trim() : "";
        const url = typeof o.url === "string" ? o.url.trim() : "";
        if (label === "" || url === "") {
          continue;
        }
        misc_links.push({ label, url });
      }
    }

    const participants: PortalProjectParticipant[] = [];
    if (Array.isArray(p.participants)) {
      for (const row of p.participants) {
        if (!row || typeof row !== "object") {
          continue;
        }
        const o = row as Record<string, unknown>;
        const uid = typeof o.user_id === "number" ? o.user_id : Number(o.user_id);
        if (!Number.isFinite(uid) || uid <= 0) {
          continue;
        }
        const role = typeof o.role === "string" ? o.role : "viewer";
        let displayName: string | null = null;
        if (typeof o.display_name === "string" && o.display_name.trim() !== "") {
          displayName = o.display_name.trim();
        }
        participants.push({ user_id: uid, role, display_name: displayName });
      }
    }

    return {
      id,
      name,
      slug,
      client_name: clientName,
      site_type: siteType,
      site_type_other: siteTypeOther,
      project_category: projectCategory,
      is_renewal: isRenewal,
      kickoff_date: kickoff,
      release_due_date: releaseDue,
      is_released: isReleased,
      renewal_urls: renewalUrls,
      redmine_links,
      misc_links,
      participants,
    };
  } catch {
    return null;
  }
}

export function parsePortalJsonMessage(text: string): string | null {
  try {
    const data = JSON.parse(text) as { message?: string };
    if (typeof data.message === "string" && data.message !== "") {
      return data.message;
    }
    return null;
  } catch {
    return null;
  }
}
