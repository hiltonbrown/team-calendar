import {
  InputOTP,
  InputOTPGroup,
  InputOTPSeparator,
  InputOTPSlot,
} from "@repo/design-system/components/ui/input-otp";

export const Default = () => (
  <InputOTP maxLength={4} defaultValue="7042">
    <InputOTPGroup>
      <InputOTPSlot index={0} />
      <InputOTPSlot index={1} />
    </InputOTPGroup>
    <InputOTPSeparator />
    <InputOTPGroup>
      <InputOTPSlot index={2} />
      <InputOTPSlot index={3} />
    </InputOTPGroup>
  </InputOTP>
);
