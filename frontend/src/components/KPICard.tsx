import { TrendingUp, TrendingDown } from 'lucide-react';

interface KPICardProps {
  title: string;
  value: string;
  trend?: 'up' | 'down' | 'neutral';
  subtitle?: string;
}

export function KPICard({ title, value, trend, subtitle }: KPICardProps) {
  return (
    <div className="bg-bears-navy-light border border-bears-gray/20 rounded-xl p-4 sm:p-5 shadow-lg min-w-[160px] snap-center flex-shrink-0 md:min-w-0 md:flex-shrink">
      <p className="text-bears-gray text-sm font-medium uppercase tracking-wide">{title}</p>
      <div className="mt-2 flex items-baseline gap-2">
        <p className={`text-xl sm:text-2xl font-bold ${
          trend === 'up' ? 'text-green-400' :
          trend === 'down' ? 'text-red-400' :
          'text-white'
        }`}>
          {value}
        </p>
        {trend === 'up' && <TrendingUp className="w-5 h-5 text-green-400" />}
        {trend === 'down' && <TrendingDown className="w-5 h-5 text-red-400" />}
      </div>
      {subtitle && <p className="text-bears-gray text-xs mt-1">{subtitle}</p>}
    </div>
  );
}
