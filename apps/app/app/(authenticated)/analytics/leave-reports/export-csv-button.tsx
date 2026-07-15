"use client";

import { Button } from "@repo/design-system/components/ui/button";
import { toast } from "@repo/design-system/components/ui/sonner";
import { DownloadIcon, Loader2Icon } from "lucide-react";
import { useState, useTransition } from "react";
import { exportLeaveReportsCsvAction } from "./_actions";

interface ExportCsvButtonProps {
  organisationId: string;
}

export const ExportCsvButton = ({ organisationId }: ExportCsvButtonProps) => {
  const [isPending, startTransition] = useTransition();
  const [exporting, setExporting] = useState(false);

  const handleExport = () => {
    setExporting(true);
    startTransition(async () => {
      try {
        const result = await exportLeaveReportsCsvAction({ organisationId });
        if (!result.ok) {
          toast.error(result.error.message);
          return;
        }

        const blob = new Blob([result.value.csvContent], {
          type: "text/csv;charset=utf-8",
        });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = result.value.filename;
        link.click();
        URL.revokeObjectURL(url);
        toast.success("Leave report exported successfully.");
      } catch {
        toast.error("Failed to export leave report.");
      } finally {
        setExporting(false);
      }
    });
  };

  return (
    <Button
      className="gap-1.5"
      disabled={exporting || isPending}
      onClick={handleExport}
      size="sm"
      variant="outline"
    >
      {exporting || isPending ? (
        <Loader2Icon className="h-4 w-4 animate-spin" />
      ) : (
        <DownloadIcon className="h-4 w-4" />
      )}
      <span>Export CSV</span>
    </Button>
  );
};
