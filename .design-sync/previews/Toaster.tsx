import { Toaster, toast } from "@repo/design-system";
import { useEffect } from "react";

const Frame = ({ children }: { children: React.ReactNode }) => (
  <div className="relative" style={{ width: 420, height: 220 }}>
    {children}
  </div>
);

export const Success = () => {
  useEffect(() => {
    toast.success("Leave request approved", {
      description: "Priya Shah, annual leave 14 to 18 Oct. Written to Xero.",
      duration: Number.POSITIVE_INFINITY,
    });
  }, []);
  return (
    <Frame>
      <Toaster position="top-center" />
    </Frame>
  );
};

export const Variants = () => {
  useEffect(() => {
    toast("Feed URL copied", { duration: Number.POSITIVE_INFINITY });
    toast.error("Could not reach Xero", {
      description: "Your request was not sent. Try again in a moment.",
      duration: Number.POSITIVE_INFINITY,
    });
  }, []);
  return (
    <Frame>
      <Toaster expand position="top-center" />
    </Frame>
  );
};
