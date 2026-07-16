import { Alert, AlertTitle } from "@repo/design-system/components/ui/alert";
import { Info } from "lucide-react";

export const Default = () => (
  <Alert className="w-80">
    <Info />
    <AlertTitle>Leave request submitted</AlertTitle>
  </Alert>
);
