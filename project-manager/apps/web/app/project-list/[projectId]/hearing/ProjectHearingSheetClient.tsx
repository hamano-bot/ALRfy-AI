"use client";

import { Button } from "@/app/components/ui/button";
import { Card, CardContent } from "@/app/components/ui/card";
import { Input, inputBaseClassName } from "@/app/components/ui/input";
import { Label } from "@/app/components/ui/label";
import { displayText } from "@/lib/empty-display";
import {
  CORPORATE_NEW_HEARING_TEMPLATE_ROWS,
  createEmptyHearingRow,
  type HearingSheetRow,
  hearingBodyFromRows,
  shouldSeedCorporateNewTemplate,
} from "@/lib/hearing-sheet-corporate-new-template";
import { formatSiteTypeLabel } from "@/lib/portal-my-projects";
import type { PortalProjectDetail } from "@/lib/portal-project";
import { buildRedmineProjectUrl } from "@/lib/redmine-url";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

type ProjectHearingSheetClientProps = {
  projectId: number;
  project: PortalProjectDetail;
  /** サーバーでテンプレ seed 済みの行 */
  initialRows: HearingSheetRow[];
  initialStatus: "draft" | "finalized" | "archived";
  canEdit: boolean;
};

function ReadOnlyField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">{label}</p>
      <div className="text-sm leading-relaxed text-[var(--foreground)]">{children}</div>
    </div>
  );
}

