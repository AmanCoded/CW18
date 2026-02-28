import { useState } from 'react';
import { AlertTriangle, ExternalLink, ChevronDown, ChevronUp, ShoppingCart, Search, Trash2, Pencil } from 'lucide-react';
import { Card } from '../types';

interface WantListTableProps {
  cards: Card[];
  isLoading?: boolean;
  onAcquire?: (card: Card) => void;
  onDelete?: (card: Card) => void;
  onEdit?: (card: Card) => void;
  isRefreshing?: boolean;
}

type SortKey = 'set_name' | 'avg_30_day_price' | 'lowest_active_price' | 'discount';
type SortDir = 'asc' | 'desc';

export function WantListTable({ cards, isLoading, onAcquire, onDelete, onEdit, isRefreshing }: WantListTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>('discount');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const formatCurrency = (value: number | null | undefined) => {
    if (value === null || value === undefined) return null;
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(value);
  };

  const calculateDiscount = (card: Card) => {
    if (!card.lowest_active_price || !card.avg_30_day_price) return null;
    return ((card.avg_30_day_price - card.lowest_active_price) / card.avg_30_day_price) * 100;
  };

  const sortedCards = [...cards].sort((a, b) => {
    let aVal: number | string = 0;
    let bVal: number | string = 0;

    switch (sortKey) {
      case 'set_name':
        aVal = `${a.set_name} ${a.parallel_rarity}`;
        bVal = `${b.set_name} ${b.parallel_rarity}`;
        break;
      case 'avg_30_day_price':
        aVal = a.avg_30_day_price || 0;
        bVal = b.avg_30_day_price || 0;
        break;
      case 'lowest_active_price':
        aVal = a.lowest_active_price || Infinity;
        bVal = b.lowest_active_price || Infinity;
        break;
      case 'discount':
        aVal = calculateDiscount(a) || -Infinity;
        bVal = calculateDiscount(b) || -Infinity;
        break;
    }

    if (sortDir === 'asc') {
      return aVal > bVal ? 1 : -1;
    }
    return aVal < bVal ? 1 : -1;
  });

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  };

  const SortIcon = ({ column }: { column: SortKey }) => {
    if (sortKey !== column) return null;
    return sortDir === 'asc' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />;
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

  // Mobile card renderer for want list
  const MobileWantCard = ({ card }: { card: Card }) => {
    const discount = calculateDiscount(card);
    const isBuyingOpportunity = discount !== null && discount >= 10;

    return (
      <div className={`bg-bears-navy border border-bears-gray/20 rounded-lg p-4 ${
        isBuyingOpportunity ? 'border-yellow-500/30 bg-green-900/10' : ''
      }`}>
        {/* Header: name + buying opportunity badge */}
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              {isBuyingOpportunity && (
                <AlertTriangle className="w-3.5 h-3.5 text-yellow-400 flex-shrink-0" />
              )}
              <p className="text-white font-medium text-sm truncate">
                {card.set_name.replace('Donruss Optic - ', '').replace('Rated Rookie 201', 'Rated Rookie')}
              </p>
            </div>
            <p className="text-bears-gray text-xs mt-0.5">{card.parallel_rarity}</p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {card.population ? (
              <span className={`text-xs px-2 py-0.5 rounded bg-bears-navy-light ${card.population <= 25 ? 'text-bears-orange font-semibold' : 'text-bears-gray'}`}>
                /{card.population}
              </span>
            ) : null}
            <span className="text-xs bg-bears-navy-light px-2 py-0.5 rounded">
              <span className="text-white">PSA</span>{' '}
              <span className="text-bears-orange font-bold">10</span>
            </span>
          </div>
        </div>

        {/* Price grid */}
        <div className="grid grid-cols-3 gap-3 text-center mb-3">
          <div>
            <p className="text-bears-gray text-[10px] uppercase tracking-wider">30D Avg</p>
            <p className="text-white text-sm font-medium">
              {card.avg_30_day_price ? formatCurrency(card.avg_30_day_price) : (isRefreshing ? '...' : '-')}
            </p>
          </div>
          <div>
            <p className="text-bears-gray text-[10px] uppercase tracking-wider">Lowest</p>
            <p className="text-white text-sm font-medium">
              {card.lowest_active_price ? formatCurrency(card.lowest_active_price) : (isRefreshing ? '...' : '-')}
            </p>
          </div>
          <div>
            <p className="text-bears-gray text-[10px] uppercase tracking-wider">vs Avg</p>
            {discount !== null ? (
              <p className={`text-sm font-semibold ${
                discount > 0 ? 'text-green-400' : discount < 0 ? 'text-red-400' : 'text-bears-gray'
              }`}>
                {discount > 0 ? '-' : '+'}{Math.abs(discount).toFixed(1)}%
              </p>
            ) : (
              <p className="text-bears-gray text-sm">-</p>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 pt-2 border-t border-bears-gray/10">
          {card.lowest_active_url ? (
            <a
              href={card.lowest_active_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 px-3 py-1.5 bg-bears-orange hover:bg-bears-orange-light text-white text-xs font-semibold rounded-lg transition-colors"
            >
              Buy <ExternalLink className="w-3 h-3" />
            </a>
          ) : card.ebay_active_url ? (
            <a
              href={card.ebay_active_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 px-3 py-1.5 bg-bears-navy border border-bears-gray/30 text-white text-xs font-medium rounded-lg transition-colors"
            >
              <Search className="w-3 h-3" /> eBay
            </a>
          ) : null}
          {onAcquire && (
            <button onClick={() => onAcquire(card)} className="p-2 hover:bg-green-500/20 rounded-lg transition-colors">
              <ShoppingCart className="w-4 h-4 text-bears-gray" />
            </button>
          )}
          {onEdit && (
            <button onClick={() => onEdit(card)} className="p-2 hover:bg-blue-500/20 rounded-lg transition-colors">
              <Pencil className="w-4 h-4 text-bears-gray" />
            </button>
          )}
          {onDelete && (
            <button onClick={() => onDelete(card)} className="p-2 hover:bg-red-500/20 rounded-lg transition-colors ml-auto">
              <Trash2 className="w-4 h-4 text-bears-gray" />
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <>
      {/* Mobile Card Layout */}
      <div className="sm:hidden space-y-3">
        {/* Mobile sort selector */}
        <div className="flex items-center gap-2 mb-2">
          <span className="text-bears-gray text-xs">Sort:</span>
          <select
            value={sortKey}
            onChange={(e) => { setSortKey(e.target.value as SortKey); setSortDir('desc'); }}
            className="bg-bears-navy border border-bears-gray/30 rounded-lg px-2 py-1 text-white text-xs focus:border-bears-orange focus:outline-none"
          >
            <option value="discount">vs Avg</option>
            <option value="lowest_active_price">Lowest Price</option>
            <option value="avg_30_day_price">30D Avg</option>
            <option value="set_name">Name</option>
          </select>
          <button
            onClick={() => setSortDir(sortDir === 'asc' ? 'desc' : 'asc')}
            className="p-1 text-bears-gray hover:text-white"
          >
            {sortDir === 'asc' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
        {sortedCards.map((card) => (
          <MobileWantCard key={card.id} card={card} />
        ))}
      </div>

      {/* Desktop Table Layout */}
      <div className="hidden sm:block overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wider text-bears-gray border-b border-bears-gray/20">
              <th className="pb-3 pr-4">
                <button onClick={() => handleSort('set_name')} className="flex items-center gap-1 hover:text-white">
                  Card <SortIcon column="set_name" />
                </button>
              </th>
              <th className="pb-3 px-4">Population</th>
              <th className="pb-3 px-4">Target Grade</th>
              <th className="pb-3 px-4">
                <button onClick={() => handleSort('avg_30_day_price')} className="flex items-center gap-1 hover:text-white">
                  30D Avg <SortIcon column="avg_30_day_price" />
                </button>
              </th>
              <th className="pb-3 px-4">
                <button onClick={() => handleSort('lowest_active_price')} className="flex items-center gap-1 hover:text-white">
                  Lowest Now <SortIcon column="lowest_active_price" />
                </button>
              </th>
              <th className="pb-3 px-4">
                <button onClick={() => handleSort('discount')} className="flex items-center gap-1 hover:text-white">
                  vs Avg <SortIcon column="discount" />
                </button>
              </th>
              <th className="pb-3 pl-4">Action</th>
            </tr>
          </thead>
          <tbody>
            {sortedCards.map((card) => {
              const discount = calculateDiscount(card);
              const isBuyingOpportunity = discount !== null && discount >= 10;

              return (
                <tr
                  key={card.id}
                  className={`border-b border-bears-gray/10 transition-colors ${
                    isBuyingOpportunity ? 'bg-green-900/20' : 'hover:bg-bears-navy-light/50'
                  }`}
                >
                  <td className="py-4 pr-4">
                    <div className="flex items-start gap-2">
                      {isBuyingOpportunity && (
                        <span title="Buying opportunity!">
                          <AlertTriangle className="w-4 h-4 text-yellow-400 mt-1 flex-shrink-0" />
                        </span>
                      )}
                      <div>
                        <p className="text-white font-medium text-sm">
                          {card.set_name.replace('Donruss Optic - ', '').replace('Rated Rookie 201', 'Rated Rookie')}
                        </p>
                        <p className="text-bears-gray text-xs mt-0.5">{card.parallel_rarity}</p>
                      </div>
                    </div>
                  </td>
                  <td className="py-4 px-4 text-white text-sm">
                    {card.population ? (
                      <span className={card.population <= 25 ? 'text-bears-orange font-semibold' : ''}>
                        /{card.population}
                      </span>
                    ) : (
                      <span className="text-bears-gray">Unlimited</span>
                    )}
                  </td>
                  <td className="py-4 px-4 text-white text-sm">
                    <span className="inline-flex items-center gap-1">
                      <span>PSA</span>
                      <span className="text-bears-orange font-bold">10</span>
                    </span>
                  </td>
                  <td className="py-4 px-4 text-sm">
                    {card.avg_30_day_price ? (
                      <span className="text-white font-medium">{formatCurrency(card.avg_30_day_price)}</span>
                    ) : isRefreshing ? (
                      <span className="text-bears-gray animate-pulse">Loading...</span>
                    ) : (
                      <span className="text-bears-gray text-xs">No data</span>
                    )}
                  </td>
                  <td className="py-4 px-4">
                    {card.lowest_active_price ? (
                      <span className="text-white text-sm font-medium">
                        {formatCurrency(card.lowest_active_price)}
                      </span>
                    ) : isRefreshing ? (
                      <span className="text-bears-gray text-sm animate-pulse">Searching...</span>
                    ) : (
                      <span className="text-bears-gray text-xs">No listings</span>
                    )}
                  </td>
                  <td className="py-4 px-4">
                    {discount !== null ? (
                      <span className={`text-sm font-semibold ${
                        discount > 0 ? 'text-green-400' :
                        discount < 0 ? 'text-red-400' :
                        'text-bears-gray'
                      }`}>
                        {discount > 0 ? '-' : '+'}{Math.abs(discount).toFixed(1)}%
                      </span>
                    ) : (
                      <span className="text-bears-gray text-sm">-</span>
                    )}
                  </td>
                  <td className="py-4 pl-4">
                    <div className="flex items-center gap-2">
                      {card.lowest_active_url ? (
                        <a
                          href={card.lowest_active_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 px-3 py-1.5 bg-bears-orange hover:bg-bears-orange-light text-white text-xs font-semibold rounded-lg transition-colors"
                        >
                          Buy Now <ExternalLink className="w-3 h-3" />
                        </a>
                      ) : card.ebay_active_url ? (
                        <a
                          href={card.ebay_active_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 px-3 py-1.5 bg-bears-navy border border-bears-gray/30 hover:border-bears-orange/50 text-white text-xs font-medium rounded-lg transition-colors"
                        >
                          <Search className="w-3 h-3" /> Search eBay
                        </a>
                      ) : null}
                      {onAcquire && (
                        <button
                          onClick={() => onAcquire(card)}
                          className="p-2 hover:bg-green-500/20 rounded-lg transition-colors"
                          title="Mark as acquired"
                        >
                          <ShoppingCart className="w-4 h-4 text-bears-gray hover:text-green-400" />
                        </button>
                      )}
                      {onEdit && (
                        <button
                          onClick={() => onEdit(card)}
                          className="p-2 hover:bg-blue-500/20 rounded-lg transition-colors"
                          title="Edit card"
                        >
                          <Pencil className="w-4 h-4 text-bears-gray hover:text-blue-400" />
                        </button>
                      )}
                      {onDelete && (
                        <button
                          onClick={() => onDelete(card)}
                          className="p-2 hover:bg-red-500/20 rounded-lg transition-colors"
                          title="Remove from want list"
                        >
                          <Trash2 className="w-4 h-4 text-bears-gray hover:text-red-400" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
