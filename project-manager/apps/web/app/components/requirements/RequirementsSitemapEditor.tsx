"use client";

import { RequirementsSitemapGeminiChatSheet } from "@/app/components/requirements/RequirementsSitemapGeminiChatSheet";
import { RequirementsSitemapImportExcelDialog } from "@/app/components/requirements/RequirementsSitemapImportExcelDialog";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import { Label } from "@/app/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/app/components/ui/select";
import { Popover, PopoverAnchor, PopoverContent } from "@/app/components/ui/popover";
import { GeminiMarkIcon } from "@/app/project-list/[projectId]/hearing/GeminiMarkIcon";
import { insertionIndexFromPointerYForStrings } from "@/lib/requirements-doc-reorder";
import {
  addChildReturningNewId,
  addSiblingAfter,
  flattenSitemapPreorder,
  removeNode,
  reorderSiblingToIndex,
  setNodeLabels,
  setNodeScreenName,
} from "@/lib/requirements-sitemap-mutate";
import {
  collectSitemapLabelSuggestions,
  type RequirementsPageContentSitemap,
  type SitemapNode,
  type SitemapNodePosition,
} from "@/lib/requirements-sitemap-schema";
import { cn } from "@/lib/utils";
import { toPng } from "html-to-image";
import { ExternalLink, GripVertical, Loader2, Plus, Trash2, ZoomIn, ZoomOut } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { RequirementsSitemapFlowCanvas } from "@/app/components/requirements/RequirementsSitemapFlowCanvas";
import {
  SitemapWorkspaceDraggableHierarchyPanel,
  SitemapWorkspaceDraggableToolbarPanel,
} from "@/app/components/requirements/SitemapWorkspaceFloatingPanels";
import type { SitemapPreviewDiagramLayout } from "@/lib/requirements-sitemap-layout";
import {
  A4_LANDSCAPE_CANVAS_HEIGHT,
  A4_LANDSCAPE_CANVAS_WIDTH,
  PREVIEW_ZOOM_MAX,
  PREVIEW_ZOOM_MIN,
} from "@/lib/requirements-sitemap-layout";
import { pruneSitemapNodePositions } from "@/lib/requirements-sitemap-positions";

const DND_MIME = "application/x-alrfy-sitemap-node";

export type { SitemapPreviewDiagramLayout } from "@/lib/requirements-sitemap-layout";

type Props = {
  content: RequirementsPageContentSitemap;
  readOnly: boolean;
  onChange: (next: RequirementsPageContentSitemap) => void;
  /** 別タブワークスペースの URL（未指定ならボタン非表示） */
  sitemapWorkspaceHref?: string;
  /** 別タブ用にプレビュー領域を広げる */
  editorLayout?: "default" | "workspace";
  /** 別タブ: 要件定義へ戻るリンク */
  workspaceBackHref?: string;
  /** 別タブ: ツールバーの保存 */
  onWorkspaceSave?: () => void | Promise<void>;
  workspaceSaveDisabled?: boolean;
  workspaceSaving?: boolean;
};

function waitNextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

function collectExpandedDefault(root: SitemapNode): Set<string> {
  const s = new Set<string>();
  const walk = (n: SitemapNode) => {
    if (n.children.length > 0) {
      s.add(n.id);
    }
    for (const c of n.children) {
      walk(c);
    }
  };
  walk(root);
  return s;
}

