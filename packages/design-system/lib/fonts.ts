import { cn } from '@repo/design-system/lib/utils';
import { Lora, Plus_Jakarta_Sans } from 'next/font/google';

const plusJakartaSans = Plus_Jakarta_Sans({
  subsets: ['latin'],
  variable: '--font-plus-jakarta-sans',
  display: 'swap',
  weight: ['400', '500', '600', '700'],
});

const lora = Lora({
  subsets: ['latin'],
  variable: '--font-lora',
  display: 'swap',
  style: ['normal', 'italic'],
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
