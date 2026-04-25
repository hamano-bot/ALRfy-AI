"use client";

import type { JSONContent } from "@tiptap/core";
import { ChevronDown, ChevronLeft, ChevronRight, Move, Printer } from "lucide-react";
import { Fragment, useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { Button } from "@/app/components/ui/button";
import { Card, CardContent } from "@/app/components/ui/card";
import {
  PreviewSitemapCanvas,
  type SitemapPreviewDiagramLayout,
} from "@/app/components/requirements/RequirementsSitemapEditor";
import type {
  RequirementsDocBody,
  RequirementsPage,
  RequirementsPageContentSitemap,
  SitemapNode,
} from "@/lib/requirements-doc-types";
import { requirementsPrintPreviewChannelName } from "@/lib/requirements-print-preview-channel";
import { cn } from "@/lib/utils";

type PrintPreviewClientProps = {
  projectId: number;
  initialBody: RequirementsDocBody;
  initialSelectedPageId?: string;
};

type RenderSheet = {
  id: string;
  pageId: string;
  branchIndex: number;
  title: string;
  createdOn: string | null;
  updatedOn: string | null;
  mode: RequirementsPage["inputMode"];
  richtextDoc?: JSONContent;
  table?: { headers: string[]; rows: string[][] };
  split?: { richtextDoc: JSONContent; headers: string[]; rows: string[][] };
  sitemapRoot?: SitemapNode;
};

const TABLE_ROWS_PER_SHEET = 10;
const SPLIT_TABLE_ROWS_PER_SHEET = 7;
const A4_LANDSCAPE_CANVAS_WIDTH = 1122;
const A4_LANDSCAPE_CANVAS_HEIGHT = 794;

function chunkList<T>(items: T[], size: number): T[][] {
  if (items.length === 0) {
    return [[]];
  }
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

function pageTitle(base: string, branchIndex: number): string {
  return branchIndex === 0 ? base : `${base} -${branchIndex}`;
}

function buildSheets(page: RequirementsPage): RenderSheet[] {
  const base = {
    pageId: page.id,
    createdOn: page.createdOn,
    updatedOn: page.updatedOn,
    mode: page.inputMode,
  } as const;
  const baseTitle = page.title || page.pageType || "ページ";

  if (page.inputMode === "richtext") {
    return [
      {
        id: `${page.id}-rt-0`,
        ...base,
        branchIndex: 0,
        title: pageTitle(baseTitle, 0),
        richtextDoc: page.content.doc,
      },
    ];
  }

  if (page.inputMode === "table") {
    const headers = page.content.columnLabels.length > 0 ? page.content.columnLabels : ["列1"];
    const rows = page.content.rows.map((r) =>
      headers.map((_, ci) => {
        const value = r.cells[ci];
        return typeof value === "string" ? value : "";
      }),
    );
    return chunkList(rows, TABLE_ROWS_PER_SHEET).map((chunk, idx) => ({
      id: `${page.id}-tb-${idx}`,
      ...base,
      branchIndex: idx,
      title: pageTitle(baseTitle, idx),
      table: { headers, rows: chunk },
    }));
  }

  if (page.inputMode === "split_editor_table") {
    const headers = page.content.columnLabels;
    const rows = page.content.rows.map((r) =>
      headers.map((_, ci) => {
        const value = r.cells[ci];
        return typeof value === "string" ? value : "";
      }),
    );
    return chunkList(rows, SPLIT_TABLE_ROWS_PER_SHEET).map((chunk, idx) => ({
      id: `${page.id}-sp-${idx}`,
      ...base,
      branchIndex: idx,
      title: pageTitle(baseTitle, idx),
      split: { richtextDoc: page.content.editorDoc, headers, rows: chunk },
    }));
  }

  return [
    {
      id: `${page.id}-sm-0`,
      ...base,
      branchIndex: 0,
      title: pageTitle(baseTitle, 0),
      sitemapRoot: page.content.root,
    },
  ];
}

function DateLine({ createdOn, updatedOn }: { createdOn: string | null; updatedOn: string | null }) {
  return (
    <p className="requirements-print-date-line" aria-label="作成日と最終更新日">
      作成日: {createdOn || "-"} / 最終更新日: {updatedOn || "-"}
    </p>
  );
}

function renderTextWithMarks(textNode: JSONContent, key: string) {
  const value = typeof textNode.text === "string" ? textNode.text : "";
  const marks = Array.isArray(textNode.marks) ? textNode.marks : [];
  return marks.reduce<React.ReactNode>((acc, mark, idx) => {
    const mKey = `${key}-m-${idx}`;
    if (mark.type === "bold") {
      return <strong key={mKey}>{acc}</strong>;
    }
    if (mark.type === "italic") {
      return <em key={mKey}>{acc}</em>;
    }
    if (mark.type === "underline") {
      return <u key={mKey}>{acc}</u>;
    }
    if (mark.type === "strike") {
      return <s key={mKey}>{acc}</s>;
    }
    if (mark.type === "code") {
      return <code key={mKey}>{acc}</code>;
    }
    if (mark.type === "link") {
      const href =
        typeof mark.attrs === "object" &&
        mark.attrs !== null &&
        typeof (mark.attrs as Record<string, unknown>).href === "string"
          ? ((mark.attrs as Record<string, unknown>).href as string)
          : "";
      return (
        <a key={mKey} href={href || "#"} target="_blank" rel="noreferrer">
          {acc}
        </a>
      );
    }
    if (mark.type === "textStyle") {
      const attrs = (typeof mark.attrs === "object" && mark.attrs !== null ? mark.attrs : {}) as Record<string, unknown>;
      const fontSize = typeof attrs.fontSize === "string" ? attrs.fontSize : undefined;
      const color = typeof attrs.color === "string" ? attrs.color : undefined;
      const fontFamily = typeof attrs.fontFamily === "string" ? attrs.fontFamily : undefined;
      return (
        <span key={mKey} style={{ fontSize, color, fontFamily }}>
          {acc}
        </span>
      );
    }
    return <Fragment key={mKey}>{acc}</Fragment>;
  }, value);
}

function renderTipTapNode(node: JSONContent, key: string): ReactNode {
  const children = Array.isArray(node.content)
    ? node.content.map((child, idx) => renderTipTapNode(child, `${key}-${idx}`)).filter(Boolean)
    : [];
  switch (node.type) {
    case "doc":
      return <Fragment key={key}>{children}</Fragment>;
    case "paragraph":
      return <p key={key} style={textBlockStyle(node)}>{children.length > 0 ? children : " "}</p>;
    case "heading": {
      const level = Number(
        typeof node.attrs === "object" && node.attrs !== null ? (node.attrs as Record<string, unknown>).level : 2,
      );
      const safeLevel = Math.min(6, Math.max(1, Number.isFinite(level) ? level : 2));
      const style = textBlockStyle(node);
      if (safeLevel === 1) return <h1 key={key} style={style}>{children}</h1>;
      if (safeLevel === 2) return <h2 key={key} style={style}>{children}</h2>;
      if (safeLevel === 3) return <h3 key={key} style={style}>{children}</h3>;
      if (safeLevel === 4) return <h4 key={key} style={style}>{children}</h4>;
      if (safeLevel === 5) return <h5 key={key} style={style}>{children}</h5>;
      return <h6 key={key} style={style}>{children}</h6>;
    }
    case "bulletList":
      return <ul key={key}>{children}</ul>;
    case "orderedList":
      return <ol key={key}>{children}</ol>;
    case "listItem":
      return <li key={key}>{children}</li>;
    case "blockquote":
      return <blockquote key={key} style={textBlockStyle(node)}>{children}</blockquote>;
    case "hardBreak":
      return <br key={key} />;
    case "horizontalRule":
      return <hr key={key} />;
    case "codeBlock":
      return (
        <pre key={key}>
          <code>{children}</code>
        </pre>
      );
    case "table":
      {
        const rows = children.filter(Boolean);
        const hasHeaderRow =
          Array.isArray(node.content) &&
          node.content.some((row) =>
            Array.isArray(row.content) ? row.content.some((cell) => cell.type === "tableHeader") : false,
          );
        const firstRow = rows[0] ?? null;
        const bodyRows = rows.slice(hasHeaderRow ? 1 : 0);
        return (
          <div key={key} className="requirements-print-richtext-table-wrap">
            <table className="requirements-print-table">
              {hasHeaderRow && firstRow ? <thead>{firstRow}</thead> : null}
              <tbody>{bodyRows.length > 0 ? bodyRows : !hasHeaderRow && firstRow ? firstRow : null}</tbody>
            </table>
          </div>
        );
      }
    case "tableRow":
      return <tr key={key}>{children}</tr>;
    case "tableHeader":
      return <th key={key} style={textBlockStyle(node)}>{children}</th>;
    case "tableCell":
      return <td key={key} style={textBlockStyle(node)}>{children}</td>;
    case "text":
      return <Fragment key={key}>{renderTextWithMarks(node, key)}</Fragment>;
    case "image": {
      const attrs = (typeof node.attrs === "object" && node.attrs !== null ? node.attrs : {}) as Record<string, unknown>;
      const src =
        typeof attrs.src === "string"
          ? (attrs.src as string)
          : "";
      const alt =
        typeof attrs.alt === "string"
          ? (attrs.alt as string)
          : "";
      const alignRaw = typeof attrs.dataAlign === "string" ? attrs.dataAlign : "left";
      const valignRaw = typeof attrs.dataValign === "string" ? attrs.dataValign : "top";
      const widthRaw = typeof attrs.width === "number" ? attrs.width : typeof attrs.width === "string" ? Number(attrs.width) : undefined;
      const heightRaw = typeof attrs.height === "number" ? attrs.height : typeof attrs.height === "string" ? Number(attrs.height) : undefined;
      const justify = alignRaw === "center" ? "center" : alignRaw === "right" ? "flex-end" : "flex-start";
      const alignItems = valignRaw === "middle" ? "center" : valignRaw === "bottom" ? "flex-end" : "flex-start";
      if (!src) {
        return null;
      }
      return (
        <div key={key} className="requirements-print-image-wrap" style={{ justifyContent: justify, alignItems }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- print preview must preserve tiptap image sizing/position attributes */}
          <img
            src={src}
            alt={alt}
            style={{
              width: Number.isFinite(widthRaw) ? `${widthRaw}px` : undefined,
              height: Number.isFinite(heightRaw) ? `${heightRaw}px` : undefined,
            }}
          />
        </div>
      );
    }
    default:
      return children.length > 0 ? <Fragment key={key}>{children}</Fragment> : null;
  }
}

function textBlockStyle(node: JSONContent): CSSProperties {
  const attrs = (typeof node.attrs === "object" && node.attrs !== null ? node.attrs : {}) as Record<string, unknown>;
  const textAlignRaw = attrs.textAlign;
  const textAlign =
    textAlignRaw === "left" || textAlignRaw === "center" || textAlignRaw === "right" || textAlignRaw === "justify"
      ? textAlignRaw
      : undefined;
  return textAlign ? { textAlign } : {};
}

function renderTipTapDoc(doc: JSONContent | undefined): React.ReactNode {
  if (!doc) {
    return <p>（内容なし）</p>;
  }
  const rendered = renderTipTapNode(doc, "doc-root");
  if (!rendered) {
    return <p>（内容なし）</p>;
  }
  return rendered;
}

function SitemapTree({ node }: { node: SitemapNode }) {
  const label = node.labels.join(" / ");
  return (
    <li>
      <div className="requirements-print-sitemap-node">
        <span className="requirements-print-sitemap-label">{label || "(無題)"}</span>
        <span className="requirements-print-sitemap-screen">{node.screenName || " "}</span>
      </div>
      {node.children.length > 0 ? (
        <ul>
          {node.children.map((child) => (
            <SitemapTree key={child.id} node={child} />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

function SheetArticle({ sheet }: { sheet: RenderSheet }) {
  return (
    <article id={`req-sheet-${sheet.id}`} className="requirements-print-sheet">
      <header className="requirements-print-sheet-header">
        <h1>{sheet.title}</h1>
        <DateLine createdOn={sheet.createdOn} updatedOn={sheet.updatedOn} />
      </header>

      {sheet.mode === "richtext" ? (
        <section className="requirements-print-richtext">{renderTipTapDoc(sheet.richtextDoc)}</section>
      ) : null}

      {sheet.mode === "table" ? (
        <section className="requirements-print-table-wrap">
          <table className="requirements-print-table">
            <caption className="requirements-print-sr-only">{sheet.title}</caption>
            <thead>
              <tr>
                {sheet.table?.headers.map((label, idx) => (
                  <th key={`${sheet.id}-th-${idx}`} scope="col">
                    {label || `列${idx + 1}`}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(sheet.table?.rows.length ?? 0) === 0 ? (
                <tr>
                  <td colSpan={sheet.table?.headers.length ?? 1}>（内容なし）</td>
                </tr>
              ) : (
                sheet.table?.rows.map((row, ri) => (
                  <tr key={`${sheet.id}-tr-${ri}`}>
                    {row.map((cell, ci) => (
                      <td key={`${sheet.id}-td-${ri}-${ci}`}>{cell || " "}</td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </section>
      ) : null}

      {sheet.mode === "split_editor_table" ? (
        <section className="requirements-print-split">
          <div className="requirements-print-split-left">{renderTipTapDoc(sheet.split?.richtextDoc)}</div>
          <div className="requirements-print-split-right">
            <table className="requirements-print-table">
              <caption className="requirements-print-sr-only">{sheet.title}</caption>
              <thead>
                <tr>
                  {sheet.split?.headers.map((label, idx) => (
                    <th key={`${sheet.id}-sp-th-${idx}`} scope="col">
                      {label || `列${idx + 1}`}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(sheet.split?.rows.length ?? 0) === 0 ? (
                  <tr>
                    <td colSpan={sheet.split?.headers.length ?? 3}>（内容なし）</td>
                  </tr>
                ) : (
                  sheet.split?.rows.map((row, ri) => (
                    <tr key={`${sheet.id}-sp-tr-${ri}`}>
                      {row.map((cell, ci) => (
                        <td key={`${sheet.id}-sp-td-${ri}-${ci}`}>{cell || " "}</td>
                      ))}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {sheet.mode === "sitemap" ? (
        <section className="requirements-print-sitemap">
          {sheet.sitemapRoot ? <SitemapPreviewBlock root={sheet.sitemapRoot} /> : <p>（内容なし）</p>}
        </section>
      ) : null}
    </article>
  );
}

function SitemapPreviewBlock({ root }: { root: SitemapNode }) {
  const [layout, setLayout] = useState<SitemapPreviewDiagramLayout>("horizontal");
  return (
    <div className="requirements-print-sitemap-canvas-wrap">
      <div className="requirements-print-sitemap-toolbar requirements-print-no-print">
        <label htmlFor="sitemap-layout" className="text-xs text-[var(--muted)]">
          レイアウト
        </label>
        <select
          id="sitemap-layout"
          className="rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-800"
          value={layout}
          onChange={(e) => setLayout(e.target.value as SitemapPreviewDiagramLayout)}
        >
          <option value="horizontal">水平（右方向）</option>
          <option value="vertical">垂直（下方向）</option>
        </select>
      </div>
      <div className="requirements-print-sitemap-canvas-shell">
        <div
          className="requirements-print-sitemap-canvas"
          style={{
            width: `${A4_LANDSCAPE_CANVAS_WIDTH}px`,
            height: `${A4_LANDSCAPE_CANVAS_HEIGHT}px`,
          }}
        >
          <PreviewSitemapCanvas root={root} diagramLayout={layout} />
        </div>
      </div>
      <div className="requirements-print-sitemap-list-fallback">
        <ul>
          <SitemapTree node={root} />
        </ul>
      </div>
    </div>
  );
}

export function ProjectRequirementsPrintPreviewClient({
  projectId,
  initialBody,
  initialSelectedPageId,
}: PrintPreviewClientProps) {
  const [body, setBody] = useState<RequirementsDocBody>(initialBody);
  const visiblePages = useMemo(() => body.pages.filter((p) => !p.deleted), [body.pages]);
  const [activePageId, setActivePageId] = useState<string>(
    () => visiblePages.find((p) => p.id === initialSelectedPageId)?.id ?? visiblePages[0]?.id ?? "",
  );
  const [activeSheetIndex, setActiveSheetIndex] = useState(0);
  const [popupOpen, setPopupOpen] = useState(true);
  const [panelPos, setPanelPos] = useState({ x: 24, y: 20 });
  const draggingRef = useRef<{ active: boolean; dx: number; dy: number }>({ active: false, dx: 0, dy: 0 });

  const allSheets = useMemo(() => visiblePages.flatMap((p) => buildSheets(p)), [visiblePages]);

  useEffect(() => {
    if (visiblePages.length === 0) {
      return;
    }
    if (!activePageId || !visiblePages.some((p) => p.id === activePageId)) {
      setActivePageId(visiblePages[0].id);
    }
  }, [activePageId, visiblePages]);

  useEffect(() => {
    if (activeSheetIndex >= allSheets.length) {
      setActiveSheetIndex(Math.max(0, allSheets.length - 1));
    }
  }, [allSheets.length, activeSheetIndex]);

  useEffect(() => {
    if (!activePageId) {
      return;
    }
    const firstIndex = allSheets.findIndex((s) => s.pageId === activePageId);
    if (firstIndex >= 0) {
      setActiveSheetIndex(firstIndex);
    }
  }, [activePageId, allSheets]);

  useEffect(() => {
    const channelName = requirementsPrintPreviewChannelName(projectId);
    const channel = new BroadcastChannel(channelName);
    channel.onmessage = (event: MessageEvent<{ body?: RequirementsDocBody; activePageId?: string }>) => {
      if (event.data?.body) {
        setBody(event.data.body);
      }
      if (typeof event.data?.activePageId === "string") {
        setActivePageId(event.data.activePageId);
      }
    };
    return () => {
      channel.close();
    };
  }, [projectId]);

  useEffect(() => {
    const onPointerMove = (e: PointerEvent) => {
      if (!draggingRef.current.active) {
        return;
      }
      setPanelPos({
        x: Math.max(8, e.clientX - draggingRef.current.dx),
        y: Math.max(8, e.clientY - draggingRef.current.dy),
      });
    };
    const onPointerUp = () => {
      draggingRef.current.active = false;
    };
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };
  }, []);

  const beginDrag = (e: ReactPointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.parentElement?.getBoundingClientRect();
    if (!rect) {
      return;
    }
    draggingRef.current = {
      active: true,
      dx: e.clientX - rect.left,
      dy: e.clientY - rect.top,
    };
  };

  const scrollToSheet = (index: number) => {
    const sheet = allSheets[index];
    if (!sheet) {
      return;
    }
    setActiveSheetIndex(index);
    setActivePageId(sheet.pageId);
    const anchorEl = document.getElementById(`req-sheet-${sheet.id}`);
    anchorEl?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const goPrev = () => {
    if (activeSheetIndex <= 0) {
      return;
    }
    scrollToSheet(activeSheetIndex - 1);
  };
  const goNext = () => {
    if (activeSheetIndex >= allSheets.length - 1) {
      return;
    }
    scrollToSheet(activeSheetIndex + 1);
  };
  const activePageIndex = Math.max(0, visiblePages.findIndex((p) => p.id === activePageId));

  return (
    <div className="requirements-print-preview-root">
      <div
        className={cn("requirements-print-floating-nav requirements-print-no-print", !popupOpen && "is-collapsed")}
        style={{ left: `${panelPos.x}px`, top: `${panelPos.y}px` }}
      >
        <div className="requirements-print-floating-head" onPointerDown={beginDrag}>
          <span className="requirements-print-floating-title">
            <Move className="h-3.5 w-3.5" />
            ページ一覧
          </span>
          <button
            type="button"
            className="requirements-print-toggle-btn"
            onClick={() => setPopupOpen((v) => !v)}
            aria-label={popupOpen ? "折りたたむ" : "展開する"}
          >
            <ChevronDown className={cn("h-4 w-4 transition-transform duration-200", popupOpen ? "rotate-0" : "-rotate-90")} />
          </button>
        </div>

        <div className="requirements-print-controls">
          <Button type="button" variant="default" size="sm" onClick={goPrev}>
            <ChevronLeft className="h-4 w-4" />
            前へ
          </Button>
          <Button type="button" variant="default" size="sm" onClick={goNext}>
            次へ
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button type="button" variant="accent" size="sm" onClick={() => window.print()}>
            <Printer className="h-4 w-4" />
            印刷
          </Button>
        </div>

        {popupOpen ? (
          <Card className="mt-2 min-h-0 overflow-hidden">
            <CardContent className="flex max-h-[52vh] flex-col gap-1 overflow-y-auto p-3">
              <p className="mb-1 text-xs font-medium text-[var(--muted)]">
                要件ページ {activePageIndex + 1} / {Math.max(visiblePages.length, 1)} ・ 印刷ページ {allSheets.length === 0 ? 0 : activeSheetIndex + 1} /{" "}
                {Math.max(allSheets.length, 1)}
              </p>
              {visiblePages.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    setActivePageId(p.id);
                    const firstIdx = allSheets.findIndex((s) => s.pageId === p.id);
                    if (firstIdx >= 0) {
                      scrollToSheet(firstIdx);
                    }
                  }}
                  className={cn(
                    "rounded-md px-2 py-2 text-left text-sm",
                    activePageId === p.id
                      ? "bg-[color:color-mix(in_srgb,var(--accent)_14%,var(--surface)_86%)]"
                      : "hover:bg-[color:color-mix(in_srgb,var(--surface)_90%,transparent)]",
                  )}
                >
                  <span className="block line-clamp-2">{p.title || p.pageType}</span>
                </button>
              ))}
              <div className="mt-1 border-t border-[color:color-mix(in_srgb,var(--border)_78%,transparent)] pt-1">
                <p className="mb-1 text-[10px] text-[var(--muted)]">印刷ページアンカー</p>
                {allSheets.map((s, idx) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => scrollToSheet(idx)}
                    className={cn(
                      "block w-full rounded px-2 py-1 text-left text-xs",
                      idx === activeSheetIndex
                        ? "bg-[color:color-mix(in_srgb,var(--accent)_16%,var(--surface)_84%)]"
                        : "hover:bg-[color:color-mix(in_srgb,var(--surface)_90%,transparent)]",
                    )}
                  >
                    {s.title}
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>
        ) : null}
      </div>

      <main className="requirements-print-canvas-wrap">
        {allSheets.length > 0 ? (
          <div>
            {allSheets.map((sheet) => <SheetArticle key={`sheet-${sheet.id}`} sheet={sheet} />)}
          </div>
        ) : (
          <Card>
            <CardContent className="p-6 text-sm text-[var(--muted)]">表示対象のページがありません。</CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}

