import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

// igloo theme aligned button styles
const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-900 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:h-[1.05rem] [&_svg]:w-[1.05rem] [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        // Primary brand blue button
        default: 'bg-blue-600 text-blue-100 hover:bg-blue-700',
        // Danger
        destructive: 'bg-red-600 text-white hover:bg-red-700',
        // Success
        success: 'bg-green-600 text-white hover:bg-green-700',
        // Subtle filled surface
        secondary: 'bg-gray-800/50 text-blue-200 hover:bg-gray-700/50 border border-blue-900/30',
        // Minimal button - igloo ghost style
        ghost: 'text-blue-400 hover:text-blue-300 hover:bg-blue-900/30',
        // Outlined
        outline: 'border border-blue-900/30 bg-transparent text-blue-300 hover:bg-blue-900/20 hover:text-blue-200',
        // Link-style
        link: 'text-blue-400 underline-offset-4 hover:underline hover:text-blue-300'
      },
      size: {
        default: 'h-10 px-4 py-2',
        sm: 'h-8 rounded-md px-3 text-xs',
        lg: 'h-11 rounded-lg px-6',
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
