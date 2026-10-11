import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Label,
  Textarea,
} from "@repo/design-system";

export const DeclineLeave = () => (
  <Dialog open>
    <DialogTrigger asChild>
      <Button variant="outline">Decline</Button>
    </DialogTrigger>
    <DialogContent style={{ maxWidth: 448 }}>
      <DialogHeader>
        <DialogTitle>Decline this leave?</DialogTitle>
        <DialogDescription>
          Priya Shah, annual leave, Mon 14 Oct to Fri 18 Oct (38 hours).
        </DialogDescription>
      </DialogHeader>
      <div className="flex flex-col gap-2">
        <Label htmlFor="decline-reason">Reason</Label>
        <Textarea
          defaultValue="Two other team members are already away that week. Could you move this to the following fortnight?"
          id="decline-reason"
        />
        <p className="text-label-md text-muted-foreground">
          The reason will be visible to the employee.
        </p>
      </div>
      <DialogFooter>
        <DialogClose asChild>
          <Button variant="outline">Cancel</Button>
        </DialogClose>
        <Button variant="destructive">Decline leave</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
);

export const ApproveLeave = () => (
  <Dialog open>
    <DialogTrigger asChild>
      <Button>Approve</Button>
    </DialogTrigger>
    <DialogContent style={{ maxWidth: 448 }}>
      <DialogHeader>
        <DialogTitle>Approve this leave?</DialogTitle>
        <DialogDescription>
          Approving writes the leave to Xero Payroll straight away. Tom Nguyen
          will be notified by email.
        </DialogDescription>
      </DialogHeader>
      <div className="bg-surface-container-low flex flex-col gap-1 rounded-xl p-4 text-sm">
        <span className="font-medium">Tom Nguyen, personal leave</span>
        <span className="text-muted-foreground">Mon 21 Oct, 7.6 hours</span>
      </div>
      <DialogFooter>
        <DialogClose asChild>
          <Button variant="outline">Cancel</Button>
        </DialogClose>
        <Button>Approve leave</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
);
