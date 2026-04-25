"use client";

import { Button } from "@/app/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/app/components/ui/dialog";
import { Label } from "@/app/components/ui/label";
import { GeminiMarkIcon } from "@/app/project-list/[projectId]/hearing/GeminiMarkIcon";
import type { RequirementsPageContentSitemap } from "@/lib/requirements-sitemap-schema";
import { mergeSitemapImport, type SitemapImportMergeMode } from "@/lib/requirements-sitemap-schema";
import { Loader2 } from "lucide-react";
import { useCallback, useRef, useState } from "react";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  current: RequirementsPageContentSitemap;
  readOnly: boolean;
  onApply: (next: RequirementsPageContentSitemap) => void;
};

export function RequirementsSitemapImportExcelDialog({ open, onOpenChange, current, readOnly, onApply }: Props) {
  const [mergeMode, setMergeMode] = useState<SitemapImportMergeMode>("replace");
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<"pick" | "preview">("pick");
  const [preview, setPreview] = useState<RequirementsPageContentSitemap | null>(null);
  const [meta, setMeta] = useState<{ sheetName: string; text_truncated: boolean } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const reset = useCallback(() => {
    setMergeMode("replace");
    setFile(null);
    setError(null);
    setStep("pick");
    setPreview(null);
    setMeta(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }, []);

  const runImport = useCallback(async () => {
    if (!file || readOnly) {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.set("file", file);
      const res = await fetch("/api/requirements/sitemap-import-excel", {
        method: "POST",
        body: fd,
      });
      const text = await res.text();
      let msg = "取り込みに失敗しました。";
      let content: RequirementsPageContentSitemap | null = null;
      let metaPayload: { sheetName?: string; text_truncated?: boolean } | null = null;
      try {
        const j = JSON.parse(text) as {
          success?: boolean;
          message?: string;
          content?: RequirementsPageContentSitemap;
          meta?: { sheetName?: string; text_truncated?: boolean };
        };
        if (typeof j.message === "string") {
          msg = j.message;
        }
        if (j.success && j.content) {
          content = j.content;
          metaPayload = j.meta ?? null;
        }
      } catch {
        /* ignore */
      }
      if (!res.ok || !content) {
        setError(msg);
        setLoading(false);
        return;
      }
      const merged = mergeSitemapImport(mergeMode, current, content);
      setPreview(merged);
      setMeta(
        metaPayload
          ? {
              sheetName: metaPayload.sheetName ?? "",
              text_truncated: Boolean(metaPayload.text_truncated),
            }
          : null,
      );
      setStep("preview");
    } catch {
      setError("取り込みに失敗しました。");
    } finally {
      setLoading(false);
    }
  }, [file, readOnly, mergeMode, current]);

  const apply = () => {
    if (preview) {
      onApply(preview);
    }
    reset();
    onOpenChange(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          reset();
        }
        onOpenChange(o);
      }}
    >
      <DialogContent className="max-h-[min(90vh,720px)] overflow-y-auto sm:max-w-lg" onOpenAutoFocus={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GeminiMarkIcon className="h-5 w-5 shrink-0" />
            Excel を取り込む（サイトマップ）
          </DialogTitle>
        </DialogHeader>
        {step === "pick" ? (
          <div className="space-y-4">
            <p className="text-xs text-[var(--muted)]">
              先頭シートを読み取り、Gemini でサイトマップ JSON に変換します。シート内容は Google に送信されます。
            </p>
            <div className="space-y-2">
              <Label>ファイル（.xlsx / .xls）</Label>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls"
                className="block w-full text-sm"
                disabled={readOnly || loading}
                onChange={(e) => {
                  const f = e.target.files?.[0] ?? null;
                  setFile(f);
                }}
              />
            </div>
            <div className="space-y-2">
              <Label>取り込み後</Label>
              <label className="flex cursor-pointer items-start gap-2 text-sm">
                <input
                  type="radio"
                  name="sm-merge"
                  checked={mergeMode === "replace"}
                  disabled={readOnly || loading}
                  onChange={() => setMergeMode("replace")}
                  className="mt-1"
                />
                <span>
                  <span className="font-medium">すべて置換</span>
                  <span className="block text-xs text-[var(--muted)]">現在のサイトマップを結果で丸ごと差し替えます。</span>
                </span>
              </label>
              <label className="flex cursor-pointer items-start gap-2 text-sm">
                <input
                  type="radio"
                  name="sm-merge"
                  checked={mergeMode === "append"}
                  disabled={readOnly || loading}
                  onChange={() => setMergeMode("append")}
                  className="mt-1"
                />
                <span>
                  <span className="font-medium">追加</span>
                  <span className="block text-xs text-[var(--muted)]">
                    取り込み結果の root.children を、既存 root.children の末尾に連結します。
                  </span>
                </span>
              </label>
            </div>
            {error ? (
              <p className="text-sm text-red-600" role="alert">
                {error}
              </p>
            ) : null}
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={loading}>
                キャンセル
              </Button>
              <Button type="button" disabled={!file || readOnly || loading} onClick={() => void runImport()}>
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    取り込み中…
                  </>
                ) : (
                  <>
                    <GeminiMarkIcon className="mr-2 h-4 w-4 shrink-0" />
                    取り込みを実行
                  </>
                )}
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-[var(--foreground)]">
              プレビュー（{meta?.sheetName ? `シート: ${meta.sheetName}` : "取り込み結果"}
              {meta?.text_truncated ? " / 長いため先頭のみ Gemini に渡しました" : ""}）
            </p>
            <p className="text-xs text-[var(--muted)]">
              ルート画面名: <strong>{preview?.root.screenName}</strong> / 直下の子: {preview?.root.children.length ?? 0} 件
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="ghost" onClick={() => setStep("pick")}>
                戻る
              </Button>
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                キャンセル
              </Button>
              <Button type="button" onClick={apply}>
                エディタに反映
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
