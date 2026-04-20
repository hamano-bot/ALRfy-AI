"use client";

import { Button } from "@/app/components/ui/button";
import { Card, CardContent } from "@/app/components/ui/card";
import { Input, inputBaseClassName } from "@/app/components/ui/input";
import { formatDateDisplayYmd } from "@/lib/format-date-display";
import { buildRedmineProjectUrl } from "@/lib/redmine-url";
import type { PortalProjectDetail } from "@/lib/portal-project";
import { cn } from "@/lib/utils";
import { ArrowUpRight, RefreshCw, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

const FILTER_DEBOUNCE_MS = 120;

type SortKey = "id" | "status" | "priority" | "assigned_to" | "due_date" | "updated_on";

function defaultSortDirForColumn(key: SortKey): "asc" | "desc" {
  return key === "updated_on" || key === "due_date" ? "desc" : "asc";
}

function parseSortableTime(value: string | null): number | null {
  if (!value || value.trim() === "") {
    return null;
  }
  const t = new Date(value).getTime();
  return Number.isNaN(t) ? null : t;
}

function parseDueDay(value: string | null): number | null {
  if (!value || value.trim() === "") {
    return null;
  }
  const m = value.trim().match(/^(\d{4}-\d{2}-\d{2})/);
  if (m) {
    const t = new Date(m[1] + "T00:00:00").getTime();
    return Number.isNaN(t) ? null : t;
  }
  const t = new Date(value).getTime();
  return Number.isNaN(t) ? null : t;
}

function sortIssues(rows: RedmineIssueRow[], key: SortKey, dir: "asc" | "desc"): RedmineIssueRow[] {
  const copy = [...rows];
  const mult = dir === "asc" ? 1 : -1;

  const str = (a: string | null | undefined) => (a ?? "").trim();

  copy.sort((a, b) => {
    if (key === "due_date") {
      const da = parseDueDay(a.due_date);
      const db = parseDueDay(b.due_date);
      const ea = da === null;
      const eb = db === null;
      if (ea !== eb) {
        return ea ? 1 : -1;
      }
      if (ea && eb) {
        return 0;
      }
      return mult * ((da as number) - (db as number));
    }
    if (key === "updated_on") {
      const ta = parseSortableTime(a.updated_on);
      const tb = parseSortableTime(b.updated_on);
      const ea = ta === null;
      const eb = tb === null;
      if (ea !== eb) {
        return ea ? 1 : -1;
      }
      if (ea && eb) {
        return 0;
      }
      return mult * ((ta as number) - (tb as number));
    }

    let cmp = 0;
    switch (key) {
      case "id":
        cmp = a.id - b.id;
        break;
      case "status":
        cmp = str(a.status).localeCompare(str(b.status), "ja");
        break;
      case "priority":
        cmp = str(a.priority).localeCompare(str(b.priority), "ja");
        break;
      case "assigned_to":
        cmp = str(a.assigned_to).localeCompare(str(b.assigned_to), "ja");
        break;
      default:
        cmp = 0;
    }
    return mult * cmp;
  });

  return copy;
}

type RedmineIssueRow = {
  id: number;
  subject: string;
  status: string;
  priority: string | null;
  assigned_to: string | null;
  updated_on: string | null;
  due_date: string | null;
  issue_url: string | null;
};

type RedmineProjectIssuesBlock = {
  redmine_project_id: number;
  redmine_project_name: string | null;
  redmine_base_url: string | null;
  summary: {
    open_in_sample: number;
    overdue: number;
    due_within_7d: number;
    sample_size: number;
    total_count: number | null;
  };
  issues: RedmineIssueRow[];
  error: string | null;
};

type IssuesApiSuccess = {
  success: true;
  projects: RedmineProjectIssuesBlock[];
  meta?: { sample_limit?: number; table_limit?: number; note?: string | null };
};

function formatShortDate(value: string | null): string {
  return formatDateDisplayYmd(value);
}

function SortableTh({
  label,
  columnKey,
  activeKey,
  dir,
  onSort,
  className,
}: {
  label: string;
  columnKey: SortKey;
  activeKey: SortKey;
  dir: "asc" | "desc";
  onSort: (k: SortKey) => void;
  className?: string;
}) {
  const active = activeKey === columnKey;
  return (
    <th
      scope="col"
      aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : "none"}
      className={cn("px-3 py-2.5 font-medium text-[var(--muted)]", className)}
    >
      <button
        type="button"
        onClick={() => onSort(columnKey)}
        className="inline-flex w-full min-w-0 items-center justify-start gap-0.5 text-left hover:text-[var(--foreground)]"
      >
        <span className="min-w-0 truncate">{label}</span>
        <span className="inline-flex shrink-0 flex-col text-[0.6rem] leading-[0.55] text-[var(--muted)]" aria-hidden>
          <span className={cn(active && dir === "asc" ? "text-[var(--accent)]" : "opacity-30")}>▲</span>
          <span className={cn("-mt-0.5", active && dir === "desc" ? "text-[var(--accent)]" : "opacity-30")}>▼</span>
        </span>
      </button>
    </th>
  );
}

