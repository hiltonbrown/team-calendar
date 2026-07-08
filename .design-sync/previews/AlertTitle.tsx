import { Info } from "lucide-react";
import { Alert, AlertTitle } from "@repo/design-system/components/ui/alert";

export const Default = () => (
  <Alert className="w-80">
    <Info />
    <AlertTitle>Leave request submitted</AlertTitle>
  </Alert>
);
