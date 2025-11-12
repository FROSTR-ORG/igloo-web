import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

const iconButtonVariants = cva(
  'inline-flex items-center justify-center rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-0 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default: 'bg-primary/85 text-primary-foreground hover:bg-primary/75',
        ghost: 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
        destructive: 'text-destructive hover:bg-destructive/20 hover:text-destructive',
        success: 'text-success hover:bg-success/20 hover:text-success-foreground',
        outline: 'border border-border text-foreground hover:bg-accent'
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
