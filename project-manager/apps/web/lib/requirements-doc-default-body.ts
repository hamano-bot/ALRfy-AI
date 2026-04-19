import type { RequirementsDocBody, RequirementsPage } from "@/lib/requirements-doc-types";
import { EMPTY_TIPTAP_DOC } from "@/lib/tiptap-json";

/** 初期14ページの pageType と既定タイトル（日本語） */
export const REQUIREMENTS_DEFAULT_PAGE_DEFS: ReadonlyArray<{ pageType: string; title: string }> = [
  { pageType: "cover", title: "表紙" },
  { pageType: "overview", title: "概要" },
  { pageType: "basic_requirements", title: "基本要件" },
  { pageType: "site_structure", title: "サイト構成" },
  { pageType: "dynamic_page_list", title: "動的ページリスト" },
  { pageType: "public_features", title: "公開側機能一覧" },
  { pageType: "admin_features", title: "管理側機能一覧" },
  { pageType: "email_timing", title: "メール送信タイミング" },
  { pageType: "external_integration", title: "外部連携" },
  { pageType: "initial_dataset", title: "初期データセット（移行データ）" },
  { pageType: "testing", title: "テスト" },
  { pageType: "non_functional", title: "非機能要件" },
  { pageType: "org_chart", title: "体制図" },
  { pageType: "server_diagram", title: "サーバー構成図" },
];

export function createDefaultRequirementsBody(): RequirementsDocBody {
  const pages: RequirementsPage[] = REQUIREMENTS_DEFAULT_PAGE_DEFS.map((def, index) => ({
    id: `default-page-${index}`,
    pageType: def.pageType,
    title: def.title,
    createdOn: null,
    updatedOn: null,
    inputMode: "richtext",
    is_fixed: false,
    deleted: false,
    content: { doc: EMPTY_TIPTAP_DOC },
  }));
  return {
    schema_version: 1,
    pages,
  };
}
