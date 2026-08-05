import React from 'react';

import { cn } from '@/lib/util/shared';

interface ExpandableContainerProps {
  children: React.ReactNode;
  isExpanded: boolean;
}

const ExpandableContainer = ({ children, isExpanded }: ExpandableContainerProps) => {
  return (
    <div
      className={cn('grid grid-rows-[0fr] duration-100', {
        'grid-rows-[1fr]': isExpanded,
      })}
    >
      <div
        className={cn('overflow-hidden opacity-0 duration-300', {
          'opacity-100': isExpanded,
        })}
      >
        {children}
      </div>
    </div>
  );
};

export default ExpandableContainer;
