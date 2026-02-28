import { useState } from 'react';
import { TrendingUp, TrendingDown, Minus, RefreshCw, ChevronDown, ChevronUp, ExternalLink, Trash2, Pencil, GripVertical } from 'lucide-react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Card } from '../types';

interface CardTableProps {
  cards: Card[];
  isLoading?: boolean;
  onRefreshCard?: (cardId: number) => void;
  onDeleteCard?: (card: Card) => void;
  onEditCard?: (card: Card) => void;
  onReorder?: (order: { card_id: number; sort_order: number }[]) => void;
  isRefreshing?: boolean;
}

type SortKey = 'set_name' | 'cost_basis' | 'estimated_value' | 'pl_percent' | 'avg_30_day_price';
type SortDir = 'asc' | 'desc';

export function CardTable({ cards, isLoading, onRefreshCard, onDeleteCard, onEditCard, onReorder, isRefreshing }: CardTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>('estimated_value');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [reorderMode, setReorderMode] = useState(false);
  const [localCards, setLocalCards] = useState<Card[]>([]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor)
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = localCards.findIndex(c => c.id === active.id);
    const newIndex = localCards.findIndex(c => c.id === over.id);
    const newOrder = arrayMove(localCards, oldIndex, newIndex);
    setLocalCards(newOrder);

    // Save to backend
    if (onReorder) {
      onReorder(newOrder.map((card, i) => ({ card_id: card.id, sort_order: i })));
    }
  };

  const toggleReorderMode = () => {
    if (!reorderMode) {
      // Enter reorder mode - use current cards as local state
      setLocalCards([...cards]);
    }
    setReorderMode(!reorderMode);
  };

  const formatCurrency = (value: number | null | undefined) => {
    if (value === null || value === undefined) return null;
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(value);
  };

  const formatPercent = (value: number | null | undefined) => {
    if (value === null || value === undefined) return null;
    return `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`;
  };

  const calculatePL = (card: Card) => {
    const value = card.estimated_value ?? card.cost_basis;
    if (!card.cost_basis || !value) return { dollars: null, percent: null };
    const dollars = value - card.cost_basis;
    const percent = (dollars / card.cost_basis) * 100;
    return { dollars, percent };
  };

  const sortedCards = [...cards].sort((a, b) => {
    let aVal: number | string = 0;
    let bVal: number | string = 0;

    switch (sortKey) {
      case 'set_name':
        aVal = `${a.set_name} ${a.parallel_rarity}`;
        bVal = `${b.set_name} ${b.parallel_rarity}`;
        break;
      case 'cost_basis':
        aVal = a.cost_basis || 0;
        bVal = b.cost_basis || 0;
        break;
      case 'estimated_value':
        aVal = a.estimated_value || a.cost_basis || 0;
        bVal = b.estimated_value || b.cost_basis || 0;
        break;
      case 'pl_percent':
        aVal = calculatePL(a).percent || 0;
        bVal = calculatePL(b).percent || 0;
        break;
      case 'avg_30_day_price':
        aVal = a.avg_30_day_price || 0;
        bVal = b.avg_30_day_price || 0;
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

  const TrendIcon = ({ trend }: { trend: Card['price_trend'] }) => {
    if (trend === 'up') return <TrendingUp className="w-4 h-4 text-green-400" />;
    if (trend === 'down') return <TrendingDown className="w-4 h-4 text-red-400" />;
    return <Minus className="w-4 h-4 text-bears-gray" />;
  };

  const ValueDisplay = ({ value, fallback }: { value: number | null | undefined; fallback?: string }) => {
    const formatted = formatCurrency(value);
    if (formatted) return <span className="text-white">{formatted}</span>;
    if (isRefreshing) return <span className="text-bears-gray animate-pulse">Loading...</span>;
    return <span className="text-bears-gray text-xs">{fallback || 'No data'}</span>;
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

  // Mobile card renderer
  const MobileCardView = ({ card }: { card: Card }) => {
    const { percent } = calculatePL(card);
    const displayValue = card.estimated_value ?? card.cost_basis;
    const isExpanded = expandedId === card.id;

    return (
      <div
        className="bg-bears-navy border border-bears-gray/20 rounded-lg p-4 transition-colors"
        onClick={() => setExpandedId(isExpanded ? null : card.id)}
      >
        {/* Top row: name + grade */}
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="min-w-0 flex-1">
            <p className="text-white font-medium text-sm truncate">
              {card.set_name.replace('Donruss Optic - ', '').replace('Rated Rookie 201', 'Rated Rookie')}
            </p>
            <p className="text-bears-gray text-xs mt-0.5">{card.parallel_rarity}</p>
          </div>
          <div className="flex-shrink-0">
            {card.is_graded ? (
              <span className="inline-flex items-center gap-1 text-xs bg-bears-navy-light px-2 py-1 rounded">
                <span className="text-white font-medium">{card.grading_company}</span>
                <span className="text-bears-orange font-bold">{card.grade}</span>
              </span>
            ) : (
              <span className="text-bears-gray text-xs bg-bears-navy-light px-2 py-1 rounded">Raw</span>
            )}
          </div>
        </div>

        {/* Value grid */}
        <div className="grid grid-cols-3 gap-3 text-center">
          <div>
            <p className="text-bears-gray text-[10px] uppercase tracking-wider">Cost</p>
            <p className="text-white text-sm font-medium">{formatCurrency(card.cost_basis) || '-'}</p>
          </div>
          <div>
            <p className="text-bears-gray text-[10px] uppercase tracking-wider">Value</p>
            <p className="text-white text-sm font-medium">
              {formatCurrency(displayValue) || (isRefreshing ? '...' : '-')}
            </p>
          </div>
          <div>
            <p className="text-bears-gray text-[10px] uppercase tracking-wider">P/L</p>
            {percent !== null ? (
              <p className={`text-sm font-semibold ${
                percent > 0 ? 'text-green-400' : percent < 0 ? 'text-red-400' : 'text-bears-gray'
              }`}>
                {formatPercent(percent)}
              </p>
            ) : (
              <p className="text-bears-gray text-sm">-</p>
            )}
          </div>
        </div>

        {/* Expanded details on tap */}
        {isExpanded && (
          <div className="mt-3 pt-3 border-t border-bears-gray/20">
            <div className="grid grid-cols-2 gap-3 text-sm mb-3">
              <div>
                <p className="text-bears-gray text-xs">30D Avg</p>
                <p className="text-white">{formatCurrency(card.avg_30_day_price) || 'No data'}</p>
              </div>
              <div>
                <p className="text-bears-gray text-xs">Trend</p>
                <div className="flex items-center gap-1">
                  {card.price_trend ? <TrendIcon trend={card.price_trend} /> : <span className="text-bears-gray">-</span>}
                </div>
              </div>
              <div>
                <p className="text-bears-gray text-xs">Last Sale</p>
                <p className="text-white">{formatCurrency(card.last_sale_price) || 'No data'}</p>
                <p className="text-bears-gray text-[10px]">{card.last_sale_date || ''}</p>
              </div>
              <div>
                <p className="text-bears-gray text-xs">Last Sale Return</p>
                {card.last_sale_price && card.cost_basis ? (() => {
                  const returnDollars = card.last_sale_price - card.cost_basis;
                  const returnPercent = (returnDollars / card.cost_basis) * 100;
                  return (
                    <p className={`text-sm font-semibold ${returnDollars > 0 ? 'text-green-400' : returnDollars < 0 ? 'text-red-400' : 'text-bears-gray'}`}>
                      {formatCurrency(returnDollars)} ({returnPercent >= 0 ? '+' : ''}{returnPercent.toFixed(1)}%)
                    </p>
                  );
                })() : (
                  <p className="text-bears-gray">-</p>
                )}
              </div>
              <div>
                <p className="text-bears-gray text-xs">Volume</p>
                <p className="text-white">{card.num_sales_30_day ?? 0} sales</p>
              </div>
              <div>
                <p className="text-bears-gray text-xs">Population</p>
                <p className="text-white">{card.population ? `/${card.population}` : 'Unlimited'}</p>
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-2 pt-2 border-t border-bears-gray/10">
              {card.ebay_sold_url && (
                <a
                  href={card.ebay_sold_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="p-2 hover:bg-bears-orange/20 rounded-lg transition-colors"
                  title="View on eBay"
                >
                  <ExternalLink className="w-4 h-4 text-bears-gray" />
                </a>
              )}
              {onRefreshCard && (
                <button
                  onClick={(e) => { e.stopPropagation(); onRefreshCard(card.id); }}
                  className="p-2 hover:bg-bears-orange/20 rounded-lg transition-colors"
                >
                  <RefreshCw className="w-4 h-4 text-bears-gray" />
                </button>
              )}
              {onEditCard && (
                <button
                  onClick={(e) => { e.stopPropagation(); onEditCard(card); }}
                  className="p-2 hover:bg-blue-500/20 rounded-lg transition-colors"
                >
                  <Pencil className="w-4 h-4 text-bears-gray" />
                </button>
              )}
              {onDeleteCard && (
                <button
                  onClick={(e) => { e.stopPropagation(); onDeleteCard(card); }}
                  className="p-2 hover:bg-red-500/20 rounded-lg transition-colors ml-auto"
                >
                  <Trash2 className="w-4 h-4 text-bears-gray" />
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    );
  };

  // Sortable wrapper for mobile cards
  const SortableMobileCard = ({ card }: { card: Card }) => {
    const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: card.id });
    const style = {
      transform: CSS.Transform.toString(transform),
      transition,
    };

    return (
      <div ref={setNodeRef} style={style}>
        <div className="flex items-start gap-2">
          <button {...attributes} {...listeners} className="mt-4 p-1 cursor-grab active:cursor-grabbing text-bears-gray hover:text-white touch-none">
            <GripVertical className="w-4 h-4" />
          </button>
          <div className="flex-1">
            <MobileCardView card={card} />
          </div>
        </div>
      </div>
    );
  };

  return (
    <>
      {/* Mobile Card Layout */}
      <div className="sm:hidden space-y-3">
        {/* Mobile sort/reorder controls */}
        <div className="flex items-center gap-2 mb-2">
          {!reorderMode && (
            <>
              <span className="text-bears-gray text-xs">Sort:</span>
              <select
                value={sortKey}
                onChange={(e) => { setSortKey(e.target.value as SortKey); setSortDir('desc'); }}
                className="bg-bears-navy border border-bears-gray/30 rounded-lg px-2 py-1 text-white text-xs focus:border-bears-orange focus:outline-none"
              >
                <option value="estimated_value">Value</option>
                <option value="cost_basis">Cost</option>
                <option value="pl_percent">P/L</option>
                <option value="avg_30_day_price">30D Avg</option>
                <option value="set_name">Name</option>
              </select>
              <button
                onClick={() => setSortDir(sortDir === 'asc' ? 'desc' : 'asc')}
                className="p-1 text-bears-gray hover:text-white"
              >
                {sortDir === 'asc' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>
            </>
          )}
          {onReorder && (
            <button
              onClick={toggleReorderMode}
              className={`ml-auto px-3 py-1 text-xs rounded-lg transition-colors ${
                reorderMode
                  ? 'bg-bears-orange text-white'
                  : 'border border-bears-gray/30 text-bears-gray hover:text-white'
              }`}
            >
              {reorderMode ? 'Done' : 'Reorder'}
            </button>
          )}
        </div>

        {reorderMode ? (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={localCards.map(c => c.id)} strategy={verticalListSortingStrategy}>
              {localCards.map((card) => (
                <SortableMobileCard key={card.id} card={card} />
              ))}
            </SortableContext>
          </DndContext>
        ) : (
          sortedCards.map((card) => (
            <MobileCardView key={card.id} card={card} />
          ))
        )}
      </div>

      {/* Desktop Layout */}
      <div className="hidden sm:block">
        {/* Desktop reorder toggle */}
        {onReorder && (
          <div className="flex justify-end mb-3">
            <button
              onClick={toggleReorderMode}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg transition-colors ${
                reorderMode
                  ? 'bg-bears-orange text-white'
                  : 'border border-bears-gray/30 text-bears-gray hover:text-white'
              }`}
            >
              <GripVertical className="w-3.5 h-3.5" />
              {reorderMode ? 'Done Reordering' : 'Reorder'}
            </button>
          </div>
        )}

        {/* Desktop Reorder Mode - simplified drag list */}
        {reorderMode ? (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={localCards.map(c => c.id)} strategy={verticalListSortingStrategy}>
              <div className="space-y-1">
                {localCards.map((card) => {
                  const { percent } = calculatePL(card);
                  const displayValue = card.estimated_value ?? card.cost_basis;
                  return <SortableDesktopRow key={card.id} card={card} percent={percent} displayValue={displayValue} />;
                })}
              </div>
            </SortableContext>
          </DndContext>
        ) : (
        <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wider text-bears-gray border-b border-bears-gray/20">
              <th className="pb-3 pr-4">
                <button onClick={() => handleSort('set_name')} className="flex items-center gap-1 hover:text-white">
                  Card <SortIcon column="set_name" />
                </button>
              </th>
              <th className="pb-3 px-4">Grade</th>
              <th className="pb-3 px-4">
                <button onClick={() => handleSort('cost_basis')} className="flex items-center gap-1 hover:text-white">
                  Cost <SortIcon column="cost_basis" />
                </button>
              </th>
              <th className="pb-3 px-4">
                <button onClick={() => handleSort('estimated_value')} className="flex items-center gap-1 hover:text-white">
                  Value <SortIcon column="estimated_value" />
                </button>
              </th>
              <th className="pb-3 px-4">
                <button onClick={() => handleSort('pl_percent')} className="flex items-center gap-1 hover:text-white">
                  P/L <SortIcon column="pl_percent" />
                </button>
              </th>
              <th className="pb-3 px-4">
                <button onClick={() => handleSort('avg_30_day_price')} className="flex items-center gap-1 hover:text-white">
                  30D Avg <SortIcon column="avg_30_day_price" />
                </button>
              </th>
              <th className="pb-3 px-4">Trend</th>
              <th className="pb-3 pl-4"></th>
            </tr>
          </thead>
          <tbody>
            {sortedCards.map((card) => {
              const { dollars, percent } = calculatePL(card);
              const isExpanded = expandedId === card.id;
              const displayValue = card.estimated_value ?? card.cost_basis;

              return (
                <>
                  <tr
                    key={card.id}
                    onClick={() => setExpandedId(isExpanded ? null : card.id)}
                    className="border-b border-bears-gray/10 hover:bg-bears-navy-light/50 cursor-pointer transition-colors"
                  >
                    <td className="py-4 pr-4">
                      <div>
                        <p className="text-white font-medium text-sm">
                          {card.set_name.replace('Donruss Optic - ', '').replace('Rated Rookie 201', 'Rated Rookie')}
                        </p>
                        <p className="text-bears-gray text-xs mt-0.5">{card.parallel_rarity}</p>
                      </div>
                    </td>
                    <td className="py-4 px-4">
                      {card.is_graded ? (
                        <span className="inline-flex items-center gap-1 text-sm">
                          <span className="font-semibold text-white">{card.grading_company}</span>
                          <span className="text-bears-orange font-bold">{card.grade}</span>
                        </span>
                      ) : (
                        <span className="text-bears-gray text-sm">Raw</span>
                      )}
                    </td>
                    <td className="py-4 px-4 text-white text-sm font-medium">
                      {formatCurrency(card.cost_basis) || '-'}
                    </td>
                    <td className="py-4 px-4 text-sm font-medium">
                      <ValueDisplay value={displayValue} fallback="= Cost" />
                    </td>
                    <td className="py-4 px-4">
                      {percent !== null ? (
                        <>
                          <div className={`text-sm font-semibold ${
                            percent > 0 ? 'text-green-400' :
                            percent < 0 ? 'text-red-400' :
                            'text-bears-gray'
                          }`}>
                            {formatPercent(percent)}
                          </div>
                          <div className="text-xs text-bears-gray">
                            {formatCurrency(dollars)}
                          </div>
                        </>
                      ) : (
                        <span className="text-bears-gray text-sm">-</span>
                      )}
                    </td>
                    <td className="py-4 px-4 text-sm">
                      <ValueDisplay value={card.avg_30_day_price} fallback={card.num_sales_30_day === 0 ? '0 sales' : 'No data'} />
                    </td>
                    <td className="py-4 px-4">
                      {card.price_trend ? <TrendIcon trend={card.price_trend} /> : <span className="text-bears-gray">-</span>}
                    </td>
                    <td className="py-4 pl-4">
                      <div className="flex items-center gap-1">
                        {card.ebay_sold_url && (
                          <a
                            href={card.ebay_sold_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="p-2 hover:bg-bears-orange/20 rounded-lg transition-colors"
                            title="View on eBay"
                          >
                            <ExternalLink className="w-4 h-4 text-bears-gray hover:text-bears-orange" />
                          </a>
                        )}
                        {onRefreshCard && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onRefreshCard(card.id);
                            }}
                            className="p-2 hover:bg-bears-orange/20 rounded-lg transition-colors"
                            title="Refresh price"
                          >
                            <RefreshCw className="w-4 h-4 text-bears-gray hover:text-bears-orange" />
                          </button>
                        )}
                        {onEditCard && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onEditCard(card);
                            }}
                            className="p-2 hover:bg-blue-500/20 rounded-lg transition-colors"
                            title="Edit card"
                          >
                            <Pencil className="w-4 h-4 text-bears-gray hover:text-blue-400" />
                          </button>
                        )}
                        {onDeleteCard && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onDeleteCard(card);
                            }}
                            className="p-2 hover:bg-red-500/20 rounded-lg transition-colors"
                            title="Remove card"
                          >
                            <Trash2 className="w-4 h-4 text-bears-gray hover:text-red-400" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                  {isExpanded && (
                    <tr key={`${card.id}-expanded`}>
                      <td colSpan={8} className="bg-bears-navy/50 px-4 py-4">
                        <div className="grid grid-cols-2 md:grid-cols-6 gap-4 text-sm">
                          <div>
                            <p className="text-bears-gray text-xs">Last Sale</p>
                            <p className="text-white">{formatCurrency(card.last_sale_price) || 'No data'}</p>
                            <p className="text-bears-gray text-xs">{card.last_sale_date || ''}</p>
                          </div>
                          <div>
                            <p className="text-bears-gray text-xs">Last Sale Return</p>
                            {card.last_sale_price && card.cost_basis ? (() => {
                              const returnDollars = card.last_sale_price - card.cost_basis;
                              const returnPercent = (returnDollars / card.cost_basis) * 100;
                              return (
                                <p className={`font-semibold ${returnDollars > 0 ? 'text-green-400' : returnDollars < 0 ? 'text-red-400' : 'text-bears-gray'}`}>
                                  {formatCurrency(returnDollars)} ({returnPercent >= 0 ? '+' : ''}{returnPercent.toFixed(1)}%)
                                </p>
                              );
                            })() : (
                              <p className="text-bears-gray">-</p>
                            )}
                          </div>
                          <div>
                            <p className="text-bears-gray text-xs">30-Day Volume</p>
                            <p className="text-white">{card.num_sales_30_day ?? 0} sales</p>
                          </div>
                          <div>
                            <p className="text-bears-gray text-xs">Population</p>
                            <p className="text-white">{card.population ? `/${card.population}` : 'Unlimited'}</p>
                          </div>
                          <div>
                            <p className="text-bears-gray text-xs">Acquired</p>
                            <p className="text-white">{card.date_acquired || '-'}</p>
                          </div>
                          <div>
                            <p className="text-bears-gray text-xs">eBay Search</p>
                            {card.ebay_sold_url && (
                              <a
                                href={card.ebay_sold_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-bears-orange hover:underline text-xs flex items-center gap-1"
                              >
                                View Sold Listings <ExternalLink className="w-3 h-3" />
                              </a>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              );
            })}
          </tbody>
        </table>
        </div>
        )}
      </div>
    </>
  );
}

// Desktop sortable row for reorder mode
function SortableDesktopRow({ card, percent, displayValue }: { card: Card; percent: number | null; displayValue: number | null | undefined }) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: card.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const formatCurrency = (value: number | null | undefined) => {
    if (value === null || value === undefined) return '-';
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(value);
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-3 bg-bears-navy border border-bears-gray/20 rounded-lg px-3 py-3 hover:border-bears-gray/40 transition-colors"
    >
      <button {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing text-bears-gray hover:text-white touch-none flex-shrink-0">
        <GripVertical className="w-4 h-4" />
      </button>
      <div className="flex-1 min-w-0">
        <p className="text-white font-medium text-sm truncate">
          {card.set_name.replace('Donruss Optic - ', '').replace('Rated Rookie 201', 'Rated Rookie')}
        </p>
        <p className="text-bears-gray text-xs">{card.parallel_rarity}</p>
      </div>
      <div className="flex items-center gap-6 text-sm flex-shrink-0">
        <div className="text-center w-16">
          <p className="text-bears-gray text-[10px]">Grade</p>
          {card.is_graded ? (
            <p className="text-white"><span className="text-bears-orange font-bold">{card.grading_company} {card.grade}</span></p>
          ) : (
            <p className="text-bears-gray">Raw</p>
          )}
        </div>
        <div className="text-center w-16">
          <p className="text-bears-gray text-[10px]">Cost</p>
          <p className="text-white font-medium">{formatCurrency(card.cost_basis)}</p>
        </div>
        <div className="text-center w-16">
          <p className="text-bears-gray text-[10px]">Value</p>
          <p className="text-white font-medium">{formatCurrency(displayValue)}</p>
        </div>
        <div className="text-center w-16">
          <p className="text-bears-gray text-[10px]">P/L</p>
          <p className={`font-semibold ${
            (percent ?? 0) > 0 ? 'text-green-400' : (percent ?? 0) < 0 ? 'text-red-400' : 'text-bears-gray'
          }`}>
            {percent !== null ? `${percent >= 0 ? '+' : ''}${percent.toFixed(1)}%` : '-'}
          </p>
        </div>
      </div>
    </div>
  );
}
