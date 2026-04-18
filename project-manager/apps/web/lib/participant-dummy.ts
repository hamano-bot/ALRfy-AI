/** `NEXT_PUBLIC_PROJECT_LIST_DEMO=1` 時のみ — 参加者 UI の操作確認用 */
export type DummyParticipantUser = {
  user_id: number;
  display_name: string;
  email: string;
};

export const DUMMY_PARTICIPANT_USERS: DummyParticipantUser[] = [
  { user_id: 9201, display_name: "山田 太郎", email: "yamada.taro@example.com" },
  { user_id: 9202, display_name: "佐藤 花子", email: "sato.hanako@example.com" },
  { user_id: 9203, display_name: "John Smith", email: "john.smith@example.com" },
  { user_id: 9204, display_name: "鈴木 一郎", email: "suzuki@example.com" },
];
