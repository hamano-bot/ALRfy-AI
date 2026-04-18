import type { PortalMyProjectRow } from "@/lib/portal-my-projects";
import { formatSiteTypeLabel } from "@/lib/portal-my-projects";

export type ProjectListSortColumn =
  | "id"
  | "name"
  | "client_name"
  | "site_type"
  | "is_renewal"
  | "kickoff_date"
  | "release_due_date"
  | "role";

export type ProjectListSortDir = "asc" | "desc";

export type ProjectListRoleFilter = "owner" | "editor" | "viewer";

/** 詳細検索「区分」: すべて / リニューアル案件のみ / 新規案件のみ */
export type ProjectListRenewalFilter = "all" | "renewal" | "new";

export type ProjectListAppliedFilters = {
  /** 数値の完全一致（空なら無視） */
  idQuery: string;
  nameQuery: string;
  clientQuery: string;
  /** 空 = すべて選択 */
  siteTypes: string[];
  /** リニューアル（区分）の絞り込み */
  renewalFilter: ProjectListRenewalFilter;
  kickoffFrom: string;
  kickoffTo: string;
  releaseFrom: string;
  releaseTo: string;
  /** 空 = すべて */
  roles: ProjectListRoleFilter[];
};

export const EMPTY_PROJECT_LIST_FILTERS: ProjectListAppliedFilters = {
  idQuery: "",
  nameQuery: "",
  clientQuery: "",
  siteTypes: [],
  renewalFilter: "all",
  kickoffFrom: "",
  kickoffTo: "",
  releaseFrom: "",
  releaseTo: "",
  roles: [],
};

/** 古い state 形状や API 欠損で落ちないよう正規化（`.includes` 前に必須） */
export function ensureProjectListFilters(f: Partial<ProjectListAppliedFilters> | null | undefined): ProjectListAppliedFilters {
  const base = EMPTY_PROJECT_LIST_FILTERS;
  if (!f || typeof f !== "object") {
    return { ...base };
  }
  const rolesRaw = Array.isArray(f.roles) ? f.roles : [];
  const roles: ProjectListRoleFilter[] = rolesRaw.filter(
    (r): r is ProjectListRoleFilter => r === "owner" || r === "editor" || r === "viewer",
  );
  const siteTypes = Array.isArray(f.siteTypes) ? f.siteTypes.filter((s): s is string => typeof s === "string") : [];
  const legacy = f as Partial<ProjectListAppliedFilters> & { renewalYesOnly?: boolean };
  let renewalFilter: ProjectListRenewalFilter = "all";
  if (legacy.renewalFilter === "all" || legacy.renewalFilter === "renewal" || legacy.renewalFilter === "new") {
    renewalFilter = legacy.renewalFilter;
  } else if (legacy.renewalYesOnly === true) {
    renewalFilter = "renewal";
  }
  return {
    idQuery: typeof f.idQuery === "string" ? f.idQuery : "",
    nameQuery: typeof f.nameQuery === "string" ? f.nameQuery : "",
    clientQuery: typeof f.clientQuery === "string" ? f.clientQuery : "",
    siteTypes,
    renewalFilter,
    kickoffFrom: typeof f.kickoffFrom === "string" ? f.kickoffFrom : "",
    kickoffTo: typeof f.kickoffTo === "string" ? f.kickoffTo : "",
    releaseFrom: typeof f.releaseFrom === "string" ? f.releaseFrom : "",
    releaseTo: typeof f.releaseTo === "string" ? f.releaseTo : "",
    roles,
  };
}

function safeText(value: unknown): string {
  if (value == null) {
    return "";
  }
  return typeof value === "string" ? value : String(value);
}

function rolePriority(role: string): number {
  const k = safeText(role).trim().toLowerCase();
  if (k === "owner") {
    return 3;
  }
  if (k === "editor") {
    return 2;
  }
  if (k === "viewer") {
    return 1;
  }
  return 0;
}

/** 詳細検索サジェスト用: オーナー行を先に、同一ならプロジェクト名順 */
export function ownersFirstProjects(rows: PortalMyProjectRow[]): PortalMyProjectRow[] {
  return [...rows].sort((a, b) => {
    const ao = safeText(a.role).trim().toLowerCase() === "owner" ? 0 : 1;
    const bo = safeText(b.role).trim().toLowerCase() === "owner" ? 0 : 1;
    if (ao !== bo) {
      return ao - bo;
    }
    return safeText(a.name).localeCompare(safeText(b.name), "ja");
  });
}

/** ID が完全一致で 1 件にマッチするときだけプロジェクト名・クライアント名を返す */
export function syncNameClientFromId(
  idStr: string,
  rows: PortalMyProjectRow[],
): { name: string; client: string } | null {
  const trimmed = idStr.trim();
  if (trimmed === "") {
    return null;
  }
  const n = Number(trimmed);
  if (!Number.isInteger(n) || n <= 0) {
    return null;
  }
  const row = rows.find((r) => r.id === n);
  if (!row) {
    return null;
  }
  return { name: safeText(row.name), client: safeText(row.client_name ?? "") };
}

