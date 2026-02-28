import { ExternalLink } from 'lucide-react';
import { NotableSale } from '../types';

interface NotableSalesProps {
  sales: NotableSale[];
  isLoading?: boolean;
}

export function NotableSales({ sales, isLoading }: NotableSalesProps) {
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
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="bg-bears-navy-light rounded-lg p-4 animate-pulse">
            <div className="h-4 bg-bears-gray/20 rounded w-3/4" />
          </div>
        ))}
      </div>
    );
  }

  if (!sales.length) {
    return (
      <div className="text-center py-12">
        <p className="text-bears-gray">No notable sales recorded yet.</p>
        <p className="text-bears-gray text-sm mt-2">Notable sales will appear here after refreshing prices.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {sales.map((sale) => (
        <div
          key={sale.id}
          className="bg-bears-navy-light border border-bears-gray/20 rounded-lg p-3 sm:p-4 hover:border-bears-orange/30 transition-colors"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-white font-medium text-sm sm:text-base truncate sm:whitespace-normal">{sale.card_description}</p>
              <div className="flex flex-wrap items-center gap-2 sm:gap-3 mt-2 text-sm">
                <span className="text-bears-orange font-bold text-base sm:text-lg">
                  {formatCurrency(sale.price)}
                </span>
                <span className="text-bears-gray text-xs sm:text-sm">
                  {formatDate(sale.sale_date)}
                </span>
                <span className="text-bears-gray bg-bears-navy px-2 py-0.5 rounded text-xs">
                  {sale.platform}
                </span>
              </div>
            </div>
            {sale.url && (
              <a
                href={sale.url}
                target="_blank"
                rel="noopener noreferrer"
                className="p-2 hover:bg-bears-orange/20 rounded-lg transition-colors"
              >
                <ExternalLink className="w-4 h-4 text-bears-gray hover:text-bears-orange" />
              </a>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
