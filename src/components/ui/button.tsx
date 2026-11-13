import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full font-nunito font-extrabold transition-all duration-150 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-[#2b2540] disabled:pointer-events-none disabled:opacity-45 cursor-pointer',
  {
    variants: {
      variant: {
        default: 'bg-[#2b2540] text-white hover:bg-[#3d3752] shadow-sm',
        soft: 'bg-[#ede6fb] text-[#2b2540] hover:bg-[#dfd4f6]',
        outline: 'border-2 border-[#ece3d3] bg-white text-[#2b2540] hover:bg-[#fcf9f2]',
        ghost: 'text-[#4e4860] hover:bg-[#f6f1e8] hover:text-[#2b2540]',
      },
      size: {
        default: 'min-h-[46px] px-5 py-2 text-[15px]',
        sm: 'min-h-[38px] px-3.5 text-xs',
        lg: 'min-h-[50px] px-7 text-base',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  }
);
type ButtonProps = React.ComponentProps<'button'> & VariantProps<typeof buttonVariants> & { asChild?: boolean };
export function Button({ className, variant, size, asChild = false, ...props }: ButtonProps) {
  const Comp = asChild ? Slot : 'button';
  return <Comp className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}
