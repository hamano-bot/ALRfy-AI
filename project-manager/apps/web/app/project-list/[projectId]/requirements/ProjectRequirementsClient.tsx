"use client";

import {
  ArrowDown,
  ArrowUp,
  ChevronLeft,
  ExternalLink,
  FileSpreadsheet,
  FileText,
  GripVertical,
  Plus,
  Redo2,
  RotateCcw,
  Trash2,
  Undo2,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type MouseEvent } from "react";
import { ThemeDateField } from "@/app/components/ThemeDateField";
import { Button } from "@/app/components/ui/button";
import { Card, CardContent } from "@/app/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/app/components/ui/dialog";
import { Input } from "@/app/components/ui/input";
import { Label } from "@/app/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/app/components/ui/select";
import { RequirementsSitemapEditor } from "@/app/components/requirements/RequirementsSitemapEditor";
import { RequirementsTableImportExcelDialog } from "@/app/components/requirements/RequirementsTableImportExcelDialog";
import { RequirementsTiptapField } from "@/app/components/requirements/RequirementsTiptapField";
import { HearingAutoTextarea } from "@/app/project-list/[projectId]/hearing/HearingAutoTextarea";
import { GeminiMarkIcon } from "@/app/project-list/[projectId]/hearing/GeminiMarkIcon";
import { HearingUrlClipRow } from "@/app/project-list/[projectId]/hearing/HearingUrlClipRow";
import { defaultRichtextContent, emptyTableRowByColumnCount, pageWithNewInputMode } from "@/lib/requirements-doc-content-defaults";
import { requirementsDocFingerprint } from "@/lib/requirements-doc-fingerprint";
import {
  insertionIndexFromPointerYForStrings,
  reorderVisiblePage,
  reorderVisiblePageToInsertionIndex,
} from "@/lib/requirements-doc-reorder";
import { downloadRequirementsPreviewExcel } from "@/lib/requirements-excel-export";
import type {
  RequirementsDocBody,
  RequirementsInputMode,
  RequirementsPage,
  RequirementsPageContentSplit,
  RequirementsPageContentTable,
} from "@/lib/requirements-doc-types";
import { UNSAVED_LEAVE_CONFIRM_MESSAGE } from "@/lib/unsaved-navigation";
import { useEditHistoryState } from "@/lib/use-edit-history-state";
import { cn } from "@/lib/utils";
import { trashDeleteIconButtonClassName } from "@/lib/trash-delete-icon-button-class";
import { requirementsPrintPreviewChannelName } from "@/lib/requirements-print-preview-channel";

const AUTO_SAVE_IDLE_MS = 7_000;

type SaveMode = "manual" | "auto";

type FocusSnapshot = {
  element: HTMLElement | null;
  id: string | null;
  name: string | null;
  selectionStart: number | null;
  selectionEnd: number | null;
};

function takeFocusSnapshot(): FocusSnapshot | null {
  if (typeof document === "undefined") {
    return null;
  }
  const active = document.activeElement;
  if (!(active instanceof HTMLElement)) {
    return null;
  }
  const textLike =
    active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement
      ? {
          selectionStart: active.selectionStart,
          selectionEnd: active.selectionEnd,
        }
      : { selectionStart: null, selectionEnd: null };
  return {
    element: active,
    id: active.id || null,
    name: active.getAttribute("name"),
    selectionStart: textLike.selectionStart,
    selectionEnd: textLike.selectionEnd,
  };
}

function restoreFocusSnapshot(snapshot: FocusSnapshot | null) {
  if (!snapshot || typeof document === "undefined") {
    return;
  }
  const resolveTarget = (): HTMLElement | null => {
    if (snapshot.element && snapshot.element.isConnected) {
      return snapshot.element;
    }
    if (snapshot.id) {
      const byId = document.getElementById(snapshot.id);
      if (byId instanceof HTMLElement) {
        return byId;
      }
    }
    if (snapshot.name) {
      const byName = document.querySelector<HTMLElement>(`[name="${CSS.escape(snapshot.name)}"]`);
      if (byName) {
        return byName;
      }
    }
    return null;
  };
  const target = resolveTarget();
  if (!target) {
    return;
  }
  target.focus({ preventScroll: true });
  if (
    (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) &&
    snapshot.selectionStart !== null &&
    snapshot.selectionEnd !== null
  ) {
    target.setSelectionRange(snapshot.selectionStart, snapshot.selectionEnd);
  }
}

function downloadFilenameFromContentDisposition(header: string | null): string | null {
  if (!header) {
    return null;
  }
  const star = /filename\*\s*=\s*UTF-8''([^;\s]+)/i.exec(header);
  if (star?.[1]) {
    try {
      return decodeURIComponent(star[1].replace(/^"+|"+$/g, ""));
    } catch {
      return star[1];
    }
  }
  const q = /filename\s*=\s*"([^"]+)"/i.exec(header);
  if (q?.[1]) {
    return q[1];
  }
  const plain = /filename\s*=\s*([^;\s]+)/i.exec(header);
  return plain?.[1]?.replace(/^"+|"+$/g, "") ?? null;
}
const DND_MIME = "application/x-alrfy-req-page";
const RIGHT_SIDEBAR_COLLAPSED_LS_KEY = "pm-requirements-right-sidebar-collapsed";

function requirementsBodyEquals(a: RequirementsDocBody, b: RequirementsDocBody): boolean {
  return requirementsDocFingerprint(a) === requirementsDocFingerprint(b);
}

