import * as React from 'react';
import { cn } from '../../lib/utils';

export function Card({ className, ...props }: React.ComponentProps<'section'>) {
  return (
    <section
      className={cn('rounded-[28px] border border-[#ece3d3]/80 bg-white shadow-card', className)}
      {...props}
    />
  );
}
