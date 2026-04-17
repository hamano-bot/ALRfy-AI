"use client";

import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import rawUpdates from "../data/updates.json";

type UpdateItem = {
  id: string;
  datetime: string;
  version: string;
  title: string;
  summary?: string;
};

const updates = rawUpdates as readonly UpdateItem[];

function formatMinutesLikeDateTime(value: string): string {
  // Keep display consistent with minutes-side PHP timestamps: Y-m-d H:i:s
  const date = new Date(value.replace(" ", "T"));
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  const pad = (num: number): string => String(num).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

export function SystemUpdatesCard() {
  return (
    <Card className="backdrop-blur-sm">
      <CardHeader className="pb-3">
        <CardTitle>システム更新履歴</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="modern-scrollbar max-h-72 overflow-y-auto pr-1">
        <ul className="space-y-2">
          {updates.map((item) => (
            <li
              key={item.id}
              className="rounded-md border border-[color:color-mix(in_srgb,var(--border)_90%,transparent)] bg-[color:color-mix(in_srgb,var(--surface-soft)_88%,black_12%)] p-3"
            >
              <p className="text-xs text-[var(--muted)]">
                {formatMinutesLikeDateTime(item.datetime)} / {item.version}
              </p>
              <p className="mt-1 text-sm font-medium text-[var(--foreground)]">{item.title}</p>
              {item.summary ? (
                <p className="mt-1 text-sm text-[color:color-mix(in_srgb,var(--foreground)_88%,transparent)]">
                  {item.summary}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
        </div>
      </CardContent>
    </Card>
  );
}
