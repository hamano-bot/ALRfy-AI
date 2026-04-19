"use client";

import { Button } from "@/app/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/app/components/ui/dialog";
import { inputBaseClassName } from "@/app/components/ui/input";
import { Label } from "@/app/components/ui/label";
import { HEARING_AUTO_CATEGORY_DEFAULT_RULES_JA } from "@/lib/hearing-auto-category-gemini";
import {
  applyAutoCategoryToRows,
  selectRowsForAutoCategoryApi,
  type AutoCategoryStyleMode,
  type AutoCategoryTargetMode,
} from "@/lib/hearing-category-numbering";
import { projectToAdvicePayload } from "@/lib/hearing-advice-resolve";
import { displayText } from "@/lib/empty-display";
import type { HearingSheetRow } from "@/lib/hearing-sheet-types";
import { HEARING_TEMPLATE_LABELS, type HearingTemplateId } from "@/lib/hearing-sheet-template-matrix";
import type { PortalProjectDetail } from "@/lib/portal-project";
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

type HearingAutoCategoryDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  resolvedTemplateId: HearingTemplateId;
  project: PortalProjectDetail;
  currentRows: HearingSheetRow[];
  canEdit: boolean;
  onApply: (rows: HearingSheetRow[]) => void;
};

const TARGET_OPTIONS: { value: AutoCategoryTargetMode; label: string; hint: string }[] = [
  {
    value: "all",
    label: "すべての行",
    hint: "表のすべての行について分類を生成します（連番スタイルのときは表の順で 01 から振り直します）。",
  },
  {
    value: "empty_only",
    label: "分類が空欄の行のみ",
    hint: "分類が未入力の行だけ更新します。連番スタイルでは、他行で使われている番号と重ならないよう割り当てます。",
  },
];

const STYLE_OPTIONS: { value: AutoCategoryStyleMode; label: string; hint: string }[] = [
  {
    value: "indexed",
    label: "連番＋分類名",
    hint: "分類列に「01」＋名前の形式で入ります（2桁はこちらで付与し、Gemini は名前のみ返します）。",
  },
  {
    value: "label_only",
    label: "分類名のみ",
    hint: "連番は付けず、分類名だけをセットします。",
  },
];

