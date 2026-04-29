export type MeetingListItem = {
  id: number;
  title: string;
  meetingDate: string | null;
  updatedAt: string | null;
  ownerName: string | null;
};

export type MeetingsListResponse = {
  success: boolean;
  items: MeetingListItem[];
  message?: string;
};
