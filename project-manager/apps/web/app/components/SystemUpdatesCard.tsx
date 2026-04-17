"use client";

type UpdateItem = {
  id: string;
  datetime: string;
  version: string;
  title: string;
  summary: string;
};

const updates = [
  {
    id: "u1",
    datetime: "2026-04-17 10:30:00",
    version: "v0.1.0",
    title: "初期ダッシュボードUI",
    summary: "共通ヘッダーと左サイドメニューの土台を追加しました。",
  },
  {
    id: "u2",
    datetime: "2026-04-16 18:15:00",
    version: "v0.0.9",
    title: "AIチャット導線",
    summary: "フローティングボタンからダミーチャットを開けるようにしました。",
  },
  {
    id: "u3",
    datetime: "2026-04-15 14:00:00",
    version: "v0.0.8",
    title: "テーマ基盤調整",
    summary: "themeフォールバックの下地を整理しました。",
  },
  {
    id: "u4",
    datetime: "2026-04-14 09:45:00",
    version: "v0.0.7",
    title: "レスポンシブ調整",
    summary: "モバイル表示でサイドメニューの挙動を調整しました。",
  },
  {
    id: "u5",
    datetime: "2026-04-13 20:20:00",
    version: "v0.0.6",
    title: "ブランドテキスト導入",
    summary: "ALRfy-AIのヘッダー文言と配色演出を追加しました。",
  },
] as const satisfies readonly UpdateItem[];

function formatMinutesLikeDateTime(value: string): string {
  // Keep display consistent with minutes-side PHP timestamps: Y-m-d H:i:s
  const date = new Date(value.replace(" ", "T"));
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  const pad = (num: number): string => String(num).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

export function SystemUpdatesCard() {
  return (
    <section className="rounded-2xl border border-slate-700/70 bg-slate-900/30 p-4 backdrop-blur-sm">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-slate-100">システム更新履歴</h2>
      </div>
      <div className="modern-scrollbar mt-3 max-h-72 overflow-y-auto pr-1">
        <ul className="space-y-2">
          {updates.map((item) => (
            <li key={item.id} className="rounded-md border border-slate-800 bg-slate-950/40 p-3">
              <p className="text-xs text-slate-400">
                {formatMinutesLikeDateTime(item.datetime)} / {item.version}
              </p>
              <p className="mt-1 text-sm font-medium text-slate-100">{item.title}</p>
              <p className="mt-1 text-sm text-slate-300">{item.summary}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
