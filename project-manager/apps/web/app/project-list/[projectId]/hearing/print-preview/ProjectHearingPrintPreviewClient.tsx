"use client";

import { ChevronLeft, ChevronRight, Move, Printer } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Button } from "@/app/components/ui/button";
import type { HearingSheetRow } from "@/lib/hearing-sheet-types";
import { hearingPrintPreviewChannelName } from "@/lib/hearing-print-preview-channel";
import { cn } from "@/lib/utils";

const ROWS_PER_PAGE = 24;

type ProjectHearingPrintPreviewClientProps = {
  projectId: number;
  projectName: string;
  initialRows: HearingSheetRow[];
  initialHideCompleted: boolean;
};

function chunkRows(rows: HearingSheetRow[], size: number): HearingSheetRow[][] {
  if (rows.length === 0) {
    return [[]];
  }
  const chunks: HearingSheetRow[][] = [];
  for (let i = 0; i < rows.length; i += size) {
    chunks.push(rows.slice(i, i + size));
  }
  return chunks;
}

export function ProjectHearingPrintPreviewClient({
  projectId,
  projectName,
  initialRows,
  initialHideCompleted,
}: ProjectHearingPrintPreviewClientProps) {
  const [rows, setRows] = useState(initialRows);
  const [hideCompletedRows, setHideCompletedRows] = useState(initialHideCompleted);
  const [title, setTitle] = useState(projectName);
  const [activeIndex, setActiveIndex] = useState(0);
  const [panelPos, setPanelPos] = useState({ x: 24, y: 20 });
  const draggingRef = useRef<{ active: boolean; dx: number; dy: number }>({ active: false, dx: 0, dy: 0 });

  const visibleRows = useMemo(
    () => (hideCompletedRows ? rows.filter((r) => r.row_status.trim() !== "完了") : rows),
    [rows, hideCompletedRows],
  );
  const pages = useMemo(() => chunkRows(visibleRows, ROWS_PER_PAGE), [visibleRows]);

  useEffect(() => {
    if (activeIndex >= pages.length) {
      setActiveIndex(Math.max(0, pages.length - 1));
    }
  }, [activeIndex, pages.length]);

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

  useEffect(() => {
    const channelName = hearingPrintPreviewChannelName(projectId);
    const channel = new BroadcastChannel(channelName);
    channel.onmessage = (event: MessageEvent<{ rows?: HearingSheetRow[]; hideCompletedRows?: boolean; projectName?: string }>) => {
      if (Array.isArray(event.data?.rows)) {
        setRows(event.data.rows);
      }
      if (typeof event.data?.hideCompletedRows === "boolean") {
        setHideCompletedRows(event.data.hideCompletedRows);
      }
      if (typeof event.data?.projectName === "string" && event.data.projectName.trim() !== "") {
        setTitle(event.data.projectName);
      }
    };
    return () => channel.close();
  }, [projectId]);

  const beginDrag = (e: ReactPointerEvent<HTMLElement>) => {
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
    const safeIndex = Math.max(0, Math.min(index, pages.length - 1));
    setActiveIndex(safeIndex);
    const anchorEl = document.getElementById(`hearing-sheet-${safeIndex}`);
    anchorEl?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const goPrev = () => {
    if (activeIndex <= 0) {
      return;
    }
    scrollToSheet(activeIndex - 1);
  };

  const goNext = () => {
    if (activeIndex >= pages.length - 1) {
      return;
    }
    scrollToSheet(activeIndex + 1);
  };

  return (
    <div className="hearing-print-preview-root">
      <div
        className={cn("requirements-print-floating-nav hearing-print-no-print is-collapsed")}
        style={{ left: `${panelPos.x}px`, top: `${panelPos.y}px` }}
      >
        <div className="requirements-print-floating-head">
          <button
            type="button"
            className="requirements-print-drag-handle"
            onPointerDown={beginDrag}
            aria-label="パネルを移動"
          >
            <Move className="h-3.5 w-3.5" />
          </button>
          <span className="requirements-print-floating-title sr-only">操作</span>
        </div>

        <div className="requirements-print-controls">
          {pages.length > 1 ? (
            <>
              <Button
                type="button"
                variant="default"
                size="sm"
                className="requirements-print-control-btn"
                onClick={goPrev}
                disabled={activeIndex <= 0}
                aria-label="前へ"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant="default"
                size="sm"
                className="requirements-print-control-btn"
                onClick={goNext}
                disabled={activeIndex >= pages.length - 1}
                aria-label="次へ"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </>
          ) : null}
          <Button
            type="button"
            variant="accent"
            size="sm"
            className={cn("requirements-print-control-btn", pages.length > 1 && "requirements-print-btn-print")}
            onClick={() => window.print()}
            aria-label="印刷"
          >
            <Printer className="h-4 w-4" />
            {pages.length > 1 ? null : <span className="sr-only">印刷</span>}
          </Button>
        </div>
      </div>

      <main className="hearing-print-canvas-wrap">
        {pages.map((pageRows, pageIndex) => (
          <article
            key={`hearing-sheet-${pageIndex}`}
            id={`hearing-sheet-${pageIndex}`}
            className="hearing-print-sheet"
            style={{ display: pageIndex === activeIndex ? "block" : "none" }}
          >
            <header className="hearing-print-sheet-header">
              <h1>{title || "ヒアリングシート"}</h1>
              <p className="hearing-print-meta">
                表示条件: {hideCompletedRows ? "完了を除く" : "全行"} / ページ {pageIndex + 1} / {pages.length}
              </p>
            </header>

            <section className="hearing-print-table-wrap">
              <table className="hearing-print-table">
                <colgroup>
                  <col style={{ width: "6%" }} />
                  <col style={{ width: "11%" }} />
                  <col style={{ width: "31.85%" }} />
                  <col style={{ width: "26.7%" }} />
                  <col style={{ width: "6%" }} />
                  <col style={{ width: "10.9%" }} />
                  <col style={{ width: "7.55%" }} />
                </colgroup>
                <thead>
                  <tr>
                    <th>分類</th>
                    <th>見出し</th>
                    <th>確認事項</th>
                    <th>回答</th>
                    <th>担当</th>
                    <th>期限</th>
                    <th>状況</th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.length === 0 ? (
                    <tr>
                      <td colSpan={7}>（表示対象の行がありません）</td>
                    </tr>
                  ) : (
                    pageRows.map((row) => (
                      <tr key={row.id}>
                        <td>{row.category || " "}</td>
                        <td>{row.heading || " "}</td>
                        <td>{row.question || " "}</td>
                        <td>{row.answer || " "}</td>
                        <td>{row.assignee || " "}</td>
                        <td>{row.due || " "}</td>
                        <td>{row.row_status || " "}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </section>
          </article>
        ))}
      </main>
    </div>
  );
}

