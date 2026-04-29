"use client";

import { Button } from "@/app/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/app/components/ui/dialog";
import type { ReactNode } from "react";
import { useState } from "react";

type ConfirmDeleteButtonProps = {
  buttonLabel?: string;
  buttonTitle?: string;
  buttonIcon?: ReactNode;
  buttonClassName?: string;
  confirmTitle: string;
  confirmDescription: ReactNode;
  confirmLabel?: string;
  disabled?: boolean;
  busy?: boolean;
  onConfirm: () => void | Promise<void>;
};

export function ConfirmDeleteButton({
  buttonLabel = "削除",
  buttonTitle,
  buttonIcon,
  buttonClassName,
  confirmTitle,
  confirmDescription,
  confirmLabel = "削除する",
  disabled = false,
  busy = false,
  onConfirm,
}: ConfirmDeleteButtonProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        type="button"
        variant="destructive"
        size="sm"
        className={buttonClassName}
        disabled={disabled || busy}
        title={buttonTitle}
        onClick={() => setOpen(true)}
      >
        {buttonIcon}
        {busy ? "削除中…" : buttonLabel}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{confirmTitle}</DialogTitle>
            <DialogDescription asChild>
              <div className="whitespace-pre-line text-sm text-[var(--muted)]">{confirmDescription}</div>
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="default" size="sm" onClick={() => setOpen(false)} disabled={busy}>
              キャンセル
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              disabled={busy}
              onClick={async () => {
                await onConfirm();
                setOpen(false);
              }}
            >
              {busy ? "削除中…" : confirmLabel}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

