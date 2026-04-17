# GitHub リポジトリ設定チェックリスト（手動）

リポジトリ: [hamano-bot/ALRfy-AI](https://github.com/hamano-bot/ALRfy-AI)。**`main` は直接 push 可**（PR 必須にしない前提）。以下は **GitHub.com の画面（Settings 等）** で実施する作業です。リポジトリ **Admin** 権限が必要です。

---

## General

- [ ] **Settings → General**
  - [ ] Description / Website / Topics を実態に合わせて記載する（例: `platform-common`, `project-manager`, 案件管理 Web）。
  - [ ] **Features:** Issues / Discussions / Projects を使うか決め、使わないものはオフにする。
  - [ ] **Pull Requests:** 既定のマージ方式（Squash / Merge / Rebase）をチームで決める。

## Actions

- [ ] **Settings → Actions → General**
  - [ ] **Actions permissions:** 利用するアクションの範囲（すべて許可 / 許可リスト）を方針に合わせる。
  - [ ] **Workflow permissions:** `Update Dashboard History` が **`git push`** するため、**Read and write** が選べること、または fine-grained で **`contents: write`** が付与できることを確認する（read-only のままだと bot の push が失敗する）。
  - [ ] Fork からの workflow 実行が不要なら制限する。

## Secrets and variables

- [ ] **Settings → Secrets and variables → Actions**
  - [ ] **`GEMINI_API_KEY`** が設定されているか確認する（[update-dashboard-history.yml](workflows/update-dashboard-history.yml) が参照）。
  - [ ] 本番用キーを分けたい場合は **Environments**（例: `production`）の利用を検討する。

## Rules / Branch protection（軽量）

- [ ] **`main` を PR 必須にしない**方針のままなら、「Require pull request before merging」は **付けない**（付ける場合は **github-actions[bot]** のバイパスが必須。現状 workflow は bot が `main` に push する）。
- [ ] 任意: **Block force pushes** を有効にする。
- [ ] **lint/build CI**（[ci-project-manager-web.yml](workflows/ci-project-manager-web.yml)）を必須チェックにするかは、運用が安定してから **Rules** で追加する（最初は報告のみ推奨）。

## Security

- [ ] **Security / Dependabot** で **Dependency graph** と **Dependabot alerts** を有効にする。
- [ ] **Dependabot version updates** はリポジトリに [dependabot.yml](dependabot.yml)（`project-manager/apps/web` の npm・週次）を置いた。**Security → Code security and analysis** で Dependabot の設定がオンか確認する。
- [ ] 公開リポジトリの場合、**Secret scanning** / **Code scanning**（利用可能なら）を確認する。

## CI（リポジトリに追加済み）

- [ ] **Actions** タブで [ci-project-manager-web.yml](workflows/ci-project-manager-web.yml)（`npm ci` → `lint` → `build`）が **`main` の通常 push** で緑になることを確認する（`[skip ci]` の bot push ではスキップされる）。

## Collaborators

- [ ] **Settings → Collaborators**（または Organization のメンバー）で、Admin / Write / Read の担当を決め、必要なら社内ドキュメントや README に一行メモする。

---

## 関連ドキュメント

- ルート [README.md](../README.md) の「GitHub 運用」: `main` 直接 push と bot 追従コミット、**`git pull` のあと `next dev` を再起動**する旨。
- 案件管理 Web のローカル手順: [project-manager/apps/web/README.md](../project-manager/apps/web/README.md)