/** クライアント名のユニーク一覧（オーナー案件があるクライアントを上位） */
export function uniqueClientsOwnerFirst(rows: PortalMyProjectRow[]): string[] {
  const scores = new Map<string, number>();
  for (const p of rows) {
    const c = safeText(p.client_name).trim();
    if (!c) {
      continue;
    }
    const prefer = safeText(p.role).trim().toLowerCase() === "owner" ? 0 : 1;
    const prev = scores.get(c);
    if (prev === undefined || prefer < prev) {
      scores.set(c, prefer);
    }
  }
  return [...scores.entries()]
    .sort((a, b) => {
      if (a[1] !== b[1]) {
        return a[1] - b[1];
      }
      return a[0].localeCompare(b[0], "ja");
    })
    .map(([c]) => c);
}

function dateInRange(value: string | null, from: string, to: string): boolean {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    if (from || to) {
      return false;
    }
    return true;
  }
  if (from && value < from) {
    return false;
  }
  if (to && value > to) {
    return false;
  }
  return true;
}

export function filterProjectRows(
  rows: PortalMyProjectRow[],
  filters: ProjectListAppliedFilters,
  ownerOnly: boolean,
): PortalMyProjectRow[] {
  const filtersSafe = ensureProjectListFilters(filters);
  const idTrim = filtersSafe.idQuery.trim();
  const nameQ = filtersSafe.nameQuery.trim().toLowerCase();
  const clientQ = filtersSafe.clientQuery.trim().toLowerCase();

  return rows.filter((p) => {
    const rowRole = safeText(p.role).trim().toLowerCase();
    if (ownerOnly && rowRole !== "owner") {
      return false;
    }

    if (filtersSafe.roles.length > 0) {
      const allowed = filtersSafe.roles.map((r) => r.toLowerCase());
      if (!allowed.includes(rowRole)) {
        return false;
      }
    }

    if (idTrim !== "") {
      const idNum = Number(idTrim);
      if (!Number.isInteger(idNum) || idNum <= 0 || p.id !== idNum) {
        return false;
      }
    }
    if (nameQ && !safeText(p.name).toLowerCase().includes(nameQ)) {
      return false;
    }
    if (clientQ && !(p.client_name ?? "").toLowerCase().includes(clientQ)) {
      return false;
    }

    if (filtersSafe.siteTypes.length > 0) {
      const st = p.site_type ?? "";
      if (!filtersSafe.siteTypes.includes(st)) {
        return false;
      }
    }

    if (filtersSafe.renewalFilter === "renewal" && !p.is_renewal) {
      return false;
    }
    if (filtersSafe.renewalFilter === "new" && p.is_renewal) {
      return false;
    }

    if (!dateInRange(p.kickoff_date, filtersSafe.kickoffFrom, filtersSafe.kickoffTo)) {
      return false;
    }
    if (!dateInRange(p.release_due_date, filtersSafe.releaseFrom, filtersSafe.releaseTo)) {
      return false;
    }

    return true;
  });
}

export function sortProjectRows(
  rows: PortalMyProjectRow[],
  column: ProjectListSortColumn | null,
  dir: ProjectListSortDir,
): PortalMyProjectRow[] {
  if (!column) {
    return rows;
  }
  const mul = dir === "asc" ? 1 : -1;
  const copy = [...rows];
  copy.sort((a, b) => {
    let cmp = 0;
    switch (column) {
      case "id":
        cmp = a.id - b.id;
        break;
      case "name":
        cmp = safeText(a.name).localeCompare(safeText(b.name), "ja");
        break;
      case "client_name":
        cmp = (a.client_name ?? "").localeCompare(b.client_name ?? "", "ja");
        break;
      case "site_type": {
        const la = formatSiteTypeLabel(a.site_type, a.site_type_other);
        const lb = formatSiteTypeLabel(b.site_type, b.site_type_other);
        cmp = la.localeCompare(lb, "ja");
        break;
      }
      case "is_renewal":
        cmp = (a.is_renewal ? 1 : 0) - (b.is_renewal ? 1 : 0);
        break;
      case "kickoff_date":
        cmp = (a.kickoff_date ?? "").localeCompare(b.kickoff_date ?? "");
        break;
      case "release_due_date":
        cmp = (a.release_due_date ?? "").localeCompare(b.release_due_date ?? "");
        break;
      case "role":
        cmp = rolePriority(safeText(a.role)) - rolePriority(safeText(b.role));
        break;
      default:
        cmp = 0;
    }
    if (cmp !== 0) {
      return cmp * mul;
    }
    return a.id - b.id;
  });
  return copy;
}
