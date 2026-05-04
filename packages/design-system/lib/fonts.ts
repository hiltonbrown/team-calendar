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
});

export const fonts = cn(
  plusJakartaSans.variable,
  lora.variable,
  'touch-manipulation font-sans antialiased'
);
