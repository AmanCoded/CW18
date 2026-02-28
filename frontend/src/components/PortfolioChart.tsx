import { useState } from 'react';
import {
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Area, AreaChart
} from 'recharts';
import { PortfolioSnapshot } from '../types';

interface PortfolioChartProps {
  data: PortfolioSnapshot[];
  isLoading?: boolean;
}

type TimeRange = '7D' | '30D' | '90D' | 'ALL';

export function PortfolioChart({ data, isLoading }: PortfolioChartProps) {
  const [timeRange, setTimeRange] = useState<TimeRange>('30D');

  const filterData = (range: TimeRange) => {
    if (!data.length) return [];

    const now = new Date();
    const daysMap: Record<TimeRange, number> = {
      '7D': 7,
      '30D': 30,
      '90D': 90,
      'ALL': 365
    };

    const cutoff = new Date(now.getTime() - daysMap[range] * 24 * 60 * 60 * 1000);
    return data.filter(d => new Date(d.snapshot_date) >= cutoff);
  };

  const chartData = filterData(timeRange);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(value);
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  if (isLoading) {
    return (
      <div className="bg-bears-navy-light border border-bears-gray/20 rounded-xl p-6">
        <div className="h-64 flex items-center justify-center">
          <div className="animate-pulse text-bears-gray">Loading chart...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-bears-navy-light border border-bears-gray/20 rounded-xl p-4 sm:p-6">
      <div className="flex items-center justify-between mb-4 gap-2">
        <h2 className="text-white font-semibold text-sm sm:text-base">Portfolio Value</h2>
        <div className="flex gap-1">
          {(['7D', '30D', '90D', 'ALL'] as TimeRange[]).map((range) => (
            <button
              key={range}
              onClick={() => setTimeRange(range)}
              className={`px-2 sm:px-3 py-1 text-xs font-medium rounded-lg transition-colors ${
                timeRange === range
                  ? 'bg-bears-orange text-white'
                  : 'bg-bears-navy text-bears-gray hover:text-white'
              }`}
            >
              {range}
            </button>
          ))}
        </div>
      </div>

      {chartData.length > 0 ? (
        <div className="h-[200px] sm:h-[280px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData}>
            <defs>
              <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#C83803" stopOpacity={0.3}/>
                <stop offset="95%" stopColor="#C83803" stopOpacity={0}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#A5ACAF20" />
            <XAxis
              dataKey="snapshot_date"
              tickFormatter={formatDate}
              stroke="#A5ACAF"
              fontSize={11}
              tickLine={false}
            />
            <YAxis
              tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
              stroke="#A5ACAF"
              fontSize={11}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: '#0B162A',
                border: '1px solid #A5ACAF40',
                borderRadius: '8px',
                color: '#fff'
              }}
              formatter={(value: number) => [formatCurrency(value), 'Portfolio Value']}
              labelFormatter={formatDate}
            />
            <Area
              type="monotone"
              dataKey="total_estimated_value"
              stroke="#C83803"
              strokeWidth={2}
              fillOpacity={1}
              fill="url(#colorValue)"
            />
          </AreaChart>
        </ResponsiveContainer>
        </div>
      ) : (
        <div className="h-64 flex items-center justify-center text-bears-gray">
          <p>No portfolio history available yet. Refresh prices to start tracking.</p>
        </div>
      )}
    </div>
  );
}
