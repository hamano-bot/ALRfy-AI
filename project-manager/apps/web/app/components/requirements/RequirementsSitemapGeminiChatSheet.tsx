"use client";

import { Button } from "@/app/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/app/components/ui/sheet";
import { cn } from "@/lib/utils";
import { GeminiMarkIcon } from "@/app/project-list/[projectId]/hearing/GeminiMarkIcon";
import type { RequirementsPageContentSitemap } from "@/lib/requirements-sitemap-schema";
import type { SitemapChatMessage } from "@/lib/requirements-sitemap-gemini-map";
import { Loader2, Send } from "lucide-react";
import { useCallback, useMemo, useState } from "react";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  current: RequirementsPageContentSitemap;
  readOnly: boolean;
  onApply: (next: RequirementsPageContentSitemap) => void;
};

type PreviewRow = { id: string; depth: number; screenName: string; labels: string[] };

function flattenPreviewRows(content: RequirementsPageContentSitemap): PreviewRow[] {
  const rows: PreviewRow[] = [];
  const walk = (node: RequirementsPageContentSitemap["root"], depth: number) => {
    rows.push({ id: node.id, depth, screenName: node.screenName, labels: node.labels });
    for (const c of node.children) {
      walk(c, depth + 1);
    }
  };
  walk(content.root, 0);
  return rows;
}

