"use client";

import { Move, Printer } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Button } from "@/app/components/ui/button";
import { absolutizeEstimateHtmlAssets } from "@/lib/estimate-print-html";
import { estimatePrintPreviewChannelName } from "@/lib/estimate-print-preview-channel";
import { cn } from "@/lib/utils";

type EstimatePreviewClientProps = {
  estimateId: number;
};

export function EstimatePreviewClient({ estimateId }: EstimatePreviewClientProps) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [html, setHtml] = useState<string>("");
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [panelPos, setPanelPos] = useState({ x: 24, y: 20 });
  const draggingRef = useRef<{ active: boolean; dx: number; dy: number }>({ active: false, dx: 0, dy: 0 });
  const refreshDebounceRef = useRef<number | null>(null);

  const loadHtml = useCallback(async () => {
    if (estimateId <= 0) {
      setMessage("見積IDが不正です。");
      setLoading(false);
      setHtml("");
      return;
    }
    setMessage(null);
    setLoading(true);
    try {
      const hRes = await fetch("/api/portal/estimate-export-html", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ estimate_id: estimateId }),
      });

      let hData: { success?: boolean; html?: string; a4_overflow_warning?: boolean; message?: string };
      try {
        hData = (await hRes.json()) as typeof hData;
      } catch {
        setHtml("");
        setMessage("プレビュー応答の形式が不正です。");
        return;
      }

      if (!hRes.ok || !hData.success || !hData.html) {
        setHtml("");
        setMessage(hData.message ?? "プレビュー取得に失敗しました。");
        return;
      }

      const origin = typeof window !== "undefined" ? window.location.origin : "";
      setHtml(absolutizeEstimateHtmlAssets(hData.html, origin));
    } catch {
      setHtml("");
      setMessage("プレビュー取得に失敗しました。");
    } finally {
      setLoading(false);
    }
  }, [estimateId]);

  const fitIframeHeight = useCallback(() => {
    const frame = iframeRef.current;
    if (!frame) {
      return;
    }
    const doc = frame.contentDocument;
    if (!doc?.documentElement) {
      return;
    }
    const h = Math.max(doc.documentElement.scrollHeight, doc.body?.scrollHeight ?? 0);
    frame.style.height = `${h}px`;
  }, []);

  useEffect(() => {
    void loadHtml();
  }, [loadHtml]);

  useEffect(() => {
    if (estimateId <= 0) {
      return;
    }
    const name = estimatePrintPreviewChannelName(estimateId);
    const channel = new BroadcastChannel(name);
    channel.onmessage = () => {
      if (refreshDebounceRef.current != null) {
        window.clearTimeout(refreshDebounceRef.current);
      }
      refreshDebounceRef.current = window.setTimeout(() => {
        refreshDebounceRef.current = null;
        void loadHtml();
      }, 280);
    };
    return () => {
      channel.close();
      if (refreshDebounceRef.current != null) {
        window.clearTimeout(refreshDebounceRef.current);
        refreshDebounceRef.current = null;
      }
    };
  }, [estimateId, loadHtml]);

  useEffect(() => {
    if (!html) {
      return;
    }
    const id = window.setTimeout(() => fitIframeHeight(), 0);
    return () => window.clearTimeout(id);
  }, [html, fitIframeHeight]);

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

  const printPreview = () => {
    const frame = iframeRef.current;
    const frameWindow = frame?.contentWindow ?? null;
    if (!frameWindow) {
      setMessage("プレビューの印刷に失敗しました。");
      return;
    }
    frameWindow.focus();
    frameWindow.print();
  };

  const showLoadingLine = loading && !message;

  return (
    <div className="requirements-print-preview-root flex min-h-0 flex-1 flex-col">
      <div
        className={cn("requirements-print-floating-nav requirements-print-no-print is-collapsed")}
        style={{ left: `${panelPos.x}px`, top: `${panelPos.y}px` }}
      >
        <div className="requirements-print-floating-head !justify-center gap-1.5 px-0.5 py-0.5">
          <button
            type="button"
            className="requirements-print-drag-handle"
            onPointerDown={beginDrag}
            aria-label="パネルを移動"
          >
            <Move className="h-3.5 w-3.5" />
          </button>
          <Button
            type="button"
            variant="accent"
            size="icon"
            className="h-9 w-9 shrink-0 rounded-md p-0"
            onClick={printPreview}
            aria-label="印刷"
          >
            <Printer className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <main className="requirements-print-canvas-wrap flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden pb-28">
        {message ? <p className="mb-3 text-center text-sm text-[var(--muted)]">{message}</p> : null}
        {showLoadingLine ? <p className="text-center text-sm text-[var(--muted)]">プレビューを読み込み中…</p> : null}
        {html ? (
          <iframe
            ref={iframeRef}
            title="estimate-preview"
            srcDoc={html}
            scrolling="no"
            onLoad={fitIframeHeight}
            className="mx-auto block w-full max-w-[210mm] overflow-hidden border border-[var(--border)] bg-white"
          />
        ) : null}
      </main>
    </div>
  );
}