type ProjectRedmineTicketsCardProps = {
  projectId: number;
  redmineLinks: PortalProjectDetail["redmine_links"];
  projectName: string;
  canEdit: boolean;
};

export function ProjectRedmineTicketsCard({ projectId, redmineLinks, projectName, canEdit }: ProjectRedmineTicketsCardProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [payload, setPayload] = useState<IssuesApiSuccess | null>(null);
  const [filterQuery, setFilterQuery] = useState("");
  const [debouncedFilter, setDebouncedFilter] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({
    key: "updated_on",
    dir: "desc",
  });

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedFilter(filterQuery), FILTER_DEBOUNCE_MS);
    return () => window.clearTimeout(t);
  }, [filterQuery]);

  const load = useCallback(async () => {
    if (redmineLinks.length === 0) {
      setPayload(null);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const u = new URL("/api/portal/project-redmine-issues", window.location.origin);
      u.searchParams.set("project_id", String(projectId));
      const res = await fetch(u.toString(), { credentials: "include", cache: "no-store" });
      const text = await res.text();
      let data: unknown;
      try {
        data = JSON.parse(text) as unknown;
      } catch {
        setError("応答の解析に失敗しました。");
        setPayload(null);
        return;
      }
      const obj = data as Record<string, unknown>;
      if (!res.ok) {
        const code = obj.code;
        const msg =
          typeof obj.message === "string"
            ? obj.message
            : `取得に失敗しました（${res.status}）`;
        if (code === "redmine_not_configured") {
          setError("redmine_not_configured");
        } else {
          setError(msg);
        }
        setPayload(null);
        return;
      }
      if (!obj.success) {
        setError(typeof obj.message === "string" ? obj.message : "取得に失敗しました。");
        setPayload(null);
        return;
      }
      setPayload({
        success: true,
        projects: Array.isArray(obj.projects) ? (obj.projects as RedmineProjectIssuesBlock[]) : [],
        meta:
          obj.meta && typeof obj.meta === "object"
            ? (obj.meta as IssuesApiSuccess["meta"])
            : undefined,
      });
    } catch {
      setError("接続に失敗しました。");
      setPayload(null);
    } finally {
      setLoading(false);
    }
  }, [projectId, redmineLinks.length]);

  useEffect(() => {
    void load();
  }, [load]);

  const filteredProjects = useMemo(() => {
    if (!payload?.projects) {
      return [];
    }
    const q = debouncedFilter.trim().toLowerCase();
    if (q === "") {
      return payload.projects;
    }
    return payload.projects.map((block) => ({
      ...block,
      issues: block.issues.filter((row) => {
        const hay = `${row.subject} ${row.status} ${row.assigned_to ?? ""} ${row.id}`.toLowerCase();
        return hay.includes(q);
      }),
    }));
  }, [payload, debouncedFilter]);

  const sortedProjects = useMemo(() => {
    return filteredProjects.map((block) => ({
      ...block,
      issues: sortIssues(block.issues, sort.key, sort.dir),
    }));
  }, [filteredProjects, sort.key, sort.dir]);

  const toggleSort = useCallback((key: SortKey) => {
    setSort((prev) => {
      if (prev.key === key) {
        return { key, dir: prev.dir === "asc" ? "desc" : "asc" };
      }
      return { key, dir: defaultSortDirForColumn(key) };
    });
  }, []);

  const openRedmineSettings = () => {
    window.dispatchEvent(new Event("open-redmine-settings"));
  };

  if (redmineLinks.length === 0) {
    return (
      <Card className="overflow-hidden shadow-sm">
        <CardContent className="space-y-3 pt-6">
          <h2 className="pm-section-heading">チケット状況</h2>
          <p className="text-sm leading-relaxed text-[var(--muted)]">Redmine プロジェクトが紐づいていません。</p>
          {canEdit ? (
            <p className="text-xs text-[var(--muted)]">案件の編集から Redmine を追加すると、チケット一覧を表示できます。</p>
          ) : null}
        </CardContent>
      </Card>
    );
  }

  if (error === "redmine_not_configured") {
    return (
      <Card className="overflow-hidden shadow-sm">
        <CardContent className="space-y-3 pt-6">
          <h2 className="pm-section-heading">チケット状況</h2>
          <p className="text-sm leading-relaxed text-[var(--foreground)]">Redmine API キーが未設定のため、チケットを取得できません。</p>
          <Button type="button" variant="default" size="sm" onClick={openRedmineSettings}>
            Redmine 設定を開く
          </Button>
        </CardContent>
      </Card>
    );
  }

  const debouncedSearchActive = debouncedFilter.trim() !== "";

  return (
    <Card className="overflow-hidden shadow-sm [overflow-anchor:none]">
      <CardContent className="space-y-6 pt-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 space-y-1">
            <h2 className="pm-section-heading">チケット状況</h2>
            {payload?.meta?.note ? (
              <p className="text-xs leading-relaxed text-[var(--muted)]">{payload.meta.note}</p>
            ) : null}
          </div>
          <div className="flex w-full min-w-0 shrink-0 items-center gap-2 sm:w-auto sm:max-w-[min(100%,28rem)]">
            <label className="sr-only" htmlFor="pm-ticket-filter">
              チケットを絞り込み
            </label>
            <div className="relative min-w-0 flex-1">
              <Input
                id="pm-ticket-filter"
                type="text"
                placeholder="件名・状態・担当で検索"
                value={filterQuery}
                onChange={(e) => setFilterQuery(e.target.value)}
                autoComplete="off"
                spellCheck={false}
                className={cn(inputBaseClassName, "w-full pr-9")}
              />
              {filterQuery !== "" ? (
                <button
                  type="button"
                  className="absolute right-1.5 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-[var(--muted)] hover:bg-[color:color-mix(in_srgb,var(--surface)_88%,black_12%)] hover:text-[var(--foreground)]"
                  aria-label="検索をクリア"
                  onClick={() => setFilterQuery("")}
                >
                  <X className="h-4 w-4" aria-hidden />
                </button>
              ) : null}
            </div>
            <Button
              type="button"
              variant="default"
              size="sm"
              className="shrink-0 gap-1.5"
              disabled={loading}
              onClick={() => void load()}
            >
              <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} aria-hidden />
              更新
            </Button>
          </div>
        </div>

        {error ? <p className="text-sm text-red-600 dark:text-red-400">{error}</p> : null}

        {loading && !payload ? (
          <p className="text-sm text-[var(--muted)]">読み込み中…</p>
        ) : null}

        <div className="space-y-8 [overflow-anchor:none]">
          {sortedProjects.map((block) => {
            const listHref = buildRedmineProjectUrl(block.redmine_base_url, block.redmine_project_id);
            const title =
              block.redmine_project_name && block.redmine_project_name.trim() !== ""
                ? block.redmine_project_name.trim()
                : redmineLinks.length === 1 && projectName.trim() !== ""
                  ? projectName.trim()
                  : `Redmine #${block.redmine_project_id}`;

            const leadCount = debouncedSearchActive ? block.issues.length : block.summary.open_in_sample;

            return (
              <section key={block.redmine_project_id} className="space-y-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-[color:color-mix(in_srgb,var(--border)_85%,transparent)] pb-2">
                  <h3 className="text-sm font-semibold text-[var(--foreground)]">{title}</h3>
                  {listHref ? (
                    <a
                      href={listHref}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-xs font-medium text-[color:color-mix(in_srgb,var(--accent)_85%,var(--foreground)_15%)] hover:underline"
                    >
                      Redmine で一覧を開く
                      <ArrowUpRight className="h-3 w-3" aria-hidden />
                    </a>
                  ) : null}
                </div>

                {block.error ? (
                  <p className="text-sm text-red-600 dark:text-red-400">{block.error}</p>
                ) : (
                  <>
                    <div className="flex flex-wrap gap-2 text-xs">
                      <span className="rounded-full border border-[color:color-mix(in_srgb,var(--border)_88%,transparent)] bg-[color:color-mix(in_srgb,var(--surface)_97%,transparent)] px-2.5 py-1 font-medium text-[var(--foreground)]">
                        <span className="tabular-nums">{leadCount}</span>
                        {block.summary.total_count !== null ? (
                          <span className="ml-1 font-normal text-[var(--muted)]">/ 全 {block.summary.total_count} 件</span>
                        ) : null}
                      </span>
                      <span className="rounded-full border border-[color:color-mix(in_srgb,var(--border)_88%,transparent)] bg-[color:color-mix(in_srgb,var(--surface)_97%,transparent)] px-2.5 py-1 font-medium text-[var(--foreground)]">
                        期限超過 {block.summary.overdue}
                      </span>
                      <span className="rounded-full border border-[color:color-mix(in_srgb,var(--border)_88%,transparent)] bg-[color:color-mix(in_srgb,var(--surface)_97%,transparent)] px-2.5 py-1 font-medium text-[var(--foreground)]">
                        7日以内 {block.summary.due_within_7d}
                      </span>
                    </div>

                    {block.issues.length === 0 ? (
                      <p className="text-sm text-[var(--muted)]">
                        {debouncedSearchActive
                          ? "検索に一致するチケットはありません。"
                          : "該当するオープンチケットはありません。"}
                      </p>
                    ) : (
                      <div className="overflow-x-auto rounded-lg border border-[color:color-mix(in_srgb,var(--border)_88%,transparent)]">
                        <table className="w-full min-w-[640px] border-collapse text-left text-sm">
                          <thead>
                            <tr className="border-b border-[color:color-mix(in_srgb,var(--border)_88%,transparent)] bg-[color:color-mix(in_srgb,var(--surface)_98%,transparent)]">
                              <SortableTh
                                label="#"
                                columnKey="id"
                                activeKey={sort.key}
                                dir={sort.dir}
                                onSort={toggleSort}
                                className="whitespace-nowrap"
                              />
                              <th className="px-3 py-2.5 font-medium text-[var(--muted)]">件名</th>
                              <SortableTh
                                label="状態"
                                columnKey="status"
                                activeKey={sort.key}
                                dir={sort.dir}
                                onSort={toggleSort}
                              />
                              <SortableTh
                                label="優先度"
                                columnKey="priority"
                                activeKey={sort.key}
                                dir={sort.dir}
                                onSort={toggleSort}
                              />
                              <SortableTh
                                label="担当"
                                columnKey="assigned_to"
                                activeKey={sort.key}
                                dir={sort.dir}
                                onSort={toggleSort}
                              />
                              <SortableTh
                                label="期限"
                                columnKey="due_date"
                                activeKey={sort.key}
                                dir={sort.dir}
                                onSort={toggleSort}
                              />
                              <SortableTh
                                label="更新"
                                columnKey="updated_on"
                                activeKey={sort.key}
                                dir={sort.dir}
                                onSort={toggleSort}
                              />
                            </tr>
                          </thead>
                          <tbody>
                            {block.issues.map((row) => (
                              <tr
                                key={row.id}
                                className="border-b border-[color:color-mix(in_srgb,var(--border)_70%,transparent)] last:border-b-0"
                              >
                                <td className="whitespace-nowrap px-3 py-2 font-mono text-xs text-[var(--muted)]">{row.id}</td>
                                <td className="max-w-[min(24rem,40vw)] px-3 py-2">
                                  {row.issue_url ? (
                                    <a
                                      href={row.issue_url}
                                      target="_blank"
                                      rel="noreferrer"
                                      aria-label={
                                        row.subject.trim() !== ""
                                          ? row.subject
                                          : `チケット #${row.id}`
                                      }
                                      className="inline-block min-h-[1lh] font-medium text-[color:color-mix(in_srgb,var(--accent)_88%,var(--foreground)_12%)] hover:underline"
                                    >
                                      {row.subject.trim() !== "" ? row.subject : ""}
                                    </a>
                                  ) : (
                                    <span className="inline-block min-h-[1lh] text-[var(--foreground)]">
                                      {row.subject.trim() !== "" ? row.subject : ""}
                                    </span>
                                  )}
                                </td>
                                <td className="whitespace-nowrap px-3 py-2 text-[var(--foreground)]">
                                  {row.status.trim() !== "" ? row.status : ""}
                                </td>
                                <td className="whitespace-nowrap px-3 py-2 text-[var(--foreground)]">
                                  {row.priority != null && row.priority.trim() !== "" ? row.priority : ""}
                                </td>
                                <td className="max-w-[10rem] truncate px-3 py-2 text-[var(--foreground)]">
                                  {row.assigned_to != null && row.assigned_to.trim() !== "" ? row.assigned_to : ""}
                                </td>
                                <td className="whitespace-nowrap px-3 py-2 text-[var(--foreground)]">{formatShortDate(row.due_date)}</td>
                                <td className="whitespace-nowrap px-3 py-2 text-[var(--foreground)]">{formatShortDate(row.updated_on)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </>
                )}
              </section>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