export function HearingAutoCategoryDialog({
  open,
  onOpenChange,
  resolvedTemplateId,
  project,
  currentRows,
  canEdit,
  onApply,
}: HearingAutoCategoryDialogProps) {
  const [target, setTarget] = useState<AutoCategoryTargetMode>("empty_only");
  const [style, setStyle] = useState<AutoCategoryStyleMode>("indexed");
  const [extraRules, setExtraRules] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<"config" | "preview">("config");
  const [labels, setLabels] = useState<{ id: string; label: string }[] | null>(null);

  const [loadProgress, setLoadProgress] = useState(0);
  const [loadElapsedSec, setLoadElapsedSec] = useState(0);
  const [reduceMotion, setReduceMotion] = useState(false);
  const [portalReady, setPortalReady] = useState(false);

  useEffect(() => {
    setPortalReady(true);
  }, []);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setReduceMotion(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  const reset = useCallback(() => {
    setTarget("empty_only");
    setStyle("indexed");
    setExtraRules("");
    setError(null);
    setStep("config");
    setLabels(null);
    setLoadProgress(0);
    setLoadElapsedSec(0);
  }, []);

  const handleOpenChange = useCallback(
    (v: boolean) => {
      if (!v) {
        reset();
      }
      onOpenChange(v);
    },
    [onOpenChange, reset],
  );

  useEffect(() => {
    if (!loading) {
      return;
    }
    const start = Date.now();
    setLoadProgress(0);
    setLoadElapsedSec(0);
    const interval = window.setInterval(() => {
      setLoadElapsedSec(Math.floor((Date.now() - start) / 1000));
      setLoadProgress((p) => {
        if (p >= 90) {
          return 90;
        }
        return Math.min(90, p + 1.5 + Math.random() * 3.5);
      });
    }, 400);
    return () => window.clearInterval(interval);
  }, [loading]);

  const mergedPreview = useMemo(() => {
    if (!labels) {
      return null;
    }
    return applyAutoCategoryToRows(currentRows, { target, style, labels });
  }, [currentRows, target, style, labels]);

  const previewDiffRows = useMemo(() => {
    if (!mergedPreview) {
      return [] as { row: HearingSheetRow; before: string; after: string }[];
    }
    const out: { row: HearingSheetRow; before: string; after: string }[] = [];
    for (let i = 0; i < currentRows.length; i += 1) {
      const before = currentRows[i].category;
      const after = mergedPreview[i]?.category ?? before;
      if (before !== after) {
        out.push({ row: currentRows[i], before, after });
      }
    }
    return out;
  }, [currentRows, mergedPreview]);

  const runGemini = useCallback(async () => {
    if (!canEdit) {
      return;
    }
    const apiRows = selectRowsForAutoCategoryApi(currentRows, target).map((r) => ({
      id: r.id,
      heading: r.heading,
      question: r.question,
      category: r.category,
    }));
    if (apiRows.length === 0) {
      setError(
        target === "empty_only"
          ? "分類が空欄の行がありません。対象を「すべての行」にするか、空欄の行を用意してください。"
          : "行がありません。",
      );
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/hearing-sheet/auto-category", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project: projectToAdvicePayload(project),
          template_id: resolvedTemplateId,
          rows: apiRows,
          style,
          extra_rules: extraRules,
        }),
      });
      const text = await res.text();
      let msg = "分類の自動セットに失敗しました。";
      let payload: { labels?: { id: string; label: string }[] } | null = null;
      try {
        const j = JSON.parse(text) as { success?: boolean; message?: string; labels?: { id: string; label: string }[] };
        if (typeof j.message === "string") {
          msg = j.message;
        }
        if (j.success && Array.isArray(j.labels)) {
          payload = j;
        }
      } catch {
        /* ignore */
      }
      if (!res.ok || !payload?.labels) {
        setError(msg);
        setLoading(false);
        setLoadProgress(0);
        setLoadElapsedSec(0);
        return;
      }
      setLoadProgress(100);
      window.setTimeout(() => {
        setLabels(payload!.labels!);
        setStep("preview");
        setLoading(false);
        setLoadProgress(0);
        setLoadElapsedSec(0);
      }, 150);
    } catch {
      setError("分類の自動セットに失敗しました。");
      setLoading(false);
      setLoadProgress(0);
      setLoadElapsedSec(0);
    }
  }, [canEdit, currentRows, extraRules, project, resolvedTemplateId, style, target]);

  const apply = useCallback(() => {
    if (!mergedPreview) {
      return;
    }
    onApply(mergedPreview);
    handleOpenChange(false);
  }, [mergedPreview, onApply, handleOpenChange]);

  const phaseLabel =
    loadElapsedSec < 3 ? "ヒアリング行を読み取っています…" : "Gemini で分類名を生成しています…";

  const showLoadingOverlay = loading && step === "config";

  const loadingOverlay =
    portalReady && showLoadingOverlay ? (
      <div
        className="fixed inset-0 z-[151] flex flex-col items-center justify-center gap-4 bg-[color:color-mix(in_srgb,var(--background)_68%,black_32%)]/92 px-6 py-8 backdrop-blur-[3px]"
        role="status"
        aria-live="polite"
      >
        <Loader2
          className={cn("h-10 w-10 text-[var(--accent)]", !reduceMotion && "animate-spin")}
          aria-hidden
        />
        <p className="text-center text-sm font-medium text-[var(--foreground)]">{phaseLabel}</p>
        <div className="w-full max-w-sm space-y-1">
          <div
            className="h-2 w-full overflow-hidden rounded-full bg-[color:color-mix(in_srgb,var(--border)_70%,transparent)]"
            role="progressbar"
            aria-valuenow={Math.round(loadProgress)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="解析の目安進捗"
          >
            <div
              className={cn(
                "h-full rounded-full bg-[color:color-mix(in_srgb,var(--accent)_85%,var(--foreground)_15%)] transition-[width] duration-300 ease-out",
                !reduceMotion && loadProgress < 100 ? "animate-pulse" : undefined,
              )}
              style={{ width: `${Math.min(100, loadProgress)}%` }}
            />
          </div>
          <p className="text-center text-[11px] leading-relaxed text-[var(--muted)]">
            目安 {Math.round(loadProgress)}%（推定）・約 {loadElapsedSec} 秒経過
            <br />
            <span className="text-[10px]">サーバーからの実進捗ではなく、完了までの目安表示です。</span>
          </p>
        </div>
      </div>
    ) : null;

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent
          aria-busy={showLoadingOverlay}
          className={cn(
            "flex max-h-[min(92vh,720px)] min-h-0 w-[min(96vw,52rem)] max-w-[min(96vw,52rem)] flex-col overflow-hidden gap-0",
          )}
        >
          <DialogHeader className="shrink-0">
            <DialogTitle>分類を自動セット（Gemini）</DialogTitle>
          </DialogHeader>

          {step === "config" ? (
            <div className="mt-4 grid min-h-0 flex-1 grid-cols-1 gap-4 text-sm sm:grid-cols-2 sm:gap-5 sm:gap-y-3">
              <div className="flex min-h-0 flex-col gap-3">
                <p className="text-xs leading-snug text-[var(--muted)] sm:text-sm">
                  {`「${HEARING_TEMPLATE_LABELS[resolvedTemplateId]}」向けに、見出し・確認事項から分類名を生成します。`}
                </p>
                <div className="rounded-lg border border-[color:color-mix(in_srgb,var(--border)_88%,transparent)] bg-[var(--edit-mode-surface)] p-3">
                  <p className="text-xs font-medium text-[var(--muted)]">既定の命名ルール</p>
                  <p className="mt-1.5 whitespace-pre-wrap text-[11px] leading-snug text-[var(--foreground)]">
                    {HEARING_AUTO_CATEGORY_DEFAULT_RULES_JA}
                  </p>
                </div>
                <div className="flex min-h-0 flex-col gap-1.5">
                  <Label htmlFor="hearing-auto-cat-extra" className="text-xs">
                    追加ルール（任意）
                  </Label>
                  <textarea
                    id="hearing-auto-cat-extra"
                    name="hearing-auto-cat-extra"
                    rows={4}
                    className={cn(
                      inputBaseClassName,
                      "h-auto min-h-0 resize-none py-2",
                    )}
                    placeholder="例: クライアント名は分類に含めない、など"
                    disabled={!canEdit || loading}
                    value={extraRules}
                    onChange={(e) => setExtraRules(e.target.value)}
                  />
                </div>
              </div>

              <div className="flex min-h-0 flex-col gap-3 sm:pt-0">
                <fieldset className="min-h-0 space-y-1.5">
                  <legend className="mb-1 text-xs font-medium text-[var(--muted)]">対象</legend>
                  {TARGET_OPTIONS.map((opt) => {
                    const selected = target === opt.value;
                    return (
                      <label
                        key={opt.value}
                        className={cn(
                          "flex cursor-pointer gap-2 rounded-lg border p-2.5 transition-[border-color,background-color] sm:p-2",
                          selected
                            ? "border-[color:color-mix(in_srgb,var(--accent)_42%,var(--border)_58%)] bg-[color:color-mix(in_srgb,var(--accent)_9%,var(--surface)_91%)]"
                            : "border-[color:color-mix(in_srgb,var(--border)_85%,transparent)] hover:border-[color:color-mix(in_srgb,var(--border)_72%,var(--accent)_28%)]",
                        )}
                      >
                        <input
                          type="radio"
                          id={`hearing-auto-cat-target-${opt.value}`}
                          name="auto-cat-target"
                          className="mt-0.5 h-4 w-4 shrink-0 accent-[color:var(--accent)]"
                          checked={selected}
                          disabled={!canEdit || loading}
                          onChange={() => setTarget(opt.value)}
                        />
                        <span>
                          <span className="text-sm font-medium text-[var(--foreground)]">{opt.label}</span>
                          <span className="mt-0.5 block text-[11px] leading-snug text-[var(--muted)]">{opt.hint}</span>
                        </span>
                      </label>
                    );
                  })}
                </fieldset>

                <fieldset className="space-y-1.5">
                  <legend className="mb-1 text-xs font-medium text-[var(--muted)]">スタイル</legend>
                  {STYLE_OPTIONS.map((opt) => {
                    const selected = style === opt.value;
                    return (
                      <label
                        key={opt.value}
                        className={cn(
                          "flex cursor-pointer gap-2 rounded-lg border p-2.5 transition-[border-color,background-color] sm:p-2",
                          selected
                            ? "border-[color:color-mix(in_srgb,var(--accent)_42%,var(--border)_58%)] bg-[color:color-mix(in_srgb,var(--accent)_9%,var(--surface)_91%)]"
                            : "border-[color:color-mix(in_srgb,var(--border)_85%,transparent)] hover:border-[color:color-mix(in_srgb,var(--border)_72%,var(--accent)_28%)]",
                        )}
                      >
                        <input
                          type="radio"
                          id={`hearing-auto-cat-style-${opt.value}`}
                          name="auto-cat-style"
                          className="mt-0.5 h-4 w-4 shrink-0 accent-[color:var(--accent)]"
                          checked={selected}
                          disabled={!canEdit || loading}
                          onChange={() => setStyle(opt.value)}
                        />
                        <span>
                          <span className="text-sm font-medium text-[var(--foreground)]">{opt.label}</span>
                          <span className="mt-0.5 block text-[11px] leading-snug text-[var(--muted)]">{opt.hint}</span>
                        </span>
                      </label>
                    );
                  })}
                </fieldset>

                {error ? (
                  <p className="text-xs text-red-600 dark:text-red-400 sm:text-sm" role="alert">
                    {error}
                  </p>
                ) : null}

                <div className="mt-auto flex flex-wrap justify-end gap-2 pt-1">
                  <Button type="button" variant="default" onClick={() => handleOpenChange(false)} disabled={loading}>
                    キャンセル
                  </Button>
                  <Button type="button" variant="accent" disabled={!canEdit || loading} onClick={() => void runGemini()}>
                    {loading ? "生成中…" : "生成してプレビュー"}
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <div className="mt-4 grid min-h-0 flex-1 grid-cols-1 gap-4 text-sm md:grid-cols-[minmax(0,12.5rem)_minmax(0,1fr)] md:gap-5">
              <div className="flex shrink-0 flex-col gap-3 md:min-h-[min(16rem,36vh)] md:justify-between">
                <div className="space-y-2">
                  <p className="text-[var(--foreground)]">
                    変更がある行: <strong>{previewDiffRows.length}</strong> 件
                  </p>
                  {previewDiffRows.length === 0 ? (
                    <p className="text-xs text-[var(--muted)]">変更はありません（既存の分類と同じ結果でした）。</p>
                  ) : null}
                  <p className="text-xs leading-relaxed text-[var(--muted)]">
                    問題なければ「表に反映」を押してください（未保存のままなので、その後「保存」で DB に書き込みます）。
                  </p>
                </div>
                <div className="flex flex-wrap gap-2 md:flex-col md:gap-2">
                  <Button type="button" variant="default" className="md:w-full" onClick={() => setStep("config")}>
                    戻る
                  </Button>
                  <Button
                    type="button"
                    variant="accent"
                    className="md:w-full"
                    onClick={apply}
                    disabled={!mergedPreview}
                  >
                    表に反映
                  </Button>
                </div>
              </div>

              <div className="flex min-h-[12rem] flex-1 flex-col overflow-hidden rounded-lg border border-[color:color-mix(in_srgb,var(--border)_88%,transparent)] lg:min-h-0">
                <div
                  className="min-h-0 flex-1 overflow-auto overscroll-contain"
                  aria-label="分類のプレビュー"
                  role="region"
                >
                  <table className="w-full min-w-[min(100%,480px)] border-collapse text-left text-xs">
                    <thead className="sticky top-0 z-[1] border-b border-[color:color-mix(in_srgb,var(--border)_88%,transparent)] bg-[color:color-mix(in_srgb,var(--surface)_96%,transparent)]">
                      <tr>
                        <th className="whitespace-nowrap px-2 py-2 font-medium text-[var(--muted)]">変更前</th>
                        <th className="whitespace-nowrap px-2 py-2 font-medium text-[var(--muted)]">変更後</th>
                        <th className="min-w-[10rem] px-2 py-2 font-medium text-[var(--muted)]">見出し</th>
                      </tr>
                    </thead>
                    <tbody>
                      {previewDiffRows.map(({ row, before, after }) => (
                        <tr
                          key={row.id}
                          className="border-b border-[color:color-mix(in_srgb,var(--border)_70%,transparent)]"
                        >
                          <td className="max-w-[10rem] whitespace-pre-wrap px-2 py-1.5 align-top text-[var(--muted)]">
                            {displayText(before)}
                          </td>
                          <td className="max-w-[10rem] whitespace-pre-wrap px-2 py-1.5 align-top font-medium text-[var(--foreground)]">
                            {displayText(after)}
                          </td>
                          <td className="min-w-[10rem] whitespace-pre-wrap px-2 py-1.5 align-top">
                            {displayText(row.heading)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
      {loadingOverlay ? createPortal(loadingOverlay, document.body) : null}
    </>
  );
}
