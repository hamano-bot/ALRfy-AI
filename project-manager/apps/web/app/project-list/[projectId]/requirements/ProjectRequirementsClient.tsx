"use client";

import { ArrowDown, ArrowUp, GripVertical, Plus, RotateCcw, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type MouseEvent } from "react";
import { ThemeDateField } from "@/app/components/ThemeDateField";
import { Button } from "@/app/components/ui/button";
import { Card, CardContent } from "@/app/components/ui/card";
import { Input } from "@/app/components/ui/input";
import { Label } from "@/app/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/app/components/ui/select";
import { RequirementsTiptapField } from "@/app/components/requirements/RequirementsTiptapField";
import {
  emptyTableRow,
  pageWithNewInputMode,
} from "@/lib/requirements-doc-content-defaults";
import { requirementsDocFingerprint } from "@/lib/requirements-doc-fingerprint";
import {
  insertionIndexFromPointerYForStrings,
  reorderVisiblePage,
  reorderVisiblePageToInsertionIndex,
} from "@/lib/requirements-doc-reorder";
import type {
  RequirementsDocBody,
  RequirementsInputMode,
  RequirementsPage,
  RequirementsPageContentSplit,
  RequirementsPageContentTable,
} from "@/lib/requirements-doc-types";
import { UNSAVED_LEAVE_CONFIRM_MESSAGE } from "@/lib/unsaved-navigation";
import { cn } from "@/lib/utils";

const AUTO_SAVE_INTERVAL_MS = 120_000;
const DND_MIME = "application/x-alrfy-req-page";

type ProjectRequirementsClientProps = {
  projectId: number;
  projectName: string;
  canEdit: boolean;
  initialBody: RequirementsDocBody;
};

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
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
};

