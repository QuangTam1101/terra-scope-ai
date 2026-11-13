import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/utils';

const buttonVariants = cva('inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8ed8aa] disabled:pointer-events-none disabled:opacity-40', {
  variants: {
    variant: { default: 'bg-[#16804a] text-white hover:bg-[#11673b]', outline: 'border border-[#d9e8dc] bg-white text-[#234b36] hover:bg-[#f3f8f4]', ghost: 'text-[#234b36] hover:bg-[#eaf6ed]' },
    size: { default: 'h-11 px-4 py-2', sm: 'h-8 px-3 text-xs', lg: 'h-12 px-6' },
  },
  defaultVariants: { variant: 'default', size: 'default' },
});
type ButtonProps = React.ComponentProps<'button'> & VariantProps<typeof buttonVariants> & { asChild?: boolean };
export function Button({ className, variant, size, asChild = false, ...props }: ButtonProps) {
  const Comp = asChild ? Slot : 'button';
  return <Comp className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}