export function RequirementsSitemapGeminiChatSheet({ open, onOpenChange, current, readOnly, onApply }: Props) {
  const [messages, setMessages] = useState<SitemapChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<RequirementsPageContentSitemap | null>(null);
  const currentRows = useMemo(() => flattenPreviewRows(current), [current]);
  const previewRows = useMemo(() => (preview ? flattenPreviewRows(preview) : []), [preview]);
  const changedRowCount = useMemo(() => {
    if (!preview) {
      return 0;
    }
    const before = new Map(currentRows.map((r) => [r.id, `${r.screenName}|${r.labels.join(" / ")}`]));
    let changed = 0;
    for (const r of previewRows) {
      const prev = before.get(r.id);
      const now = `${r.screenName}|${r.labels.join(" / ")}`;
      if (prev !== now) {
        changed += 1;
      }
    }
    return changed + Math.max(0, previewRows.length - currentRows.length);
  }, [currentRows, preview, previewRows]);

  const reset = useCallback(() => {
    setMessages([]);
    setInput("");
    setLoading(false);
    setError(null);
    setPreview(null);
  }, []);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || readOnly) {
      return;
    }
    setLoading(true);
    setError(null);
    setInput("");
    setMessages((prev) => [...prev, { role: "user", text }]);
    try {
      const res = await fetch("/api/requirements/sitemap-gemini-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          current,
          messages,
          lastUserMessage: text,
        }),
      });
      const body = (await res.json()) as { success?: boolean; message?: string; content?: RequirementsPageContentSitemap };
      if (!res.ok || !body.success || !body.content) {
        setError(typeof body.message === "string" ? body.message : "編集に失敗しました。");
        setMessages((prev) => prev.slice(0, -1));
        setLoading(false);
        return;
      }
      setMessages((prev) => [
        ...prev,
        { role: "model", text: "提案するサイトマップを生成しました。プレビューを確認して反映してください。" },
      ]);
      setPreview(body.content);
    } catch {
      setError("通信に失敗しました。");
      setMessages((prev) => prev.slice(0, -1));
    } finally {
      setLoading(false);
    }
  }, [current, input, messages, readOnly]);

  const apply = () => {
    if (preview) {
      onApply(preview);
    }
    reset();
    onOpenChange(false);
  };

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          reset();
        }
        onOpenChange(o);
      }}
    >
      <SheetContent side="right" className="w-[min(100vw,1180px)] p-0 sm:max-w-none">
        <div className="flex h-full min-h-0 flex-col lg:flex-row">
          <div className="flex min-h-0 flex-col border-b border-[color:color-mix(in_srgb,var(--border)_88%,transparent)] p-3 lg:w-[44%] lg:border-b-0 lg:border-r">
            <SheetHeader>
              <SheetTitle className="flex items-center gap-2 pr-8">
                <GeminiMarkIcon className="h-5 w-5 shrink-0" />
                Gemini でサイトマップを編集
              </SheetTitle>
            </SheetHeader>
            <p className="mt-2 text-xs text-[var(--muted)]">左が現行、右が提案。変化がある行は強調表示します。</p>
            <div className="mt-3 grid min-h-0 flex-1 gap-2 lg:grid-cols-2">
              <div className="flex min-h-0 flex-col rounded-md border border-[color:color-mix(in_srgb,var(--border)_88%,transparent)] p-2">
                <p className="text-xs font-medium text-[var(--foreground)]">現行</p>
                <div className="modern-scrollbar mt-2 min-h-0 flex-1 overflow-y-auto text-xs">
                  {currentRows.map((r) => (
                    <div key={`before-${r.id}`} className="rounded px-1 py-0.5" style={{ marginLeft: `${r.depth * 10}px` }}>
                      <span className="font-medium">{r.screenName}</span>
                      {r.labels.length ? <span className="ml-1 text-[var(--muted)]">[{r.labels.join(" / ")}]</span> : null}
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex min-h-0 flex-col rounded-md border border-[color:color-mix(in_srgb,var(--accent)_35%,transparent)] bg-[color:color-mix(in_srgb,var(--accent)_8%,transparent)] p-2">
                <p className="text-xs font-medium text-[var(--foreground)]">提案 {preview ? `(${changedRowCount} 件変化)` : ""}</p>
                <div className="modern-scrollbar mt-2 min-h-0 flex-1 overflow-y-auto text-xs">
                  {!preview ? (
                    <p className="text-[var(--muted)]">まだ提案がありません。</p>
                  ) : (
                    previewRows.map((r) => {
                      const before = currentRows.find((c) => c.id === r.id);
                      const changed = !before || before.screenName !== r.screenName || before.labels.join(" / ") !== r.labels.join(" / ");
                      return (
                        <div
                          key={`after-${r.id}`}
                          className={cn("rounded px-1 py-0.5", changed && "bg-[color:color-mix(in_srgb,var(--accent)_20%,transparent)]")}
                          style={{ marginLeft: `${r.depth * 10}px` }}
                        >
                          <span className="font-medium">{r.screenName}</span>
                          {r.labels.length ? <span className="ml-1 text-[var(--muted)]">[{r.labels.join(" / ")}]</span> : null}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="flex min-h-0 flex-1 flex-col gap-3 p-3">
            <p className="text-xs text-[var(--muted)]">現在のサイトマップ JSON が API に送信されます。個人情報を含めないでください。</p>
            <div className="modern-scrollbar min-h-0 flex-1 space-y-2 overflow-y-auto rounded-md border border-[color:color-mix(in_srgb,var(--border)_88%,transparent)] p-2">
              {messages.length === 0 ? (
                <p className="text-xs text-[var(--muted)]">指示を入力して送信してください。</p>
              ) : (
                messages.map((m, i) => (
                  <div key={`${i}-${m.role}`} className={cn("flex", m.role === "model" ? "justify-end" : "justify-start")}>
                    <div
                      className={cn(
                        "max-w-[80%] rounded-xl border p-2 text-sm shadow-sm",
                        m.role === "user"
                          ? "border-[color:color-mix(in_srgb,var(--border)_90%,transparent)] bg-[color:color-mix(in_srgb,var(--surface)_92%,transparent)]"
                          : "border-[color:color-mix(in_srgb,var(--accent)_35%,transparent)] bg-[color:color-mix(in_srgb,var(--accent)_8%,transparent)]",
                      )}
                    >
                      <p className="mb-1 text-[10px] font-medium text-[var(--muted)]">
                        {m.role === "user" ? "あなた" : "Gemini"}
                      </p>
                      <div className={cn("flex items-start gap-1.5", m.role === "model" && "justify-end")}>
                        {m.role === "model" ? <GeminiMarkIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" /> : null}
                        <p className="whitespace-pre-wrap text-[var(--foreground)]">{m.text}</p>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
            {error ? (
              <p className="text-xs text-red-600" role="alert">
                {error}
              </p>
            ) : null}
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && e.ctrlKey) {
                  e.preventDefault();
                  void send();
                }
              }}
              placeholder="例: 新着のラベルに News を追加して（Ctrl+Enter で送信）"
              rows={3}
              disabled={readOnly || loading}
              className={cn(
                "flex min-h-[72px] w-full resize-none rounded-md border border-[color:color-mix(in_srgb,var(--border)_90%,transparent)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--foreground)] shadow-sm outline-none",
                "placeholder:text-[var(--muted)] focus-visible:ring-2 focus-visible:ring-[color:color-mix(in_srgb,var(--accent)_45%,transparent)]",
                "disabled:cursor-not-allowed disabled:opacity-50",
              )}
            />
            <div className="space-y-2 border-t border-[color:color-mix(in_srgb,var(--border)_88%,transparent)] pt-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[11px] text-[var(--muted)]">Enter: 改行 / Ctrl+Enter: 送信</p>
                <Button type="button" size="sm" disabled={readOnly || loading || !input.trim()} onClick={() => void send()}>
                  {loading ? (
                    <>
                      <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                      送信中…
                    </>
                  ) : (
                    <>
                      <Send className="mr-1 h-4 w-4" />
                      送信
                    </>
                  )}
                </Button>
              </div>
              <div className="flex items-center justify-between gap-2">
                <Button type="button" variant="ghost" size="sm" onClick={() => onOpenChange(false)} disabled={loading}>
                  キャンセル
                </Button>
                <div className="flex flex-wrap justify-end gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="text-red-600 hover:text-red-700"
                    disabled={!preview || readOnly}
                    onClick={() => setPreview(null)}
                  >
                    提案を破棄
                  </Button>
                  <Button type="button" size="sm" variant="default" disabled={!preview || readOnly} onClick={apply}>
                    反映する
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