function RequirementsTableEditor({
  content,
  readOnly,
  onChange,
}: {
  content: RequirementsPageContentTable;
  readOnly: boolean;
  onChange: (c: RequirementsPageContentTable) => void;
}) {
  const setLabels = (i: 0 | 1 | 2, v: string) => {
    const columnLabels = [...content.columnLabels] as [string, string, string];
    columnLabels[i] = v;
    onChange({ ...content, columnLabels });
  };

  const setCell = (rowIndex: number, col: 0 | 1 | 2, v: string) => {
    const rows = content.rows.map((r, ri) => {
      if (ri !== rowIndex) {
        return r;
      }
      const cells = [...r.cells] as [string, string, string];
      cells[col] = v;
      return { ...r, cells };
    });
    onChange({ ...content, rows });
  };

  const addRow = () => {
    onChange({ ...content, rows: [...content.rows, emptyTableRow()] });
  };

  const removeRow = (rowIndex: number) => {
    if (content.rows.length <= 1) {
      return;
    }
    onChange({ ...content, rows: content.rows.filter((_, ri) => ri !== rowIndex) });
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2">
        {([0, 1, 2] as const).map((ci) => (
          <div key={ci} className="space-y-1">
            <Label className="text-[10px]">列{ci + 1}</Label>
            <Input
              value={content.columnLabels[ci]}
              onChange={(e) => setLabels(ci, e.target.value)}
              disabled={readOnly}
              className="text-xs"
            />
          </div>
        ))}
      </div>
      <div className="overflow-x-auto rounded-md border border-[color:color-mix(in_srgb,var(--border)_88%,transparent)]">
        <table className="w-full min-w-[520px] border-collapse text-sm">
          <tbody>
            {content.rows.map((row, ri) => (
              <tr key={row.id} className="border-b border-[color:color-mix(in_srgb,var(--border)_80%,transparent)]">
                {([0, 1, 2] as const).map((ci) => (
                  <td key={ci} className="p-1 align-top">
                    <textarea
                      value={row.cells[ci]}
                      onChange={(e) => setCell(ri, ci, e.target.value)}
                      disabled={readOnly}
                      rows={3}
                      className="modern-scrollbar w-full resize-y rounded border border-transparent bg-[color:color-mix(in_srgb,var(--surface)_96%,transparent)] px-2 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[color:color-mix(in_srgb,var(--accent)_45%,transparent)]"
                    />
                  </td>
                ))}
                <td className="w-10 p-1 align-middle">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0 text-[var(--muted)] hover:text-red-600"
                    disabled={readOnly || content.rows.length <= 1}
                    onClick={() => removeRow(ri)}
                    aria-label="行を削除"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Button type="button" variant="ghost" size="sm" disabled={readOnly} onClick={addRow} className="gap-1">
        <Plus className="h-4 w-4" />
        行を追加
      </Button>
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
    <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[5fr_3fr] lg:items-start lg:gap-4">
      <div className="space-y-1.5 min-h-0 lg:min-h-[320px]">
        <Label htmlFor="split-editor">本文エリア（約 5/8）</Label>
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
        <Label>表（約 3/8）</Label>
        <RequirementsTableEditor
          content={tablePart}
          readOnly={readOnly}
          onChange={(t) => onChange({ ...content, columnLabels: t.columnLabels, rows: t.rows })}
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
}: ProjectRequirementsClientProps) {
  const router = useRouter();
  const [body, setBody] = useState<RequirementsDocBody>(initialBody);
  const [savedFingerprint, setSavedFingerprint] = useState(() => requirementsDocFingerprint(initialBody));

  useEffect(() => {
    setBody(initialBody);
    setSavedFingerprint(requirementsDocFingerprint(initialBody));
  }, [initialBody]);

  const visiblePages = useMemo(() => body.pages.filter((p) => !p.deleted), [body.pages]);
  const deletedPages = useMemo(() => body.pages.filter((p) => p.deleted), [body.pages]);
  const visiblePagesRef = useRef(visiblePages);
  visiblePagesRef.current = visiblePages;

  const [activePageId, setActivePageId] = useState(() => visiblePages[0]?.id ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDeleted, setShowDeleted] = useState(false);
  const [dropIndicatorIndex, setDropIndicatorIndex] = useState<number | null>(null);
  const [draggingPageId, setDraggingPageId] = useState<string | null>(null);
  const dndSourceIdRef = useRef<string | null>(null);
  const pageListRef = useRef<HTMLDivElement | null>(null);

  const currentFingerprint = useMemo(() => requirementsDocFingerprint(body), [body]);
  const isDirty = canEdit && currentFingerprint !== savedFingerprint;

  const activePage: RequirementsPage | undefined = useMemo(
    () => body.pages.find((p) => p.id === activePageId),
    [body.pages, activePageId],
  );

  useEffect(() => {
    if (activePageId && visiblePages.some((p) => p.id === activePageId)) {
      return;
    }
    const first = visiblePages[0]?.id ?? "";
    if (first) {
      setActivePageId(first);
    }
  }, [activePageId, visiblePages]);

  const saveBody = useCallback(
    async (next: RequirementsDocBody): Promise<boolean> => {
      if (!canEdit) {
        return false;
      }
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
            setBody(normalized);
            setSavedFingerprint(requirementsDocFingerprint(normalized));
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
    [canEdit, projectId, router],
  );

  const performSave = useCallback(async (): Promise<boolean> => {
    if (!activePageId) {
      return saveBody(body);
    }
    const withDates = withSaveDatesForPage(body, activePageId);
    return saveBody(withDates);
  }, [activePageId, body, saveBody]);

  const performSaveRef = useRef<() => Promise<boolean>>(async () => false);
  performSaveRef.current = performSave;

  const isDirtyRef = useRef(isDirty);
  const savingRef = useRef(saving);
  isDirtyRef.current = isDirty;
  savingRef.current = saving;

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

  const onProjectDetailNavigate = useCallback(
    (e: MouseEvent<HTMLAnchorElement>) => {
      if (isDirty && !window.confirm(UNSAVED_LEAVE_CONFIRM_MESSAGE)) {
        e.preventDefault();
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
      replacePage(pageWithNewInputMode(activePage, mode));
    },
    [activePage, canEdit, replacePage],
  );

  const movePage = useCallback(
    (pageId: string, dir: "up" | "down") => {
      if (!canEdit) {
        return;
      }
      setBody((prev) => reorderVisiblePage(prev, pageId, dir));
    },
    [canEdit],
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
    await performSave();
  }, [performSave]);

  const readOnly = !canEdit || (activePage?.is_fixed ?? false);

  const visibleIndex = activePage ? visiblePages.findIndex((p) => p.id === activePage.id) : -1;
  const canMoveUp =
    activePage &&
    activePage.pageType !== "cover" &&
    visibleIndex > 1 &&
    visiblePages[visibleIndex - 1]?.pageType !== "cover";
  const canMoveDown = activePage && activePage.pageType !== "cover" && visibleIndex >= 0 && visibleIndex < visiblePages.length - 1;

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
                  {canEdit && activePage.pageType !== "cover" ? (
                    <div className="flex items-center gap-1 text-xs text-[var(--muted)]">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-8"
                        disabled={!canMoveUp}
                        onClick={() => movePage(activePage.id, "up")}
                      >
                        <ArrowUp className="h-4 w-4" />
                        上へ
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-8"
                        disabled={!canMoveDown}
                        onClick={() => movePage(activePage.id, "down")}
                      >
                        <ArrowDown className="h-4 w-4" />
                        下へ
                      </Button>
                    </div>
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
                    <Label>表組</Label>
                    <RequirementsTableEditor
                      content={activePage.content}
                      readOnly={readOnly}
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

                <p className="text-xs text-[var(--muted)]">
                  表紙は常に先頭です。自動保存は未保存時に約2分ごと（ヒアリングシートと同様）。リッチテキストは TipTap（見出し・箇条書き等）で編集します。
                </p>
                  </>
                ) : (
                  <p className="text-sm text-[var(--muted)]">ページがありません。</p>
                )}
              </CardContent>
          </Card>
        </div>

        <aside className="mt-6 flex min-w-0 w-full flex-col gap-4 lg:mt-0 lg:w-[236px] lg:shrink-0 lg:self-start lg:sticky lg:top-4">
          <Card className="min-h-0 overflow-hidden">
            <CardContent className="flex flex-col gap-1 p-3" onDragLeave={onPageListDragLeave}>
              <p className="mb-2 text-xs font-medium text-[var(--muted)]">ページ</p>
              <div
                ref={pageListRef}
                className="flex flex-col gap-1"
                onDragOver={canEdit ? onPageListDragOver : undefined}
                onDrop={canEdit ? onPageListDrop : undefined}
              >
              {visiblePages.map((p, vi) => {
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
                  {canEdit && p.pageType !== "cover" ? (
                    <div className="flex shrink-0 flex-col justify-center gap-0 border-l border-[color:color-mix(in_srgb,var(--border)_60%,transparent)] pl-0.5">
                      <button
                        type="button"
                        className="rounded p-0.5 text-[var(--muted)] hover:bg-[color:color-mix(in_srgb,var(--surface)_90%,transparent)] hover:text-[var(--foreground)] disabled:opacity-30"
                        disabled={vi <= 1}
                        title="上へ"
                        onClick={() => movePage(p.id, "up")}
                      >
                        <ArrowUp className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        className="rounded p-0.5 text-[var(--muted)] hover:bg-[color:color-mix(in_srgb,var(--surface)_90%,transparent)] hover:text-[var(--foreground)] disabled:opacity-30"
                        disabled={vi >= visiblePages.length - 1}
                        title="下へ"
                        onClick={() => movePage(p.id, "down")}
                      >
                        <ArrowDown className="h-3.5 w-3.5" />
                      </button>
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
        </aside>
      </div>
    </div>
  );
}
