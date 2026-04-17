# platform-common/design-system

議事録アプリと案件管理アプリで共通利用するデザイントークンとUI仕様を定義する領域。

## 対象
- 色、タイポグラフィ、余白、角丸、影
- ボタン/入力/カード/サイドバーなどの共通部材
- 状態表現（hover/focus/disabled/error）

## 方針
- `Tailwind CSS` のトークンと同期する。
- `shadcn/ui + Radix UI + class-variance-authority` で部材の再利用性を担保する。
