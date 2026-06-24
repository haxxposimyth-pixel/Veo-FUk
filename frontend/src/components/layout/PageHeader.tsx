import React from 'react';

interface PageHeaderProps {
  title: string;
  description: string;
  actions?: React.ReactNode;
}

export const PageHeader: React.FC<PageHeaderProps> = ({ title, description, actions }) => {
  return (
    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-[#2A2A38] pb-5 shrink-0 select-none">
      <div className="space-y-1">
        <h2 className="font-display text-2xl font-black text-white tracking-wide uppercase">
          {title}
        </h2>
        <p className="text-xs text-gray-400 leading-relaxed max-w-2xl">
          {description}
        </p>
      </div>
      {actions && (
        <div className="flex items-center gap-3 shrink-0">
          {actions}
        </div>
      )}
    </div>
  );
};
export default PageHeader;
