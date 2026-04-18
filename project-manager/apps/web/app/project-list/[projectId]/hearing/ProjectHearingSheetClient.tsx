"use client";

import { useDashboardSidebarOpen } from "@/app/components/DashboardSidebarContext";
import { ThemeDateField } from "@/app/components/ThemeDateField";
import { Button } from "@/app/components/ui/button";
import { Card, CardContent } from "@/app/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/app/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/app/components/ui/select";
import type { HearingAdviceSuggestion } from "@/lib/hearing-advice-types";
import {
  collectAdviceRowIds,
  projectToAdvicePayload,
  resolveAdviceToRowId,
} from "@/lib/hearing-advice-resolve";
import { displayText } from "@/lib/empty-display";
import { sanitizeHearingRowsFromExcelImport } from "@/lib/hearing-import-sanitize";
import { createEmptyHearingRow, hearingBodyFromRows } from "@/lib/hearing-sheet-body-utils";
import type { HearingSheetRow } from "@/lib/hearing-sheet-types";
import { getDefaultRowsForTemplate } from "@/lib/hearing-sheet-template-rows";
import { type HearingTemplateId } from "@/lib/hearing-sheet-template-matrix";
import { formatSiteTypeLabel } from "@/lib/portal-my-projects";
import type { PortalProjectDetail } from "@/lib/portal-project";
import { projectPageLgMainSidebarGridClassName } from "@/lib/project-page-layout";
import { buildRedmineProjectUrl } from "@/lib/redmine-url";
import { cn } from "@/lib/utils";
import { format, parse } from "date-fns";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { GripVertical } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { HearingAutoTextarea } from "./HearingAutoTextarea";
import { HearingImportExcelDialog } from "./HearingImportExcelDialog";

const hearingSheetTdClass = "px-1 py-1.5 align-top";
const hearingSheetTdActionClass = "box-border py-1.5 pl-1 pr-2.5 align-middle";
const hearingSheetThClass = "px-1 py-2 font-medium text-[var(--muted)]";
const hearingSheetThActionClass = "py-2 pl-1 pr-2.5 font-medium text-[var(--muted)]";

const UNSAVED_LEAVE_MESSAGE = "変更が保存されていません。このままページを離れますか？";

const AUTO_SAVE_INTERVAL_MS = 120_000;

function hearingSheetStateFingerprint(
  templateId: HearingTemplateId,
  rows: HearingSheetRow[],
  sheetStatus: "draft" | "finalized" | "archived",
): string {
  return JSON.stringify({ templateId, status: sheetStatus, rows });
}

function hearingRowsHaveAnyContent(rows: HearingSheetRow[]): boolean {
  return rows.some((r) =>
    [r.category, r.heading, r.question, r.answer, r.assignee, r.due, r.row_status].some((v) => v.trim() !== ""),
  );
}

function rowStatusSelectValue(v: string): "" | "確認中" | "完了" {
  const t = v.trim();
  if (t === "確認中" || t === "完了") {
    return t;
  }
  return "";
}

// ヒアリングシート全体のステータス（下書き／確定／アーカイブ）— 当面 UI 非表示。保存 API には initialStatus 由来の値をそのまま送る。
// function hearingSheetStatusLabel(s: "draft" | "finalized" | "archived"): string {
//   switch (s) {
//     case "draft":
//       return "下書き";
//     case "finalized":
//       return "確定";
//     case "archived":
//       return "アーカイブ";
//     default:
//       return s;
//   }
// }

function insertionIndexFromPointerYForStrings(
  list: string[],
  rowElements: HTMLElement[],
  clientY: number,
  dragId: string,
): number {
  if (list.length === 0) {
    return 0;
  }
  for (let i = 0; i < list.length; i++) {
    const el = rowElements[i];
    if (!el) {
      break;
    }
    const r = el.getBoundingClientRect();
    const mid = r.top + r.height / 2;
    if (clientY < mid) {
      return list.slice(0, i).filter((x) => x !== dragId).length;
    }
  }
  return list.filter((x) => x !== dragId).length;
}

function reorderHearingRows(rows: HearingSheetRow[], rowId: string, newIndex: number): HearingSheetRow[] {
  const without = rows.filter((r) => r.id !== rowId);
  const row = rows.find((r) => r.id === rowId);
  if (!row) {
    return rows;
  }
  const i = Math.max(0, Math.min(newIndex, without.length));
  return [...without.slice(0, i), row, ...without.slice(i)];
}

