"use client";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@repo/design-system/components/ui/alert-dialog";
import { Input } from "@repo/design-system/components/ui/input";
import { Label } from "@repo/design-system/components/ui/label";
import { useId, useState } from "react";

interface ConfirmActionDialogProps {
  confirmLabel: string;
  description: string;
  destructive?: boolean;
  onConfirm: () => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  pending?: boolean;
  /** If set, user must type this exact string before confirming */
  requireTyping?: string;
  title: string;
}

export const ConfirmActionDialog = ({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  onConfirm,
  requireTyping,
  destructive = false,
  pending = false,
}: ConfirmActionDialogProps) => {
  const [typedValue, setTypedValue] = useState("");
  const inputId = useId();
  const canConfirm =
    (requireTyping ? typedValue === requireTyping : true) && !pending;

  const handleOpenChange = (next: boolean) => {
    if (!(next || pending)) {
      setTypedValue("");
      onOpenChange(next);
    }
    if (next) {
      onOpenChange(next);
    }
  };

  return (
    <AlertDialog onOpenChange={handleOpenChange} open={open}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>

        {requireTyping ? (
          <div className="space-y-2 py-2">
            <Label className="text-muted-foreground text-sm" htmlFor={inputId}>
              Type{" "}
              <span className="font-semibold text-foreground">
                {requireTyping}
              </span>{" "}
              to confirm
            </Label>
            <Input
              autoComplete="off"
              disabled={pending}
              id={inputId}
              onChange={(e) => setTypedValue(e.target.value)}
              placeholder={requireTyping}
              value={typedValue}
            />
          </div>
        ) : null}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className={
              destructive
                ? "bg-destructive text-destructive-foreground hover:bg-destructive/90 disabled:opacity-40"
                : undefined
            }
            disabled={!canConfirm}
            onClick={(event) => {
              event.preventDefault();
              onConfirm();
            }}
          >
            {confirmationButtonLabel(pending, confirmLabel)}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

function confirmationButtonLabel(pending: boolean, confirmLabel: string) {
  return pending ? "Updating…" : confirmLabel;
}
