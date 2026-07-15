"use client";

import { Toaster, toast } from "@repo/design-system/components/ui/sonner";
import { useEffect } from "react";

export const ApprovalSuccess = () => {
  useEffect(() => {
    toast.success("Leave request approved", {
      description: "Priya Nair has been notified.",
      duration: Number.POSITIVE_INFINITY,
    });
  }, []);

  return <Toaster position="top-center" richColors />;
};

export const SyncError = () => {
  useEffect(() => {
    toast.error("Xero sync failed", {
      description: "Your leave request could not be written back to Xero.",
      duration: Number.POSITIVE_INFINITY,
    });
  }, []);

  return <Toaster position="top-center" richColors />;
};
