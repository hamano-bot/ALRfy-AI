"use client";

import { useDashboardSidebarOpen } from "@/app/components/DashboardSidebarContext";
import { ThemeDateField } from "@/app/components/ThemeDateField";
import { Button } from "@/app/components/ui/button";
import { Card, CardContent } from "@/app/components/ui/card";
import { Input } from "@/app/components/ui/input";
import { Label } from "@/app/components/ui/label";
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
import { createEmptyHearingRow, hearingBodyFromRows, normalizeHearingRows } from "@/lib/hearing-sheet-body-utils";
import type { HearingRowRedmineTicket, HearingSheetRow } from "@/lib/hearing-sheet-types";
import { getDefaultRowsForTemplate } from "@/lib/hearing-sheet-template-rows";
import { type HearingTemplateId } from "@/lib/hearing-sheet-template-matrix";
import { formatProjectCategoryLabelJa, formatSiteTypeLabel } from "@/lib/portal-my-projects";
import type { PortalProjectDetail } from "@/lib/portal-project";
import { downloadHearingRowsExcel } from "@/lib/hearing-excel-export";
import { hearingFieldIds } from "@/lib/hearing-form-ids";
import { hearingPrintPreviewChannelName } from "@/lib/hearing-print-preview-channel";
import { buildRedmineIssueUrl, buildRedmineProjectUrl } from "@/lib/redmine-url";
import { UNSAVED_LEAVE_CONFIRM_MESSAGE } from "@/lib/unsaved-navigation";
import { useEditHistoryState } from "@/lib/use-edit-history-state";
import { trashDeleteIconButtonClassName } from "@/lib/trash-delete-icon-button-class";
import { cn } from "@/lib/utils";
import { formatDateDisplayYmd } from "@/lib/format-date-display";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, ExternalLink, FileSpreadsheet, GripVertical, Pencil, Redo2, Trash2, Undo2 } from "lucide-react";
import {
  type MouseEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { HearingAssigneeField } from "./HearingAssigneeField";
import { HearingAutoCategoryDialog } from "./HearingAutoCategoryDialog";
import { HearingAutoTextarea } from "./HearingAutoTextarea";
import { HearingImportExcelDialog } from "./HearingImportExcelDialog";
import { HearingUrlClipRow, hearingInlineIconButtonClassName } from "./HearingUrlClipRow";
import { GeminiMarkIcon } from "./GeminiMarkIcon";
import { HearingRedmineIssueDialog } from "./HearingRedmineIssueDialog";

/** overflow-visible: 子の textarea 自動高さ＋クリップ行で内容が欠けないようにする */
const hearingSheetTdClass = "overflow-visible px-1 py-1.5 align-top";
const hearingSheetTdActionClass =
  "box-border py-1.5 pl-2 pr-2 align-middle min-w-[7.75rem] max-w-[10rem]";
const hearingSheetThClass = "px-1 py-2 font-medium text-[var(--muted)]";
const hearingSheetThActionClass = "py-2 pl-2 pr-2 font-medium text-[var(--muted)] min-w-[7.75rem]";
/** 画面スクロール時にヘッダ行を固定（祖先に overflow:hidden/auto があると効かないため Card / 表ラッパーは overflow-visible） */
const hearingSheetStickyTh =
  "sticky top-0 z-[30] bg-[var(--surface)] shadow-[0_1px_0_0_color-mix(in_srgb,var(--border)_88%,transparent)]";

const AUTO_SAVE_INTERVAL_MS = 120_000;

const HEARING_RIGHT_SIDEBAR_COLLAPSED_KEY = "pm-hearing-right-sidebar-collapsed";

function hearingSheetStateFingerprint(
  templateId: HearingTemplateId,
  rows: HearingSheetRow[],
  sheetStatus: "draft" | "finalized" | "archived",
): string {
  return JSON.stringify({ templateId, status: sheetStatus, rows });
}

function hearingRowsEquals(a: HearingSheetRow[], b: HearingSheetRow[]): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
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

function hearingRedmineTicketHref(
  ticket: HearingRowRedmineTicket,
  project: PortalProjectDetail,
  userRedmineBase: string | null,
): string | null {
  const id = ticket.issue_id;
  if (!Number.isFinite(id) || id <= 0) {
    return null;
  }
  let base: string | null =
    ticket.base_url !== undefined && ticket.base_url !== null && ticket.base_url.trim() !== ""
      ? ticket.base_url.trim().replace(/\/+$/, "")
      : null;
  if (!base && ticket.project_id) {
    const link = project.redmine_links.find((l) => l.redmine_project_id === ticket.project_id);
    if (link?.redmine_base_url && link.redmine_base_url.trim() !== "") {
      base = link.redmine_base_url.trim().replace(/\/+$/, "");
    }
  }
  if (!base) {
    const first = project.redmine_links[0];
    if (first?.redmine_base_url && first.redmine_base_url.trim() !== "") {
      base = first.redmine_base_url.trim().replace(/\/+$/, "");
    }
  }
  if (!base && userRedmineBase && userRedmineBase.trim() !== "") {
    base = userRedmineBase.trim().replace(/\/+$/, "");
  }
  return buildRedmineIssueUrl(base, id);
}

function formatDueYmdReadOnly(raw: string): string {
  return formatDateDisplayYmd(raw);
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
  const rowsHistory = useEditHistoryState<HearingSheetRow[]>(initialRows, {
    equals: hearingRowsEquals,
    maxSize: 300,
  });
  const rows = rowsHistory.present;
  const setRows = rowsHistory.setPresent;
  const [status, setStatus] = useState(initialStatus);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [autoCategoryDialogOpen, setAutoCategoryDialogOpen] = useState(false);
  const [templateReloadConfirmOpen, setTemplateReloadConfirmOpen] = useState(false);
  const [adviceSuggestions, setAdviceSuggestions] = useState<HearingAdviceSuggestion[]>([]);
  const [adviceLoading, setAdviceLoading] = useState(false);
  const [adviceError, setAdviceError] = useState<string | null>(null);
  const [focusedAdviceRowId, setFocusedAdviceRowId] = useState<string | null>(null);
  /** 右パネルのアドバイス一覧でクリック選択中のカード（行ハイライトとは別） */
  const [selectedAdviceIndex, setSelectedAdviceIndex] = useState<number | null>(null);
  const rowRefs = useRef<Map<string, HTMLTableRowElement>>(new Map());
  const [isLg, setIsLg] = useState(false);
  const [rightSidebarCollapsed, setRightSidebarCollapsed] = useState(false);
  /** 折りたたみからシェブロンで展開したときだけ true（初回表示・他画面からの遷移ではフェードさせない） */
  const [rightAsideExpandEntrance, setRightAsideExpandEntrance] = useState(false);
  const [hideCompletedRows, setHideCompletedRows] = useState(false);
  const [redmineDialogRowId, setRedmineDialogRowId] = useState<string | null>(null);
  const [deleteConfirmRowId, setDeleteConfirmRowId] = useState<string | null>(null);
  const [issueEditTarget, setIssueEditTarget] = useState<{ rowId: string; index: number } | null>(null);
  const [issueEditDraft, setIssueEditDraft] = useState("");
  const [userRedmineBase, setUserRedmineBase] = useState<string | null>(null);
  const previewChannelRef = useRef<BroadcastChannel | null>(null);

  const sidebarMenuExpanded = useDashboardSidebarOpen();
  /** lg でヒアリング右パネル展開時: 担当は「上の行と同じ」幅に寄せ、期限は全角2文字分だけ狭める */
  const rightHearingPanelOpen = isLg && !rightSidebarCollapsed;
  const hearingTableCols = useMemo(() => {
    const dueMin = rightHearingPanelOpen ? ("calc(8rem + 2ch - 2em)" as const) : ("calc(8rem + 2ch)" as const);
    const assigneeWidth = rightHearingPanelOpen ? ("7.25rem" as const) : ("6%" as const);
    if (sidebarMenuExpanded) {
      return {
        question: canEdit ? "27.85%" : "31.85%",
        answer: canEdit ? "22.5%" : "27.5%",
        assigneeWidth,
        duePct: "11.6%",
        dueMin,
        statusPct: "6.05%",
        deletePct: "9%" as const,
      };
    }
    return {
      question: canEdit ? "27.85%" : "31.85%",
      answer: canEdit ? "21.7%" : "26.7%",
      assigneeWidth,
      duePct: "10.9%",
      dueMin,
      statusPct: "7.55%",
      deletePct: "9%" as const,
    };
  }, [sidebarMenuExpanded, canEdit, rightHearingPanelOpen]);

  useLayoutEffect(() => {
    try {
      if (localStorage.getItem(HEARING_RIGHT_SIDEBAR_COLLAPSED_KEY) === "1") {
        setRightSidebarCollapsed(true);
      }
    } catch {
      /* ignore */
    }
    const mq = window.matchMedia("(min-width: 1024px)");
    const apply = () => setIsLg(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  useEffect(() => {
    rowsHistory.reset(sanitizeHearingRowsFromExcelImport(initialRows));
    setStatus(initialStatus);
  }, [rowsHistory.reset, initialRows, initialStatus]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/portal/me", { credentials: "include", cache: "no-store" });
        const data = (await res.json()) as { redmine?: { base_url?: string | null } };
        if (cancelled) {
          return;
        }
        const b = data.redmine?.base_url;
        setUserRedmineBase(typeof b === "string" && b.trim() !== "" ? b.trim().replace(/\/+$/, "") : null);
      } catch {
        if (!cancelled) {
          setUserRedmineBase(null);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

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

  const persistSidebarCollapsed = useCallback((collapsed: boolean) => {
    setRightSidebarCollapsed(collapsed);
    try {
      localStorage.setItem(HEARING_RIGHT_SIDEBAR_COLLAPSED_KEY, collapsed ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, []);

  const toggleRightSidebarCollapsed = useCallback(() => {
    if (rightSidebarCollapsed) {
      setRightAsideExpandEntrance(true);
    }
    persistSidebarCollapsed(!rightSidebarCollapsed);
  }, [rightSidebarCollapsed, persistSidebarCollapsed]);

  const onProjectDetailNavigate = useCallback(
    (e: MouseEvent<HTMLAnchorElement>) => {
      if (isDirty && !window.confirm(UNSAVED_LEAVE_CONFIRM_MESSAGE)) {
        e.preventDefault();
      }
    },
    [isDirty],
  );

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

  useEffect(() => {
    if (!canEdit) {
      return;
    }
    const onKeyDown = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) {
        return;
      }
      const key = e.key.toLowerCase();
      if (key === "z" && e.shiftKey) {
        if (rowsHistory.canRedo) {
          e.preventDefault();
          rowsHistory.redo();
        }
        return;
      }
      if (key === "z") {
        if (rowsHistory.canUndo) {
          e.preventDefault();
          rowsHistory.undo();
        }
        return;
      }
      if (key === "y" && rowsHistory.canRedo) {
        e.preventDefault();
        rowsHistory.redo();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [canEdit, rowsHistory]);

  const adviceRowIds = useMemo(
    () => collectAdviceRowIds(adviceSuggestions, rows),
    [adviceSuggestions, rows],
  );

  const visibleRows = useMemo(() => {
    if (!hideCompletedRows) {
      return rows;
    }
    return rows.filter((r) => r.row_status.trim() !== "完了");
  }, [rows, hideCompletedRows]);

  useEffect(() => {
    const channelName = hearingPrintPreviewChannelName(projectId);
    const channel = new BroadcastChannel(channelName);
    previewChannelRef.current = channel;
    return () => {
      previewChannelRef.current = null;
      channel.close();
    };
  }, [projectId]);

  useEffect(() => {
    previewChannelRef.current?.postMessage({
      rows,
      hideCompletedRows,
      projectName: project.name,
    });
  }, [rows, hideCompletedRows, project.name]);

  /** 担当サジェスト用: シート内の担当の出現回数降順（空除外） */
  const assigneeSuggestions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of rows) {
      const t = r.assignee.trim();
      if (t) {
        counts.set(t, (counts.get(t) ?? 0) + 1);
      }
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "ja"))
      .map(([s]) => s);
  }, [rows]);

  const dragRowsEnabled = canEdit && !hideCompletedRows;

  const openPreview = useCallback(() => {
    const qs = new URLSearchParams();
    if (hideCompletedRows) {
      qs.set("hide_completed", "1");
    }
    const suffix = qs.toString();
    window.open(
      `/project-list/${projectId}/hearing/print-preview${suffix ? `?${suffix}` : ""}`,
      "_blank",
      "noopener,noreferrer",
    );
  }, [projectId, hideCompletedRows]);

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
          setSelectedAdviceIndex(null);
          return;
        }
        if (j.success !== true || !Array.isArray(j.suggestions)) {
          setAdviceError(msg);
          setAdviceSuggestions([]);
          setSelectedAdviceIndex(null);
          return;
        }
        setAdviceSuggestions(j.suggestions);
        setFocusedAdviceRowId(null);
        setSelectedAdviceIndex(null);
      } catch {
        setAdviceError(msg);
        setAdviceSuggestions([]);
        setSelectedAdviceIndex(null);
      }
    } catch {
      setAdviceError("アドバイスの取得に失敗しました。");
      setAdviceSuggestions([]);
      setSelectedAdviceIndex(null);
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

  const onAdviceCardClick = useCallback(
    (index: number, s: HearingAdviceSuggestion) => {
      setSelectedAdviceIndex(index);
      focusAdviceSuggestion(s);
    },
    [focusAdviceSuggestion],
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

  const saveRows = useCallback(
    async (rowsToSave: HearingSheetRow[]): Promise<boolean> => {
      if (!canEdit) {
        return false;
      }
      setSaving(true);
      setError(null);
      try {
        const body_json = hearingBodyFromRows(resolvedTemplateId, rowsToSave);
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
        try {
          const j = JSON.parse(text) as {
            success?: boolean;
            hearing_sheet?: { body_json?: unknown; status?: string };
          };
          if (j.success && j.hearing_sheet?.body_json !== undefined && j.hearing_sheet.body_json !== null) {
            rowsHistory.reset(sanitizeHearingRowsFromExcelImport(normalizeHearingRows(j.hearing_sheet.body_json)));
            const st = j.hearing_sheet.status;
            if (st === "draft" || st === "finalized" || st === "archived") {
              setStatus(st);
            }
          }
        } catch {
          /* ignore */
        }
        router.refresh();
        return true;
      } catch {
        setError("保存に失敗しました。");
        return false;
      } finally {
        setSaving(false);
      }
    },
    [canEdit, projectId, resolvedTemplateId, status, router, rowsHistory],
  );

  const performSave = useCallback(async (): Promise<boolean> => {
    return saveRows(rows);
  }, [saveRows, rows]);

  performSaveRef.current = performSave;

  const save = useCallback(async () => {
    await performSave();
  }, [performSave]);

  const handleRedmineIssueCreated = useCallback(
    async (rowId: string, ticket: HearingRowRedmineTicket) => {
      const nextRows = rows.map((r) =>
        r.id === rowId ? { ...r, redmine_tickets: [...(r.redmine_tickets ?? []), ticket] } : r,
      );
      setRows(nextRows);
      return saveRows(nextRows);
    },
    [rows, saveRows],
  );

  const removeRedmineTicketAt = useCallback(
    (rowId: string, index: number) => {
      const nextRows = rows.map((r) => {
        if (r.id !== rowId) {
          return r;
        }
        const list = [...(r.redmine_tickets ?? [])];
        if (index < 0 || index >= list.length) {
          return r;
        }
        list.splice(index, 1);
        return { ...r, redmine_tickets: list };
      });
      setRows(nextRows);
      void saveRows(nextRows);
    },
    [rows, saveRows],
  );

  const masterPane = (
    <Card className="overflow-hidden shadow-sm">
      <CardContent className="space-y-4 p-4 sm:p-5">
        <h2 className="pm-section-heading">Project基本情報</h2>
        <p className="text-xs text-[var(--muted)]">
          <Link
            href={`/project-list/${projectId}`}
            prefetch
            onClick={onProjectDetailNavigate}
            className="text-[color:color-mix(in_srgb,var(--accent)_82%,var(--foreground)_18%)] underline-offset-2 hover:underline"
          >
            詳細へ
          </Link>
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <ReadOnlyField label="案件名">{project.name}</ReadOnlyField>
          <ReadOnlyField label="クライアント">{displayText(project.client_name)}</ReadOnlyField>
          <ReadOnlyField label="サイト種別">{formatSiteTypeLabel(project.site_type, project.site_type_other)}</ReadOnlyField>
          <ReadOnlyField label="区分">{formatProjectCategoryLabelJa(project.project_category)}</ReadOnlyField>
          <ReadOnlyField label="キックオフ日">{formatDateDisplayYmd(project.kickoff_date)}</ReadOnlyField>
          <ReadOnlyField label="リリース予定日">{formatDateDisplayYmd(project.release_due_date)}</ReadOnlyField>
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
    <Card className="shadow-sm">
      <CardContent className="space-y-3 p-4 pb-5 sm:p-5">
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
          className="inline-flex items-center gap-1.5"
        >
          <GeminiMarkIcon className="h-4 w-4 shrink-0" />
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
          <ul className="pm-scrollbar-themed max-h-[min(24rem,50vh)] space-y-2 overflow-y-auto pr-1 pb-0.5">
            {adviceSuggestions.map((s, i) => {
              const targetId = resolveAdviceToRowId(s, rows);
              const targetLine =
                s.heading?.trim() !== ""
                  ? `見出し: ${s.heading!.trim()}`
                  : s.row_id?.trim() !== ""
                    ? `行 ID: ${s.row_id!.trim()}`
                    : null;
              const selected = selectedAdviceIndex === i;
              return (
                <li key={`${i}-${s.message.slice(0, 24)}`}>
                  <button
                    type="button"
                    aria-disabled={!targetId}
                    onClick={() => {
                      if (targetId) {
                        onAdviceCardClick(i, s);
                      } else {
                        setSelectedAdviceIndex(i);
                      }
                    }}
                    className={cn(
                      "w-full rounded-lg border-2 bg-[color:color-mix(in_srgb,var(--surface)_98%,transparent)] p-2.5 text-left text-sm transition",
                      selected
                        ? "border-[color:color-mix(in_srgb,var(--accent)_88%,white_12%)] shadow-[0_0_0_1px_color-mix(in_srgb,var(--accent)_35%,transparent),0_6px_24px_-12px_color-mix(in_srgb,var(--accent)_45%,transparent)]"
                        : "border-[color:color-mix(in_srgb,var(--border)_88%,transparent)] hover:bg-[color:color-mix(in_srgb,var(--surface)_92%,transparent)]",
                      !targetId && "cursor-not-allowed opacity-75",
                      targetId && "cursor-pointer",
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
              onClick={onProjectDetailNavigate}
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
            <Button
              type="button"
              variant="default"
              size="sm"
              className="inline-flex shrink-0 items-center gap-1.5 self-center rounded-lg"
              onClick={() => void downloadHearingRowsExcel(rows, project.name, project.client_name)}
            >
              <FileSpreadsheet className="h-4 w-4 shrink-0 text-emerald-500" />
              Excel出力
            </Button>
            {canEdit ? (
              <>
                <Button
                  type="button"
                  variant="default"
                  size="sm"
                  className="shrink-0 self-center rounded-lg"
                  disabled={!rowsHistory.canUndo}
                  onClick={rowsHistory.undo}
                  aria-label="ひとつ前に戻す"
                >
                  <Undo2 className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="default"
                  size="sm"
                  className="shrink-0 self-center rounded-lg"
                  disabled={!rowsHistory.canRedo}
                  onClick={rowsHistory.redo}
                  aria-label="やり直す"
                >
                  <Redo2 className="h-4 w-4" />
                </Button>
              </>
            ) : null}
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
                name="pm-hearing-status"
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
                variant="default"
                size="sm"
                className="shrink-0 self-center rounded-lg gap-1"
                onClick={openPreview}
              >
                <ExternalLink className="h-4 w-4" />
                プレビュー
              </Button>
            ) : null}
            {canEdit ? (
              <Button
                type="button"
                variant="accent"
                size="sm"
                className="shrink-0 self-center rounded-lg"
                disabled={saving}
                onClick={() => void save()}
              >
                {saving ? "Saving…" : "Save"}
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

      <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:gap-6">
        <div className="min-w-0 w-full flex-1">
          <Card className="min-w-0 overflow-visible shadow-sm">
          <CardContent className="space-y-3 p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2">
                <h2 className="pm-section-heading mb-0">確認事項</h2>
                <div className="flex items-center gap-2">
                  <input
                    id="pm-hearing-hide-completed"
                    name="pm-hearing-hide-completed"
                    type="checkbox"
                    className="h-4 w-4 shrink-0 rounded border border-[color:color-mix(in_srgb,var(--border)_90%,transparent)] bg-[color:color-mix(in_srgb,var(--background)_94%,black_6%)] accent-[var(--accent)] outline-none focus-visible:ring-2 focus-visible:ring-[color:color-mix(in_srgb,var(--accent)_55%,transparent)]"
                    checked={hideCompletedRows}
                    onChange={(e) => setHideCompletedRows(e.target.checked)}
                  />
                  <Label htmlFor="pm-hearing-hide-completed" className="cursor-pointer text-xs font-normal text-[var(--muted)]">
                    完了を除く
                  </Label>
                </div>
              </div>
              <div className="flex flex-wrap justify-end gap-2">
                {canEdit ? (
                  <>
                    <Button
                      type="button"
                      variant="default"
                      size="sm"
                      className="inline-flex items-center gap-1.5"
                      onClick={() => setAutoCategoryDialogOpen(true)}
                    >
                      <GeminiMarkIcon className="h-4 w-4 shrink-0" />
                      分類を自動セット
                    </Button>
                    <Button type="button" variant="default" size="sm" onClick={sortRowsByCategoryCodeOrder}>
                      分類で並べ替え
                    </Button>
                    <Button
                      type="button"
                      variant="default"
                      size="sm"
                      className="inline-flex items-center gap-1.5"
                      onClick={() => setImportDialogOpen(true)}
                    >
                      <GeminiMarkIcon className="h-4 w-4 shrink-0" />
                      Excel を取り込む
                    </Button>
                    <Button type="button" variant="default" size="sm" onClick={requestLoadTemplate}>
                      テンプレを読み込む
                    </Button>
                  </>
                ) : null}
              </div>
            </div>

            <div className="w-full min-w-0 rounded-lg border border-[color:color-mix(in_srgb,var(--border)_88%,transparent)]">
              <table className="w-full min-w-0 table-fixed border-collapse text-left text-sm">
                <colgroup>
                  {canEdit ? <col style={{ width: "2.25rem" }} /> : null}
                  <col style={{ width: "6%" }} />
                  <col style={{ width: "11%" }} />
                  <col style={{ width: hearingTableCols.question }} />
                  <col style={{ width: hearingTableCols.answer }} />
                  <col style={{ width: hearingTableCols.assigneeWidth }} />
                  <col style={{ width: hearingTableCols.duePct, minWidth: hearingTableCols.dueMin }} />
                  <col style={{ width: hearingTableCols.statusPct }} />
                  {canEdit ? (
                    <col style={{ width: hearingTableCols.deletePct, minWidth: "7.75rem" }} />
                  ) : null}
                </colgroup>
                <thead>
                  <tr className="border-b border-[color:color-mix(in_srgb,var(--border)_88%,transparent)]">
                    {canEdit ? (
                      <th className={cn(hearingSheetThClass, hearingSheetStickyTh, "w-9 max-w-[2.25rem] px-0.5")} scope="col">
                        <span className="sr-only">行の並び替え</span>
                      </th>
                    ) : null}
                    <th className={cn(hearingSheetThClass, hearingSheetStickyTh)} scope="col">
                      分類
                    </th>
                    <th className={cn(hearingSheetThClass, hearingSheetStickyTh)} scope="col">
                      見出し
                    </th>
                    <th className={cn(hearingSheetThClass, hearingSheetStickyTh)} scope="col">
                      確認事項
                    </th>
                    <th className={cn(hearingSheetThClass, hearingSheetStickyTh)} scope="col">
                      回答
                    </th>
                    <th className={cn(hearingSheetThClass, hearingSheetStickyTh)} scope="col">
                      担当
                    </th>
                    <th className={cn(hearingSheetThClass, hearingSheetStickyTh)} scope="col">
                      期限
                    </th>
                    <th className={cn(hearingSheetThClass, hearingSheetStickyTh)} scope="col">
                      状況
                    </th>
                    {canEdit ? <th className={cn(hearingSheetThActionClass, hearingSheetStickyTh)} scope="col" /> : null}
                  </tr>
                </thead>
                <tbody
                  ref={tbodyRef}
                  onDragOver={dragRowsEnabled ? onTbodyDragOver : undefined}
                  onDrop={dragRowsEnabled ? onTbodyDrop : undefined}
                >
                  {rows.length === 0 ? (
                    <>
                      <tr>
                        <td colSpan={canEdit ? 9 : 7} className="px-1 py-6 text-center text-sm text-[var(--muted)]">
                          <p className="mb-4">行がありません。下のボタンから入力を開始できます。</p>
                          {canEdit ? (
                            <div className="flex flex-wrap items-center justify-center gap-2">
                              <Button
                                type="button"
                                variant="default"
                                size="sm"
                                className="inline-flex items-center gap-1.5"
                                onClick={() => setImportDialogOpen(true)}
                              >
                                <GeminiMarkIcon className="h-4 w-4 shrink-0" />
                                Excel を取り込む
                              </Button>
                              <Button type="button" variant="default" size="sm" onClick={requestLoadTemplate}>
                                テンプレを読み込む
                              </Button>
                              <Button type="button" variant="default" size="sm" onClick={addRow}>
                                行を追加
                              </Button>
                            </div>
                          ) : (
                            <p>閲覧のみのため、編集は案件のオーナー／編集者に依頼してください。</p>
                          )}
                        </td>
                      </tr>
                    </>
                  ) : visibleRows.length === 0 ? (
                    <tr>
                      <td colSpan={canEdit ? 9 : 7} className="px-1 py-8 text-center text-sm text-[var(--muted)]">
                        完了の行だけが該当するため、表示する行がありません。「完了を除く」をオフにするとすべて表示されます。
                      </td>
                    </tr>
                  ) : (
                    visibleRows.map((row, rowIndex) => {
                      const fieldIds = {
                        category: hearingFieldIds(row.id, "category"),
                        heading: hearingFieldIds(row.id, "heading"),
                        question: hearingFieldIds(row.id, "question"),
                        answer: hearingFieldIds(row.id, "answer"),
                        assignee: hearingFieldIds(row.id, "assignee"),
                        due: hearingFieldIds(row.id, "due"),
                        row_status: hearingFieldIds(row.id, "row_status"),
                      };
                      const isLastRow = rowIndex === visibleRows.length - 1;
                      const insertAfter =
                        dropIndicatorIndex !== null &&
                        isLastRow &&
                        (dropIndicatorIndex === visibleRows.length ||
                          dropIndicatorIndex === visibleRows.length - 1);
                      const insertBefore =
                        dropIndicatorIndex !== null &&
                        dropIndicatorIndex === rowIndex &&
                        !insertAfter;
                      return (
                      <tr
                        key={row.id}
                        ref={setRowRef(row.id)}
                        data-hearing-row
                        draggable={dragRowsEnabled}
                        onDragStart={dragRowsEnabled ? (e) => onRowDragStart(e, row.id) : undefined}
                        onDragEnd={dragRowsEnabled ? clearRowDrag : undefined}
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
                              className={cn(
                                "inline-flex touch-none select-none items-center justify-center rounded px-0.5 text-[color:color-mix(in_srgb,var(--muted)_95%,transparent)]",
                                dragRowsEnabled ? "cursor-grab active:cursor-grabbing" : "cursor-not-allowed opacity-70",
                              )}
                              title={
                                dragRowsEnabled
                                  ? "ドラッグして並び替え"
                                  : hideCompletedRows
                                    ? "「完了を除く」表示中は並べ替えできません"
                                    : "ドラッグして並び替え"
                              }
                            >
                              <GripVertical className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
                            </span>
                          </td>
                        ) : null}
                        <td className={hearingSheetTdClass}>
                          {canEdit ? (
                            <HearingAutoTextarea
                              id={fieldIds.category.id}
                              name={fieldIds.category.name}
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
                              id={fieldIds.heading.id}
                              name={fieldIds.heading.name}
                              value={row.heading}
                              onChange={(e) => updateRow(row.id, { heading: e.target.value })}
                            />
                          ) : (
                            <span className="block whitespace-pre-wrap px-1 py-1.5 text-xs">{displayText(row.heading)}</span>
                          )}
                        </td>
                        <td className={hearingSheetTdClass}>
                          <div className="flex min-w-0 flex-col gap-0.5">
                            <div className="min-w-0 shrink-0">
                              {canEdit ? (
                                <HearingAutoTextarea
                                  id={fieldIds.question.id}
                                  name={fieldIds.question.name}
                                  value={row.question}
                                  onChange={(e) => updateRow(row.id, { question: e.target.value })}
                                />
                              ) : (
                                <span className="block whitespace-pre-wrap px-1 py-1 text-xs">{displayText(row.question)}</span>
                              )}
                            </div>
                            <div className="shrink-0">
                              <HearingUrlClipRow text={row.question} />
                            </div>
                          </div>
                        </td>
                        <td className={hearingSheetTdClass}>
                          <div className="flex min-w-0 flex-col gap-0.5">
                            <div className="min-w-0 shrink-0">
                              {canEdit ? (
                                <HearingAutoTextarea
                                  id={fieldIds.answer.id}
                                  name={fieldIds.answer.name}
                                  value={row.answer}
                                  onChange={(e) => updateRow(row.id, { answer: e.target.value })}
                                />
                              ) : (
                                <span className="block whitespace-pre-wrap px-1 py-1 text-xs">{displayText(row.answer)}</span>
                              )}
                            </div>
                            <div className="shrink-0">
                              <HearingUrlClipRow text={row.answer} />
                            </div>
                          </div>
                        </td>
                        <td className={hearingSheetTdClass}>
                          {canEdit ? (
                            <HearingAssigneeField
                              inputId={fieldIds.assignee.id}
                              inputName={fieldIds.assignee.name}
                              value={row.assignee}
                              onValueChange={(next) => updateRow(row.id, { assignee: next })}
                              suggestions={assigneeSuggestions}
                              copyFromAboveDisabled={rowIndex === 0}
                              onCopyFromAbove={() => {
                                const prev = visibleRows[rowIndex - 1];
                                if (prev) {
                                  updateRow(row.id, { assignee: prev.assignee });
                                }
                              }}
                            />
                          ) : (
                            <span className="block whitespace-pre-wrap px-1 py-1.5 text-xs">{displayText(row.assignee)}</span>
                          )}
                        </td>
                        <td className={cn(hearingSheetTdClass, "min-w-0")}>
                          {canEdit ? (
                            <ThemeDateField
                              label={<span className="sr-only">期限</span>}
                              controlId={fieldIds.due.id}
                              name={fieldIds.due.name}
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
                              name={fieldIds.row_status.name}
                              value={rowStatusSelectValue(row.row_status) === "" ? "__empty__" : rowStatusSelectValue(row.row_status)}
                              onValueChange={(v) =>
                                updateRow(row.id, {
                                  row_status: (v === "__empty__" ? "" : v) as "" | "確認中" | "完了",
                                })
                              }
                            >
                              <SelectTrigger
                                id={fieldIds.row_status.id}
                                name={fieldIds.row_status.name}
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
                          <td className={cn(hearingSheetTdActionClass, "align-top")}>
                            <div className="flex w-full min-w-0 flex-col gap-2 py-0.5">
                              <div className="flex w-full min-w-0 items-center justify-between gap-2">
                                <div className="min-w-0 shrink">
                                  <Button
                                    type="button"
                                    variant="default"
                                    size="sm"
                                    draggable={false}
                                    disabled={project.redmine_links.length === 0}
                                    className="h-9 w-9 shrink-0 border border-[color:color-mix(in_srgb,var(--border)_88%,transparent)] bg-[color:color-mix(in_srgb,var(--surface)_96%,transparent)] p-0"
                                    aria-label="Redmine にチケットを作成"
                                    title={
                                      project.redmine_links.length === 0
                                        ? "案件に Redmine を紐づけてください"
                                        : "Redmine にチケットを作成"
                                    }
                                    onClick={() => setRedmineDialogRowId(row.id)}
                                  >
                                    <span
                                      className="inline-flex rounded-lg border border-[color:color-mix(in_srgb,rgb(248_113_113)_55%,var(--border)_45%)] bg-[color:color-mix(in_srgb,var(--surface)_78%,rgb(120_30_35)_22%)] p-1 shadow-[inset_0_1px_0_0_rgba(252,165,165,0.12)] dark:border-red-400/45 dark:bg-[color:color-mix(in_srgb,var(--surface)_72%,rgb(100_28_32)_28%)]"
                                      aria-hidden
                                    >
                                      <Image
                                        src="/brand/redmine_logo.svg"
                                        alt=""
                                        width={28}
                                        height={28}
                                        className="h-6 w-6 brightness-110 contrast-110 dark:brightness-125"
                                      />
                                    </span>
                                  </Button>
                                </div>
                                <div className="shrink-0">
                                  <Button
                                    type="button"
                                    variant="destructive"
                                    size="sm"
                                    draggable={false}
                                    className={cn(trashDeleteIconButtonClassName, "shrink-0")}
                                    aria-label="行を削除"
                                    title="行を削除"
                                    onClick={() => setDeleteConfirmRowId(row.id)}
                                  >
                                    <Trash2 className="h-4 w-4" strokeWidth={2.2} aria-hidden />
                                  </Button>
                                </div>
                              </div>
                              <div className="flex flex-col gap-1.5">
                                {(row.redmine_tickets ?? []).map((t, ti) => {
                                  const href = hearingRedmineTicketHref(t, project, userRedmineBase);
                                  const n = t.issue_id;
                                  return (
                                    <div
                                      key={`${row.id}-rm-${ti}-${n}`}
                                      className="flex w-full min-w-0 items-center justify-start gap-2 pl-0.5"
                                    >
                                      {href ? (
                                        <a
                                          href={href}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="min-w-0 max-w-[6rem] shrink truncate font-mono text-xs tabular-nums text-[var(--accent)] underline-offset-2 hover:underline"
                                          translate="no"
                                        >
                                          {n}
                                        </a>
                                      ) : (
                                        <span
                                          className="min-w-0 max-w-[6rem] shrink truncate font-mono text-xs tabular-nums text-[var(--foreground)]"
                                          translate="no"
                                        >
                                          {n}
                                        </span>
                                      )}
                                      <button
                                        type="button"
                                        draggable={false}
                                        className={hearingInlineIconButtonClassName}
                                        aria-label="チケット番号を編集"
                                        onClick={() => {
                                          setIssueEditTarget({ rowId: row.id, index: ti });
                                          setIssueEditDraft(String(n));
                                        }}
                                      >
                                        <Pencil className="h-3.5 w-3.5" aria-hidden strokeWidth={2} />
                                      </button>
                                    </div>
                                  );
                                })}
                              </div>
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
        </div>

        <aside
          className={cn(
            "relative mt-6 flex min-w-0 flex-col gap-4 lg:mt-0 lg:shrink-0 lg:self-start",
            "lg:sticky lg:top-4",
            "min-w-0",
            "motion-safe:transition-[width] motion-safe:duration-200 motion-safe:ease-out motion-reduce:transition-none",
            isLg ? (rightSidebarCollapsed ? "lg:w-11 lg:overflow-hidden" : "lg:w-[236px]") : "w-full",
          )}
        >
          {isLg ? (
            <div
              className={cn(
                "z-40",
                rightSidebarCollapsed
                  ? "relative flex h-8 w-full items-start justify-center"
                  : "absolute top-0 right-0",
              )}
            >
              <Button
                type="button"
                variant="default"
                size="sm"
                className="group h-8 w-8 shrink-0 p-0 shadow-sm"
                aria-label={rightSidebarCollapsed ? "右パネルを展開" : "右パネルを折りたたむ"}
                aria-expanded={!rightSidebarCollapsed}
                onClick={toggleRightSidebarCollapsed}
              >
                <ChevronLeft
                  className={[
                    "h-3.5 w-3.5 shrink-0 text-[var(--foreground)] transition-[transform,color] duration-200 ease-out motion-reduce:transition-none",
                    "group-hover:text-[color:color-mix(in_srgb,var(--accent)_78%,var(--foreground)_22%)] motion-safe:group-hover:scale-110",
                    rightSidebarCollapsed ? "rotate-0" : "rotate-180",
                  ].join(" ")}
                  aria-hidden
                  strokeWidth={2.25}
                />
              </Button>
            </div>
          ) : null}
          {!isLg || !rightSidebarCollapsed ? (
            <div
              className={cn(
                "space-y-4",
                rightAsideExpandEntrance && "pm-hearing-right-aside-content-enter",
              )}
            >
              {masterPane}
              {advicePane}
            </div>
          ) : null}
        </aside>
      </div>

      <HearingRedmineIssueDialog
        open={redmineDialogRowId !== null}
        onOpenChange={(o) => {
          if (!o) {
            setRedmineDialogRowId(null);
          }
        }}
        project={project}
        row={redmineDialogRowId === null ? null : rows.find((r) => r.id === redmineDialogRowId) ?? null}
        canEdit={canEdit}
        onIssueCreated={handleRedmineIssueCreated}
      />

      <Dialog open={deleteConfirmRowId !== null} onOpenChange={(o) => !o && setDeleteConfirmRowId(null)}>
        <DialogContent className="max-w-md" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>行を削除しますか</DialogTitle>
          </DialogHeader>
          <p className="text-sm leading-relaxed text-[var(--foreground)]">この行を削除すると元に戻せません。</p>
          <div className="mt-6 flex flex-wrap justify-end gap-2">
            <Button type="button" variant="default" size="sm" onClick={() => setDeleteConfirmRowId(null)}>
              キャンセル
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={() => {
                const id = deleteConfirmRowId;
                setDeleteConfirmRowId(null);
                if (id) {
                  removeRow(id);
                }
              }}
            >
              削除
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={issueEditTarget !== null} onOpenChange={(o) => !o && setIssueEditTarget(null)}>
        <DialogContent className="max-w-md" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>チケット番号を編集</DialogTitle>
          </DialogHeader>
          <Label htmlFor="hearing-issue-id-edit" className="text-xs text-[var(--muted)]">
            Redmine のチケット ID（数字のみ、# なし）
          </Label>
          <Input
            id="hearing-issue-id-edit"
            name="hearing-issue-id-edit"
            inputMode="numeric"
            className="mt-1 font-mono tabular-nums"
            value={issueEditDraft}
            onChange={(e) => setIssueEditDraft(e.target.value.replace(/\D/g, ""))}
          />
          <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <Button
              type="button"
              variant="destructive"
              size="sm"
              className="w-full sm:w-auto"
              onClick={() => {
                const target = issueEditTarget;
                if (!target) {
                  return;
                }
                setIssueEditTarget(null);
                removeRedmineTicketAt(target.rowId, target.index);
              }}
            >
              紐づけを解除
            </Button>
            <div className="flex flex-wrap justify-end gap-2 sm:ml-auto">
              <Button type="button" variant="default" size="sm" onClick={() => setIssueEditTarget(null)}>
                キャンセル
              </Button>
              <Button
                type="button"
                variant="accent"
                size="sm"
                onClick={() => {
                  const target = issueEditTarget;
                  if (!target) {
                    return;
                  }
                  const n = Number.parseInt(issueEditDraft, 10);
                  if (!Number.isFinite(n) || n <= 0) {
                    setError("正の整数を入力してください。");
                    return;
                  }
                  const nextRows = rows.map((r) => {
                    if (r.id !== target.rowId) {
                      return r;
                    }
                    const list = [...(r.redmine_tickets ?? [])];
                    const cur = list[target.index];
                    if (!cur) {
                      return r;
                    }
                    list[target.index] = { ...cur, issue_id: n };
                    return { ...r, redmine_tickets: list };
                  });
                  setRows(nextRows);
                  setIssueEditTarget(null);
                  void saveRows(nextRows);
                }}
              >
                保存
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <HearingAutoCategoryDialog
        open={autoCategoryDialogOpen}
        onOpenChange={setAutoCategoryDialogOpen}
        resolvedTemplateId={resolvedTemplateId}
        project={project}
        currentRows={rows}
        canEdit={canEdit}
        onApply={(next) => setRows(next)}
      />

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
            <DialogTitle className="text-red-500 dark:text-red-400">テンプレを読み込む</DialogTitle>
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
