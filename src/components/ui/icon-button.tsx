import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

const iconButtonVariants = cva(
  'inline-flex items-center justify-center rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-0 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default: 'bg-blue-600 text-blue-100 hover:bg-blue-700',
        ghost: 'text-blue-400 hover:bg-blue-900/30 hover:text-blue-300',
        destructive: 'text-red-400 hover:bg-red-500/20 hover:text-red-300',
        success: 'text-green-400 hover:bg-green-500/20 hover:text-green-300',
        outline: 'border border-blue-900/30 text-blue-300 hover:bg-blue-900/20'
      },
      size: {
        default: 'h-8 w-8',
        sm: 'h-7 w-7',
        lg: 'h-10 w-10'
      }
    },
    defaultVariants: {
      variant: 'ghost',
      size: 'default'
    }
  }
);

export interface IconButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof iconButtonVariants> {
  icon: React.ReactNode;
  tooltip?: string;
}

const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ className, variant, size, icon, tooltip, ...props }, ref) => (
    <Button
      variant="ghost"
      size="sm"
      className={cn(iconButtonVariants({ variant, size }), className)}
      ref={ref}
      title={tooltip}
      aria-label={tooltip}
      type="button"
      {...props}
    >
      {icon}
    </Button>
  )
);

IconButton.displayName = 'IconButton';

export { IconButton, iconButtonVariants };