export function ProjectHearingSheetClient({
  projectId,
  project,
  initialRows,
  initialStatus,
  canEdit,
}: ProjectHearingSheetClientProps) {
  const router = useRouter();
  const [rows, setRows] = useState<HearingSheetRow[]>(initialRows);
  const [status, setStatus] = useState(initialStatus);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setRows(initialRows);
    setStatus(initialStatus);
  }, [initialRows, initialStatus]);

  const templateHint = useMemo(() => {
    if (shouldSeedCorporateNewTemplate(project)) {
      return "コーポレート・新規向けの初期行を表示しています（未保存のときは DB に未登録）。";
    }
    return null;
  }, [project]);

  const updateRow = useCallback((id: string, patch: Partial<HearingSheetRow>) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }, []);

  const removeRow = useCallback((id: string) => {
    setRows((prev) => prev.filter((r) => r.id !== id));
  }, []);

  const addRow = useCallback(() => {
    setRows((prev) => [...prev, createEmptyHearingRow()]);
  }, []);

  const loadTemplate = useCallback(() => {
    if (!canEdit) {
      return;
    }
    setRows([...CORPORATE_NEW_HEARING_TEMPLATE_ROWS.map((r) => ({ ...r, id: `${r.id}-${Date.now()}` }))]);
  }, [canEdit]);

  const save = useCallback(async () => {
    if (!canEdit) {
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const body_json = hearingBodyFromRows(rows);
      const res = await fetch("/api/portal/project-hearing-sheet", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          project_id: projectId,
          status,
          body_json,
        }),
      });
      const text = await res.text();
      let msg = "保存に失敗しました。";
      try {
        const j = JSON.parse(text) as { message?: string };
        if (typeof j.message === "string") {
          msg = j.message;
        }
      } catch {
        /* ignore */
      }
      if (!res.ok) {
        setError(msg);
        return;
      }
      router.refresh();
    } catch {
      setError("保存に失敗しました。");
    } finally {
      setSaving(false);
    }
  }, [canEdit, projectId, rows, status, router]);

  const masterPane = (
    <Card className="overflow-hidden shadow-sm">
      <CardContent className="space-y-4 p-4 sm:p-5">
        <h2 className="pm-section-heading">案件マスタ（参照）</h2>
        <p className="text-xs text-[var(--muted)]">編集は案件詳細の「編集」から行ってください。</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <ReadOnlyField label="案件名">{project.name}</ReadOnlyField>
          <ReadOnlyField label="クライアント">{displayText(project.client_name)}</ReadOnlyField>
          <ReadOnlyField label="サイト種別">{formatSiteTypeLabel(project.site_type, project.site_type_other)}</ReadOnlyField>
          <ReadOnlyField label="区分">{project.is_renewal ? "リニューアル" : "新規"}</ReadOnlyField>
          <ReadOnlyField label="キックオフ日">{displayText(project.kickoff_date)}</ReadOnlyField>
          <ReadOnlyField label="リリース予定日">{displayText(project.release_due_date)}</ReadOnlyField>
        </div>
        {project.redmine_links.length > 0 ? (
          <ReadOnlyField label="Redmine">
            <ul className="space-y-1 text-sm">
              {project.redmine_links.map((r) => {
                const href = buildRedmineProjectUrl(r.redmine_base_url, r.redmine_project_id);
                const label =
                  r.redmine_project_name?.trim() !== ""
                    ? r.redmine_project_name!.trim()
                    : `プロジェクト #${r.redmine_project_id}`;
                return (
                  <li key={`${r.redmine_project_id}-${r.redmine_base_url ?? ""}`}>
                    {href ? (
                      <a
                        href={href}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[color:color-mix(in_srgb,var(--accent)_85%,var(--foreground)_15%)] hover:underline"
                      >
                        {label}
                      </a>
                    ) : (
                      label
                    )}
                  </li>
                );
              })}
            </ul>
          </ReadOnlyField>
        ) : null}
      </CardContent>
    </Card>
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-5">
      <section className="surface-card pm-page-hero relative shrink-0 overflow-hidden px-5">
        <div className="pointer-events-none absolute -top-10 right-0 h-36 w-36 rounded-full bg-[color:color-mix(in_srgb,var(--accent)_22%,transparent)] blur-3xl" />
        <div className="relative flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 flex-1 items-start gap-3">
            <Link
              href={`/project-list/${projectId}`}
              prefetch
              className="shrink-0 pt-0.5 text-sm text-[color:color-mix(in_srgb,var(--accent)_82%,var(--foreground)_18%)] hover:underline"
            >
              ← 案件詳細
            </Link>
            <div className="min-w-0">
              <h1 className="text-xl font-semibold leading-tight tracking-tight text-[var(--foreground)] md:text-2xl">
                ヒアリングシート
              </h1>
              <p className="mt-1 truncate text-sm text-[var(--muted)]">{project.name}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2">
              <Label htmlFor="pm-hearing-status" className="text-xs text-[var(--muted)]">
                ステータス
              </Label>
              <select
                id="pm-hearing-status"
                disabled={!canEdit}
                className={cn(inputBaseClassName, "h-9 min-w-[10rem] cursor-pointer text-sm")}
                value={status}
                onChange={(e) => setStatus(e.target.value as typeof status)}
              >
                <option value="draft">draft</option>
                <option value="finalized">finalized</option>
                <option value="archived">archived</option>
              </select>
            </div>
            {canEdit ? (
              <Button type="button" variant="accent" size="sm" disabled={saving} onClick={() => void save()}>
                {saving ? "保存中…" : "保存"}
              </Button>
            ) : null}
          </div>
        </div>
        {templateHint ? <p className="relative mt-3 text-xs text-[var(--muted)]">{templateHint}</p> : null}
        {error ? (
          <p className="relative mt-2 text-sm text-red-600 dark:text-red-400" role="alert">
            {error}
          </p>
        ) : null}
      </section>

      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(300px,380px)] lg:items-start lg:gap-8">
        <Card className="min-w-0 overflow-hidden shadow-sm">
          <CardContent className="space-y-3 p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="pm-section-heading mb-0">確認事項</h2>
              {canEdit ? (
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="default" size="sm" onClick={addRow}>
                    行を追加
                  </Button>
                  <Button type="button" variant="default" size="sm" onClick={loadTemplate}>
                    コーポ新規テンプレを再読込
                  </Button>
                </div>
              ) : null}
            </div>

            <div className="overflow-x-auto rounded-lg border border-[color:color-mix(in_srgb,var(--border)_88%,transparent)]">
              <table className="w-full min-w-[880px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-[color:color-mix(in_srgb,var(--border)_88%,transparent)] bg-[color:color-mix(in_srgb,var(--surface)_96%,transparent)]">
                    <th className="px-2 py-2 font-medium text-[var(--muted)]">分類</th>
                    <th className="px-2 py-2 font-medium text-[var(--muted)]">見出し</th>
                    <th className="min-w-[8rem] px-2 py-2 font-medium text-[var(--muted)]">確認事項</th>
                    <th className="min-w-[8rem] px-2 py-2 font-medium text-[var(--muted)]">回答</th>
                    <th className="px-2 py-2 font-medium text-[var(--muted)]">担当</th>
                    <th className="w-24 px-2 py-2 font-medium text-[var(--muted)]">期限</th>
                    <th className="w-20 px-2 py-2 font-medium text-[var(--muted)]">状況</th>
                    {canEdit ? <th className="w-12 px-1 py-2" /> : null}
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 ? (
                    <tr>
                      <td colSpan={canEdit ? 8 : 7} className="px-3 py-8 text-center text-sm text-[var(--muted)]">
                        行がありません。「行を追加」またはテンプレ再読込で入力してください。
                      </td>
                    </tr>
                  ) : (
                    rows.map((row) => (
                      <tr
                        key={row.id}
                        className="border-b border-[color:color-mix(in_srgb,var(--border)_70%,transparent)] align-top"
                      >
                        <td className="p-1.5">
                          {canEdit ? (
                            <Input
                              className="h-8 text-xs"
                              value={row.category}
                              onChange={(e) => updateRow(row.id, { category: e.target.value })}
                            />
                          ) : (
                            <span className="block px-1 py-1.5 text-xs">{displayText(row.category)}</span>
                          )}
                        </td>
                        <td className="p-1.5">
                          {canEdit ? (
                            <Input
                              className="h-8 text-xs"
                              value={row.heading}
                              onChange={(e) => updateRow(row.id, { heading: e.target.value })}
                            />
                          ) : (
                            <span className="block px-1 py-1.5 text-xs">{displayText(row.heading)}</span>
                          )}
                        </td>
                        <td className="p-1.5">
                          {canEdit ? (
                            <textarea
                              className={cn(inputBaseClassName, "min-h-[3rem] resize-y text-xs")}
                              rows={2}
                              value={row.question}
                              onChange={(e) => updateRow(row.id, { question: e.target.value })}
                            />
                          ) : (
                            <span className="block whitespace-pre-wrap px-1 py-1 text-xs">{displayText(row.question)}</span>
                          )}
                        </td>
                        <td className="p-1.5">
                          {canEdit ? (
                            <textarea
                              className={cn(inputBaseClassName, "min-h-[3rem] resize-y text-xs")}
                              rows={2}
                              value={row.answer}
                              onChange={(e) => updateRow(row.id, { answer: e.target.value })}
                            />
                          ) : (
                            <span className="block whitespace-pre-wrap px-1 py-1 text-xs">{displayText(row.answer)}</span>
                          )}
                        </td>
                        <td className="p-1.5">
                          {canEdit ? (
                            <Input
                              className="h-8 text-xs"
                              value={row.assignee}
                              onChange={(e) => updateRow(row.id, { assignee: e.target.value })}
                            />
                          ) : (
                            <span className="block px-1 py-1.5 text-xs">{displayText(row.assignee)}</span>
                          )}
                        </td>
                        <td className="p-1.5">
                          {canEdit ? (
                            <Input
                              className="h-8 text-xs"
                              value={row.due}
                              onChange={(e) => updateRow(row.id, { due: e.target.value })}
                            />
                          ) : (
                            <span className="block px-1 py-1.5 text-xs">{displayText(row.due)}</span>
                          )}
                        </td>
                        <td className="p-1.5">
                          {canEdit ? (
                            <Input
                              className="h-8 text-xs"
                              value={row.row_status}
                              onChange={(e) => updateRow(row.id, { row_status: e.target.value })}
                            />
                          ) : (
                            <span className="block px-1 py-1.5 text-xs">{displayText(row.row_status)}</span>
                          )}
                        </td>
                        {canEdit ? (
                          <td className="p-1.5">
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-8 text-xs text-red-600 hover:text-red-700"
                              onClick={() => removeRow(row.id)}
                            >
                              削除
                            </Button>
                          </td>
                        ) : null}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        <aside className="mt-6 min-w-0 lg:mt-0 lg:sticky lg:top-4 lg:self-start">{masterPane}</aside>
      </div>
    </div>
  );
}
