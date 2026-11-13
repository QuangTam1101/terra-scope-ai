import * as React from 'react';
import { cn } from '../../lib/utils';
export function Card({ className, ...props }: React.ComponentProps<'section'>) {
  return <section className={cn('rounded-2xl border border-[#d9e8dc] bg-white shadow-soft', className)} {...props} />;
}
