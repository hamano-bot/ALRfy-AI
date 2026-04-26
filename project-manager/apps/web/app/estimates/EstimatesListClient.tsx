"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import { Label } from "@/app/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/app/components/ui/select";

type EstimateListItem = {
  id: number;
  project_id: number | null;
  estimate_number: string;
  estimate_status: "draft" | "submitted" | "won" | "lost";
  title: string;
  client_name: string | null;
  issue_date: string;
  sales_user_id: number | null;
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

export function EstimatesListClient() {
  const [items, setItems] = useState<EstimateListItem[]>([]);
  const [statusFilter, setStatusFilter] = useState<"all" | EstimateListItem["estimate_status"]>("all");
  const [projectFilter, setProjectFilter] = useState<"all" | string>("all");
  const [teamTagFilter, setTeamTagFilter] = useState<"all" | string>("all");
  const [salesFilter, setSalesFilter] = useState<"all" | string>("all");
  const [updatedFrom, setUpdatedFrom] = useState("");
  const [updatedTo, setUpdatedTo] = useState("");
  const [keyword, setKeyword] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [totalCount, setTotalCount] = useState(0);
  const [refreshKey, setRefreshKey] = useState(0);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setMessage(null);
    try {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("page_size", String(pageSize));
      if (statusFilter !== "all") params.set("status", statusFilter);
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
  }, [page, pageSize, statusFilter, projectFilter, teamTagFilter, salesFilter, updatedFrom, updatedTo, keyword, refreshKey]);

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
  }, [statusFilter, projectFilter, teamTagFilter, salesFilter, updatedFrom, updatedTo, keyword]);

  const duplicate = async (estimateId: number) => {
    try {
      const res = await fetch("/api/portal/estimate-duplicate", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ estimate_id: estimateId }),
      });
      const data = (await res.json()) as { success?: boolean; message?: string };
      if (!res.ok || !data.success) {
        setMessage(data.message ?? "複製に失敗しました。");
        return;
      }
      await load();
    } catch {
      setMessage("複製に失敗しました。");
    }
  };

  return (
    <section className="surface-card min-h-0 flex-1 overflow-auto p-4">
      <div className="mb-3 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        <div className="space-y-1">
          <Label htmlFor="estimate-status-filter">ステータス</Label>
          <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as typeof statusFilter)}>
            <SelectTrigger id="estimate-status-filter">
              <SelectValue placeholder="全て" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全て</SelectItem>
              <SelectItem value="draft">下書き</SelectItem>
              <SelectItem value="submitted">提出済み</SelectItem>
              <SelectItem value="won">受注</SelectItem>
              <SelectItem value="lost">失注</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="estimate-project-filter">Project</Label>
          <Select value={projectFilter} onValueChange={setProjectFilter}>
            <SelectTrigger id="estimate-project-filter">
              <SelectValue placeholder="全て" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全て</SelectItem>
              {projectOptions.map((projectId) => (
                <SelectItem key={`project-filter-${projectId}`} value={String(projectId)}>
                  #{projectId}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="estimate-team-tag-filter">チームタグ</Label>
          <Select value={teamTagFilter} onValueChange={setTeamTagFilter}>
            <SelectTrigger id="estimate-team-tag-filter">
              <SelectValue placeholder="全て" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全て</SelectItem>
              {teamTagOptions.map((tag) => (
                <SelectItem key={`team-filter-${tag}`} value={tag}>
                  #{tag}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="estimate-sales-filter">担当営業</Label>
          <Select value={salesFilter} onValueChange={setSalesFilter}>
            <SelectTrigger id="estimate-sales-filter">
              <SelectValue placeholder="全て" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全て</SelectItem>
              {salesOptions.map((id) => (
                <SelectItem key={`sales-filter-${id}`} value={String(id)}>
                  user#{id}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1 xl:col-span-2">
          <Label htmlFor="estimate-keyword-filter">キーワード</Label>
          <Input
            id="estimate-keyword-filter"
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            placeholder="見積番号・件名・顧客名"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="estimate-updated-from">更新日（From）</Label>
          <Input id="estimate-updated-from" type="date" value={updatedFrom} onChange={(event) => setUpdatedFrom(event.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="estimate-updated-to">更新日（To）</Label>
          <Input id="estimate-updated-to" type="date" value={updatedTo} onChange={(event) => setUpdatedTo(event.target.value)} />
        </div>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Button type="button" variant="default" size="sm" onClick={() => void load()}>
          再読込
        </Button>
        <Button type="button" variant="default" size="sm" onClick={() => setRefreshKey((v) => v + 1)}>
          最新化
        </Button>
        <Button
          type="button"
          variant="default"
          size="sm"
          onClick={() => {
            setStatusFilter("all");
            setProjectFilter("all");
            setTeamTagFilter("all");
            setSalesFilter("all");
            setUpdatedFrom("");
            setUpdatedTo("");
            setKeyword("");
          }}
        >
          フィルタクリア
        </Button>
      </div>

      {loading ? <p className="text-sm text-[var(--muted)]">読み込み中…</p> : null}
      {message ? <p className="mb-2 text-sm text-[var(--muted)]">{message}</p> : null}

      <div className="overflow-auto">
        <table className="w-full min-w-[900px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-[var(--border)] text-left">
              <th className="px-2 py-2">見積番号</th>
              <th className="px-2 py-2">件名</th>
              <th className="px-2 py-2">顧客名</th>
              <th className="px-2 py-2">ステータス</th>
                <th className="px-2 py-2">チームタグ</th>
                <th className="px-2 py-2">担当営業</th>
              <th className="px-2 py-2">発行日</th>
                <th className="px-2 py-2">更新日</th>
              <th className="px-2 py-2 text-right">税込合計</th>
              <th className="px-2 py-2">操作</th>
            </tr>
          </thead>
          <tbody>
              {items.map((item) => (
              <tr key={item.id} className="border-b border-[var(--border)]">
                <td className="px-2 py-2">{item.estimate_number}</td>
                <td className="px-2 py-2">{item.title}</td>
                <td className="px-2 py-2">{item.client_name ?? "-"}</td>
                <td className="px-2 py-2">{statusLabel[item.estimate_status] ?? item.estimate_status}</td>
                <td className="px-2 py-2">{(item.team_tags_csv ?? "").split(",").filter((v) => v.trim() !== "").map((v) => `#${v.trim()}`).join(" ") || "-"}</td>
                <td className="px-2 py-2">{item.sales_user_id ? `user#${item.sales_user_id}` : "-"}</td>
                <td className="px-2 py-2">{item.issue_date}</td>
                <td className="px-2 py-2">{String(item.updated_at ?? "").slice(0, 10)}</td>
                <td className="px-2 py-2 text-right">{Number(item.total_including_tax ?? 0).toLocaleString("ja-JP")}</td>
                <td className="px-2 py-2">
                  <div className="flex flex-wrap gap-1">
                    <Button
                      asChild
                      type="button"
                      variant="default"
                      size="sm"
                      disabled={!["owner", "editor"].includes(item.effective_role ?? "")}
                      title={!["owner", "editor"].includes(item.effective_role ?? "") ? "編集権限がありません" : undefined}
                    >
                      <Link href={`/estimates/${item.id}`}>{["owner", "editor"].includes(item.effective_role ?? "") ? "編集" : "詳細"}</Link>
                    </Button>
                    <Button
                      type="button"
                      variant="default"
                      size="sm"
                      disabled={!["owner", "editor"].includes(item.effective_role ?? "")}
                      title={!["owner", "editor"].includes(item.effective_role ?? "") ? "編集権限がありません" : undefined}
                      onClick={() => void duplicate(item.id)}
                    >
                      複製
                    </Button>
                    <Button asChild type="button" variant="default" size="sm" disabled={!["owner", "editor", "viewer"].includes(item.effective_role ?? "")}>
                      <Link href={`/estimates/${item.id}/preview`}>HTML出力へ</Link>
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
            {!loading && items.length === 0 ? (
              <tr>
                <td colSpan={11} className="px-2 py-4 text-center text-[var(--muted)]">
                  データがありません。
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm">
        <div>
          {totalCount === 0 ? "0 件" : `${(currentPage - 1) * pageSize + 1} - ${Math.min(currentPage * pageSize, totalCount)} / ${totalCount} 件`}
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2">
            <Label htmlFor="estimate-page-size" className="whitespace-nowrap">
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
              <SelectTrigger id="estimate-page-size" className="w-[100px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="20">20</SelectItem>
                <SelectItem value="50">50</SelectItem>
                <SelectItem value="100">100</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button type="button" variant="default" size="sm" disabled={currentPage <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
            前へ
          </Button>
          <span>
            {currentPage} / {totalPages}
          </span>
          <Button
            type="button"
            variant="default"
            size="sm"
            disabled={currentPage >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          >
            次へ
          </Button>
        </div>
      </div>
    </section>
  );
}
