import React from 'react';
import { HelpCircle } from 'lucide-react';
import Button from './Button';

interface EmptyStateProps {
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  icon?: React.ComponentType<{ className?: string }>;
  disabled?: boolean;
  actionTitle?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  title,
  description,
  actionLabel,
  onAction,
  icon: Icon = HelpCircle,
  disabled,
  actionTitle,
}) => {
  return (
    <div className="flex flex-col items-center justify-center p-12 text-center border border-dashed border-[#2A2A38] rounded-xl bg-[#111118]/35 max-w-lg mx-auto space-y-4">
      <div className="p-4 bg-[#6C63FF]/5 border border-[#6C63FF]/10 text-[#6C63FF] rounded-2xl">
        <Icon className="w-10 h-10" />
      </div>
      <div className="space-y-1">
        <h4 className="text-base font-bold text-white tracking-wide">{title}</h4>
        <p className="text-xs text-gray-400 leading-relaxed">{description}</p>
      </div>
      {actionLabel && onAction && (
        <Button onClick={onAction} size="sm" className="mt-2" disabled={disabled} title={actionTitle}>
          {actionLabel}
        </Button>
      )}
    </div>
  );
};
export default EmptyState;
