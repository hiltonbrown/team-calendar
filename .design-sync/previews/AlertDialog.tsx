import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
  Button,
  Input,
  Label,
} from "@repo/design-system";

export const WithdrawRequest = () => (
  <AlertDialog open>
    <AlertDialogTrigger asChild>
      <Button variant="destructive">Withdraw request</Button>
    </AlertDialogTrigger>
    <AlertDialogContent style={{ maxWidth: 448 }}>
      <AlertDialogHeader>
        <AlertDialogTitle>Withdraw this leave request?</AlertDialogTitle>
        <AlertDialogDescription>
          Annual leave, Mon 14 Oct to Fri 18 Oct. Your approver will be told the
          request has been withdrawn, and the leave is removed from Xero Payroll.
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel>Keep request</AlertDialogCancel>
        <AlertDialogAction className="bg-destructive text-white">
          Withdraw
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
);

export const TypeToConfirm = () => (
  <AlertDialog open>
    <AlertDialogTrigger asChild>
      <Button variant="outline">Disconnect Xero</Button>
    </AlertDialogTrigger>
    <AlertDialogContent style={{ maxWidth: 448 }}>
      <AlertDialogHeader>
        <AlertDialogTitle>Disconnect Xero Payroll?</AlertDialogTitle>
        <AlertDialogDescription>
          Leave will stop syncing for Acme Restaurants. Existing calendar
          entries stay in place until you reconnect.
        </AlertDialogDescription>
      </AlertDialogHeader>
      <div className="flex flex-col gap-2">
        <Label className="text-muted-foreground" htmlFor="confirm-disconnect">
          Type <span className="text-foreground font-semibold">DISCONNECT</span>{" "}
          to confirm
        </Label>
        <Input autoComplete="off" defaultValue="DISCONNECT" id="confirm-disconnect" />
      </div>
      <AlertDialogFooter>
        <AlertDialogCancel>Cancel</AlertDialogCancel>
        <AlertDialogAction className="bg-destructive text-white">
          Disconnect
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
);
