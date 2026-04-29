"use client";

import { Label } from "@/app/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/app/components/ui/select";
import { clampListPageSize, LIST_PAGE_SIZE_OPTIONS } from "@/lib/list-pagination";
import { cn } from "@/lib/utils";

type PageSizeSelectProps = {
  id?: string;
  value: number;
  onChange: (size: number) => void;
  triggerClassName?: string;
};

export function PageSizeSelect({ id = "list-page-size", value, onChange, triggerClassName }: PageSizeSelectProps) {
  const safe = clampListPageSize(value);
  return (
    <div className="flex items-center gap-2">
      <Label htmlFor={id} className="whitespace-nowrap text-sm text-[var(--muted)]">
        表示件数
      </Label>
      <Select
        value={String(safe)}
        onValueChange={(v) => {
          const n = Number.parseInt(v, 10);
          onChange(clampListPageSize(n));
        }}
      >
        <SelectTrigger id={id} className={cn("h-9 w-[100px]", triggerClassName)}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {LIST_PAGE_SIZE_OPTIONS.map((opt) => (
            <SelectItem key={opt} value={String(opt)}>
              {opt}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
