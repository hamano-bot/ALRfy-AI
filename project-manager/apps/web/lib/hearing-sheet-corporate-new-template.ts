import type { PortalProjectDetail } from "@/lib/portal-project";

/** DB の body_json.items と対応する1行 */
export type HearingSheetRow = {
  id: string;
  category: string;
  heading: string;
  question: string;
  answer: string;
  assignee: string;
  due: string;
  row_status: string;
};

export const HEARING_TEMPLATE_ID_CORPORATE_NEW = "corporate_new" as const;

/** コーポレート × 新規 の初期行（プレースホルダ中心・短め） */
export const CORPORATE_NEW_HEARING_TEMPLATE_ROWS: HearingSheetRow[] = [
  {
    id: "cn-1",
    category: "プロジェクト",
    heading: "サイト名",
    question: "サイトの正式名称・表記を決める",
    answer: "",
    assignee: "",
    due: "",
    row_status: "",
  },
  {
    id: "cn-2",
    category: "ドメイン",
    heading: "本番・STG URL",
    question: "本番 / STG の URL・管理画面 URL の方針",
    answer: "",
    assignee: "",
    due: "",
    row_status: "",
  },
  {
    id: "cn-3",
    category: "ドメイン",
    heading: "ドメイン取得",
    question: "取得担当（クライアント / 当社）",
    answer: "",
    assignee: "",
    due: "",
    row_status: "",
  },
  {
    id: "cn-4",
    category: "プロジェクト",
    heading: "検証ブラウザ",
    question: "公開側・管理側の対象ブラウザ（PC / SP）",
    answer: "",
    assignee: "",
    due: "",
    row_status: "",
  },
  {
    id: "cn-5",
    category: "プロジェクト",
    heading: "ターゲット・利用想定",
    question: "想定ユーザー・デバイス・競合参考",
    answer: "",
    assignee: "",
    due: "",
    row_status: "",
  },
  {
    id: "cn-6",
    category: "プロジェクト",
    heading: "デザイン",
    question: "トーン・参考サイト・ブランドカラー",
    answer: "",
    assignee: "",
    due: "",
    row_status: "",
  },
  {
    id: "cn-7",
    category: "インフラ",
    heading: "サーバー",
    question: "ホスティング要件・既存契約の有無",
    answer: "",
    assignee: "",
    due: "",
    row_status: "",
  },
  {
    id: "cn-8",
    category: "その他",
    heading: "情報共有",
    question: "共有ツール（スプレッドシート・チャット等）",
    answer: "",
    assignee: "",
    due: "",
    row_status: "",
  },
];

export function shouldSeedCorporateNewTemplate(project: PortalProjectDetail): boolean {
  return project.site_type === "corporate" && !project.is_renewal;
}

export function normalizeHearingRows(raw: unknown): HearingSheetRow[] {
  if (raw === null || raw === undefined) {
    return [];
  }
  let items: unknown;
  if (Array.isArray(raw)) {
    items = raw;
  } else if (typeof raw === "object") {
    const o = raw as Record<string, unknown>;
    items = o.items;
  } else {
    return [];
  }
  if (!Array.isArray(items)) {
    return [];
  }
  const out: HearingSheetRow[] = [];
  for (const it of items) {
    if (!it || typeof it !== "object" || Array.isArray(it)) {
      continue;
    }
    const r = it as Record<string, unknown>;
    const id = typeof r.id === "string" && r.id !== "" ? r.id : `row-${out.length}`;
    out.push({
      id,
      category: typeof r.category === "string" ? r.category : "",
      heading: typeof r.heading === "string" ? r.heading : "",
      question: typeof r.question === "string" ? r.question : "",
      answer: typeof r.answer === "string" ? r.answer : "",
      assignee: typeof r.assignee === "string" ? r.assignee : "",
      due: typeof r.due === "string" ? r.due : "",
      row_status: typeof r.row_status === "string" ? r.row_status : "",
    });
  }
  return out;
}

export function hearingBodyFromRows(rows: HearingSheetRow[]): Record<string, unknown> {
  return {
    template_id: HEARING_TEMPLATE_ID_CORPORATE_NEW,
    items: rows.map((r) => ({ ...r })),
  };
}

export function createEmptyHearingRow(): HearingSheetRow {
  const id =
    typeof globalThis.crypto !== "undefined" && typeof globalThis.crypto.randomUUID === "function"
      ? globalThis.crypto.randomUUID()
      : `row-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return {
    id,
    category: "",
    heading: "",
    question: "",
    answer: "",
    assignee: "",
    due: "",
    row_status: "",
  };
}
