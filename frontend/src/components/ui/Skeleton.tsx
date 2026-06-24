import React from 'react';
import { cn } from '../../utils/cn';

interface SkeletonProps {
  className?: string;
}

export const Skeleton: React.FC<SkeletonProps> = ({ className }) => {
  return (
    <div className={cn('bg-[#1A1A24] border border-[#2A2A38]/30 animate-pulse rounded', className)} />
  );
};
export default Skeleton;
