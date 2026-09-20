import { cn } from '@repo/design-system/lib/utils';
import localFont from 'next/font/local';

const plusJakartaSans = localFont({
  display: 'swap',
  src: '../fonts/plus-jakarta-sans.woff2',
  variable: '--font-plus-jakarta-sans',
  weight: '400 700',
});

const lora = localFont({
  display: 'swap',
  src: [
    {
      path: '../fonts/lora-regular.woff2',
      style: 'normal',
      weight: '400 700',
    },
    {
      path: '../fonts/lora-italic.woff2',
      style: 'italic',
      weight: '400 700',
    },
  ],
  variable: '--font-lora',
});

const base = 'touch-manipulation font-sans antialiased';

// Product UI (apps/app): Plus Jakarta Sans carries every type level, so the app
// never loads Lora. See DESIGN.md typography scale.
export const fonts = cn(plusJakartaSans.variable, base);

// Marketing surfaces (apps/web): additionally load Lora for the editorial serif
// exposed via --marketing-serif.
export const marketingFonts = cn(
  plusJakartaSans.variable,
  lora.variable,
  base
);