function SitemapLabelInput({
  value,
  suggestions,
  readOnly,
  onChange,
}: {
  value: string;
  suggestions: string[];
  readOnly: boolean;
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const q = value.trim().toLowerCase();
  const filtered = useMemo(() => {
    const list = suggestions.filter((s) => {
      const t = s.trim();
      if (!t) {
        return false;
      }
      if (q === "") {
        return true;
      }
      return t.toLowerCase().includes(q);
    });
    return list.slice(0, 40);
  }, [suggestions, q]);

  return (
    <Popover open={open && filtered.length > 0 && !readOnly} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <Input
          value={value}
          readOnly={readOnly}
          onChange={(e) => {
            onChange(e.target.value);
            setOpen(true);
          }}
          onFocus={() => {
            if (suggestions.length > 0) {
              setOpen(true);
            }
          }}
          className="h-8 text-xs"
        />
      </PopoverAnchor>
      <PopoverContent
        align="start"
        side="bottom"
        sideOffset={4}
        className="max-h-48 min-w-[12rem] max-w-[min(24rem,calc(100vw-2rem))] overflow-y-auto p-1"
        onOpenAutoFocus={(e) => e.preventDefault()}
        onCloseAutoFocus={(e) => e.preventDefault()}
      >
        <ul className="space-y-0.5">
          {filtered.map((s) => (
            <li key={s}>
              <button
                type="button"
                className="w-full rounded px-2 py-1.5 text-left text-xs leading-snug hover:bg-[color:color-mix(in_srgb,var(--foreground)_8%,transparent)]"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onChange(s);
                  setOpen(false);
                }}
              >
                {s}
              </button>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}


type TreeRowProps = {
  node: SitemapNode;
  root: SitemapNode;
  depth: number;
  selectedId: string | null;
  readOnly: boolean;
  suggestions: string[];
  onPatchRoot: (nextRoot: SitemapNode) => void;
  onSelect: (id: string) => void;
  onAddChild: (parentId: string) => void;
  onDragStart: (e: React.DragEvent, id: string) => void;
  onDragEnd: () => void;
  insertBefore?: boolean;
};

function TreeRow({
  node,
  root,
  depth,
  selectedId,
  readOnly,
  suggestions,
  onPatchRoot,
  onSelect,
  onAddChild,
  onDragStart,
  onDragEnd,
  insertBefore,
}: TreeRowProps) {
  const isRoot = node.id === root.id;
  const isSelected = selectedId === node.id;

  const patchLabels = (labels: string[]) => {
    onPatchRoot(setNodeLabels(root, node.id, labels));
  };

  return (
    <div
      data-sitemap-row
      draggable={!readOnly && !isRoot}
      onDragStart={(e) => {
        if (!isRoot) {
          onDragStart(e, node.id);
        }
      }}
      onDragEnd={onDragEnd}
      className={cn(
        "relative flex flex-wrap items-center gap-2 rounded-md border p-1",
        "border-[color:color-mix(in_srgb,var(--border)_90%,transparent)] bg-[var(--surface)]",
        isSelected && "ring-2 ring-[color:color-mix(in_srgb,var(--accent)_40%,transparent)]",
        insertBefore &&
          "before:pointer-events-none before:absolute before:inset-x-1 before:top-0 before:z-[1] before:h-[3px] before:-translate-y-1/2 before:rounded-full before:bg-[color:color-mix(in_srgb,var(--accent)_90%,transparent)]",
      )}
      style={{ marginLeft: depth > 0 ? Math.min(depth * 4, 48) : 0 }}
    >
      {!isRoot ? (
        <GripVertical className="h-4 w-4 shrink-0 cursor-grab text-[var(--muted)]" aria-hidden />
      ) : (
        <span className="w-4 shrink-0" />
      )}
      <span className="w-4 shrink-0" aria-hidden />
      <Input
        data-sitemap-screen-input={node.id}
        value={node.screenName}
        readOnly={readOnly}
        onChange={(e) => onPatchRoot(setNodeScreenName(root, node.id, e.target.value))}
        onClick={() => onSelect(node.id)}
        className="h-8 min-w-[6rem] max-w-[14rem] flex-1 text-sm font-medium"
      />
      {isSelected ? (
        <div className="flex w-full basis-full flex-col gap-2 border-t border-[color:color-mix(in_srgb,var(--border)_80%,transparent)] pt-2 pl-6">
          <Label className="text-xs text-[var(--muted)]">ラベル</Label>
          {!readOnly ? (
            <>
              {node.labels.map((lab, li) => (
                <div key={`${node.id}-lab-${li}`} className="flex items-center gap-1">
                  <SitemapLabelInput
                    value={lab}
                    suggestions={suggestions}
                    readOnly={readOnly}
                    onChange={(v) => {
                      const next = [...node.labels];
                      next[li] = v;
                      patchLabels(next);
                    }}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 shrink-0 px-2"
                    onClick={() => patchLabels(node.labels.filter((_, i) => i !== li))}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
              <Button type="button" variant="ghost" size="sm" className="h-7 w-fit gap-1 text-xs" onClick={() => patchLabels([...node.labels, ""])}>
                <Plus className="h-3.5 w-3.5" />
                ラベルを追加
              </Button>
            </>
          ) : (
            <p className="text-xs text-[var(--muted)]">{node.labels.length ? node.labels.join(" / ") : "—"}</p>
          )}
          {!readOnly ? (
            <div className="flex flex-wrap gap-1">
              <Button type="button" variant="default" size="sm" className="h-7 text-xs" onClick={() => onAddChild(node.id)}>
                子を追加
              </Button>
              {!isRoot ? (
                <>
                  <Button type="button" variant="default" size="sm" className="h-7 text-xs" onClick={() => onPatchRoot(addSiblingAfter(root, node.id))}>
                    同階層に追加
                  </Button>
                  <Button type="button" variant="ghost" size="sm" className="h-7 text-xs text-red-600" onClick={() => onPatchRoot(removeNode(root, node.id))}>
                    削除
                  </Button>
                </>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

type ChildUlProps = {
  parent: SitemapNode;
  root: SitemapNode;
  depth: number;
  expanded: Set<string>;
  selectedId: string | null;
  readOnly: boolean;
  suggestions: string[];
  onPatchRoot: (nextRoot: SitemapNode) => void;
  onSelect: (id: string) => void;
  onAddChild: (parentId: string) => void;
};

function ChildUl({ parent, root, depth, expanded, selectedId, readOnly, suggestions, onPatchRoot, onSelect, onAddChild }: ChildUlProps) {
  const listRef = useRef<HTMLUListElement>(null);
  const dragIdRef = useRef<string | null>(null);
  const [dropIdx, setDropIdx] = useState<number | null>(null);

  const clearDrag = () => {
    dragIdRef.current = null;
    setDropIdx(null);
  };

  const onDragStart = (e: React.DragEvent, id: string) => {
    if (readOnly) {
      return;
    }
    dragIdRef.current = id;
    e.dataTransfer.setData(DND_MIME, id);
    e.dataTransfer.effectAllowed = "move";
  };

  const onDragOver = (e: React.DragEvent) => {
    if (dragIdRef.current === null || !listRef.current) {
      return;
    }
    const hit = flattenSitemapPreorder(root).find((r) => r.id === dragIdRef.current);
    if (!hit || hit.parentId !== parent.id) {
      return;
    }
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    const ids = parent.children.map((c) => c.id);
    const rowEls = [...listRef.current.querySelectorAll<HTMLElement>(":scope > li > div[data-sitemap-row]")];
    const idx = insertionIndexFromPointerYForStrings(ids, rowEls, e.clientY, dragIdRef.current);
    setDropIdx((p) => (p === idx ? p : idx));
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const dragId = dragIdRef.current ?? e.dataTransfer.getData(DND_MIME);
    if (!dragId || !listRef.current) {
      clearDrag();
      return;
    }
    const hit = flattenSitemapPreorder(root).find((r) => r.id === dragId);
    if (!hit || hit.parentId !== parent.id) {
      clearDrag();
      return;
    }
    const ids = parent.children.map((c) => c.id);
    const rowEls = [...listRef.current.querySelectorAll<HTMLElement>(":scope > li > div[data-sitemap-row]")];
    const newIndex = insertionIndexFromPointerYForStrings(ids, rowEls, e.clientY, dragId);
    onPatchRoot(reorderSiblingToIndex(root, dragId, parent.id, newIndex));
    clearDrag();
  };

  if (parent.children.length === 0) {
    return null;
  }

  return (
    <ul
      ref={listRef}
      className="ml-1 flex flex-col gap-1 border-l border-[color:color-mix(in_srgb,var(--border)_70%,transparent)] pl-2"
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragLeave={(ev) => {
        const rel = ev.relatedTarget as Node | null;
        if (rel && ev.currentTarget.contains(rel)) {
          return;
        }
        setDropIdx(null);
      }}
    >
      {parent.children.map((child, ci) => (
        <li key={child.id} className="relative p-1">
          <TreeRow
            node={child}
            root={root}
            depth={depth}
            selectedId={selectedId}
            readOnly={readOnly}
            suggestions={suggestions}
            onPatchRoot={onPatchRoot}
            onSelect={onSelect}
            onAddChild={onAddChild}
            onDragStart={onDragStart}
            onDragEnd={clearDrag}
            insertBefore={dropIdx === ci}
          />
          {expanded.has(child.id) ? (
            <ChildUl
              parent={child}
              root={root}
              depth={depth + 1}
              expanded={expanded}
              selectedId={selectedId}
              readOnly={readOnly}
              suggestions={suggestions}
              onPatchRoot={onPatchRoot}
              onSelect={onSelect}
              onAddChild={onAddChild}
            />
          ) : null}
        </li>
      ))}
    </ul>
  );
}

export function RequirementsSitemapEditor({
  content,
  readOnly,
  onChange,
  sitemapWorkspaceHref,
  editorLayout = "default",
  workspaceBackHref,
  onWorkspaceSave,
  workspaceSaveDisabled,
  workspaceSaving,
}: Props) {
  const isWorkspace = editorLayout === "workspace";
  const [structureFloatExpanded, setStructureFloatExpanded] = useState(true);
  const [expanded, setExpanded] = useState(() => collectExpandedDefault(content.root));
  const [selectedId, setSelectedId] = useState<string | null>(content.root.id);
  const [importOpen, setImportOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [pngBusy, setPngBusy] = useState(false);
  const [previewZoom, setPreviewZoom] = useState(1);
  const [isPanningPreview, setIsPanningPreview] = useState(false);
  const [pendingFocusNodeId, setPendingFocusNodeId] = useState<string | null>(null);
  const [previewDiagramLayout, setPreviewDiagramLayout] = useState<SitemapPreviewDiagramLayout>(() =>
    content.diagramLayout === "vertical" ? "vertical" : "horizontal",
  );
  const previewBodyRef = useRef<HTMLDivElement>(null);
  const previewViewportRef = useRef<HTMLDivElement>(null);
  const previewPanRef = useRef<{ startX: number; startY: number; scrollLeft: number; scrollTop: number } | null>(null);

  useEffect(() => {
    setExpanded((prev) => {
      if (prev.has(content.root.id)) {
        return prev;
      }
      const n = new Set(prev);
      n.add(content.root.id);
      return n;
    });
  }, [content.root.id]);

  useEffect(() => {
    const viewport = previewViewportRef.current;
    if (!viewport) {
      return;
    }
    viewport.scrollLeft = 0;
    viewport.scrollTop = 0;
  }, [previewDiagramLayout]);

  useEffect(() => {
    setPreviewDiagramLayout(content.diagramLayout === "vertical" ? "vertical" : "horizontal");
  }, [content.diagramLayout]);

  useEffect(() => {
    const exists = flattenSitemapPreorder(content.root).some((r) => r.id === selectedId);
    if (!exists) {
      setSelectedId(content.root.id);
    }
  }, [content.root, selectedId]);

  useLayoutEffect(() => {
    if (!pendingFocusNodeId) {
      return;
    }
    const exists = flattenSitemapPreorder(content.root).some((r) => r.id === pendingFocusNodeId);
    if (!exists) {
      return;
    }
    const el = document.querySelector<HTMLInputElement>(`[data-sitemap-screen-input="${CSS.escape(pendingFocusNodeId)}"]`);
    el?.focus();
    el?.select?.();
    setPendingFocusNodeId(null);
  }, [pendingFocusNodeId, content.root]);

  const suggestions = useMemo(() => collectSitemapLabelSuggestions(content.root), [content.root]);

  const onPatchRoot = useCallback(
    (nextRoot: SitemapNode) => {
      const nodePositions = pruneSitemapNodePositions(nextRoot, content.nodePositions);
      onChange({
        ...content,
        schemaVersion: content.schemaVersion ?? 1,
        root: nextRoot,
        ...(nodePositions && Object.keys(nodePositions).length > 0 ? { nodePositions } : { nodePositions: undefined }),
      });
    },
    [content, onChange],
  );

  const onAddChild = useCallback(
    (parentId: string) => {
      if (readOnly) {
        return;
      }
      const { root: next, newChildId } = addChildReturningNewId(content.root, parentId);
      if (!newChildId) {
        return;
      }
      const nodePositions = pruneSitemapNodePositions(next, content.nodePositions);
      onChange({
        ...content,
        schemaVersion: content.schemaVersion ?? 1,
        root: next,
        ...(nodePositions && Object.keys(nodePositions).length > 0 ? { nodePositions } : { nodePositions: undefined }),
      });
      setPendingFocusNodeId(newChildId);
      setExpanded((prev) => {
        const n = new Set(prev);
        n.add(parentId);
        return n;
      });
    },
    [content, onChange, readOnly],
  );

  const collapseThirdLevel = useCallback(() => {
    setExpanded((prev) => {
      const n = new Set(prev);
      n.add(content.root.id);
      for (const c of content.root.children) {
        n.delete(c.id);
      }
      return n;
    });
  }, [content.root.children, content.root.id]);

  const expandAll = useCallback(() => {
    setExpanded(collectExpandedDefault(content.root));
  }, [content.root]);

  const buildPreviewStandaloneHtml = (el: HTMLElement, title: string, forPrint: boolean) => `<!doctype html><html><head><meta charset="utf-8" /><title>${title}</title><style>
      @page { size: A4 landscape; margin: ${forPrint ? "0" : "12mm"}; }
      html, body { margin: 0; min-height: 100vh; padding: 12px; box-sizing: border-box; background: ${forPrint ? "#ffffff" : "#f8fafc"}; }
      body { display: flex; align-items: center; justify-content: center; }
      .preview-wrap { width: fit-content; border: ${forPrint ? "0" : "1px solid #cbd5e1"}; background: #fff; }
      @media print {
        html, body { min-height: auto; padding: 0; background: #fff; }
        .preview-wrap { width: 297mm; height: 210mm; overflow: hidden; border: 0; }
      }
    </style></head><body><div class="preview-wrap">${el.outerHTML}</div></body></html>`;

  const printPreview = () => {
    const el = previewBodyRef.current;
    if (!el) {
      return;
    }
    const html = buildPreviewStandaloneHtml(el, "Sitemap Print", true);
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const w = window.open(url, "_blank");
    if (!w) {
      URL.revokeObjectURL(url);
      return;
    }
    const onLoaded = () => {
      try {
        w.focus();
        w.print();
      } finally {
        w.removeEventListener("load", onLoaded);
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
      }
    };
    w.addEventListener("load", onLoaded);
  };

  const openSitemapWorkspaceTab = () => {
    if (!sitemapWorkspaceHref) {
      return;
    }
    window.open(sitemapWorkspaceHref, "_blank", "noopener,noreferrer");
  };

  const zoomOut = () => setPreviewZoom((z) => Math.max(PREVIEW_ZOOM_MIN, Math.round((z - 0.1) * 10) / 10));
  const zoomIn = () => setPreviewZoom((z) => Math.min(PREVIEW_ZOOM_MAX, Math.round((z + 0.1) * 10) / 10));
  const zoomFitAll = () => {
    const viewport = previewViewportRef.current;
    if (!viewport) {
      setPreviewZoom(1);
      return;
    }
    const w = Math.max(1, viewport.clientWidth - 32);
    const h = Math.max(1, viewport.clientHeight - 32);
    const fit = Math.min(w / A4_LANDSCAPE_CANVAS_WIDTH, h / A4_LANDSCAPE_CANVAS_HEIGHT);
    const clamped = Math.max(PREVIEW_ZOOM_MIN, Math.min(PREVIEW_ZOOM_MAX, fit));
    setPreviewZoom(Math.round(clamped * 100) / 100);
  };

  const stopPreviewPanning = useCallback(() => {
    previewPanRef.current = null;
    setIsPanningPreview(false);
  }, []);

  const onPreviewPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) {
      return;
    }
    const target = e.target as HTMLElement | null;
    if (target?.closest(".react-flow")) {
      return;
    }
    const viewport = previewViewportRef.current;
    if (!viewport) {
      return;
    }
    previewPanRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      scrollLeft: viewport.scrollLeft,
      scrollTop: viewport.scrollTop,
    };
    setIsPanningPreview(true);
    e.currentTarget.setPointerCapture(e.pointerId);
    e.preventDefault();
  }, []);

  const onPreviewPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const viewport = previewViewportRef.current;
    const pan = previewPanRef.current;
    if (!viewport || !pan) {
      return;
    }
    const dx = e.clientX - pan.startX;
    const dy = e.clientY - pan.startY;
    viewport.scrollLeft = pan.scrollLeft - dx;
    viewport.scrollTop = pan.scrollTop - dy;
  }, []);

  const onPreviewPointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    stopPreviewPanning();
  }, [stopPreviewPanning]);

  const downloadPng = async () => {
    const el = previewBodyRef.current;
    if (!el) {
      return;
    }
    setPngBusy(true);
    try {
      if (typeof document !== "undefined" && "fonts" in document) {
        try {
          await (document as Document & { fonts?: FontFaceSet }).fonts?.ready;
        } catch {
          /* ignore */
        }
      }
      await waitNextFrame();
      await waitNextFrame();
      const dataUrl = await toPng(el, {
        pixelRatio: 2,
        cacheBust: true,
        backgroundColor: "#ffffff",
        width: el.scrollWidth,
        height: el.scrollHeight,
        style: {
          width: `${el.scrollWidth}px`,
          height: `${el.scrollHeight}px`,
          overflow: "visible",
        },
        filter: (node) =>
          !node.classList?.contains("requirements-sitemap-page-break-guide") &&
          !node.classList?.contains("sitemap-flow-toolbar-panel"),
      });
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = "sitemap.png";
      a.click();
    } catch {
      /* ignore */
    } finally {
      setPngBusy(false);
    }
  };

  const structureInner = (
    <>
      <Label>構造</Label>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="ghost" size="sm" className="h-8 text-xs" disabled={readOnly} onClick={collapseThirdLevel}>
          3階層目を閉じる
        </Button>
        <Button type="button" variant="ghost" size="sm" className="h-8 text-xs" disabled={readOnly} onClick={expandAll}>
          すべて開く
        </Button>
      </div>
      <div className="rounded-md border border-[color:color-mix(in_srgb,var(--border)_85%,transparent)] bg-[color:color-mix(in_srgb,var(--surface)_96%,transparent)] p-2">
        <TreeRow
          node={content.root}
          root={content.root}
          depth={0}
          selectedId={selectedId}
          readOnly={readOnly}
          suggestions={suggestions}
          onPatchRoot={onPatchRoot}
          onSelect={setSelectedId}
          onAddChild={onAddChild}
          onDragStart={() => {}}
          onDragEnd={() => {}}
        />
        {expanded.has(content.root.id) ? (
          <ChildUl
            parent={content.root}
            root={content.root}
            depth={1}
            expanded={expanded}
            selectedId={selectedId}
            readOnly={readOnly}
            suggestions={suggestions}
            onPatchRoot={onPatchRoot}
            onSelect={setSelectedId}
            onAddChild={onAddChild}
          />
        ) : null}
      </div>
    </>
  );

  const zoomLayoutRow = (
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      <span className="min-w-[3.8rem] text-left text-xs text-[var(--muted)]">{Math.round(previewZoom * 100)}%</span>
      <Button type="button" variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={zoomOut} aria-label="縮小">
        <ZoomOut className="h-3.5 w-3.5" />
      </Button>
      <Button type="button" variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={zoomIn} aria-label="拡大">
        <ZoomIn className="h-3.5 w-3.5" />
      </Button>
      <Button type="button" variant="ghost" size="sm" className="h-8 px-2 text-xs" onClick={zoomFitAll}>
        全体
      </Button>
      <Label htmlFor={isWorkspace ? "sitemap-preview-diagram-layout-ws" : "sitemap-preview-diagram-layout"} className="text-xs text-[var(--muted)]">
        レイアウト
      </Label>
      <Select
        value={previewDiagramLayout}
        disabled={readOnly}
        onValueChange={(v) => {
          const next = v as SitemapPreviewDiagramLayout;
          setPreviewDiagramLayout(next);
          if (readOnly) {
            return;
          }
          onChange({
            ...content,
            schemaVersion: content.schemaVersion ?? 1,
            diagramLayout: next,
            nodePositions: undefined,
          });
        }}
      >
        <SelectTrigger
          id={isWorkspace ? "sitemap-preview-diagram-layout-ws" : "sitemap-preview-diagram-layout"}
          className="h-8 w-[min(100%,11rem)] max-w-full"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="horizontal">水平（右方向）</SelectItem>
          <SelectItem value="vertical">垂直（下方向）</SelectItem>
        </SelectContent>
      </Select>
      {!isWorkspace && sitemapWorkspaceHref && !readOnly ? (
        <Button type="button" variant="ghost" size="sm" className="h-8 gap-1 px-2 text-xs" onClick={openSitemapWorkspaceTab}>
          <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden />
          別タブで編集
        </Button>
      ) : null}
    </div>
  );

  const previewViewport = (
    <div
      ref={previewViewportRef}
      className={cn(
        "requirements-sitemap-print-root overflow-auto rounded-lg border border-slate-300 bg-slate-100/80 shadow-sm dark:bg-slate-900/40",
        isWorkspace ? "min-h-0 flex-1 rounded-md" : "min-h-[32rem]",
      )}
      onPointerDown={onPreviewPointerDown}
      onPointerMove={onPreviewPointerMove}
      onPointerUp={onPreviewPointerUp}
      onPointerCancel={stopPreviewPanning}
      onPointerLeave={stopPreviewPanning}
      style={{
        cursor: isPanningPreview ? "grabbing" : "grab",
        userSelect: isPanningPreview ? "none" : "auto",
        touchAction: "none",
      }}
    >
      <div
        className={cn(
          "box-border flex w-full",
          isWorkspace ? "min-h-full flex-1 items-center justify-center p-0" : "min-h-[32rem] items-start justify-start p-4",
        )}
      >
        <div style={{ width: `${A4_LANDSCAPE_CANVAS_WIDTH * previewZoom}px`, height: `${A4_LANDSCAPE_CANVAS_HEIGHT * previewZoom}px` }}>
          <div
            style={{
              width: `${A4_LANDSCAPE_CANVAS_WIDTH}px`,
              height: `${A4_LANDSCAPE_CANVAS_HEIGHT}px`,
              transform: `scale(${previewZoom})`,
              transformOrigin: "top left",
            }}
          >
            <div
              ref={previewBodyRef}
              className="relative bg-white shadow-sm"
              style={{
                width: `${A4_LANDSCAPE_CANVAS_WIDTH}px`,
                height: `${A4_LANDSCAPE_CANVAS_HEIGHT}px`,
                overflow: "hidden",
                border: "1px solid #cbd5e1",
                boxSizing: "border-box",
              }}
            >
              <RequirementsSitemapFlowCanvas
                root={content.root}
                diagramLayout={previewDiagramLayout}
                nodePositions={content.nodePositions}
                readOnly={readOnly}
                showRfZoomToolbar={!isWorkspace}
                showDotGrid={!isWorkspace}
                onNodePositionsCommit={
                  readOnly
                    ? undefined
                    : (next: Record<string, SitemapNodePosition>) => {
                        const pruned = pruneSitemapNodePositions(content.root, next);
                        onChange({
                          ...content,
                          schemaVersion: content.schemaVersion ?? 1,
                          ...(pruned && Object.keys(pruned).length > 0 ? { nodePositions: pruned } : { nodePositions: undefined }),
                        });
                      }
                }
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className={cn("space-y-3", isWorkspace && "flex h-full min-h-0 min-w-0 flex-1 flex-col gap-0 space-y-0")}>
      <RequirementsSitemapImportExcelDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        current={content}
        readOnly={readOnly}
        onApply={(next) => onChange(next)}
      />
      <RequirementsSitemapGeminiChatSheet
        open={chatOpen}
        onOpenChange={setChatOpen}
        current={content}
        readOnly={readOnly}
        onApply={(next) => onChange(next)}
      />

      {isWorkspace ? (
        <>
          <SitemapWorkspaceDraggableHierarchyPanel
            title="階層"
            width={320}
            bodyMaxHeight="min(70vh, 560px)"
            initialPosition={{ x: 12, y: 56 }}
            expanded={structureFloatExpanded}
            onExpandedChange={setStructureFloatExpanded}
          >
            <div className="requirements-sitemap-no-print space-y-2">{structureInner}</div>
          </SitemapWorkspaceDraggableHierarchyPanel>

          <SitemapWorkspaceDraggableToolbarPanel title="操作" initialPosition={{ x: 24, y: 12 }}>
            {workspaceBackHref ? (
              <Button asChild type="button" variant="ghost" size="sm" className="h-8 shrink-0 px-2 text-xs">
                <Link href={workspaceBackHref}>要件定義</Link>
              </Button>
            ) : null}
            <Button
              type="button"
              variant="default"
              size="sm"
              className="inline-flex h-8 shrink-0 items-center gap-1 px-2 text-xs"
              disabled={readOnly}
              onClick={() => setImportOpen(true)}
            >
              <GeminiMarkIcon className="h-3.5 w-3.5 shrink-0" />
              Excel を取り込む
            </Button>
            <Button
              type="button"
              variant="default"
              size="sm"
              className="inline-flex h-8 shrink-0 items-center gap-1 px-2 text-xs"
              disabled={readOnly}
              onClick={() => setChatOpen(true)}
            >
              <GeminiMarkIcon className="h-3.5 w-3.5 shrink-0" />
              Gemini で編集
            </Button>
            <Button type="button" variant="default" size="sm" className="h-8 shrink-0 px-2 text-xs" onClick={printPreview}>
              印刷
            </Button>
            <Button type="button" variant="default" size="sm" className="h-8 shrink-0 px-2 text-xs" disabled={pngBusy} onClick={() => void downloadPng()}>
              {pngBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "PNG"}
            </Button>
            {onWorkspaceSave ? (
              <Button
                type="button"
                variant="accent"
                size="sm"
                className="h-8 shrink-0 px-2 text-xs"
                disabled={Boolean(workspaceSaveDisabled)}
                onClick={() => void onWorkspaceSave()}
              >
                {workspaceSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "保存"}
              </Button>
            ) : null}
            <div className="mt-1 w-full basis-full border-t border-[color:color-mix(in_srgb,var(--border)_75%,transparent)] pt-1.5">
              {zoomLayoutRow}
            </div>
          </SitemapWorkspaceDraggableToolbarPanel>

          <div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">{previewViewport}</div>
        </>
      ) : (
        <>
          <div className="requirements-sitemap-no-print flex flex-wrap items-center gap-2">
            <p className="mr-auto text-sm font-medium text-[var(--foreground)]">サイトマップ</p>
            <Button
              type="button"
              variant="default"
              size="sm"
              className="inline-flex items-center gap-1.5"
              disabled={readOnly}
              onClick={() => setImportOpen(true)}
            >
              <GeminiMarkIcon className="h-4 w-4 shrink-0" />
              Excel を取り込む
            </Button>
            <Button
              type="button"
              variant="default"
              size="sm"
              className="inline-flex items-center gap-1.5"
              disabled={readOnly}
              onClick={() => setChatOpen(true)}
            >
              <GeminiMarkIcon className="h-4 w-4 shrink-0" />
              Gemini で編集
            </Button>
            <Button type="button" variant="default" size="sm" onClick={printPreview}>
              印刷
            </Button>
            <Button type="button" variant="default" size="sm" disabled={pngBusy} onClick={() => void downloadPng()}>
              {pngBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : "PNG"}
            </Button>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="requirements-sitemap-no-print space-y-2 rounded-lg border border-[color:color-mix(in_srgb,var(--border)_88%,transparent)] p-3">
              {structureInner}
            </div>

            <div className="space-y-2">
              <div className="requirements-sitemap-no-print flex min-w-0 flex-col gap-2">
                <Label className="text-sm font-medium leading-snug">プレビュー（印刷・PNG）</Label>
                {!readOnly ? (
                  <p className="text-xs leading-snug text-[var(--muted)]">
                    図のノードをドラッグして位置を調整できます（指を離すと保存）。ノードは 16px のグリッドに吸着します。外側の余白をドラッグすると表示領域を移動できます。
                  </p>
                ) : null}
                {zoomLayoutRow}
              </div>
              {previewViewport}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

