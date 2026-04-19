import { FileText, Server, ShieldCheck, ClipboardList } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type ProjectDocumentTemplateItem = {
  key: string;
  title: string;
  description: string;
  icon: LucideIcon;
  /** 連携先 URL（未設定時は UI で「準備中」） */
  href?: string;
};

/** 案件詳細のテンプレ一覧（href を足すと「開く」が有効化） */
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
    title: "チェックシート",
    description: "制作・進行上の確認項目を洗い出すための一覧です。",
    icon: ShieldCheck,
  },
  {
    key: "infrastructure",
    title: "インフラシート",
    description: "ホスティング・DNS・証明書などの情報をまとめる枠です。",
    icon: Server,
  },
];
