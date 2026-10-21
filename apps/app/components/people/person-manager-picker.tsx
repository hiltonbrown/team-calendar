"use client";
import type { ManagerChoice } from "@repo/availability";
import { Label } from "@repo/design-system/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/design-system/components/ui/select";
import { toast } from "@repo/design-system/components/ui/sonner";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { setPersonManagerAction } from "@/app/(authenticated)/people/_actions";

export function PersonManagerPicker({
  personId,
  currentManagerId,
  choices,
}: {
  personId: string;
  currentManagerId: string | null;
  choices: ManagerChoice[];
}) {
  const [selected, setSelected] = useState(currentManagerId ?? "unassigned");
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const fieldId = `manager-${personId}`;
  return (
    <div className="space-y-2">
      <Label htmlFor={fieldId}>Manager</Label>
      <Select
        disabled={pending}
        onValueChange={(value) => {
          startTransition(async () => {
            const result = await setPersonManagerAction({
              managerPersonId: value === "unassigned" ? null : value,
              personId,
            });
            if (!result.ok) {
              toast.error(result.error.message);
              return;
            }
            setSelected(result.value.managerPersonId ?? "unassigned");
            toast.success("Manager updated.");
            router.refresh();
          });
        }}
        value={selected}
      >
        <SelectTrigger aria-describedby={`${fieldId}-description`} id={fieldId}>
          <SelectValue placeholder="Unassigned" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="unassigned">Unassigned</SelectItem>
          {choices
            .filter((choice) => choice.id !== personId)
            .map((choice) => (
              <SelectItem key={choice.id} value={choice.id}>
                {choice.name} · {choice.companyName}
              </SelectItem>
            ))}
        </SelectContent>
      </Select>
      <p
        className="text-muted-foreground text-xs"
        id={`${fieldId}-description`}
      >
        Choose a manager from any company in this account.
      </p>
    </div>
  );
}
