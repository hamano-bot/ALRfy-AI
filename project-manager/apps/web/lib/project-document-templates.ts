import { FileText, LayoutList, Server, ShieldCheck, ClipboardList } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type ProjectDocumentTemplateItem = {
  key: string;
  title: string;
  description: string;
  icon: LucideIcon;
};

/** 案件詳細のテンプレ5種の表示（子画面は未実装。将来 href を足す） */
export const PROJECT_DOCUMENT_TEMPLATES: ProjectDocumentTemplateItem[] = [
  {
    key: "hearing",
    title: "ヒアリングシート",
    description: "要件の前提・目的・背景を整理するための雛形です。",
    icon: ClipboardList,
  },
  {
    key: "requirements",
    title: "要件定義",
    description: "スコープ・機能・非機能要件を記載するドキュメントです。",
    icon: FileText,
  },
  {
    key: "director_check",
    title: "ディレクターチェックシート",
    description: "制作・進行上の確認項目を洗い出すための一覧です。",
    icon: ShieldCheck,
  },
  {
    key: "infrastructure",
    title: "インフラシート",
    description: "ホスティング・DNS・証明書などの情報をまとめる枠です。",
    icon: Server,
  },
  {
    key: "design_spec",
    title: "デザイン・画面仕様",
    description: "UI 方針・画面構成・コンポーネント単位の仕様を記述します。",
    icon: LayoutList,
  },
];
