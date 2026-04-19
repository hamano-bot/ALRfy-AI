"use client";

import { type CSSProperties, useEffect } from "react";
import { Button } from "@/app/components/ui/button";

type Props = {
  error: Error & { digest?: string };
  reset: () => void;
};

/** スタイルチャンク 404 時でも確実に押せる再読み込み（インラインのみ） */
const reloadButtonInlineStyle: CSSProperties = {
  marginTop: 10,
  padding: "10px 16px",
  fontSize: 14,
  cursor: "pointer",
  borderRadius: 8,
  border: "1px solid #1e40af",
  backgroundColor: "#2563eb",
  color: "#ffffff",
  fontFamily: 'system-ui, "Segoe UI", sans-serif',
};

export default function ProjectListError({ error, reset }: Props) {
  useEffect(() => {
    console.error("[project-list]", error);
  }, [error]);

  const reloadPage = () => {
    window.location.reload();
  };

  return (
    <section className="surface-card border border-red-500/30 p-5" role="alert">
      <p className="text-sm font-semibold text-[var(--foreground)]">Project一覧を表示できません</p>
      <p className="mt-2 text-sm text-[var(--foreground)]">
        表示中にエラーが発生しました。ターミナルまたはサーバーログに詳細が出力されている場合があります。
      </p>
      <p className="mt-2 text-xs leading-relaxed text-[var(--muted)]">
        キャッシュやサイトデータを削除した直後は、古いスクリプトやスタイルを読み込もうとして失敗することがあります。
        <strong className="font-medium text-[var(--foreground)]"> ページの再読み込み</strong>
        で解消することが多いです。
      </p>
      {process.env.NODE_ENV === "development" && error.message ? (
        <pre className="mt-3 max-h-40 overflow-auto rounded-md border border-[color:color-mix(in_srgb,var(--border)_90%,transparent)] bg-[color:color-mix(in_srgb,var(--background)_96%,transparent)] p-3 text-xs text-[var(--muted)]">
          {error.message}
        </pre>
      ) : null}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button type="button" variant="accent" size="sm" onClick={reloadPage}>
          ページを再読み込み
        </Button>
        <Button type="button" variant="default" size="sm" onClick={() => reset()}>
          この場で再試行
        </Button>
      </div>
      <p className="mt-3 text-[10px] leading-snug text-[var(--muted)]">
        表示が崩れている・上のボタンが効かないときは下のボタンを試すか、ブラウザの再読み込み（F5）を使ってください。
      </p>
      <button
        type="button"
        onClick={reloadPage}
        style={reloadButtonInlineStyle}
        aria-label="スタイルが読み込めない場合でも使える再読み込み"
      >
        再読み込み
      </button>
    </section>
  );
}