function formatDueYmdReadOnly(raw: string): string {
  const t = raw.trim();
  if (t === "") {
    return displayText(raw);
  }
  try {
    const d = parse(t, "yyyy-MM-dd", new Date());
    if (!Number.isNaN(d.getTime())) {
      return format(d, "yyyy-MM-dd");
    }
  } catch {
    /* ignore */
  }
  return displayText(raw);
}

function adviceKindLabel(kind: HearingAdviceSuggestion["kind"]): string {
  switch (kind) {
    case "empty_required":
      return "未入力";
    case "master_conflict":
      return "マスタと照合";
    default:
      return "その他";
  }
}

function adviceKindBadgeClass(kind: HearingAdviceSuggestion["kind"]): string {
  switch (kind) {
    case "empty_required":
      return "bg-amber-100 text-amber-900 dark:bg-amber-950/40 dark:text-amber-100";
    case "master_conflict":
      return "bg-rose-100 text-rose-900 dark:bg-rose-950/40 dark:text-rose-100";
    default:
      return "bg-slate-100 text-slate-800 dark:bg-slate-800/80 dark:text-slate-200";
  }
}

type ProjectHearingSheetClientProps = {
  projectId: number;
  project: PortalProjectDetail;
  /** 案件マスタに連動するテンプレ ID */
  resolvedTemplateId: HearingTemplateId;
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
  resolvedTemplateId,
  initialRows,
  initialStatus,
  canEdit,
}: ProjectHearingSheetClientProps) {
  const router = useRouter();
  const [rows, setRows] = useState<HearingSheetRow[]>(initialRows);
  const [status, setStatus] = useState(initialStatus);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [templateReloadConfirmOpen, setTemplateReloadConfirmOpen] = useState(false);
  const [adviceSuggestions, setAdviceSuggestions] = useState<HearingAdviceSuggestion[]>([]);
  const [adviceLoading, setAdviceLoading] = useState(false);
  const [adviceError, setAdviceError] = useState<string | null>(null);
  const [focusedAdviceRowId, setFocusedAdviceRowId] = useState<string | null>(null);
  const rowRefs = useRef<Map<string, HTMLTableRowElement>>(new Map());

  const sidebarMenuExpanded = useDashboardSidebarOpen();
  const hearingTableCols = useMemo(() => {
    if (sidebarMenuExpanded) {
      return {
        question: canEdit ? "29.85%" : "31.85%",
        answer: canEdit ? "24.5%" : "27.5%",
        duePct: "11.6%",
        dueMin: "calc(8rem + 2ch)" as const,
        statusPct: "6.05%",
        deletePct: "5%" as const,
      };
    }
    return {
      question: canEdit ? "29.85%" : "31.85%",
      answer: canEdit ? "23.7%" : "26.7%",
      duePct: "10.9%",
      dueMin: "calc(8rem + 2ch)" as const,
      statusPct: "7.55%",
      deletePct: "5%" as const,
    };
  }, [sidebarMenuExpanded, canEdit]);

  useEffect(() => {
    setRows(sanitizeHearingRowsFromExcelImport(initialRows));
    setStatus(initialStatus);
  }, [initialRows, initialStatus]);

  const baselineRows = useMemo(
    () => sanitizeHearingRowsFromExcelImport(initialRows),
    [initialRows],
  );

  const baselineFingerprint = useMemo(
    () => hearingSheetStateFingerprint(resolvedTemplateId, baselineRows, initialStatus),
    [resolvedTemplateId, baselineRows, initialStatus],
  );

  const currentFingerprint = useMemo(
    () => hearingSheetStateFingerprint(resolvedTemplateId, rows, status),
    [resolvedTemplateId, rows, status],
  );

  const isDirty = canEdit && currentFingerprint !== baselineFingerprint;

  const isDirtyRef = useRef(isDirty);
  const savingRef = useRef(saving);
  isDirtyRef.current = isDirty;
  savingRef.current = saving;

  const performSaveRef = useRef<() => Promise<boolean>>(async () => false);

  useEffect(() => {
    if (!isDirty || !canEdit) {
      return;
    }
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [isDirty, canEdit]);

  useEffect(() => {
    if (!canEdit) {
      return;
    }
    const id = window.setInterval(() => {
      if (!isDirtyRef.current || savingRef.current) {
        return;
      }
      void performSaveRef.current();
    }, AUTO_SAVE_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [canEdit]);

  const adviceRowIds = useMemo(
    () => collectAdviceRowIds(adviceSuggestions, rows),
    [adviceSuggestions, rows],
  );

  const setRowRef = useCallback((id: string) => (el: HTMLTableRowElement | null) => {
    if (el) {
      rowRefs.current.set(id, el);
    } else {
      rowRefs.current.delete(id);
    }
  }, []);

  const tbodyRef = useRef<HTMLTableSectionElement>(null);
  const rowsRef = useRef(rows);
  rowsRef.current = rows;

  const draggingRowIdRef = useRef<string | null>(null);
  const [draggingRowId, setDraggingRowId] = useState<string | null>(null);
  const [dropIndicatorIndex, setDropIndicatorIndex] = useState<number | null>(null);

  const onRowDragStart = useCallback((e: React.DragEvent, rowId: string) => {
    draggingRowIdRef.current = rowId;
    setDraggingRowId(rowId);
    setDropIndicatorIndex(null);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", rowId);
  }, []);

  const clearRowDrag = useCallback(() => {
    draggingRowIdRef.current = null;
    setDraggingRowId(null);
    setDropIndicatorIndex(null);
  }, []);

  const updateHearingDropIndicator = useCallback((clientY: number) => {
    const dragId = draggingRowIdRef.current;
    if (dragId === null || !tbodyRef.current) {
      return;
    }
    const list = rowsRef.current.map((r) => r.id);
    const rowEls = [...tbodyRef.current.querySelectorAll<HTMLElement>("tr[data-hearing-row]")];
    const idx = insertionIndexFromPointerYForStrings(list, rowEls, clientY, dragId);
    setDropIndicatorIndex((prev) => (prev === idx ? prev : idx));
  }, []);

  const onTbodyDragOver = useCallback(
    (e: React.DragEvent) => {
      if (draggingRowIdRef.current === null) {
        return;
      }
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      updateHearingDropIndicator(e.clientY);
    },
    [updateHearingDropIndicator],
  );

  const onTbodyDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const dragId = draggingRowIdRef.current;
      if (!dragId || !tbodyRef.current) {
        clearRowDrag();
        return;
      }
      const tbody = tbodyRef.current;
      setRows((prev) => {
        const list = prev.map((r) => r.id);
        const rowEls = [...tbody.querySelectorAll<HTMLElement>("tr[data-hearing-row]")];
        const idx = insertionIndexFromPointerYForStrings(list, rowEls, e.clientY, dragId);
        return reorderHearingRows(prev, dragId, idx);
      });
      clearRowDrag();
    },
    [clearRowDrag],
  );

  const fetchAdvice = useCallback(async () => {
    if (rows.length === 0) {
      return;
    }
    setAdviceLoading(true);
    setAdviceError(null);
    try {
      const res = await fetch("/api/hearing-sheet/advice", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          project: projectToAdvicePayload(project),
          template_id: resolvedTemplateId,
          items: rows.map((r) => ({
            id: r.id,
            category: r.category,
            heading: r.heading,
            question: r.question,
            answer: r.answer,
            assignee: r.assignee,
            due: r.due,
            row_status: r.row_status,
          })),
        }),
      });
      const text = await res.text();
      let msg = "アドバイスの取得に失敗しました。";
      try {
        const j = JSON.parse(text) as { success?: boolean; message?: string; suggestions?: HearingAdviceSuggestion[] };
        if (typeof j.message === "string" && j.message.trim() !== "") {
          msg = j.message;
        }
        if (!res.ok) {
          setAdviceError(msg);
          setAdviceSuggestions([]);
          return;
        }
        if (j.success !== true || !Array.isArray(j.suggestions)) {
          setAdviceError(msg);
          setAdviceSuggestions([]);
          return;
        }
        setAdviceSuggestions(j.suggestions);
        setFocusedAdviceRowId(null);
      } catch {
        setAdviceError(msg);
        setAdviceSuggestions([]);
      }
    } catch {
      setAdviceError("アドバイスの取得に失敗しました。");
      setAdviceSuggestions([]);
    } finally {
      setAdviceLoading(false);
    }
  }, [project, resolvedTemplateId, rows]);

  const focusAdviceSuggestion = useCallback(
    (s: HearingAdviceSuggestion) => {
      const id = resolveAdviceToRowId(s, rows);
      if (!id) {
        return;
      }
      setFocusedAdviceRowId(id);
      const el = rowRefs.current.get(id);
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
    },
    [rows],
  );

  const updateRow = useCallback((id: string, patch: Partial<HearingSheetRow>) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }, []);

  const removeRow = useCallback((id: string) => {
    setRows((prev) => prev.filter((r) => r.id !== id));
  }, []);

  const addRow = useCallback(() => {
    setRows((prev) => [...prev, createEmptyHearingRow()]);
  }, []);

  const sortRowsByCategoryCodeOrder = useCallback(() => {
    setRows((prev) => {
      const indexed = prev.map((r, i) => ({ r, i }));
      indexed.sort((a, b) => {
        const ca = a.r.category;
        const cb = b.r.category;
        if (ca < cb) {
          return -1;
        }
        if (ca > cb) {
          return 1;
        }
        return a.i - b.i;
      });
      return indexed.map((x) => x.r);
    });
  }, []);

  const applyTemplateReload = useCallback(() => {
    const base = getDefaultRowsForTemplate(resolvedTemplateId);
    setRows(
      base.map((r, i) => ({
        ...r,
        id: `${r.id}-${Date.now()}-${i}`,
      })),
    );
  }, [resolvedTemplateId]);

  const requestLoadTemplate = useCallback(() => {
    if (!canEdit) {
      return;
    }
    if (hearingRowsHaveAnyContent(rows)) {
      setTemplateReloadConfirmOpen(true);
      return;
    }
    applyTemplateReload();
  }, [canEdit, rows, applyTemplateReload]);

  const confirmLoadTemplate = useCallback(() => {
    setTemplateReloadConfirmOpen(false);
    applyTemplateReload();
  }, [applyTemplateReload]);

  const performSave = useCallback(async (): Promise<boolean> => {
    if (!canEdit) {
      return false;
    }
    setSaving(true);
    setError(null);
    try {
      const body_json = hearingBodyFromRows(resolvedTemplateId, rows);
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
        return false;
      }
      router.refresh();
      return true;
    } catch {
      setError("保存に失敗しました。");
      return false;
    } finally {
      setSaving(false);
    }
  }, [canEdit, projectId, resolvedTemplateId, rows, status, router]);

  performSaveRef.current = performSave;

  const save = useCallback(async () => {
    await performSave();
  }, [performSave]);

  const masterPane = (
    <Card className="overflow-hidden shadow-sm">
      <CardContent className="space-y-4 p-4 sm:p-5">
        <h2 className="pm-section-heading">Project基本情報</h2>
        <p className="text-xs text-[var(--muted)]">
          編集は詳細画面から行えます。{" "}
          <Link
            href={`/project-list/${projectId}`}
            prefetch
            className="text-[color:color-mix(in_srgb,var(--accent)_82%,var(--foreground)_18%)] underline-offset-2 hover:underline"
          >
            詳細へ
          </Link>
        </p>
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

  const advicePane = (
    <Card className="overflow-hidden shadow-sm">
      <CardContent className="space-y-3 p-4 sm:p-5">
        <h2 className="pm-section-heading">更新アドバイス（Gemini）</h2>
        <p className="text-xs leading-relaxed text-[var(--muted)]">
          Project基本情報とヒアリングシートに記載された内容をGeminiに送信し、重要な個所やProjectと矛盾しそうな箇所をアドバイスしてくれます。
          <br />
          回答内容を選択すると対象データ行へ遷移します。
        </p>
        <Button
          type="button"
          variant="default"
          size="sm"
          disabled={adviceLoading || rows.length === 0}
          onClick={() => void fetchAdvice()}
        >
          {adviceLoading ? "取得中…" : "アドバイスを取得"}
        </Button>
        {adviceError ? (
          <p className="text-sm text-red-600 dark:text-red-400" role="alert">
            {adviceError}
          </p>
        ) : null}
        {adviceSuggestions.length === 0 && !adviceLoading && !adviceError ? (
          <p className="text-xs text-[var(--muted)]">まだ取得していません。上のボタンで実行してください。</p>
        ) : null}
        {adviceSuggestions.length > 0 ? (
          <ul className="max-h-[min(24rem,50vh)] space-y-2 overflow-y-auto pr-1">
            {adviceSuggestions.map((s, i) => {
              const targetId = resolveAdviceToRowId(s, rows);
              const targetLine =
                s.heading?.trim() !== ""
                  ? `見出し: ${s.heading!.trim()}`
                  : s.row_id?.trim() !== ""
                    ? `行 ID: ${s.row_id!.trim()}`
                    : null;
              return (
                <li key={`${i}-${s.message.slice(0, 24)}`}>
                  <button
                    type="button"
                    disabled={!targetId}
                    onClick={() => focusAdviceSuggestion(s)}
                    className={cn(
                      "w-full rounded-lg border border-[color:color-mix(in_srgb,var(--border)_88%,transparent)] bg-[color:color-mix(in_srgb,var(--surface)_98%,transparent)] p-2.5 text-left text-sm transition hover:bg-[color:color-mix(in_srgb,var(--surface)_92%,transparent)]",
                      !targetId && "cursor-not-allowed opacity-60",
                    )}
                  >
                    <div className="mb-1 flex flex-wrap items-center gap-1.5">
                      <span
                        className={cn(
                          "rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide",
                          adviceKindBadgeClass(s.kind),
                        )}
                      >
                        {adviceKindLabel(s.kind)}
                      </span>
                    </div>
                    <p className="text-[13px] leading-snug text-[var(--foreground)]">{s.message}</p>
                    {targetLine ? (
                      <p className="mt-1 text-[11px] text-[var(--muted)]">{targetLine}</p>
                    ) : (
                      <p className="mt-1 text-[11px] text-amber-700 dark:text-amber-300">
                        行に紐づけられませんでした（見出し・行 ID を確認してください）
                      </p>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        ) : null}
      </CardContent>
    </Card>
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-5">
      <section className="surface-card pm-page-hero relative shrink-0 overflow-hidden px-5">
        <div className="pointer-events-none absolute -top-10 right-0 h-36 w-36 rounded-full bg-[color:color-mix(in_srgb,var(--accent)_22%,transparent)] blur-3xl" />
        <div className="relative flex h-full min-h-0 items-center justify-between gap-3">
          <div className="flex min-h-0 min-w-0 flex-1 items-start gap-3">
            <Link
              href={`/project-list/${projectId}`}
              prefetch
              onClick={(e) => {
                if (isDirty && !window.confirm(UNSAVED_LEAVE_MESSAGE)) {
                  e.preventDefault();
                }
              }}
              className="shrink-0 pt-0.5 text-sm text-[color:color-mix(in_srgb,var(--accent)_82%,var(--foreground)_18%)] hover:underline"
            >
              ←戻る
            </Link>
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-xl font-semibold leading-tight tracking-tight text-[var(--foreground)] md:text-2xl">
                {project.name}
              </h1>
              <p className="mt-1 min-w-0 truncate text-sm leading-relaxed text-[var(--foreground)]">ヒアリングシート</p>
              {isDirty ? (
                <p className="mt-1 text-xs text-amber-700 dark:text-amber-300" role="status">
                  変更が保存されていません。
                </p>
              ) : null}
            </div>
          </div>
          <div className="flex shrink-0 flex-nowrap items-center gap-2 sm:gap-3">
            {/*
            <div className="flex items-center gap-2">
              <Label
                htmlFor="pm-hearing-status"
                className="shrink-0 whitespace-nowrap text-xs font-medium text-[var(--muted)]"
              >
                ステータス
              </Label>
              <Select
                disabled={!canEdit}
                value={status}
                onValueChange={(v) => setStatus(v as typeof status)}
              >
                <SelectTrigger
                  id="pm-hearing-status"
                  draggable={false}
                  className="h-9 min-w-[9rem] text-sm sm:min-w-[10rem]"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">{hearingSheetStatusLabel("draft")}</SelectItem>
                  <SelectItem value="finalized">{hearingSheetStatusLabel("finalized")}</SelectItem>
                  <SelectItem value="archived">{hearingSheetStatusLabel("archived")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            */}
            {canEdit ? (
              <Button
                type="button"
                variant="accent"
                size="sm"
                className="shrink-0 self-center rounded-lg"
                disabled={saving}
                onClick={() => void save()}
              >
                {saving ? "保存中…" : "保存"}
              </Button>
            ) : null}
          </div>
        </div>
      </section>
      {error ? (
        <p className="text-sm text-red-600 dark:text-red-400" role="alert">
          {error}
        </p>
      ) : null}

      <div className={projectPageLgMainSidebarGridClassName}>
        <Card className="min-w-0 overflow-hidden shadow-sm">
          <CardContent className="space-y-3 p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="pm-section-heading mb-0">確認事項</h2>
              {canEdit ? (
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="default" size="sm" onClick={sortRowsByCategoryCodeOrder}>
                    分類で並べ替え（文字コード順）
                  </Button>
                  <Button type="button" variant="default" size="sm" onClick={() => setImportDialogOpen(true)}>
                    Excel を取り込む
                  </Button>
                  <Button type="button" variant="default" size="sm" onClick={requestLoadTemplate}>
                    テンプレを読込
                  </Button>
                </div>
              ) : null}
            </div>

            <div className="overflow-x-auto rounded-lg border border-[color:color-mix(in_srgb,var(--border)_88%,transparent)]">
              <table className="w-full min-w-0 table-fixed border-collapse text-left text-sm">
                <colgroup>
                  {canEdit ? <col style={{ width: "2.25rem" }} /> : null}
                  <col style={{ width: "6%" }} />
                  <col style={{ width: "11%" }} />
                  <col style={{ width: hearingTableCols.question }} />
                  <col style={{ width: hearingTableCols.answer }} />
                  <col style={{ width: "6%" }} />
                  <col style={{ width: hearingTableCols.duePct, minWidth: hearingTableCols.dueMin }} />
                  <col style={{ width: hearingTableCols.statusPct }} />
                  {canEdit ? <col style={{ width: hearingTableCols.deletePct }} /> : null}
                </colgroup>
                <thead>
                  <tr className="border-b border-[color:color-mix(in_srgb,var(--border)_88%,transparent)] bg-[color:color-mix(in_srgb,var(--surface)_96%,transparent)]">
                    {canEdit ? (
                      <th className={cn(hearingSheetThClass, "w-9 max-w-[2.25rem] px-0.5")} scope="col">
                        <span className="sr-only">行の並び替え</span>
                      </th>
                    ) : null}
                    <th className={hearingSheetThClass}>分類</th>
                    <th className={hearingSheetThClass}>見出し</th>
                    <th className={hearingSheetThClass}>確認事項</th>
                    <th className={hearingSheetThClass}>回答</th>
                    <th className={hearingSheetThClass}>担当</th>
                    <th className={hearingSheetThClass}>期限</th>
                    <th className={hearingSheetThClass}>状況</th>
                    {canEdit ? <th className={hearingSheetThActionClass} /> : null}
                  </tr>
                </thead>
                <tbody
                  ref={tbodyRef}
                  onDragOver={canEdit ? onTbodyDragOver : undefined}
                  onDrop={canEdit ? onTbodyDrop : undefined}
                >
                  {rows.length === 0 ? (
                    <>
                      <tr>
                        <td colSpan={canEdit ? 9 : 7} className="px-1 py-8 text-center text-sm text-[var(--muted)]">
                          行がありません。下の「行を追加」、「Excel を取り込む」またはテンプレを読込で入力してください。
                        </td>
                      </tr>
                      {canEdit ? (
                        <tr className="border-b border-[color:color-mix(in_srgb,var(--border)_70%,transparent)] bg-[color:color-mix(in_srgb,var(--surface)_98%,transparent)]">
                          <td colSpan={9} className="px-1 py-2">
                            <Button type="button" variant="default" size="sm" onClick={addRow}>
                              行を追加
                            </Button>
                          </td>
                        </tr>
                      ) : null}
                    </>
                  ) : (
                    rows.map((row, rowIndex) => {
                      const isLastRow = rowIndex === rows.length - 1;
                      const insertAfter =
                        dropIndicatorIndex !== null &&
                        isLastRow &&
                        (dropIndicatorIndex === rows.length || dropIndicatorIndex === rows.length - 1);
                      const insertBefore =
                        dropIndicatorIndex !== null &&
                        dropIndicatorIndex === rowIndex &&
                        !insertAfter;
                      return (
                      <tr
                        key={row.id}
                        ref={setRowRef(row.id)}
                        data-hearing-row
                        draggable={canEdit}
                        onDragStart={canEdit ? (e) => onRowDragStart(e, row.id) : undefined}
                        onDragEnd={canEdit ? clearRowDrag : undefined}
                        className={cn(
                          "relative border-b border-[color:color-mix(in_srgb,var(--border)_70%,transparent)] align-top transition-colors",
                          "hover:bg-[color:color-mix(in_srgb,var(--foreground)_5%,transparent)]",
                          adviceRowIds.has(row.id) &&
                            "bg-[color:color-mix(in_srgb,var(--accent)_10%,transparent)] dark:bg-[color:color-mix(in_srgb,var(--accent)_14%,transparent)]",
                          focusedAdviceRowId === row.id &&
                            "ring-2 ring-[color:color-mix(in_srgb,var(--accent)_55%,transparent)] ring-inset",
                          draggingRowId === row.id && "opacity-60",
                          insertBefore &&
                            "before:pointer-events-none before:absolute before:inset-x-1 before:top-0 before:z-[1] before:h-[3px] before:-translate-y-1/2 before:rounded-full before:bg-[color:color-mix(in_srgb,var(--accent)_90%,transparent)] before:shadow-[0_0_0_1px_color-mix(in_srgb,var(--accent)_30%,transparent)]",
                          insertAfter &&
                            "after:pointer-events-none after:absolute after:inset-x-1 after:bottom-0 after:z-[1] after:h-[3px] after:translate-y-1/2 after:rounded-full after:bg-[color:color-mix(in_srgb,var(--accent)_90%,transparent)] after:shadow-[0_0_0_1px_color-mix(in_srgb,var(--accent)_30%,transparent)]",
                        )}
                      >
                        {canEdit ? (
                          <td className={cn(hearingSheetTdClass, "w-9 max-w-[2.25rem] px-0.5 align-middle")}>
                            <span
                              className="inline-flex cursor-grab touch-none select-none items-center justify-center rounded px-0.5 text-[color:color-mix(in_srgb,var(--muted)_95%,transparent)] active:cursor-grabbing"
                              title="ドラッグして並び替え"
                            >
                              <GripVertical className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
                            </span>
                          </td>
                        ) : null}
                        <td className={hearingSheetTdClass}>
                          {canEdit ? (
                            <HearingAutoTextarea
                              value={row.category}
                              onChange={(e) => updateRow(row.id, { category: e.target.value })}
                            />
                          ) : (
                            <span className="block whitespace-pre-wrap px-1 py-1.5 text-xs">{displayText(row.category)}</span>
                          )}
                        </td>
                        <td className={hearingSheetTdClass}>
                          {canEdit ? (
                            <HearingAutoTextarea
                              value={row.heading}
                              onChange={(e) => updateRow(row.id, { heading: e.target.value })}
                            />
                          ) : (
                            <span className="block whitespace-pre-wrap px-1 py-1.5 text-xs">{displayText(row.heading)}</span>
                          )}
                        </td>
                        <td className={hearingSheetTdClass}>
                          {canEdit ? (
                            <HearingAutoTextarea
                              value={row.question}
                              onChange={(e) => updateRow(row.id, { question: e.target.value })}
                            />
                          ) : (
                            <span className="block whitespace-pre-wrap px-1 py-1 text-xs">{displayText(row.question)}</span>
                          )}
                        </td>
                        <td className={hearingSheetTdClass}>
                          {canEdit ? (
                            <HearingAutoTextarea
                              value={row.answer}
                              onChange={(e) => updateRow(row.id, { answer: e.target.value })}
                            />
                          ) : (
                            <span className="block whitespace-pre-wrap px-1 py-1 text-xs">{displayText(row.answer)}</span>
                          )}
                        </td>
                        <td className={hearingSheetTdClass}>
                          {canEdit ? (
                            <HearingAutoTextarea
                              value={row.assignee}
                              onChange={(e) => updateRow(row.id, { assignee: e.target.value })}
                            />
                          ) : (
                            <span className="block whitespace-pre-wrap px-1 py-1.5 text-xs">{displayText(row.assignee)}</span>
                          )}
                        </td>
                        <td className={cn(hearingSheetTdClass, "min-w-0")}>
                          {canEdit ? (
                            <ThemeDateField
                              displayVariant="iso"
                              label={<span className="sr-only">期限</span>}
                              value={row.due}
                              onChange={(next) => updateRow(row.id, { due: next })}
                              className="w-full min-w-0 [&_label]:sr-only [&_button]:mt-0 [&_button]:min-w-0 [&_button]:text-xs"
                            />
                          ) : (
                            <span className="block whitespace-nowrap px-1 py-1.5 font-mono text-xs tabular-nums">
                              {formatDueYmdReadOnly(row.due)}
                            </span>
                          )}
                        </td>
                        <td className={cn(hearingSheetTdClass, "min-w-0")}>
                          {canEdit ? (
                            <Select
                              value={rowStatusSelectValue(row.row_status) === "" ? "__empty__" : rowStatusSelectValue(row.row_status)}
                              onValueChange={(v) =>
                                updateRow(row.id, {
                                  row_status: (v === "__empty__" ? "" : v) as "" | "確認中" | "完了",
                                })
                              }
                            >
                              <SelectTrigger
                                aria-label="状況"
                                draggable={false}
                                className="h-8 min-h-8 w-full py-1.5 pl-2 text-xs leading-tight"
                              >
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__empty__">—</SelectItem>
                                <SelectItem value="確認中">確認中</SelectItem>
                                <SelectItem value="完了">完了</SelectItem>
                              </SelectContent>
                            </Select>
                          ) : (
                            <span className="block whitespace-pre-wrap px-1 py-1.5 text-xs">{displayText(row.row_status)}</span>
                          )}
                        </td>
                        {canEdit ? (
                          <td className={hearingSheetTdActionClass}>
                            <div className="flex min-h-[2rem] items-center justify-center">
                              <Button
                                type="button"
                                variant="destructive"
                                size="sm"
                                draggable={false}
                                onClick={() => removeRow(row.id)}
                              >
                                Delete
                              </Button>
                            </div>
                          </td>
                        ) : null}
                      </tr>
                      );
                    })
                  )}
                  {rows.length > 0 && canEdit ? (
                    <tr className="border-b border-[color:color-mix(in_srgb,var(--border)_70%,transparent)] bg-[color:color-mix(in_srgb,var(--surface)_98%,transparent)]">
                      <td colSpan={9} className="px-1 py-2">
                        <Button type="button" variant="default" size="sm" onClick={addRow}>
                          行を追加
                        </Button>
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        <aside className="mt-6 flex min-w-0 flex-col gap-4 lg:mt-0 lg:sticky lg:top-4 lg:self-start">
          {masterPane}
          {advicePane}
        </aside>
      </div>

      <HearingImportExcelDialog
        open={importDialogOpen}
        onOpenChange={setImportDialogOpen}
        resolvedTemplateId={resolvedTemplateId}
        currentRows={rows}
        canEdit={canEdit}
        onApply={(next) => setRows(next)}
      />

      <Dialog open={templateReloadConfirmOpen} onOpenChange={setTemplateReloadConfirmOpen}>
        <DialogContent
          className={cn(
            "max-w-md border-red-500/40 bg-[color:color-mix(in_srgb,color-mix(in_srgb,var(--surface)_92%,black_8%)_94%,rgb(239_68_68)_6%)] text-[var(--foreground)]",
            "shadow-[inset_0_1px_0_0_rgba(239,68,68,0.2)]",
          )}
          aria-describedby={undefined}
        >
          <DialogHeader>
            <DialogTitle className="text-red-500 dark:text-red-400">テンプレを読込</DialogTitle>
          </DialogHeader>
          <p className="text-sm leading-relaxed text-[var(--foreground)]">
            すでに入力されている値はすべてリセットされます。続行しますか？
          </p>
          <div className="mt-6 flex flex-wrap justify-end gap-2">
            <Button type="button" variant="default" size="sm" onClick={() => setTemplateReloadConfirmOpen(false)}>
              キャンセル
            </Button>
            <Button type="button" variant="accent" size="sm" onClick={confirmLoadTemplate}>
              はい
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
