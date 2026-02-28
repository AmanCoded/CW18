import { useState } from 'react';
import { Search, X, Filter } from 'lucide-react';

export interface FilterState {
  search: string;
  set: string;
  graded: 'all' | 'graded' | 'raw';
}

interface FilterBarProps {
  filters: FilterState;
  onFilterChange: (filters: FilterState) => void;
  sets: string[];
}

export const defaultFilters: FilterState = {
  search: '',
  set: 'all',
  graded: 'all',
};

export function FilterBar({ filters, onFilterChange, sets }: FilterBarProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const hasActiveFilters = filters.search !== '' || filters.set !== 'all' || filters.graded !== 'all';

  const clearFilters = () => {
    onFilterChange(defaultFilters);
  };

  return (
    <div className="mb-4 space-y-3">
      {/* Search + Toggle Row */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-bears-gray" />
          <input
            type="text"
            value={filters.search}
            onChange={(e) => onFilterChange({ ...filters, search: e.target.value })}
            placeholder="Search cards..."
            className="w-full bg-bears-navy border border-bears-gray/30 rounded-lg pl-10 pr-3 py-2 text-white text-sm placeholder-bears-gray/50 focus:border-bears-orange focus:outline-none"
          />
          {filters.search && (
            <button
              onClick={() => onFilterChange({ ...filters, search: '' })}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 hover:bg-bears-gray/20 rounded"
            >
              <X className="w-3 h-3 text-bears-gray" />
            </button>
          )}
        </div>
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className={`inline-flex items-center gap-2 px-3 py-2 border rounded-lg text-sm transition-colors ${
            hasActiveFilters
              ? 'border-bears-orange/50 text-bears-orange bg-bears-orange/10'
              : 'border-bears-gray/30 text-bears-gray hover:text-white hover:border-bears-gray/50'
          }`}
        >
          <Filter className="w-4 h-4" />
          Filters
          {hasActiveFilters && (
            <span className="bg-bears-orange text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
              {[filters.set !== 'all', filters.graded !== 'all'].filter(Boolean).length}
            </span>
          )}
        </button>
        {hasActiveFilters && (
          <button
            onClick={clearFilters}
            className="text-bears-gray hover:text-white text-sm transition-colors"
          >
            Clear all
          </button>
        )}
      </div>

      {/* Expanded Filters */}
      {isExpanded && (
        <div className="flex flex-wrap gap-3 p-3 bg-bears-navy/50 rounded-lg border border-bears-gray/20">
          {/* Set Filter */}
          <div className="flex-1 min-w-[180px]">
            <label className="block text-bears-gray text-xs mb-1">Set</label>
            <select
              value={filters.set}
              onChange={(e) => onFilterChange({ ...filters, set: e.target.value })}
              className="w-full bg-bears-navy border border-bears-gray/30 rounded-lg px-3 py-1.5 text-white text-sm focus:border-bears-orange focus:outline-none"
            >
              <option value="all">All Sets</option>
              {sets.map((set) => (
                <option key={set} value={set}>{set}</option>
              ))}
            </select>
          </div>

          {/* Graded Filter */}
          <div>
            <label className="block text-bears-gray text-xs mb-1">Grade</label>
            <div className="flex gap-1">
              {(['all', 'graded', 'raw'] as const).map((option) => (
                <button
                  key={option}
                  onClick={() => onFilterChange({ ...filters, graded: option })}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    filters.graded === option
                      ? 'bg-bears-orange text-white'
                      : 'bg-bears-navy border border-bears-gray/30 text-bears-gray hover:text-white'
                  }`}
                >
                  {option === 'all' ? 'All' : option === 'graded' ? 'Graded' : 'Raw'}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** Apply filters to a card list */
export function applyFilters(cards: import('../types').Card[], filters: FilterState): import('../types').Card[] {
  return cards.filter((card) => {
    // Text search
    if (filters.search) {
      const query = filters.search.toLowerCase();
      const matchesSearch =
        card.set_name.toLowerCase().includes(query) ||
        card.parallel_rarity.toLowerCase().includes(query) ||
        (card.grading_company && card.grading_company.toLowerCase().includes(query));
      if (!matchesSearch) return false;
    }

    // Set filter
    if (filters.set !== 'all' && card.set_name !== filters.set) {
      return false;
    }

    // Graded filter
    if (filters.graded === 'graded' && !card.is_graded) return false;
    if (filters.graded === 'raw' && card.is_graded) return false;

    return true;
  });
}
