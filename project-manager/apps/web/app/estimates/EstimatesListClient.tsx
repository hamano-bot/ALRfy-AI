"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Eye, Loader2, Search } from "lucide-react";
import { Button } from "@/app/components/ui/button";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/app/components/ui/hover-card";
import { Input } from "@/app/components/ui/input";
import { Label } from "@/app/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/app/components/ui/select";
import { Sheet, SheetClose, SheetContent, SheetHeader, SheetTitle } from "@/app/components/ui/sheet";
import { cn } from "@/lib/utils";

type EstimateListItem = {
  id: number;
  project_id: number | null;
  estimate_number: string;
  estimate_status: "draft" | "submitted" | "won" | "lost";
  title: string;
  client_name: string | null;
  issue_date: string;
  sales_user_id: number | null;
  sales_user_label?: string | null;
  team_tags_csv: string | null;
  effective_role?: "owner" | "editor" | "viewer" | "none";
  total_including_tax: number;
  updated_at: string;
};

const statusLabel: Record<EstimateListItem["estimate_status"], string> = {
  draft: "下書き",
  submitted: "提出済み",
  won: "受注",
  lost: "失注",
};

const statusChipClass: Record<EstimateListItem["estimate_status"], string> = {
  draft:
    "bg-[color:color-mix(in_srgb,var(--muted)_22%,transparent)] text-[color:color-mix(in_srgb,var(--muted)_86%,var(--foreground)_14%)]",
  submitted:
    "bg-[color:color-mix(in_srgb,var(--accent)_18%,transparent)] text-[color:color-mix(in_srgb,var(--accent)_84%,var(--foreground)_16%)]",
  won: "bg-[color:color-mix(in_srgb,#16a34a_22%,transparent)] text-[color:color-mix(in_srgb,#16a34a_86%,var(--foreground)_14%)]",
  lost:
    "bg-[color:color-mix(in_srgb,#ef4444_18%,transparent)] text-[color:color-mix(in_srgb,#ef4444_84%,var(--foreground)_16%)]",
};

const ESTIMATE_STATUS_OPTIONS: Array<{ value: EstimateListItem["estimate_status"]; label: string }> = [
  { value: "draft", label: "下書き" },
  { value: "submitted", label: "提出済み" },
  { value: "won", label: "受注" },
  { value: "lost", label: "失注" },
];

function estimateNumberShort(estimateNumber: string): string {
  const raw = String(estimateNumber ?? "").trim();
  const stripped = raw.replace(/^見積_/u, "");
  const legacy = /^\d{8}_(.+)_(\d{4})$/u.exec(stripped);
  if (legacy) {
    return `${legacy[1]}_${legacy[2]}`;
  }
  const compact = /^(.+)_(\d{4})$/u.exec(stripped);
  if (compact) {
    return `${compact[1]}_${compact[2]}`;
  }
  return stripped !== "" ? stripped : raw;
}

