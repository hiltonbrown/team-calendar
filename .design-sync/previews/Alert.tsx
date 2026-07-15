import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@repo/design-system/components/ui/alert";
import { CircleAlert, Info } from "lucide-react";

export const Default = () => (
  <Alert className="w-96">
    <Info />
    <AlertTitle>Public holiday added</AlertTitle>
    <AlertDescription>
      Australia Day (26 Jan 2026) was applied automatically for your region.
    </AlertDescription>
  </Alert>
);

export const Destructive = () => (
  <Alert className="w-96" variant="destructive">
    <CircleAlert />
    <AlertTitle>Xero sync failed</AlertTitle>
    <AlertDescription>
      Your leave request could not be written back to Xero. Try submitting
      again.
    </AlertDescription>
  </Alert>
);
