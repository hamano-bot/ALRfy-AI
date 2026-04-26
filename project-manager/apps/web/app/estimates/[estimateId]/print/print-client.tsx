"use client";

import { useEffect, useState } from "react";
import { absolutizeEstimateHtmlAssets, injectPrintOverridesForEstimate } from "@/lib/estimate-print-html";

export function EstimatePrintToPdfClient({ estimateId }: { estimateId: number }) {
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (estimateId <= 0) {
      setErr("見積IDが不正です。");
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/portal/estimate-export-html", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ estimate_id: estimateId }),
        });
        const data = (await res.json()) as { success?: boolean; html?: string; message?: string };
        if (cancelled) return;
        if (!res.ok || !data.success || !data.html) {
          setErr(data.message ?? "帳票の取得に失敗しました。");
          return;
        }
        const origin = typeof window !== "undefined" ? window.location.origin : "";
        const html = injectPrintOverridesForEstimate(absolutizeEstimateHtmlAssets(data.html, origin));
        const w = window.open("", "_blank", "noopener,noreferrer");
        if (!w) {
          setErr("ポップアップがブロックされています。許可してから再度お試しください。");
          return;
        }
        w.document.open();
        w.document.write(html);
        w.document.close();
        window.setTimeout(() => {
          try {
            w.focus();
            w.print();
          } catch {
            /* ignore */
          }
        }, 400);
      } catch {
        if (!cancelled) setErr("通信に失敗しました。");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [estimateId]);

  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 p-8 text-sm text-[var(--muted)]">
      {err ? <p className="text-center text-amber-700">{err}</p> : <p>印刷ダイアログを開いています…（「PDF に保存」を選ぶとレイアウトはプレビュー印刷と同じです）</p>}
    </div>
  );
}
