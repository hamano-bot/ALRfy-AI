export type SettingsAdminUser = {
  id: number;
  email: string;
  display_name: string | null;
  team: string | null;
  is_admin: number;
  created_at: string | null;
  updated_at: string | null;
};

export function parseTeamTags(raw: string | null): string[] {
  if (!raw || raw.trim() === "") return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((v): v is string => typeof v === "string")
      .map((v) => v.trim().toLowerCase())
      .filter((v) => v !== "");
  } catch {
    return [];
  }
}

export function normalizeTagsInput(raw: string): string[] {
  const uniq = new Set<string>();
  for (const part of raw.split(",")) {
    const value = part.trim().toLowerCase();
    if (value !== "") {
      uniq.add(value);
    }
  }
  return [...uniq];
}

export function toggleSelectedIds(prev: number[], targetId: number, checked: boolean): number[] {
  if (checked) {
    return prev.includes(targetId) ? prev : [...prev, targetId];
  }
  return prev.filter((id) => id !== targetId);
}

export function formatUserDisplayName(user: SettingsAdminUser): string {
  const displayName = typeof user.display_name === "string" ? user.display_name.trim() : "";
  if (displayName !== "") return displayName;
  return `user#${user.id}`;
}

