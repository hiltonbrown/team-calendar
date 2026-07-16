import { Button } from "@repo/design-system/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@repo/design-system/components/ui/dialog";

export const WithdrawLeaveRequest = () => (
  <Dialog defaultOpen>
    <DialogTrigger asChild>
      <Button variant="destructive">Withdraw request</Button>
    </DialogTrigger>
    <DialogContent className="sm:max-w-[420px]">
      <DialogHeader>
        <DialogTitle>Withdraw leave request?</DialogTitle>
        <DialogDescription>
          This withdraws your annual leave request for 12&ndash;16 January 2026
          and notifies your manager. Xero is updated immediately.
        </DialogDescription>
      </DialogHeader>
      <DialogFooter>
        <Button variant="secondary">Keep request</Button>
        <Button variant="destructive">Withdraw request</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
);

export const SendToXero = () => (
  <Dialog defaultOpen>
    <DialogTrigger asChild>
      <Button>Send to Xero</Button>
    </DialogTrigger>
    <DialogContent className="max-h-[92dvh] overflow-y-auto rounded-2xl sm:max-w-[400px]">
      <DialogHeader>
        <DialogTitle>Send leave to Xero?</DialogTitle>
        <DialogDescription>
          This sends the leave request to Xero Payroll and puts it in the
          manager approval queue. It is not approved until Xero accepts it.
        </DialogDescription>
      </DialogHeader>
      <div className="rounded-2xl bg-muted p-4 text-sm">
        <dl className="grid gap-3">
          <div className="grid gap-1">
            <dt className="font-medium text-muted-foreground text-xs uppercase tracking-widest">
              Leave type
            </dt>
            <dd className="text-foreground">Annual leave</dd>
          </div>
          <div className="grid gap-1">
            <dt className="font-medium text-muted-foreground text-xs uppercase tracking-widest">
              Dates
            </dt>
            <dd className="text-foreground">
              12 January 2026 to 16 January 2026
            </dd>
          </div>
          <div className="grid gap-1">
            <dt className="font-medium text-muted-foreground text-xs uppercase tracking-widest">
              Balance impact
            </dt>
            <dd className="text-foreground">
              9 days remaining after this submission
            </dd>
          </div>
        </dl>
      </div>
      <DialogFooter>
        <Button variant="secondary">Cancel</Button>
        <Button>Send to Xero</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
);