export function EstimatesListClient() {
  const router = useRouter();
  const [items, setItems] = useState<EstimateListItem[]>([]);
  const [statusChecks, setStatusChecks] = useState<Record<EstimateListItem["estimate_status"], boolean>>({
    draft: false,
    submitted: false,
    won: false,
    lost: false,
  });
  const [projectFilter, setProjectFilter] = useState<"all" | string>("all");
  const [teamTagFilter, setTeamTagFilter] = useState<"all" | string>("all");
  const [salesFilter, setSalesFilter] = useState<"all" | string>("all");
  const [updatedFrom, setUpdatedFrom] = useState("");
  const [updatedTo, setUpdatedTo] = useState("");
  const [keyword, setKeyword] = useState("");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [draftProjectFilter, setDraftProjectFilter] = useState<"all" | string>("all");
  const [draftTeamTagFilter, setDraftTeamTagFilter] = useState<"all" | string>("all");
  const [draftSalesFilter, setDraftSalesFilter] = useState<"all" | string>("all");
  const [draftUpdatedFrom, setDraftUpdatedFrom] = useState("");
  const [draftUpdatedTo, setDraftUpdatedTo] = useState("");
  const [draftKeyword, setDraftKeyword] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [previewStateById, setPreviewStateById] = useState<Record<number, "idle" | "loading" | "ready" | "error">>({});

  const load = async () => {
    setLoading(true);
    setMessage(null);
    try {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("page_size", String(pageSize));
      const selectedStatuses = ESTIMATE_STATUS_OPTIONS.filter((opt) => statusChecks[opt.value]).map((opt) => opt.value);
      if (selectedStatuses.length === 1) params.set("status", selectedStatuses[0]);
      else if (selectedStatuses.length > 1 && selectedStatuses.length < ESTIMATE_STATUS_OPTIONS.length) {
        params.set("status_csv", selectedStatuses.join(","));
      }
      if (projectFilter !== "all") params.set("project_id", projectFilter);
      if (teamTagFilter !== "all") params.set("team_tag", teamTagFilter);
      if (salesFilter !== "all") params.set("sales_user_id", salesFilter);
      if (updatedFrom !== "") params.set("updated_from", updatedFrom);
      if (updatedTo !== "") params.set("updated_to", updatedTo);
      if (keyword.trim() !== "") params.set("keyword", keyword.trim());

      const res = await fetch(`/api/portal/estimates?${params.toString()}`, { credentials: "include", cache: "no-store" });
      const data = (await res.json()) as { success?: boolean; estimates?: EstimateListItem[]; total?: number; message?: string };
      if (!res.ok || !data.success || !Array.isArray(data.estimates)) {
        setMessage(data.message ?? "見積一覧の取得に失敗しました。");
        return;
      }
      setItems(data.estimates);
      setTotalCount(typeof data.total === "number" && Number.isFinite(data.total) ? Math.max(0, data.total) : 0);
    } catch {
      setMessage("見積一覧の取得に失敗しました。");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [page, pageSize, statusChecks, projectFilter, teamTagFilter, salesFilter, updatedFrom, updatedTo, keyword]);

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const currentPage = Math.min(page, totalPages);

  const projectOptions = (() => {
    const ids = Array.from(new Set(items.map((item) => item.project_id).filter((id): id is number => typeof id === "number")));
    ids.sort((a, b) => a - b);
    return ids;
  })();

  const teamTagOptions = (() => {
    const tags = new Set<string>();
    for (const item of items) {
      for (const tag of (item.team_tags_csv ?? "").split(",")) {
        const t = tag.trim();
        if (t !== "") tags.add(t);
      }
    }
    return Array.from(tags).sort((a, b) => a.localeCompare(b, "ja"));
  })();

  const salesOptions = (() => {
    const ids = Array.from(new Set(items.map((item) => item.sales_user_id).filter((id): id is number => typeof id === "number")));
    ids.sort((a, b) => a - b);
    return ids;
  })();

  useEffect(() => {
    setPage(1);
  }, [statusChecks, projectFilter, teamTagFilter, salesFilter, updatedFrom, updatedTo, keyword]);

  const openDetailFilter = () => {
    setDraftProjectFilter(projectFilter);
    setDraftTeamTagFilter(teamTagFilter);
    setDraftSalesFilter(salesFilter);
    setDraftUpdatedFrom(updatedFrom);
    setDraftUpdatedTo(updatedTo);
    setDraftKeyword(keyword);
    setSheetOpen(true);
  };

  const applyDetailFilter = () => {
    setProjectFilter(draftProjectFilter);
    setTeamTagFilter(draftTeamTagFilter);
    setSalesFilter(draftSalesFilter);
    setUpdatedFrom(draftUpdatedFrom);
    setUpdatedTo(draftUpdatedTo);
    setKeyword(draftKeyword);
    setPage(1);
    setSheetOpen(false);
  };

  const clearDraftFilters = () => {
    setDraftProjectFilter("all");
    setDraftTeamTagFilter("all");
    setDraftSalesFilter("all");
    setDraftUpdatedFrom("");
    setDraftUpdatedTo("");
    setDraftKeyword("");
  };

  const clearAppliedFilters = () => {
    setStatusChecks({ draft: false, submitted: false, won: false, lost: false });
    setProjectFilter("all");
    setTeamTagFilter("all");
    setSalesFilter("all");
    setUpdatedFrom("");
    setUpdatedTo("");
    setKeyword("");
    clearDraftFilters();
    setPage(1);
  };

  const duplicate = (estimateId: number) => {
    void (async () => {
      try {
        const res = await fetch("/api/portal/estimate-duplicate", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ estimate_id: estimateId }),
        });
        const data = (await res.json()) as { success?: boolean; message?: string; estimate_id?: number };
        if (!res.ok || !data.success || !Number.isFinite(data.estimate_id) || (data.estimate_id ?? 0) <= 0) {
          setMessage(data.message ?? "複製に失敗しました。");
          return;
        }
        router.push(`/estimates/${data.estimate_id}`);
      } catch {
        setMessage("複製に失敗しました。");
      }
    })();
  };

  const ensurePreviewReady = async (estimateId: number) => {
    let shouldFetch = false;
    setPreviewStateById((prev) => {
      const current = prev[estimateId] ?? "idle";
      if (current === "loading" || current === "ready") {
        return prev;
      }
      shouldFetch = true;
      return { ...prev, [estimateId]: "loading" };
    });
    if (!shouldFetch) {
      return;
    }
    const startedAt = Date.now();
    try {
      const res = await fetch("/api/portal/estimate-export-html", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ estimate_id: estimateId }),
      });
      const data = (await res.json()) as { success?: boolean; html?: string };
      const elapsed = Date.now() - startedAt;
      if (elapsed < 180) {
        await new Promise((resolve) => window.setTimeout(resolve, 180 - elapsed));
      }
      if (!res.ok || !data.success || typeof data.html !== "string" || data.html.trim() === "") {
        setPreviewStateById((prev) => ({ ...prev, [estimateId]: "error" }));
        return;
      }
      setPreviewStateById((prev) => ({ ...prev, [estimateId]: "ready" }));
    } catch {
      setPreviewStateById((prev) => ({ ...prev, [estimateId]: "error" }));
    }
  };

  return (
    <section className="surface-card flex min-h-0 flex-1 flex-col overflow-hidden p-0">
      <div className="shrink-0 border-b border-[color:color-mix(in_srgb,var(--border)_88%,transparent)] px-5 py-4">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <Button
            type="button"
            variant="accent"
            size="sm"
            className="h-9 gap-1.5 rounded-lg shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]"
            aria-label="詳細絞込を開く"
            onClick={openDetailFilter}
          >
            <Search className="h-4 w-4 shrink-0 text-[var(--accent-contrast)]" aria-hidden />
          </Button>
          {ESTIMATE_STATUS_OPTIONS.map((opt) => (
            <label key={opt.value} className="flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={statusChecks[opt.value]}
                onChange={(event) => {
                  setStatusChecks((prev) => ({ ...prev, [opt.value]: event.target.checked }));
                }}
                className="h-4 w-4 shrink-0 rounded border border-[color:color-mix(in_srgb,var(--border)_90%,transparent)] bg-[color:color-mix(in_srgb,var(--background)_94%,black_6%)] accent-[var(--accent)] outline-none ring-offset-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:color-mix(in_srgb,var(--accent)_55%,transparent)]"
              />
              <span className="text-sm text-[var(--foreground)]">{opt.label}</span>
            </label>
          ))}
          <Button type="button" variant="default" size="sm" className="h-9 rounded-lg" onClick={clearAppliedFilters}>
            クリア
          </Button>
          <div className="ml-auto flex items-center gap-2">
            <Label htmlFor="estimate-page-size" className="whitespace-nowrap text-sm text-[var(--muted)]">
              表示件数
            </Label>
            <Select
              value={String(pageSize)}
              onValueChange={(value) => {
                const size = Number.parseInt(value, 10);
                setPageSize(Number.isFinite(size) && size > 0 ? size : 20);
                setPage(1);
              }}
            >
              <SelectTrigger id="estimate-page-size" className="h-9 w-[100px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="20">20</SelectItem>
                <SelectItem value="50">50</SelectItem>
                <SelectItem value="100">100</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <p className="shrink-0 text-sm tabular-nums text-[var(--muted)]">
            {totalCount === 0 ? "0 件" : `${(currentPage - 1) * pageSize + 1} - ${Math.min(currentPage * pageSize, totalCount)} / ${totalCount} 件`}
          </p>
        </div>
        {loading ? <p className="mt-3 text-sm text-[var(--muted)]">読み込み中…</p> : null}
        {message ? <p className="mt-3 text-sm text-[var(--muted)]">{message}</p> : null}
      </div>

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-lg">
          <SheetHeader className="mb-0 flex flex-row items-center justify-between space-y-0 border-b border-[color:color-mix(in_srgb,var(--border)_90%,transparent)] px-6 py-4">
            <SheetTitle className="text-base">詳細絞込</SheetTitle>
            <SheetClose asChild>
              <Button type="button" variant="default" size="sm" className="h-7 shrink-0 px-2 py-1 text-xs">
                Close
              </Button>
            </SheetClose>
          </SheetHeader>
          <div className="flex max-h-[calc(100vh-8rem)] flex-col">
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-4">
              <div className="space-y-1.5">
                <Label htmlFor="estimate-project-filter-sheet">Project</Label>
                <Select value={draftProjectFilter} onValueChange={setDraftProjectFilter}>
                  <SelectTrigger id="estimate-project-filter-sheet">
                    <SelectValue placeholder="全て" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">全て</SelectItem>
                    {projectOptions.map((projectId) => (
                      <SelectItem key={`project-filter-sheet-${projectId}`} value={String(projectId)}>
                        #{projectId}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="estimate-team-tag-filter-sheet">チームタグ</Label>
                <Select value={draftTeamTagFilter} onValueChange={setDraftTeamTagFilter}>
                  <SelectTrigger id="estimate-team-tag-filter-sheet">
                    <SelectValue placeholder="全て" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">全て</SelectItem>
                    {teamTagOptions.map((tag) => (
                      <SelectItem key={`team-filter-sheet-${tag}`} value={tag}>
                        #{tag}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="estimate-sales-filter-sheet">担当営業</Label>
                <Select value={draftSalesFilter} onValueChange={setDraftSalesFilter}>
                  <SelectTrigger id="estimate-sales-filter-sheet">
                    <SelectValue placeholder="全て" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">全て</SelectItem>
                    {salesOptions.map((id) => (
                      <SelectItem key={`sales-filter-sheet-${id}`} value={String(id)}>
                        user#{id}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="estimate-keyword-filter-sheet">キーワード</Label>
                <Input
                  id="estimate-keyword-filter-sheet"
                  value={draftKeyword}
                  onChange={(event) => setDraftKeyword(event.target.value)}
                  placeholder="見積番号・件名・顧客名"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="estimate-updated-from-sheet">更新日（From）</Label>
                <Input
                  id="estimate-updated-from-sheet"
                  type="date"
                  value={draftUpdatedFrom}
                  onChange={(event) => setDraftUpdatedFrom(event.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="estimate-updated-to-sheet">更新日（To）</Label>
                <Input
                  id="estimate-updated-to-sheet"
                  type="date"
                  value={draftUpdatedTo}
                  onChange={(event) => setDraftUpdatedTo(event.target.value)}
                />
              </div>
            </div>
            <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-[color:color-mix(in_srgb,var(--border)_90%,transparent)] px-6 py-4">
              <Button type="button" variant="default" size="sm" onClick={clearDraftFilters}>
                クリア
              </Button>
              <Button type="button" variant="accent" size="sm" onClick={applyDetailFilter}>
                適用して閉じる
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <div className="modern-scrollbar min-h-0 flex-1 overflow-x-auto overflow-y-auto">
        <table className="w-full min-w-[1080px] table-auto text-left text-sm">
          <thead className="pm-table-head sticky top-0 z-10 text-sm font-semibold normal-case tracking-normal text-[var(--foreground)]">
            <tr>
              <th className="px-5 py-3">見積番号</th>
              <th className="px-3 py-3">件名</th>
              <th className="px-3 py-3">顧客名</th>
              <th className="px-3 py-3">ステータス</th>
              <th className="px-3 py-3">チームタグ</th>
              <th className="px-3 py-3">担当営業</th>
              <th className="px-3 py-3">発行日</th>
              <th className="px-3 py-3">更新日</th>
              <th className="px-3 py-3 text-right">税込合計</th>
              <th className="px-2 py-3">操作</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr
                key={item.id}
                onPointerEnter={() => {
                  if (["owner", "editor", "viewer"].includes(item.effective_role ?? "")) {
                    void ensurePreviewReady(item.id);
                  }
                }}
                onMouseEnter={() => {
                  if (["owner", "editor", "viewer"].includes(item.effective_role ?? "")) {
                    void ensurePreviewReady(item.id);
                  }
                }}
                className="group border-b border-[color:color-mix(in_srgb,var(--border)_88%,transparent)] transition-colors duration-150 hover:bg-[color:color-mix(in_srgb,var(--accent)_12%,var(--surface)_88%)]"
              >
                <td className="px-5 py-3 font-mono text-xs text-[var(--muted)]">{estimateNumberShort(item.estimate_number)}</td>
                <td className="max-w-[20rem] truncate px-3 py-3 font-medium text-[var(--foreground)]" title={item.title}>
                  {item.title}
                </td>
                <td className="max-w-[16rem] truncate px-3 py-3 text-[var(--muted)]" title={item.client_name ?? undefined}>
                  {item.client_name ?? "-"}
                </td>
                <td className="px-3 py-3">
                  <span
                    className={cn(
                      "inline-block rounded-full px-2 py-0.5 text-[11px] font-medium leading-tight",
                      statusChipClass[item.estimate_status] ?? statusChipClass.draft,
                    )}
                  >
                    {statusLabel[item.estimate_status] ?? item.estimate_status}
                  </span>
                </td>
                <td
                  className="max-w-[14rem] truncate px-3 py-3 text-[var(--muted)]"
                  title={(item.team_tags_csv ?? "")
                    .split(",")
                    .filter((v) => v.trim() !== "")
                    .map((v) => `#${v.trim()}`)
                    .join(" ")}
                >
                  {(item.team_tags_csv ?? "")
                    .split(",")
                    .filter((v) => v.trim() !== "")
                    .map((v) => `#${v.trim()}`)
                    .join(" ") || "-"}
                </td>
                <td className="px-3 py-3 text-[var(--muted)]">
                  {String(item.sales_user_label ?? "").trim() || (item.sales_user_id ? `user#${item.sales_user_id}` : "-")}
                </td>
                <td className="whitespace-nowrap px-3 py-3 font-mono text-xs text-[var(--muted)] tabular-nums">{item.issue_date}</td>
                <td className="whitespace-nowrap px-3 py-3 font-mono text-xs text-[var(--muted)] tabular-nums">
                  {String(item.updated_at ?? "").slice(0, 10)}
                </td>
                <td className="whitespace-nowrap px-3 py-3 text-right font-mono text-xs tabular-nums text-[var(--foreground)]">
                  {Number(item.total_including_tax ?? 0).toLocaleString("ja-JP")}
                </td>
                <td className="px-2 py-3">
                  <div className="flex flex-wrap gap-1.5">
                    <Button
                      asChild
                      type="button"
                      variant="default"
                      size="sm"
                      className="h-8 rounded-md"
                      disabled={!["owner", "editor"].includes(item.effective_role ?? "")}
                      title={!["owner", "editor"].includes(item.effective_role ?? "") ? "編集権限がありません" : undefined}
                    >
                      <Link href={`/estimates/${item.id}`}>{["owner", "editor"].includes(item.effective_role ?? "") ? "編集" : "詳細"}</Link>
                    </Button>
                    <Button
                      type="button"
                      variant="default"
                      size="sm"
                      className="h-8 rounded-md"
                      disabled={!["owner", "editor"].includes(item.effective_role ?? "")}
                      title={!["owner", "editor"].includes(item.effective_role ?? "") ? "編集権限がありません" : undefined}
                      onClick={() => void duplicate(item.id)}
                    >
                      複製
                    </Button>
                    {["owner", "editor", "viewer"].includes(item.effective_role ?? "") ? (
                      (previewStateById[item.id] ?? "idle") === "loading" ? (
                        <span
                          className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-[color:color-mix(in_srgb,var(--border)_55%,transparent)] bg-[color:color-mix(in_srgb,var(--surface)_92%,transparent)] text-[color:color-mix(in_srgb,var(--muted)_90%,var(--foreground)_10%)]"
                          title="プレビューを読み込み中"
                          aria-label="プレビューを読み込み中"
                        >
                          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                        </span>
                      ) : (previewStateById[item.id] ?? "idle") === "ready" ? (
                      <HoverCard openDelay={180} closeDelay={120}>
                        <HoverCardTrigger asChild>
                          <a
                            href={`/estimates/${item.id}/preview`}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-[color:color-mix(in_srgb,var(--border)_55%,transparent)] bg-[color:color-mix(in_srgb,var(--surface)_92%,transparent)] text-[color:color-mix(in_srgb,var(--muted)_90%,var(--foreground)_10%)] transition-colors hover:border-[color:color-mix(in_srgb,var(--accent)_45%,var(--border)_55%)] hover:bg-[color:color-mix(in_srgb,var(--accent)_12%,var(--surface)_88%)] hover:text-[var(--accent)]"
                            title="プレビューを別タブで開く"
                            aria-label="プレビューを別タブで開く"
                          >
                            <Eye className="h-4 w-4" aria-hidden />
                          </a>
                        </HoverCardTrigger>
                        <HoverCardContent side="left" align="start" className="p-0">
                          <div className="w-[min(72vw,880px)] bg-white p-2 [--background:#ffffff] [--surface:#ffffff] [--foreground:#0f172a] [--muted:#475569] [--border:#cbd5e1]">
                            <p className="px-2 pb-2 text-xs text-[var(--muted)]">クリックで別タブに開きます</p>
                            <iframe
                              title={`estimate-preview-${item.id}`}
                              src={`/estimates/${item.id}/preview`}
                              loading="lazy"
                              className="h-[440px] w-full rounded-md border border-[var(--border)] bg-white"
                            />
                          </div>
                        </HoverCardContent>
                      </HoverCard>
                      ) : (
                        <span className="inline-flex h-8 w-8" aria-hidden />
                      )
                    ) : (
                      <Button
                        type="button"
                        variant="default"
                        size="sm"
                        className="h-8 w-8 rounded-md p-0"
                        disabled
                        title="閲覧権限がありません"
                      >
                        <Eye className="h-4 w-4" aria-hidden />
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {!loading && items.length === 0 ? (
              <tr>
                <td colSpan={11} className="px-5 py-8 text-center text-sm text-[var(--muted)]">
                  データがありません。
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      {totalPages > 1 && currentPage >= 2 ? (
        <div className="flex shrink-0 items-center justify-end gap-2 border-t border-[color:color-mix(in_srgb,var(--border)_88%,transparent)] px-5 py-3 text-sm">
          {currentPage > 1 ? (
            <Button type="button" variant="default" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))}>
              前へ
            </Button>
          ) : null}
          {currentPage < totalPages ? (
            <Button type="button" variant="default" size="sm" onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>
              次へ
            </Button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
