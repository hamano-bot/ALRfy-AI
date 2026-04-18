import type { HearingSheetRow } from "@/lib/hearing-sheet-types";
import type { HearingTemplateId } from "@/lib/hearing-sheet-template-matrix";

function row(
  id: string,
  category: string,
  heading: string,
  question: string,
): HearingSheetRow {
  return { id, category, heading, question, answer: "", assignee: "", due: "", row_status: "" };
}

/**
 * 全サイト種別・新規/リニューアル共通（検証ブラウザ・納品物の最低ライン）。
 * `getDefaultRowsForTemplate` で種別固有行の先頭に付与する。
 */
export const HEARING_UNIVERSAL_TEMPLATE_ROWS: HearingSheetRow[] = [
  row(
    "univ-1",
    "品質・検証",
    "公開側検証ブラウザ",
    "対象（PC）：Microsoft Edge、Safari、Google Chrome、Firefox の最新ver\n対象（スマホ）：Safari 及び Google Chrome の最新ver",
  ),
  row(
    "univ-2",
    "品質・検証",
    "管理側検証ブラウザ",
    "推奨環境：Windows OS 最新環境における Google Chrome（最新ver）",
  ),
  row(
    "univ-3",
    "納品",
    "納品物",
    "以下を納品の対象とする。\n・要件定義書\n・サイト構成\n・公開側画面設計書\n・管理画面設計書\n・CMS操作説明書\n・HTMLデータ（サーバに納品）\n・プログラムソース（サーバに納品）\n・DB（サーバ納品）",
  ),
];

/** コーポレート × 新規 */
export const ROWS_CORPORATE_NEW: HearingSheetRow[] = [
  row("cn-1", "プロジェクト", "サイト名", "サイトの正式名称・表記を決める"),
  row("cn-2", "ドメイン", "本番・STG URL", "本番 / STG の URL・管理画面 URL の方針"),
  row("cn-3", "ドメイン", "ドメイン取得", "取得担当（クライアント / 当社）"),
  row("cn-5", "プロジェクト", "ターゲット・利用想定", "想定ユーザー・デバイス・競合参考"),
  row("cn-6", "プロジェクト", "デザイン", "トーン・参考サイト・ブランドカラー"),
  row("cn-7", "インフラ", "サーバー", "ホスティング要件・既存契約の有無"),
  row("cn-8", "その他", "情報共有", "共有ツール（スプレッドシート・チャット等）"),
];

/** コーポレート × リニューアル */
export const ROWS_CORPORATE_RENEWAL: HearingSheetRow[] = [
  row("cr-1", "プロジェクト", "現行サイト", "本番 URL・管理画面の所在・契約主体"),
  row("cr-2", "プロジェクト", "リニューアル目的", "課題・KPI・スコープ外の明示"),
  row("cr-3", "ドメイン", "URL・ドメイン", "継続利用 / 変更の方針"),
  row("cr-4", "データ", "移行範囲", "ページ・資産・問い合わせ履歴などの移行対象"),
  row("cr-5", "インフラ", "サーバー・DNS", "現行構成と切替タイミング"),
  row("cr-6", "プロジェクト", "スケジュール", "公開切替・検証・凍結期間"),
];

/** EC × 新規 */
export const ROWS_EC_NEW: HearingSheetRow[] = [
  row("en-1", "プロジェクト", "店舗の前提", "ブランド・取扱カテゴリ・SKU規模の目安"),
  row("en-2", "決済・価格", "決済", "利用カード・代引き・後払いなど"),
  row("en-3", "物流", "配送", "配送エリア・送料・リードタイム"),
  row("en-4", "在庫", "在庫連携", "基幹・WMS との連携の有無"),
  row("en-5", "法務表示", "表示", "特商法・価格表示・割引表示の方針"),
  row("en-6", "インフラ", "ホスティング", "想定トラフィック・決済証明"),
];

/** EC × リニューアル */
export const ROWS_EC_RENEWAL: HearingSheetRow[] = [
  row("er-1", "プロジェクト", "現行EC", "URL・カート基盤・決済・配送の現状"),
  row("er-2", "データ", "移行", "会員・注文・在庫・クーポンの移行方針"),
  row("er-3", "決済・物流", "切替", "決済プロバイダ・配送業者の変更有無"),
  row("er-4", "プロジェクト", "リリース", "メンテナンス窓・切替手順"),
  row("er-5", "プロジェクト", "課題", "現行のボトルネックと優先改善"),
];

/** その他サイト種別 × 新規 */
export const ROWS_GENERIC_NEW: HearingSheetRow[] = [
  row("gn-1", "プロジェクト", "目的", "サイトの目的・成功指標"),
  row("gn-2", "プロジェクト", "ターゲット", "利用者像・利用シーン"),
  row("gn-3", "プロジェクト", "スコープ", "画面・機能の大枠・除外範囲"),
  row("gn-4", "プロジェクト", "スケジュール", "キックオフ〜公開の目安"),
];

/** その他サイト種別 × リニューアル */
export const ROWS_GENERIC_RENEWAL: HearingSheetRow[] = [
  row("gr-1", "プロジェクト", "現状課題", "改善したい点の優先度"),
  row("gr-2", "プロジェクト", "既存システム", "URL・CMS・連携の概要"),
  row("gr-3", "データ", "移行・継続", "コンテンツ・ユーザーデータの扱い"),
  row("gr-4", "プロジェクト", "リリース目標", "切替時期・並行運用の有無"),
];

const TEMPLATE_ROWS: Record<HearingTemplateId, HearingSheetRow[]> = {
  corporate_new: ROWS_CORPORATE_NEW,
  corporate_renewal: ROWS_CORPORATE_RENEWAL,
  ec_new: ROWS_EC_NEW,
  ec_renewal: ROWS_EC_RENEWAL,
  generic_new: ROWS_GENERIC_NEW,
  generic_renewal: ROWS_GENERIC_RENEWAL,
};

export function getDefaultRowsForTemplate(templateId: HearingTemplateId): HearingSheetRow[] {
  const universal = HEARING_UNIVERSAL_TEMPLATE_ROWS.map((r) => ({ ...r }));
  const specific = TEMPLATE_ROWS[templateId].map((r) => ({ ...r }));
  return [...universal, ...specific];
}