type ProjectRequirementsClientProps = {
  projectId: number;
  projectName: string;
  canEdit: boolean;
  initialBody: RequirementsDocBody;
  initialExists: boolean;
};

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function newPageId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `req-page-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function withSaveDatesForPage(body: RequirementsDocBody, pageId: string): RequirementsDocBody {
  const d = todayIsoDate();
  return {
    ...body,
    pages: body.pages.map((p) => {
      if (p.id !== pageId) {
        return p;
      }
      return {
        ...p,
        createdOn: p.createdOn ?? d,
        updatedOn: d,
      };
    }),
  };
}

const INPUT_MODE_LABEL: Record<RequirementsInputMode, string> = {
  richtext: "リッチテキスト（TipTap）",
  table: "表組",
  split_editor_table: "分割（5/8 テキスト + 3/8 表）",
  sitemap: "サイトマップ",
};

function RequirementsTableEditor({
  content,
  readOnly,
  onChange,
  allowColumnEdit = true,
  onImportExcel,
  compactLayout = false,
}: {
  content: RequirementsPageContentTable;
  readOnly: boolean;
  onChange: (c: RequirementsPageContentTable) => void;
  allowColumnEdit?: boolean;
  onImportExcel?: () => void;
  compactLayout?: boolean;
}) {
  const columnDragIdRef = useRef<string | null>(null);
  const [draggingColumnId, setDraggingColumnId] = useState<string | null>(null);
  const [columnDropIndicatorIndex, setColumnDropIndicatorIndex] = useState<number | null>(null);
  const [draggingRowId, setDraggingRowId] = useState<string | null>(null);
  const [rowDropIndicatorIndex, setRowDropIndicatorIndex] = useState<number | null>(null);
  const rowDragIdRef = useRef<string | null>(null);
  const tbodyRef = useRef<HTMLTableSectionElement | null>(null);
  const rowListRef = useRef(content.rows.map((row) => row.id));
  rowListRef.current = content.rows.map((row) => row.id);
  const colListRef = useRef(content.columnLabels.map((_, ci) => `col-${ci}`));
  colListRef.current = content.columnLabels.map((_, ci) => `col-${ci}`);
  const insertionIndexFromPointerXForStrings = (
    list: string[],
    colElements: HTMLElement[],
    clientX: number,
    dragId: string,
  ): number => {
    if (list.length === 0) {
      return 0;
    }
    for (let i = 0; i < list.length; i++) {
      const el = colElements[i];
      if (!el) {
        break;
      }
      const r = el.getBoundingClientRect();
      const mid = r.left + r.width / 2;
      if (clientX < mid) {
        return list.slice(0, i).filter((x) => x !== dragId).length;
      }
    }
    return list.filter((x) => x !== dragId).length;
  };

  const setLabels = (i: number, v: string) => {
    const columnLabels = [...content.columnLabels];
    columnLabels[i] = v;
    onChange({ ...content, columnLabels });
  };

  const setCell = (rowIndex: number, col: number, v: string) => {
    const rows = content.rows.map((r, ri) => {
      if (ri !== rowIndex) {
        return r;
      }
      const cells = [...r.cells];
      cells[col] = v;
      return { ...r, cells };
    });
    onChange({ ...content, rows });
  };

  const addRow = () => {
    onChange({ ...content, rows: [...content.rows, emptyTableRowByColumnCount(content.columnLabels.length)] });
  };

  const addColumn = () => {
    const current = content.columnLabels.length;
    if (current >= 6) {
      return;
    }
    const columnLabels = [...content.columnLabels, `列${current + 1}`];
    const rows = content.rows.map((r) => ({ ...r, cells: [...r.cells, ""] }));
    onChange({ ...content, columnLabels, rows });
  };

  const removeColumn = (colIndex: number) => {
    const current = content.columnLabels.length;
    if (colIndex === 0 || current <= 1 || !allowColumnEdit) {
      return;
    }
    const columnLabels = content.columnLabels.filter((_, idx) => idx !== colIndex);
    const rows = content.rows.map((r) => ({ ...r, cells: r.cells.filter((_, idx) => idx !== colIndex) }));
    onChange({ ...content, columnLabels, rows });
  };

  const removeRow = (rowIndex: number) => {
    if (content.rows.length <= 1) {
      return;
    }
    onChange({ ...content, rows: content.rows.filter((_, ri) => ri !== rowIndex) });
  };

  const reorderRows = (rowId: string, newIndex: number) => {
    const without = content.rows.filter((r) => r.id !== rowId);
    const row = content.rows.find((r) => r.id === rowId);
    if (!row) {
      return;
    }
    const i = Math.max(0, Math.min(newIndex, without.length));
    const rows = [...without.slice(0, i), row, ...without.slice(i)];
    onChange({ ...content, rows });
  };

  const reorderColumns = (fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0) {
      return;
    }
    const labelsWithout = content.columnLabels.filter((_, idx) => idx !== fromIndex);
    const movedLabel = content.columnLabels[fromIndex];
    if (movedLabel === undefined) {
      return;
    }
    const safeIndex = Math.max(0, Math.min(toIndex, labelsWithout.length));
    const columnLabels = [...labelsWithout.slice(0, safeIndex), movedLabel, ...labelsWithout.slice(safeIndex)];
    const rows = content.rows.map((row) => {
      const cellsWithout = row.cells.filter((_, idx) => idx !== fromIndex);
      const movedCell = row.cells[fromIndex] ?? "";
      const cells = [...cellsWithout.slice(0, safeIndex), movedCell, ...cellsWithout.slice(safeIndex)];
      return { ...row, cells };
    });
    onChange({ ...content, columnLabels, rows });
  };

  const clearRowDrag = () => {
    rowDragIdRef.current = null;
    setDraggingRowId(null);
    setRowDropIndicatorIndex(null);
  };

  const clearColumnDrag = () => {
    columnDragIdRef.current = null;
    setDraggingColumnId(null);
    setColumnDropIndicatorIndex(null);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Label>表組</Label>
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="default" size="sm" disabled={readOnly} onClick={addRow}>
            行を追加
          </Button>
          {onImportExcel ? (
            <Button type="button" variant="default" size="sm" className="inline-flex items-center gap-1.5" disabled={readOnly} onClick={onImportExcel}>
              <GeminiMarkIcon className="h-4 w-4 shrink-0" />
              Excel を取り込む
            </Button>
          ) : null}
          {allowColumnEdit && content.columnLabels.length < 6 ? (
            <Button type="button" variant="default" size="sm" disabled={readOnly} onClick={addColumn}>
              列を追加
            </Button>
          ) : null}
        </div>
      </div>
      <div className={cn("rounded-md border border-[color:color-mix(in_srgb,var(--border)_88%,transparent)]", compactLayout ? "overflow-x-hidden" : "overflow-x-auto")}>
        <table className={cn("w-full table-fixed border-collapse text-sm", compactLayout ? "min-w-0" : "min-w-[760px]")}>
          <colgroup>
            <col style={{ width: compactLayout ? "1.75rem" : "2.25rem" }} />
            {content.columnLabels.map((_, ci) => (
              <col key={`col-${ci}`} style={{ width: `${100 / Math.max(content.columnLabels.length, 1)}%` }} />
            ))}
            <col style={{ width: compactLayout ? "2.5rem" : "3.5rem" }} />
          </colgroup>
          <thead>
            <tr className="border-b border-[color:color-mix(in_srgb,var(--border)_80%,transparent)]">
              <th className="w-9 p-1">
                <span className="sr-only">行並び替え</span>
              </th>
              {content.columnLabels.map((label, ci) => (
                <th
                  key={`header-${ci}`}
                  data-req-table-col
                  draggable={!readOnly && allowColumnEdit}
                  onDragStart={(e) => {
                    if (readOnly || !allowColumnEdit) {
                      return;
                    }
                    const id = `col-${ci}`;
                    columnDragIdRef.current = id;
                    setDraggingColumnId(id);
                    setColumnDropIndicatorIndex(null);
                    e.dataTransfer.effectAllowed = "move";
                    e.dataTransfer.setData("text/plain", id);
                  }}
                  onDragEnd={clearColumnDrag}
                  onDragOver={(e) => {
                    if (columnDragIdRef.current === null) {
                      return;
                    }
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "move";
                    const rowEl = e.currentTarget.parentElement;
                    const colEls = [...(rowEl?.querySelectorAll<HTMLElement>("[data-req-table-col]") ?? [])];
                    const idx = insertionIndexFromPointerXForStrings(colListRef.current, colEls, e.clientX, columnDragIdRef.current);
                    setColumnDropIndicatorIndex(idx);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    const dragId = columnDragIdRef.current;
                    if (!dragId) {
                      clearColumnDrag();
                      return;
                    }
                    const fromIndex = Number.parseInt(dragId.replace("col-", ""), 10);
                    const rowEl = e.currentTarget.parentElement;
                    const colEls = [...(rowEl?.querySelectorAll<HTMLElement>("[data-req-table-col]") ?? [])];
                    const toIndex = insertionIndexFromPointerXForStrings(colListRef.current, colEls, e.clientX, dragId);
                    reorderColumns(fromIndex, toIndex);
                    clearColumnDrag();
                  }}
                  className={cn(
                    "relative p-1 align-top",
                    draggingColumnId === `col-${ci}` && "opacity-60",
                    columnDropIndicatorIndex === ci &&
                      "before:pointer-events-none before:absolute before:bottom-0 before:left-0 before:top-0 before:z-[1] before:w-[3px] before:-translate-x-1/2 before:rounded-full before:bg-[color:color-mix(in_srgb,var(--accent)_90%,transparent)]",
                    columnDropIndicatorIndex === content.columnLabels.length &&
                      ci === content.columnLabels.length - 1 &&
                      "after:pointer-events-none after:absolute after:bottom-0 after:right-0 after:top-0 after:z-[1] after:w-[3px] after:translate-x-1/2 after:rounded-full after:bg-[color:color-mix(in_srgb,var(--accent)_90%,transparent)]",
                  )}
                >
                  <div className="space-y-1">
                    <Label className="text-[10px]">列{ci + 1}</Label>
                    <div className="flex items-center gap-1">
                      {allowColumnEdit ? (
                        <span
                          className={cn("inline-flex text-[var(--muted)]", !readOnly && "cursor-grab active:cursor-grabbing")}
                          title="ドラッグして列を並び替え"
                        >
                          <GripVertical className="h-4 w-4 -rotate-90" />
                        </span>
                      ) : null}
                      <Input value={label} onChange={(e) => setLabels(ci, e.target.value)} disabled={readOnly} className="text-xs" />
                      {allowColumnEdit && ci > 0 ? (
                        <Button
                          type="button"
                          variant="destructive"
                          size="sm"
                          className={trashDeleteIconButtonClassName}
                          disabled={readOnly || content.columnLabels.length <= 1 || ci === 0}
                          onClick={() => removeColumn(ci)}
                          aria-label={`列${ci + 1}を削除`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      ) : null}
                    </div>
                  </div>
                </th>
              ))}
              <th className="w-14 p-1 align-middle">
                <span className="sr-only">行削除</span>
              </th>
            </tr>
          </thead>
          <tbody
            ref={tbodyRef}
            onDragOver={(e) => {
              if (rowDragIdRef.current === null || !tbodyRef.current) {
                return;
              }
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
              const rowEls = [...tbodyRef.current.querySelectorAll<HTMLElement>("tr[data-req-table-row]")];
              const idx = insertionIndexFromPointerYForStrings(rowListRef.current, rowEls, e.clientY, rowDragIdRef.current);
              setRowDropIndicatorIndex(idx);
            }}
            onDrop={(e) => {
              e.preventDefault();
              const dragId = rowDragIdRef.current;
              if (!dragId || !tbodyRef.current) {
                clearRowDrag();
                return;
              }
              const rowEls = [...tbodyRef.current.querySelectorAll<HTMLElement>("tr[data-req-table-row]")];
              const idx = insertionIndexFromPointerYForStrings(rowListRef.current, rowEls, e.clientY, dragId);
              reorderRows(dragId, idx);
              clearRowDrag();
            }}
          >
            {content.rows.map((row, ri) => (
              <tr
                key={row.id}
                data-req-table-row
                draggable={!readOnly}
                onDragStart={(e) => {
                  if (readOnly) {
                    return;
                  }
                  rowDragIdRef.current = row.id;
                  setDraggingRowId(row.id);
                  setRowDropIndicatorIndex(null);
                  e.dataTransfer.effectAllowed = "move";
                  e.dataTransfer.setData("text/plain", row.id);
                }}
                onDragEnd={clearRowDrag}
                className={cn(
                  "relative border-b border-[color:color-mix(in_srgb,var(--border)_80%,transparent)]",
                  draggingRowId === row.id && "opacity-60",
                  rowDropIndicatorIndex === ri &&
                    "before:pointer-events-none before:absolute before:inset-x-1 before:top-0 before:z-[1] before:h-[3px] before:-translate-y-1/2 before:rounded-full before:bg-[color:color-mix(in_srgb,var(--accent)_90%,transparent)]",
                  rowDropIndicatorIndex === content.rows.length &&
                    ri === content.rows.length - 1 &&
                    "after:pointer-events-none after:absolute after:inset-x-1 after:bottom-0 after:z-[1] after:h-[3px] after:translate-y-1/2 after:rounded-full after:bg-[color:color-mix(in_srgb,var(--accent)_90%,transparent)]",
                )}
              >
                <td className="w-9 p-1 align-middle">
                  <span className={cn("inline-flex text-[var(--muted)]", !readOnly && "cursor-grab active:cursor-grabbing")} title="ドラッグして行を並び替え">
                    <GripVertical className="h-4 w-4" />
                  </span>
                </td>
                {content.columnLabels.map((_, ci) => (
                  <td key={ci} className="p-1 align-top">
                    <div className={cn("flex flex-col gap-0.5", compactLayout ? "min-w-0" : "min-w-[10rem]")}>
                      <HearingAutoTextarea
                        value={row.cells[ci] ?? ""}
                        onChange={(e) => setCell(ri, ci, e.target.value)}
                        readOnly={readOnly}
                        className={cn(
                          "modern-scrollbar bg-[color:color-mix(in_srgb,var(--surface)_96%,transparent)] px-2 py-1.5",
                          compactLayout ? "text-xs" : "text-sm",
                        )}
                      />
                      <HearingUrlClipRow text={row.cells[ci] ?? ""} />
                    </div>
                  </td>
                ))}
                <td className="w-14 p-1 align-middle">
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    className={trashDeleteIconButtonClassName}
                    disabled={readOnly || content.rows.length <= 1}
                    onClick={() => removeRow(ri)}
                    aria-label="行を削除"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </td>
              </tr>
            ))}
            <tr className="border-b border-[color:color-mix(in_srgb,var(--border)_70%,transparent)] bg-[color:color-mix(in_srgb,var(--surface)_98%,transparent)]">
              <td colSpan={content.columnLabels.length + 2} className="px-1 py-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Button type="button" variant="default" size="sm" disabled={readOnly} onClick={addRow}>
                    行を追加
                  </Button>
                  {onImportExcel ? (
                    <Button
                      type="button"
                      variant="default"
                      size="sm"
                      className="inline-flex items-center gap-1.5"
                      disabled={readOnly}
                      onClick={onImportExcel}
                    >
                      <GeminiMarkIcon className="h-4 w-4 shrink-0" />
                      Excel を取り込む
                    </Button>
                  ) : null}
                  {allowColumnEdit && content.columnLabels.length < 6 ? (
                    <Button type="button" variant="default" size="sm" disabled={readOnly} onClick={addColumn}>
                      列を追加
                    </Button>
                  ) : null}
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

function RequirementsSplitEditor({
  projectId,
  content,
  readOnly,
  onChange,
}: {
  projectId: number;
  content: RequirementsPageContentSplit;
  readOnly: boolean;
  onChange: (c: RequirementsPageContentSplit) => void;
}) {
  const tablePart: RequirementsPageContentTable = {
    columnLabels: content.columnLabels,
    rows: content.rows,
  };

  return (
    <div className="flex flex-col gap-4 lg:grid lg:grid-cols-2 lg:items-start lg:gap-4">
      <div className="space-y-1.5 min-h-0 lg:min-h-[320px]">
        <Label htmlFor="split-editor">本文エリア</Label>
        <RequirementsTiptapField
          id="split-editor"
          projectId={projectId}
          doc={content.editorDoc}
          readOnly={readOnly}
          onChange={(editorDoc) => onChange({ ...content, editorDoc })}
          className="min-h-[240px]"
        />
      </div>
      <div className="space-y-1.5 min-h-0 border-t border-[color:color-mix(in_srgb,var(--border)_70%,transparent)] pt-4 lg:border-t-0 lg:border-l lg:pl-4 lg:pt-0">
        <Label>表</Label>
        <RequirementsTableEditor
          content={tablePart}
          readOnly={readOnly}
          allowColumnEdit={false}
          compactLayout
          onChange={(t) =>
            onChange({
              ...content,
              columnLabels: [
                t.columnLabels[0] ?? "",
                t.columnLabels[1] ?? "",
                t.columnLabels[2] ?? "",
              ],
              rows: t.rows.map((row) => ({
                ...row,
                cells: [row.cells[0] ?? "", row.cells[1] ?? "", row.cells[2] ?? ""],
              })),
            })
          }
        />
      </div>
    </div>
  );
}

export function ProjectRequirementsClient({
  projectId,
  projectName,
  canEdit,
  initialBody,
  initialExists,
}: ProjectRequirementsClientProps) {
  const router = useRouter();
  const history = useEditHistoryState(initialBody, {
    equals: requirementsBodyEquals,
    maxSize: 250,
  });
  const body = history.present;
  const setBody = history.setPresent;
  const [savedFingerprint, setSavedFingerprint] = useState(() => requirementsDocFingerprint(initialBody));

  useEffect(() => {
    history.reset(initialBody);
    setSavedFingerprint(requirementsDocFingerprint(initialBody));
  }, [history.reset, initialBody]);

  const visiblePages = useMemo(() => body.pages.filter((p) => !p.deleted), [body.pages]);
  const deletedPages = useMemo(() => body.pages.filter((p) => p.deleted), [body.pages]);
  const visiblePagesRef = useRef(visiblePages);
  visiblePagesRef.current = visiblePages;

  const [activePageId, setActivePageId] = useState(() => visiblePages[0]?.id ?? "");
  const [pendingNewPageId, setPendingNewPageId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [pdfDownloading, setPdfDownloading] = useState(false);
  const [requirementsInitialized, setRequirementsInitialized] = useState(initialExists);
  const [error, setError] = useState<string | null>(null);
  const [showDeleted, setShowDeleted] = useState(false);
  const [isLg, setIsLg] = useState(false);
  const [rightSidebarCollapsed, setRightSidebarCollapsed] = useState(false);
  const [rightAsideExpandEntrance, setRightAsideExpandEntrance] = useState(false);
  const [tableImportOpen, setTableImportOpen] = useState(false);
  const [modeChangeDialogOpen, setModeChangeDialogOpen] = useState(false);
  const [pendingModeChange, setPendingModeChange] = useState<RequirementsInputMode | null>(null);
  const [leaveConfirmOpen, setLeaveConfirmOpen] = useState(false);
  const [dropIndicatorIndex, setDropIndicatorIndex] = useState<number | null>(null);
  const [draggingPageId, setDraggingPageId] = useState<string | null>(null);
  const dndSourceIdRef = useRef<string | null>(null);
  const pageListRef = useRef<HTMLDivElement | null>(null);
  const previewChannelRef = useRef<BroadcastChannel | null>(null);

  const currentFingerprint = useMemo(() => requirementsDocFingerprint(body), [body]);
  const isDirty = canEdit && currentFingerprint !== savedFingerprint;

  const activePage: RequirementsPage | undefined = useMemo(
    () => body.pages.find((p) => p.id === activePageId),
    [body.pages, activePageId],
  );

  useEffect(() => {
    if (pendingNewPageId && activePageId === pendingNewPageId) {
      // 新規ページ追加直後に body 反映待ちの場合、先頭ページへのフォールバックを抑止する。
      return;
    }
    if (activePageId && visiblePages.some((p) => p.id === activePageId)) {
      return;
    }
    const first = visiblePages[0]?.id ?? "";
    if (first) {
      setActivePageId(first);
    }
  }, [activePageId, visiblePages, pendingNewPageId]);

  useEffect(() => {
    if (!pendingNewPageId) {
      return;
    }
    if (body.pages.some((p) => p.id === pendingNewPageId)) {
      setActivePageId(pendingNewPageId);
      setPendingNewPageId(null);
    }
  }, [body.pages, pendingNewPageId]);

  const saveBody = useCallback(
    async (next: RequirementsDocBody, mode: SaveMode): Promise<boolean> => {
      if (!canEdit) {
        return false;
      }
      const focusSnapshot = mode === "auto" ? takeFocusSnapshot() : null;
      setSaving(true);
      setError(null);
      try {
        const res = await fetch("/api/portal/project-requirements", {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({
            project_id: projectId,
            body_json: next,
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
            requirements?: { body_json?: unknown };
          };
          if (j.success && j.requirements?.body_json !== undefined && j.requirements.body_json !== null) {
            const { normalizeRequirementsDocBody } = await import("@/lib/requirements-doc-normalize");
            const normalized = normalizeRequirementsDocBody(j.requirements.body_json);
            const normalizedFingerprint = requirementsDocFingerprint(normalized);
            const nextFingerprint = requirementsDocFingerprint(next);
            if (mode === "manual") {
              history.reset(normalized);
              setSavedFingerprint(normalizedFingerprint);
              router.refresh();
            } else {
              if (normalizedFingerprint !== nextFingerprint) {
                history.reset(normalized);
                window.setTimeout(() => restoreFocusSnapshot(focusSnapshot), 0);
                setSavedFingerprint(normalizedFingerprint);
              } else {
                setSavedFingerprint(nextFingerprint);
              }
            }
          } else {
            setSavedFingerprint(requirementsDocFingerprint(next));
            if (mode === "manual") {
              router.refresh();
            }
          }
        } catch {
          setSavedFingerprint(requirementsDocFingerprint(next));
          if (mode === "manual") {
            router.refresh();
          }
        }
        return true;
      } catch {
        setError("保存に失敗しました。");
        return false;
      } finally {
        setSaving(false);
      }
    },
    [canEdit, projectId, router, history],
  );

  const performSave = useCallback(
    async (mode: SaveMode = "manual"): Promise<boolean> => {
      if (!activePageId) {
        return saveBody(body, mode);
      }
      const withDates = withSaveDatesForPage(body, activePageId);
      return saveBody(withDates, mode);
    },
    [activePageId, body, saveBody],
  );

  const performSaveRef = useRef<(mode?: SaveMode) => Promise<boolean>>(async () => false);
  performSaveRef.current = performSave;

  const isDirtyRef = useRef(isDirty);
  const savingRef = useRef(saving);
  const isComposingRef = useRef(false);
  isDirtyRef.current = isDirty;
  savingRef.current = saving;

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const onCompositionStart = () => {
      isComposingRef.current = true;
    };
    const onCompositionEnd = () => {
      isComposingRef.current = false;
      if (canEdit && isDirtyRef.current && !savingRef.current) {
        window.setTimeout(() => {
          if (!isDirtyRef.current || savingRef.current || isComposingRef.current) {
            return;
          }
          void performSaveRef.current("auto");
        }, AUTO_SAVE_IDLE_MS);
      }
    };
    window.addEventListener("compositionstart", onCompositionStart, true);
    window.addEventListener("compositionend", onCompositionEnd, true);
    return () => {
      window.removeEventListener("compositionstart", onCompositionStart, true);
      window.removeEventListener("compositionend", onCompositionEnd, true);
    };
  }, [canEdit]);

  useEffect(() => {
    if (!requirementsInitialized || !canEdit || !isDirty || saving || isComposingRef.current) {
      return;
    }
    const id = window.setTimeout(() => {
      if (!isDirtyRef.current || savingRef.current || isComposingRef.current) {
        return;
      }
      void performSaveRef.current("auto");
    }, AUTO_SAVE_IDLE_MS);
    return () => window.clearTimeout(id);
  }, [requirementsInitialized, canEdit, currentFingerprint, isDirty, saving]);

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
        if (history.canRedo) {
          e.preventDefault();
          history.redo();
        }
        return;
      }
      if (key === "z") {
        if (history.canUndo) {
          e.preventDefault();
          history.undo();
        }
        return;
      }
      if (key === "y" && history.canRedo) {
        e.preventDefault();
        history.redo();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [canEdit, history]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const media = window.matchMedia("(min-width: 1024px)");
    const sync = () => setIsLg(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const raw = window.localStorage.getItem(RIGHT_SIDEBAR_COLLAPSED_LS_KEY);
    setRightSidebarCollapsed(raw === "1");
  }, []);

  const persistSidebarCollapsed = useCallback((next: boolean) => {
    if (typeof window === "undefined") {
      return;
    }
    try {
      window.localStorage.setItem(RIGHT_SIDEBAR_COLLAPSED_LS_KEY, next ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, []);

  const toggleRightSidebarCollapsed = useCallback(() => {
    setRightSidebarCollapsed((prev) => {
      const next = !prev;
      persistSidebarCollapsed(next);
      if (isLg && prev) {
        setRightAsideExpandEntrance(true);
      }
      return next;
    });
  }, [isLg, persistSidebarCollapsed]);

  useEffect(() => {
    const channel = new BroadcastChannel(requirementsPrintPreviewChannelName(projectId));
    previewChannelRef.current = channel;
    return () => {
      channel.close();
      previewChannelRef.current = null;
    };
  }, [projectId]);

  useEffect(() => {
    previewChannelRef.current?.postMessage({ body, activePageId });
  }, [body, activePageId]);

  const onProjectDetailNavigate = useCallback(
    (e: MouseEvent<HTMLAnchorElement>) => {
      if (isDirty) {
        e.preventDefault();
        setLeaveConfirmOpen(true);
      }
    },
    [isDirty],
  );

  const replacePage = useCallback((next: RequirementsPage) => {
    setBody((prev) => ({
      ...prev,
      pages: prev.pages.map((p) => (p.id === next.id ? next : p)),
    }));
  }, []);

  const patchActiveBase = useCallback(
    (patch: Partial<Pick<RequirementsPage, "title" | "createdOn" | "updatedOn" | "is_fixed" | "deleted">>) => {
      if (!activePageId || !canEdit) {
        return;
      }
      setBody((prev) => {
        const cur = prev.pages.find((p) => p.id === activePageId);
        if (cur?.is_fixed && !("is_fixed" in patch)) {
          return prev;
        }
        return {
          ...prev,
          pages: prev.pages.map((p) => (p.id === activePageId ? { ...p, ...patch } : p)),
        };
      });
    },
    [activePageId, canEdit],
  );

  const onInputModeChange = useCallback(
    (mode: RequirementsInputMode) => {
      if (!activePage || !canEdit || activePage.is_fixed) {
        return;
      }
      if (activePage.inputMode === mode) {
        return;
      }
      setPendingModeChange(mode);
      setModeChangeDialogOpen(true);
    },
    [activePage, canEdit],
  );

  const closeModeChangeDialog = useCallback(() => {
    setModeChangeDialogOpen(false);
    setPendingModeChange(null);
  }, []);

  const runModeChange = useCallback(
    (withBackup: boolean) => {
      if (!activePage || !pendingModeChange || !canEdit || activePage.is_fixed) {
        closeModeChangeDialog();
        return;
      }
      const switched = pageWithNewInputMode(activePage, pendingModeChange);
      setBody((prev) => {
        const nextPages = prev.pages.map((p) => (p.id === activePage.id ? switched : p));
        if (!withBackup) {
          return { ...prev, pages: nextPages };
        }
        const backupId = newPageId();
        const backupTitle = `${activePage.title || activePage.pageType || "ページ"}（バックアップ）`;
        const backupPage: RequirementsPage = {
          ...activePage,
          id: backupId,
          title: backupTitle,
          is_fixed: false,
          deleted: false,
        };
        return { ...prev, pages: [...nextPages, backupPage] };
      });
      setActivePageId(activePage.id);
      closeModeChangeDialog();
    },
    [activePage, pendingModeChange, canEdit, closeModeChangeDialog, setBody],
  );

  const clearPageDrag = useCallback(() => {
    dndSourceIdRef.current = null;
    setDraggingPageId(null);
    setDropIndicatorIndex(null);
  }, []);

  const updatePageDropIndicator = useCallback((clientY: number) => {
    const dragId = dndSourceIdRef.current;
    if (dragId === null || !pageListRef.current) {
      return;
    }
    const list = visiblePagesRef.current.map((p) => p.id);
    const rowEls = [...pageListRef.current.querySelectorAll<HTMLElement>("[data-req-page-row]")];
    let idx = insertionIndexFromPointerYForStrings(list, rowEls, clientY, dragId);
    if (idx < 1) {
      idx = 1;
    }
    setDropIndicatorIndex((prev) => (prev === idx ? prev : idx));
  }, []);

  const onPageListDragOver = useCallback(
    (e: DragEvent) => {
      if (dndSourceIdRef.current === null) {
        return;
      }
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      updatePageDropIndicator(e.clientY);
    },
    [updatePageDropIndicator],
  );

  const onPageListDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      const dragId = dndSourceIdRef.current;
      if (!dragId || !pageListRef.current) {
        clearPageDrag();
        return;
      }
      const list = visiblePagesRef.current.map((p) => p.id);
      const rowEls = [...pageListRef.current.querySelectorAll<HTMLElement>("[data-req-page-row]")];
      let idx = insertionIndexFromPointerYForStrings(list, rowEls, e.clientY, dragId);
      if (idx < 1) {
        idx = 1;
      }
      setBody((prev) => reorderVisiblePageToInsertionIndex(prev, dragId, idx));
      clearPageDrag();
    },
    [clearPageDrag],
  );

  const onPageDragStart = useCallback((e: DragEvent, pageId: string) => {
    e.dataTransfer.setData(DND_MIME, pageId);
    e.dataTransfer.effectAllowed = "move";
    dndSourceIdRef.current = pageId;
    setDraggingPageId(pageId);
    setDropIndicatorIndex(null);
  }, []);

  const onPageDragEnd = useCallback(() => {
    clearPageDrag();
  }, [clearPageDrag]);

  const onPageListDragLeave = useCallback((e: DragEvent) => {
    const next = e.relatedTarget as Node | null;
    if (next && e.currentTarget.contains(next)) {
      return;
    }
    setDropIndicatorIndex(null);
  }, []);

  const softDeleteActive = useCallback(() => {
    if (!activePage || activePage.pageType === "cover") {
      return;
    }
    patchActiveBase({ deleted: true });
  }, [activePage, patchActiveBase]);

  const restorePage = useCallback(
    (id: string) => {
      setBody((prev) => ({
        ...prev,
        pages: prev.pages.map((p) => (p.id === id ? { ...p, deleted: false } : p)),
      }));
    },
    [],
  );

  const handleManualSave = useCallback(async () => {
    await performSave("manual");
  }, [performSave]);

  const handleInitializeRequirements = useCallback(async () => {
    const ok = await performSave("manual");
    if (ok) {
      setRequirementsInitialized(true);
    }
  }, [performSave]);

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


  const addPageToBottom = useCallback(() => {
    if (!canEdit) {
      return;
    }
    const pageId = newPageId();
    const page: RequirementsPage = {
      id: pageId,
      pageType: "custom",
      title: "新規",
      createdOn: null,
      updatedOn: null,
      inputMode: "richtext",
      is_fixed: false,
      deleted: false,
      content: defaultRichtextContent(),
    };
    setBody((prev) => ({ ...prev, pages: [...prev.pages, page] }));
    setPendingNewPageId(pageId);
    setActivePageId(pageId);
  }, [canEdit, setBody]);

  const movePageByArrow = useCallback(
    (pageId: string, direction: "up" | "down") => {
      if (!canEdit) {
        return;
      }
      setBody((prev) => reorderVisiblePage(prev, pageId, direction));
    },
    [canEdit, setBody],
  );

  const openPreview = useCallback(() => {
    const qs = new URLSearchParams();
    if (activePageId) {
      qs.set("selected_page_id", activePageId);
    }
    const suffix = qs.toString();
    window.open(
      `/project-list/${projectId}/requirements/print-preview${suffix ? `?${suffix}` : ""}`,
      "_blank",
      "noopener,noreferrer",
    );
  }, [projectId, activePageId]);

  const readOnly = !canEdit || (activePage?.is_fixed ?? false);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-5">
      <Dialog
        open={modeChangeDialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            closeModeChangeDialog();
            return;
          }
          setModeChangeDialogOpen(true);
        }}
      >
        <DialogContent className="max-w-lg" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>入力方式を変更しますか？</DialogTitle>
          </DialogHeader>
          <p className="text-sm leading-relaxed text-[var(--foreground)]">
            入力方式を変更すると、現在の入力内容は新しい入力方式に引き継がれません。安全のため、次のいずれかを選択してください。
          </p>
          <div className="mt-4 flex flex-col gap-2">
            <Button type="button" variant="default" onClick={() => runModeChange(true)}>
              複製（バックアップ）して新しい入力形式で入力する
            </Button>
            <Button type="button" variant="destructive" onClick={() => runModeChange(false)}>
              既に入力されている値を破棄して新しい入力形式で入力する
            </Button>
          </div>
          <div className="mt-2 flex justify-end">
            <Button type="button" variant="ghost" onClick={closeModeChangeDialog}>
              キャンセル
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={leaveConfirmOpen} onOpenChange={setLeaveConfirmOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>未保存の変更があります</DialogTitle>
            <DialogDescription>{UNSAVED_LEAVE_CONFIRM_MESSAGE}</DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="default" size="sm" onClick={() => setLeaveConfirmOpen(false)}>
              キャンセル
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={() => {
                setLeaveConfirmOpen(false);
                router.push(`/project-list/${projectId}`);
              }}
            >
              破棄して戻る
            </Button>
          </div>
        </DialogContent>
      </Dialog>
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
                {projectName}
              </h1>
              <p className="mt-1 min-w-0 truncate text-sm leading-relaxed text-[var(--foreground)]">要件定義</p>
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
              onClick={() => {
                void downloadRequirementsPreviewExcel(body, projectName).catch((e: unknown) => {
                  const msg = e instanceof Error ? e.message : "Excel出力に失敗しました。";
                  setError(msg);
                });
              }}
            >
              <FileSpreadsheet className="h-4 w-4 shrink-0 text-emerald-500" />
              Excel出力
            </Button>
            <Button
              type="button"
              variant="default"
              size="sm"
              className="inline-flex shrink-0 items-center gap-1.5 self-center rounded-lg"
              disabled={pdfDownloading}
              onClick={async () => {
                setPdfDownloading(true);
                setError(null);
                try {
                  const res = await fetch("/api/portal/requirements-export-pdf", {
                    method: "POST",
                    credentials: "include",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ project_id: projectId }),
                  });
                  const ct = res.headers.get("content-type") ?? "";
                  if (!res.ok) {
                    if (ct.includes("application/json")) {
                      const data = (await res.json()) as { message?: string };
                      setError(data.message ?? "PDF出力に失敗しました。");
                    } else {
                      setError("PDF出力に失敗しました。");
                    }
                    return;
                  }
                  if (!ct.includes("application/pdf")) {
                    setError("PDF出力の応答が不正です。");
                    return;
                  }
                  const blob = await res.blob();
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download =
                    downloadFilenameFromContentDisposition(res.headers.get("content-disposition")) ??
                    `要件定義プレビュー_#${projectId}.pdf`;
                  document.body.appendChild(a);
                  a.click();
                  a.remove();
                  URL.revokeObjectURL(url);
                } catch {
                  setError("PDF出力に失敗しました。");
                } finally {
                  setPdfDownloading(false);
                }
              }}
            >
              <FileText className="h-4 w-4 shrink-0 text-red-600" aria-hidden />
              {pdfDownloading ? "PDF生成中…" : "PDF出力"}
            </Button>
            {canEdit ? (
              <>
                <Button
                  type="button"
                  variant="default"
                  size="sm"
                  className="shrink-0 self-center rounded-lg"
                  disabled={!history.canUndo}
                  onClick={history.undo}
                  aria-label="ひとつ前に戻す"
                >
                  <Undo2 className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="default"
                  size="sm"
                  className="shrink-0 self-center rounded-lg"
                  disabled={!history.canRedo}
                  onClick={history.redo}
                  aria-label="やり直す"
                >
                  <Redo2 className="h-4 w-4" />
                </Button>
              </>
            ) : null}
            <Button type="button" variant="default" size="sm" className="shrink-0 self-center rounded-lg gap-1" onClick={openPreview}>
              <ExternalLink className="h-4 w-4" />
              プレビュー
            </Button>
            {canEdit ? (
              <Button
                type="button"
                variant="accent"
                size="sm"
                className="shrink-0 self-center rounded-lg"
                disabled={saving || !isDirty}
                onClick={() => void handleManualSave()}
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

      {!requirementsInitialized ? (
        <Card className="shadow-sm">
          <CardContent className="space-y-4 p-6">
            <h2 className="pm-section-heading">要件定義はまだ作成されていません</h2>
            <p className="text-sm text-[var(--muted)]">
              「作成する」を押すと、このプロジェクトの要件定義データを作成します。
            </p>
            {canEdit ? (
              <div className="flex justify-end">
                <Button type="button" variant="accent" size="sm" onClick={() => void handleInitializeRequirements()} disabled={saving}>
                  {saving ? "作成中…" : "作成する"}
                </Button>
              </div>
            ) : (
              <p className="text-xs text-[var(--muted)]">編集権限があるユーザーのみ作成できます。</p>
            )}
          </CardContent>
        </Card>
      ) : (
      <div className="flex min-h-0 flex-1 flex-col gap-6 pb-6 lg:flex-row lg:items-start lg:gap-6">
        <div className="min-w-0 w-full flex-1">
          <Card className="min-w-0 overflow-visible shadow-sm">
            <CardContent className="flex flex-col gap-4 p-4 sm:p-5">
                {activePage ? (
                  <>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="req-title">ページ名</Label>
                    <Input
                      id="req-title"
                      value={activePage.title}
                      onChange={(e) => patchActiveBase({ title: e.target.value })}
                      disabled={readOnly}
                    />
                  </div>
                  <div className="flex flex-col justify-end gap-2">
                    <Label htmlFor="req-mode">入力方式</Label>
                    <Select
                      value={activePage.inputMode}
                      onValueChange={(v) => onInputModeChange(v as RequirementsInputMode)}
                      disabled={readOnly}
                    >
                      <SelectTrigger id="req-mode" className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {(Object.keys(INPUT_MODE_LABEL) as RequirementsInputMode[]).map((m) => (
                          <SelectItem key={m} value={m}>
                            {INPUT_MODE_LABEL[m]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-4">
                  <label className="flex cursor-pointer items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-[var(--border)]"
                      checked={activePage.is_fixed}
                      disabled={!canEdit}
                      onChange={(e) => patchActiveBase({ is_fixed: e.target.checked })}
                    />
                    <span>FIX（このページをロック）</span>
                  </label>
                  {canEdit && activePage.pageType !== "cover" ? (
                    <Button type="button" variant="ghost" size="sm" className="gap-1 text-red-600 hover:text-red-700" onClick={softDeleteActive}>
                      <Trash2 className="h-4 w-4" />
                      ページを非表示
                    </Button>
                  ) : null}
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <ThemeDateField
                    className="min-w-[12.5rem] max-w-full sm:w-auto"
                    controlId="req-created"
                    name="req-created"
                    label="作成日"
                    value={activePage.createdOn ?? ""}
                    onChange={(v) => patchActiveBase({ createdOn: v.trim() === "" ? null : v })}
                    disabled={readOnly}
                  />
                  <ThemeDateField
                    className="min-w-[12.5rem] max-w-full sm:w-auto"
                    controlId="req-updated"
                    name="req-updated"
                    label="最終更新日"
                    value={activePage.updatedOn ?? ""}
                    onChange={(v) => patchActiveBase({ updatedOn: v.trim() === "" ? null : v })}
                    disabled={readOnly}
                  />
                </div>

                {activePage.inputMode === "table" ? (
                  <RequirementsTableImportExcelDialog
                    open={tableImportOpen}
                    onOpenChange={setTableImportOpen}
                    current={activePage.content}
                    canEdit={!readOnly}
                    onApply={(next) => replacePage({ ...activePage, content: next })}
                  />
                ) : null}

                {activePage.inputMode === "richtext" ? (
                  <div className="space-y-1.5">
                    <Label htmlFor="req-body">本文</Label>
                    <RequirementsTiptapField
                      id="req-body"
                      key={activePage.id}
                      projectId={projectId}
                      doc={activePage.content.doc}
                      readOnly={readOnly}
                      onChange={(doc) => {
                        if (readOnly) {
                          return;
                        }
                        replacePage({ ...activePage, content: { doc } });
                      }}
                      className="min-h-[280px]"
                    />
                  </div>
                ) : null}

                {activePage.inputMode === "table" ? (
                  <div className="space-y-1.5">
                    <RequirementsTableEditor
                      content={activePage.content}
                      readOnly={readOnly}
                      onImportExcel={() => setTableImportOpen(true)}
                      onChange={(c) => replacePage({ ...activePage, content: c })}
                    />
                  </div>
                ) : null}

                {activePage.inputMode === "split_editor_table" ? (
                  <div className="space-y-1.5">
                    <Label>分割レイアウト</Label>
                    <RequirementsSplitEditor
                      key={activePage.id}
                      projectId={projectId}
                      content={activePage.content}
                      readOnly={readOnly}
                      onChange={(c: RequirementsPageContentSplit) => replacePage({ ...activePage, content: c })}
                    />
                  </div>
                ) : null}

                {activePage.inputMode === "sitemap" ? (
                  <div className="space-y-1.5">
                    <Label>サイトマップ</Label>
                    <RequirementsSitemapEditor
                      key={activePage.id}
                      content={activePage.content}
                      readOnly={readOnly}
                      sitemapWorkspaceHref={
                        !readOnly
                          ? `/project-list/${projectId}/requirements/sitemap-workspace?page=${encodeURIComponent(activePage.id)}`
                          : undefined
                      }
                      onChange={(c) => {
                        if (readOnly) {
                          return;
                        }
                        replacePage({ ...activePage, content: c });
                      }}
                    />
                  </div>
                ) : null}

                <p className="text-xs text-[var(--muted)]">
                  表紙は常に先頭です。自動保存は未保存時に約2分ごと（ヒアリングシートと同様）。リッチテキストは TipTap（見出し・箇条書き等）で編集します。サイトマップはツリー編集・Excel 取り込み・Gemini 編集・印刷・PNG・JSON 出力に対応します。
                </p>
                  </>
                ) : (
                  <p className="text-sm text-[var(--muted)]">ページがありません。</p>
                )}
              </CardContent>
          </Card>
        </div>

        <aside
          className={cn(
            "mt-6 flex min-w-0 w-full flex-col gap-4 lg:mt-0 lg:shrink-0 lg:self-start lg:sticky lg:top-4",
            "motion-safe:transition-[width] motion-safe:duration-200 motion-safe:ease-out",
            rightSidebarCollapsed ? "lg:w-11 lg:overflow-hidden" : "lg:w-[236px]",
          )}
        >
          {rightSidebarCollapsed ? (
            <div className="relative flex h-8 w-full items-start justify-center">
              <Button
                type="button"
                variant="default"
                size="sm"
                className="group h-8 w-8 shrink-0 p-0 shadow-sm"
                onClick={toggleRightSidebarCollapsed}
                aria-expanded={!rightSidebarCollapsed}
                aria-label={rightSidebarCollapsed ? "右ペインを展開" : "右ペインを折りたたむ"}
              >
                <ChevronLeft
                  className={[
                    "h-3.5 w-3.5 shrink-0 text-[var(--foreground)] transition-[transform,color] duration-200 ease-out motion-reduce:transition-none",
                    "group-hover:text-[color:color-mix(in_srgb,var(--accent)_78%,var(--foreground)_22%)] motion-safe:group-hover:scale-110",
                    "rotate-0",
                  ].join(" ")}
                  aria-hidden
                  strokeWidth={2.25}
                />
              </Button>
            </div>
          ) : (
          <Card className="min-h-0 overflow-hidden">
            <CardContent
              className={cn(
                "flex flex-col gap-1 p-3",
                !rightSidebarCollapsed && rightAsideExpandEntrance && "pm-hearing-right-aside-content-enter",
              )}
              onDragLeave={onPageListDragLeave}
              onAnimationEnd={() => {
                if (rightAsideExpandEntrance) {
                  setRightAsideExpandEntrance(false);
                }
              }}
            >
              <div className="mb-2 flex items-center justify-between gap-2">
                {!rightSidebarCollapsed ? (
                  <div className="flex items-center gap-2">
                    <p className="text-xs font-medium text-[var(--muted)]">ページ</p>
                    {canEdit ? (
                      <Button type="button" variant="default" size="sm" className="h-7 gap-1 px-2 text-[10px]" onClick={addPageToBottom}>
                        <Plus className="h-3.5 w-3.5" />
                        追加
                      </Button>
                    ) : null}
                  </div>
                ) : (
                  <span className="sr-only">ページ</span>
                )}
                <Button
                  type="button"
                  variant="default"
                  size="sm"
                  className="group h-8 w-8 shrink-0 p-0 shadow-sm"
                  onClick={toggleRightSidebarCollapsed}
                  aria-expanded={!rightSidebarCollapsed}
                  aria-label={rightSidebarCollapsed ? "右ペインを展開" : "右ペインを折りたたむ"}
                >
                  <ChevronLeft
                    className={[
                      "h-3.5 w-3.5 shrink-0 text-[var(--foreground)] transition-[transform,color] duration-200 ease-out motion-reduce:transition-none",
                      "group-hover:text-[color:color-mix(in_srgb,var(--accent)_78%,var(--foreground)_22%)] motion-safe:group-hover:scale-110",
                      "rotate-180",
                    ].join(" ")}
                    aria-hidden
                    strokeWidth={2.25}
                  />
                </Button>
              </div>
              <div
                ref={pageListRef}
                className="flex flex-col gap-1"
                onDragOver={canEdit ? onPageListDragOver : undefined}
                onDrop={canEdit ? onPageListDrop : undefined}
              >
              {visiblePages.map((p, vi) => {
                const canMoveUp = vi > 0 && p.pageType !== "cover" && visiblePages[vi - 1]?.pageType !== "cover";
                const canMoveDown = vi < visiblePages.length - 1 && p.pageType !== "cover" && visiblePages[vi + 1]?.pageType !== "cover";
                const isLastRow = vi === visiblePages.length - 1;
                const insertAfter =
                  dropIndicatorIndex !== null &&
                  isLastRow &&
                  (dropIndicatorIndex === visiblePages.length ||
                    dropIndicatorIndex === visiblePages.length - 1);
                const insertBefore =
                  dropIndicatorIndex !== null && dropIndicatorIndex === vi && !insertAfter;
                return (
                <div
                  key={p.id}
                  data-req-page-row
                  className={cn(
                    "relative flex items-stretch gap-0.5 rounded-lg border border-transparent transition-[box-shadow,background-color] duration-150",
                    p.id === activePageId
                      ? "border-[color:color-mix(in_srgb,var(--accent)_35%,var(--border)_65%)] bg-[color:color-mix(in_srgb,var(--accent)_12%,var(--surface)_88%)]"
                      : "hover:bg-[color:color-mix(in_srgb,var(--surface)_92%,transparent)]",
                    draggingPageId === p.id && "opacity-60",
                    insertBefore &&
                      "before:pointer-events-none before:absolute before:inset-x-1 before:top-0 before:z-[1] before:h-[3px] before:-translate-y-1/2 before:rounded-full before:bg-[color:color-mix(in_srgb,var(--accent)_90%,transparent)] before:shadow-[0_0_0_1px_color-mix(in_srgb,var(--accent)_30%,transparent)]",
                    insertAfter &&
                      "after:pointer-events-none after:absolute after:inset-x-1 after:bottom-0 after:z-[1] after:h-[3px] after:translate-y-1/2 after:rounded-full after:bg-[color:color-mix(in_srgb,var(--accent)_90%,transparent)] after:shadow-[0_0_0_1px_color-mix(in_srgb,var(--accent)_30%,transparent)]",
                  )}
                >
                  <button
                    type="button"
                    title="ドラッグして並び替え"
                    className={cn(
                      "flex w-7 shrink-0 items-center justify-center text-[var(--muted)] hover:text-[var(--foreground)]",
                      (p.pageType === "cover" || !canEdit) && "pointer-events-none opacity-30",
                    )}
                    draggable={canEdit && p.pageType !== "cover"}
                    onDragStart={(e) => onPageDragStart(e, p.id)}
                    onDragEnd={onPageDragEnd}
                  >
                    <GripVertical className="h-4 w-4" aria-hidden />
                  </button>
                  <button
                    type="button"
                    onClick={() => setActivePageId(p.id)}
                    className="min-w-0 flex-1 px-1.5 py-2 text-left text-sm text-[var(--foreground)]"
                  >
                    <span className="line-clamp-2">{p.title || p.pageType}</span>
                    {p.is_fixed ? <span className="mt-0.5 block text-[10px] text-[var(--muted)]">FIX</span> : null}
                  </button>
                  {canEdit ? (
                    <div className="mr-1 flex shrink-0 items-center gap-0.5">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0 text-[var(--muted)] hover:text-[var(--foreground)]"
                        disabled={!canMoveUp}
                        onClick={() => movePageByArrow(p.id, "up")}
                        aria-label="ページを上へ移動"
                      >
                        <ArrowUp className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0 text-[var(--muted)] hover:text-[var(--foreground)]"
                        disabled={!canMoveDown}
                        onClick={() => movePageByArrow(p.id, "down")}
                        aria-label="ページを下へ移動"
                      >
                        <ArrowDown className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ) : null}
                </div>
                );
              })}
              </div>

              {deletedPages.length > 0 ? (
                <div className="mt-3 border-t border-[color:color-mix(in_srgb,var(--border)_70%,transparent)] pt-2">
                  <button
                    type="button"
                    className="flex w-full items-center justify-between text-left text-xs text-[var(--muted)] hover:text-[var(--foreground)]"
                    onClick={() => setShowDeleted((v) => !v)}
                  >
                    <span>非表示のページ（{deletedPages.length}）</span>
                    <span>{showDeleted ? "▼" : "▶"}</span>
                  </button>
                  {showDeleted ? (
                    <ul className="mt-2 space-y-1">
                      {deletedPages.map((p) => (
                        <li key={p.id} className="flex items-center justify-between gap-2 text-xs">
                          <span className="truncate text-[var(--muted)]">{p.title || p.pageType}</span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-7 gap-1 px-2 text-[10px]"
                            onClick={() => restorePage(p.id)}
                          >
                            <RotateCcw className="h-3 w-3" />
                            復元
                          </Button>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              ) : null}
            </CardContent>
          </Card>
          )}
        </aside>
      </div>
      )}
    </div>
  );
}
