# Chrome DevTools 品質インベントリ（優先度付き）

このドキュメントは、Project Web（`project-manager/apps/web`）について **DevTools に出やすい問題を分類し、対応の優先度を揃える**ための基準です。  
実際のコンソール内容はブラウザ・データ・拡張機能に依存するため、**リリース前に手動で Issues / Console を一度確認する**前提です。

**最終更新:** 2026-04-19

---

## 1. 自動チェック（CI／ローカルで再現可能）

| チェック | コマンド（`apps/web`） | 現状（2026-04-19 時点） |
|----------|------------------------|-------------------------|
| 型 | `npx tsc --noEmit` | 成功 |
| 本番ビルド | `npm run build` | 成功（Next.js 16.2.4） |
| ESLint | `npm run lint`（`eslint .`） | **成功**（警告 2 件: `@next/next/no-img-element`） |

Next.js 16 では `next lint` コマンドが CLI から無くなっているため、`eslint.config.mjs`（flat）＋ `eslint-config-next/core-web-vitals` で置き換えた。

### 1.1 ESLint でいま無効にしているルール（意図）

`eslint-plugin-react-hooks` v7 の **`react-hooks/set-state-in-effect`** と **`react-hooks/refs`** は、既存コードの「effect 内で sessionStorage 復元」「レンダー中に ref に最新値を書く」等と衝突しやすい。**段階的にリファクタするまで off** にしてあり、DevTools の実行時エラーとは別物（静的ルール）である。

### 1.2 残っている警告（P2）

- **`@next/next/no-img-element`**（2 件）: `DashboardShell` のロゴ、`GeminiMarkIcon` の SVG。`next/image` 化またはルールをファイル単位で調整すると解消可能。

---

## 2. 優先度の定義

| 優先度 | 意味 | 例 |
|--------|------|-----|
| **P0** | 機能・表示・セキュリティに直結。本番で放置しない。 | Console の赤エラー、API の 5xx、Mixed Content |
| **P1** | ユーザー体験・保守性に効く。計画的に潰す。 | React の警告、未処理の Promise、開発フロー（lint 復旧） |
| **P2** | 推奨事項・一部環境のみ。方針を決めて対応。 | Issues の「フォームに id/name」、サードパーティの注意 |
| **P3** | 情報・開発専用。必要なら抑制またはドキュメント化。 | HMR ログ、Strict Mode の二重マウント説明、拡張機能由来 |

---

## 3. DevTools パネル別の見どころ

### 3.1 Console

| 内容 | 優先度 | メモ |
|------|--------|------|
| 赤（Error） | **P0** | 実行時例外、ネットワーク失敗の未処理、Hydration mismatch |
| 黄（Warning） | **P1** | React の `key`、非推奨 API、`useEffect` 依存の指摘（core-web-vitals で一部検出） |
| 青 / Verbose | **P3** | `console.log` は本番では原則なし。エラーバウンダリの `console.error` は意図的なログあり（例: `app/project-list/error.tsx`） |

### 3.2 Issues（Chrome）

| 内容 | 優先度 | メモ |
|------|--------|------|
| フォームに `id` / `name` がない | **P2** | オートフィル・アクセシビリティ推奨。Radix `Select` は **ルート `<Select name>`** が非表示 `<select>` に付く（既にヒアリング表で対応済みの経緯あり） |
| コントラスト・名前付きリージョン等 | **P2** | デザインとセットで検討 |

### 3.3 Network

| 内容 | 優先度 | メモ |
|------|--------|------|
| 4xx/5xx（意図しない） | **P0** | ポータル API、BFF の失敗。環境変数・Cookie・CORS を確認 |
| ブロック / CORS | **P0** | 開発時は `next.config.ts` の `allowedDevOrigins` と関連（別オリジンで CSS が効かない等） |

### 3.4 Application / Lighthouse

| 内容 | 優先度 | メモ |
|------|--------|------|
| 大きな CLS / LCP | **P1** | ヒアリング右パネルは `useLayoutEffect` と入場アニメの条件付けで改善済みの経緯あり |
| キャッシュ・Cookie | **P3** | 認証まわりの不具合切り分け時に確認 |

---

## 4. 本リポジトリで既に手が入っている項目（参考）

- ヒアリング表: セル・`ThemeDateField`・Radix `Select` の `name` / 非表示 `select` への伝播。
- 一覧の詳細検索シート、インポート／自動分類ダイアログ、設定まわりのフォーム属性。
- Hydration: URL を `aria-label` に含めない等の方針。
- 右パネル: 初回遷移では入場フェードをかけず、折りたたみ→展開時のみアニメーション。

---

## 5. 手動スモーク（リリース前 10 分）

1. **Console** を開いたまま、次を操作する: ログイン → Project 一覧 → 任意案件 → ヒアリングシート → 戻る。
2. **Issues** の件数が許容範囲か（P2 は「ゼロ必須」にしない運用でも可）。
3. **Network** で `/api/portal/*` が意図したステータスか（401 は未ログイン時のみ等）。
4. 別オリジン／LAN で開く場合は **CSS が当たらない**（`allowedDevOrigins`）が再発していないか。

---

## 6. 次にやると効果が大きい順（推奨バックログ）

1. **P0 — 本番相当での Console 赤ゼロ**  
   `npm run build && npm run start` で主要フローをクリックし、赤が出ないことを確認。
2. **P1 — `react-hooks` 厳格ルールの段階的再有効化**  
   `set-state-in-effect` / `refs` を、コンポーネント単位で直しつつ `warn` → `error` へ。
3. **P2 — `@next/next/no-img-element` の解消**  
   ロゴ・Gemini アイコンを `next/image` にするか、正当な理由で disable コメント。
4. **P2 — Issues パネルの残件**  
   画面ごとに「許容 / 修正」をラベル付け（フォーム属性、見出し階層など）。
5. **P3 — 開発時ノイズ**  
   拡張機能をオフにしたウィンドウで再現するか確認し、本当にアプリ由来か切り分ける。

---

## 7. 制約（期待値のすり合わせ）

- **Chrome の表示を常に 0 件**にすることは保証しにくい（拡張、実データ、ブラウザ更新）。
- 代わりに **「本番ビルド + 型 +（復旧後の）lint + 手動スモーク」** を通したうえで、P0 を実質ゼロに近づける方針が現実的です。
