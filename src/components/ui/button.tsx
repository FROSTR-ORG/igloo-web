import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:h-[1.05rem] [&_svg]:w-[1.05rem] [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default: 'bg-blue-600 text-blue-100 hover:bg-blue-500/90',
        destructive: 'bg-red-600 text-blue-50 hover:bg-red-500/90',
        outline: 'border border-blue-900/40 bg-transparent text-blue-200 hover:border-blue-400/70 hover:text-blue-50',
        secondary: 'bg-blue-900/30 text-blue-100 hover:bg-blue-900/50',
        ghost: 'text-blue-300 hover:text-blue-100 hover:bg-blue-900/30',
        link: 'text-blue-400 underline-offset-4 hover:text-blue-200 hover:underline'
      },
      size: {
        default: 'h-10 px-4 py-2',
        sm: 'h-9 rounded-md px-3',
        lg: 'h-11 rounded-md px-6',
        icon: 'h-10 w-10'
      }
    },
    defaultVariants: {
      variant: 'default',
      size: 'default'
    }
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
    );
  }
);
Button.displayName = 'Button';

export { Button, buttonVariants };
