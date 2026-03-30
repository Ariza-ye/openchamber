import React from 'react';
import { Button } from './button';

export const ButtonLarge = React.forwardRef<HTMLButtonElement, React.ComponentProps<typeof Button>>(
  ({ className, variant, ...props }, ref) => {
    return <Button ref={ref} variant={variant} size="lg" className={className} {...props} />;
  }
);
ButtonLarge.displayName = 'ButtonLarge';
