/** 1 行に紐づく Redmine チケット（複数可） */
export type HearingRowRedmineTicket = {
  issue_id: number;
  project_id: number;
  /** 別インスタンス時のベース URL（リンク生成用） */
  base_url?: string | null;
};

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
  /** この行に紐づく Redmine チケット（複数） */
  redmine_tickets?: HearingRowRedmineTicket[];
};
