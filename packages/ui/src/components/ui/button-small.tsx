import React from 'react';
import { Button } from './button';

export const ButtonSmall = React.forwardRef<HTMLButtonElement, React.ComponentProps<typeof Button>>(
  ({ className, variant, ...props }, ref) => {
    return <Button ref={ref} variant={variant} size="sm" className={className} {...props} />;
  }
);
ButtonSmall.displayName = 'ButtonSmall';
