import { Label } from "@repo/design-system/components/ui/label";
import { Textarea } from "@repo/design-system/components/ui/textarea";

export const Default = () => (
  <div className="flex w-80 flex-col gap-2">
    <Label htmlFor="textarea-default">Decline reason</Label>
    <Textarea
      id="textarea-default"
      placeholder="Explain why this leave request is being declined"
    />
  </div>
);

export const WithValue = () => (
  <div className="flex w-80 flex-col gap-2">
    <Label htmlFor="textarea-value">Notes for manager</Label>
    <Textarea
      defaultValue="Covering the Bondi store while Priya is on annual leave. Happy to swap shifts if needed."
      id="textarea-value"
    />
  </div>
);

export const Disabled = () => (
  <div className="flex w-80 flex-col gap-2">
    <Label htmlFor="textarea-disabled">Approval comment</Label>
    <Textarea
      defaultValue="Approved. Please arrange handover with the team lead."
      disabled
      id="textarea-disabled"
    />
  </div>
);
