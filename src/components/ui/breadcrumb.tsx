import React from 'react';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface BreadcrumbsProps {
  children: React.ReactNode;
  className?: string;
  separator?: React.ReactNode;
}

export interface BreadcrumbItemProps {
  children: React.ReactNode;
  onClick?: () => void;
  current?: boolean;
  className?: string;
}

export function Breadcrumbs({
  children,
  className,
  separator = <ChevronRight className="h-4 w-4" aria-hidden="true" />,
}: BreadcrumbsProps) {
  const items = React.Children.toArray(children);

  return (
    <nav
      aria-label="Breadcrumb navigation"
      className={cn('flex items-center space-x-1 text-sm', className)}
    >
      <ol className="flex items-center space-x-1" role="list">
        {items.map((item, index) => (
          <React.Fragment key={index}>
            {item}
            {index < items.length - 1 && (
              <li
                className="flex items-center text-muted-foreground"
                role="separator"
                aria-hidden="true"
              >
                {separator}
              </li>
            )}
          </React.Fragment>
        ))}
      </ol>
    </nav>
  );
}

export function BreadcrumbItem({
  children,
  onClick,
  current = false,
  className,
}: BreadcrumbItemProps) {
  const baseStyles = 'inline-flex items-center transition-colors';

  if (current) {
    return (
      <li
        className={cn(baseStyles, 'text-foreground font-medium', className)}
        aria-current="page"
      >
        {children}
      </li>
    );
  }

  if (onClick) {
    return (
      <li className={cn(baseStyles, className)}>
        <button
          onClick={onClick}
          className="text-muted-foreground hover:text-foreground focus-visible:text-foreground focus-visible:underline"
          type="button"
        >
          {children}
        </button>
      </li>
    );
  }

  return (
    <li className={cn(baseStyles, 'text-muted-foreground', className)}>
      {children}
    </li>
  );
}
