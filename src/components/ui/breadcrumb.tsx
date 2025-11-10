import React from 'react';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * <^ bQü*Äö
 *
 * Ð›p„B§ü*& WCAG 2.1 ï¿î'Æ
 *
 * @example
 * ```tsx
 * <Breadcrumbs>
 *   <BreadcrumbItem onClick={() => setView('projects')}>
 *     yîh
 *   </BreadcrumbItem>
 *   <BreadcrumbItem onClick={() => setView('sessions')}>
 *     Ý¡
 *   </BreadcrumbItem>
 *   <BreadcrumbItem current>
 *     SMÝ
 *   </BreadcrumbItem>
 * </Breadcrumbs>
 * ```
 */

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

/**
 * bQ¹hÄö
 */
export function Breadcrumbs({
  children,
  className,
  separator = <ChevronRight className="h-4 w-4" aria-hidden="true" />,
}: BreadcrumbsProps) {
  const items = React.Children.toArray(children);

  return (
    <nav
      aria-label="bQü*"
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

/**
 * bQyÄö
 */
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

/**
 * bQþ¥Äö(Žèþ¥	
 */
export interface BreadcrumbLinkProps {
  children: React.ReactNode;
  href: string;
  current?: boolean;
  className?: string;
}

export function BreadcrumbLink({
  children,
  href,
  current = false,
  className,
}: BreadcrumbLinkProps) {
  if (current) {
    return (
      <li
        className={cn(
          'inline-flex items-center text-foreground font-medium transition-colors',
          className
        )}
        aria-current="page"
      >
        {children}
      </li>
    );
  }

  return (
    <li className="inline-flex items-center transition-colors">
      <a
        href={href}
        className={cn(
          'text-muted-foreground hover:text-foreground focus-visible:text-foreground focus-visible:underline',
          className
        )}
      >
        {children}
      </a>
    </li>
  );
}

/**
 * bQeÄö(Žï„	
 */
export interface BreadcrumbEllipsisProps {
  items: Array<{
    label: string;
    onClick: () => void;
  }>;
  className?: string;
}

export function BreadcrumbEllipsis({ items, className }: BreadcrumbEllipsisProps) {
  const [isOpen, setIsOpen] = React.useState(false);

  return (
    <li className={cn('inline-flex items-center relative', className)}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="text-muted-foreground hover:text-foreground focus-visible:text-foreground p-1 rounded"
        aria-label=">:ôï„"
        aria-expanded={isOpen}
      >
        <span className="sr-only">>:ô</span>
        <span aria-hidden="true">...</span>
      </button>

      {isOpen && (
        <div
          className="absolute top-full left-0 mt-1 bg-popover border border-border rounded-lg shadow-lg py-1 z-50 min-w-[160px]"
          role="menu"
        >
          {items.map((item, index) => (
            <button
              key={index}
              onClick={() => {
                item.onClick();
                setIsOpen(false);
              }}
              className="w-full text-left px-3 py-2 text-sm hover:bg-muted transition-colors"
              role="menuitem"
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </li>
  );
}
