"use client";

import { Button } from "@/app/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/app/components/ui/dialog";
import { Label } from "@/app/components/ui/label";
import { GeminiMarkIcon } from "@/app/project-list/[projectId]/hearing/GeminiMarkIcon";
import type { RequirementsPageContentTable } from "@/lib/requirements-doc-types";
import {
  mergeRequirementsTableImport,
  type RequirementsTableMergeMode,
} from "@/lib/requirements-table-import-merge";
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";
import { useCallback, useRef, useState } from "react";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  current: RequirementsPageContentTable;
  canEdit: boolean;
  onApply: (next: RequirementsPageContentTable) => void;
};

const MERGE_OPTIONS: { value: RequirementsTableMergeMode; label: string; hint: string }[] = [
  { value: "replace", label: "すべて置換", hint: "現在の表を取り込み結果で丸ごと置き換えます。" },
  {
    value: "append",
    label: "追加",
    hint: "1行全体が重複しない行のみ末尾に追加します（Gemini判定結果を使用）。",
  },
];

export function RequirementsTableImportExcelDialog({ open, onOpenChange, current, canEdit, onApply }: Props) {
  const [mergeMode, setMergeMode] = useState<RequirementsTableMergeMode>("replace");
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<"pick" | "preview">("pick");
  const [preview, setPreview] = useState<RequirementsPageContentTable | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const reset = useCallback(() => {
    setMergeMode("replace");
    setFile(null);
    setLoading(false);
    setError(null);
    setStep("pick");
    setPreview(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }, []);

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!next) {
        reset();
      }
      onOpenChange(next);
    },
    [onOpenChange, reset],
  );

  const runImport = useCallback(async () => {
    if (!file || !canEdit) {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.set("file", file);
      const res = await fetch("/api/requirements/table-import-excel", {
        method: "POST",
        body: fd,
      });
      const text = await res.text();
      let msg = "取り込みに失敗しました。";
      let content: RequirementsPageContentTable | null = null;
      try {
        const json = JSON.parse(text) as {
          success?: boolean;
          message?: string;
          content?: RequirementsPageContentTable;
        };
        if (typeof json.message === "string") {
          msg = json.message;
        }
        if (json.success && json.content) {
          content = json.content;
        }
      } catch {
        /* ignore */
      }
      if (!res.ok || !content) {
        setError(msg);
        return;
      }
      const merged = mergeRequirementsTableImport(current, content, mergeMode);
      setPreview(merged);
      setStep("preview");
    } catch {
      setError("取り込みに失敗しました。");
    } finally {
      setLoading(false);
    }
  }, [file, canEdit, current, mergeMode]);

  const apply = useCallback(() => {
    if (!preview) {
      return;
    }
    onApply(preview);
    handleOpenChange(false);
  }, [preview, onApply, handleOpenChange]);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className={cn(
          "max-h-[90vh] overflow-y-auto",
          step === "preview" ? "w-[min(96vw,56rem)] max-w-[min(96vw,56rem)]" : "w-[min(92vw,520px)]",
        )}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GeminiMarkIcon className="h-5 w-5 shrink-0" />
            Excel を取り込む（表組）
          </DialogTitle>
        </DialogHeader>
        {step === "pick" ? (
          <div className="space-y-4 text-sm">
            <p className="text-[var(--muted)]">
              Excel（.xlsx / .xls）の先頭シートを読み取り、Gemini で表組へ変換します。列数は最大6、不足時は3列基準で補完されます。
            </p>
            <div className="space-y-2">
              <Label htmlFor="requirements-table-excel-file">ファイル（.xlsx / .xls）</Label>
              <div className="rounded-xl border border-[color:color-mix(in_srgb,var(--border)_88%,transparent)] bg-[var(--edit-mode-surface)] p-4">
                <div className="flex flex-wrap items-center gap-3">
                  <input
                    ref={fileInputRef}
                    id="requirements-table-excel-file"
                    name="requirements-table-excel-file"
                    type="file"
                    accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                    className="sr-only"
                    disabled={!canEdit || loading}
                    onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  />
                  <Button type="button" variant="accent" disabled={!canEdit || loading} onClick={() => fileInputRef.current?.click()}>
                    ファイルを選択
                  </Button>
                  <span className={cn("min-w-0 flex-1 truncate", file ? "text-[var(--foreground)]" : "text-[var(--muted)]")}>
                    {file ? file.name : "選択されていません"}
                  </span>
                </div>
              </div>
            </div>
            <fieldset className="space-y-2">
              <legend className="text-xs font-medium text-[var(--muted)]">取り込み後</legend>
              {MERGE_OPTIONS.map((opt) => {
                const selected = mergeMode === opt.value;
                return (
                  <label
                    key={opt.value}
                    className={cn(
                      "flex cursor-pointer gap-2 rounded-lg border p-3 transition-[border-color,background-color]",
                      selected
                        ? "border-[color:color-mix(in_srgb,var(--accent)_42%,var(--border)_58%)] bg-[color:color-mix(in_srgb,var(--accent)_9%,var(--surface)_91%)]"
                        : "border-[color:color-mix(in_srgb,var(--border)_85%,transparent)] hover:border-[color:color-mix(in_srgb,var(--border)_72%,var(--accent)_28%)]",
                    )}
                  >
                    <input
                      type="radio"
                      name="requirements-table-merge-mode"
                      checked={selected}
                      disabled={!canEdit || loading}
                      onChange={() => setMergeMode(opt.value)}
                      className="mt-0.5 h-4 w-4 shrink-0 accent-[color:var(--accent)]"
                    />
                    <span>
                      <span className="font-medium text-[var(--foreground)]">{opt.label}</span>
                      <span className="mt-0.5 block text-xs text-[var(--muted)]">{opt.hint}</span>
                    </span>
                  </label>
                );
              })}
            </fieldset>
            {error ? (
              <p className="text-sm text-red-600 dark:text-red-400" role="alert">
                {error}
              </p>
            ) : null}
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="default" onClick={() => handleOpenChange(false)} disabled={loading}>
                キャンセル
              </Button>
              <Button type="button" variant="accent" disabled={!canEdit || !file || loading} onClick={() => void runImport()}>
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    解析中…
                  </>
                ) : (
                  "取り込んでプレビュー"
                )}
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4 text-sm">
            <p className="text-[var(--foreground)]">
              マージ結果: <strong>{current.rows.length}</strong> 行 → <strong>{preview?.rows.length ?? 0}</strong> 行
            </p>
            <div className="overflow-hidden rounded-lg border border-[color:color-mix(in_srgb,var(--border)_88%,transparent)]">
              <div className="max-h-[min(50vh,24rem)] overflow-auto" role="region" aria-label="表組マージ結果のプレビュー">
                <table className="w-full min-w-[640px] border-collapse text-left text-xs">
                  <thead className="sticky top-0 z-[1] border-b border-[color:color-mix(in_srgb,var(--border)_88%,transparent)] bg-[color:color-mix(in_srgb,var(--surface)_96%,transparent)]">
                    <tr>
                      {(preview?.columnLabels ?? current.columnLabels).map((label, idx) => (
                        <th key={`th-${idx}`} className="px-2 py-2 font-medium text-[var(--muted)]">
                          {label || `列${idx + 1}`}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(preview?.rows ?? []).map((row) => (
                      <tr key={row.id} className="border-b border-[color:color-mix(in_srgb,var(--border)_70%,transparent)]">
                        {row.cells.map((cell, ci) => (
                          <td key={`${row.id}-${ci}`} className="whitespace-pre-wrap px-2 py-1.5 align-top">
                            {cell}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="default" onClick={() => setStep("pick")}>
                戻る
              </Button>
              <Button type="button" variant="accent" onClick={apply}>
                表に反映
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
