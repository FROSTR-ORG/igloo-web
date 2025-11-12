import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

const iconButtonVariants = cva(
  'inline-flex items-center justify-center rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60 focus-visible:ring-offset-0 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default: 'bg-blue-600/80 text-blue-50 hover:bg-blue-500/80',
        ghost: 'text-blue-400 hover:text-blue-200 hover:bg-blue-900/30',
        destructive: 'text-red-400 hover:text-red-200 hover:bg-red-900/30',
        success: 'text-emerald-400 hover:text-emerald-200 hover:bg-emerald-900/30',
        outline: 'border border-blue-900/40 text-blue-200 hover:border-blue-400/70 hover:text-blue-50'
      },
      size: {
        default: 'h-8 w-8',
        sm: 'h-7 w-7',
        lg: 'h-10 w-10'
      }
    },
    defaultVariants: {
      variant: 'default',
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
