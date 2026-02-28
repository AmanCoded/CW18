import { useState, useEffect, useMemo } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { RefreshCw, Download, Trophy, ListTodo, Newspaper, Plus, Upload } from 'lucide-react';
import { KPICard } from './components/KPICard';
import { PortfolioChart } from './components/PortfolioChart';
import { CardTable } from './components/CardTable';
import { WantListTable } from './components/WantListTable';
import { NotableSales } from './components/NotableSales';
import { AddCardModal, CardFormData } from './components/AddCardModal';
import { AcquireCardModal } from './components/AcquireCardModal';
import { ConfirmModal } from './components/ConfirmModal';
import { ImportModal } from './components/ImportModal';
import { FilterBar, FilterState, defaultFilters, applyFilters } from './components/FilterBar';
import {
  usePortfolioSummary,
  usePortfolioHistory,
  useOwnedCards,
  useWantList,
  useNotableSales,
  useRefreshPrices,
  useRefreshSingleCard,
  useRefreshStatus,
  useExportCSV,
  useCreateCard,
  useDeleteCard,
  useAcquireCard,
  useUpdateCard,
  useReorderCards
} from './hooks/useApi';
import { TabType, Card } from './types';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30000,
      retry: 1,
    },
  },
});

function Dashboard() {
  const [activeTab, setActiveTab] = useState<TabType>('collection');
  const queryClientHook = useQueryClient();

  // Modals state
  const [showAddModal, setShowAddModal] = useState(false);
  const [addToWantList, setAddToWantList] = useState(false);
  const [showAcquireModal, setShowAcquireModal] = useState(false);
  const [cardToAcquire, setCardToAcquire] = useState<Card | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [cardToDelete, setCardToDelete] = useState<Card | null>(null);
  const [showImportModal, setShowImportModal] = useState(false);
  const [cardToEdit, setCardToEdit] = useState<Card | null>(null);

  // Filter state
  const [filters, setFilters] = useState<FilterState>(defaultFilters);

  const { data: summary, isLoading: summaryLoading } = usePortfolioSummary();
  const { data: history, isLoading: historyLoading } = usePortfolioHistory(365);
  const { data: ownedCards, isLoading: ownedLoading } = useOwnedCards();
  const { data: wantList, isLoading: wantListLoading } = useWantList();
  const { data: notableSales, isLoading: salesLoading } = useNotableSales();
  const { data: refreshStatus } = useRefreshStatus();

  const refreshPrices = useRefreshPrices();
  const refreshSingleCard = useRefreshSingleCard();
  const exportCSV = useExportCSV();
  const createCard = useCreateCard();
  const deleteCard = useDeleteCard();
  const acquireCard = useAcquireCard();
  const updateCard = useUpdateCard();
  const reorderCards = useReorderCards();

  // When refresh completes, invalidate all queries
  useEffect(() => {
    if (refreshStatus && !refreshStatus.running && refreshStatus.progress > 0) {
      queryClientHook.invalidateQueries({ queryKey: ['cards'] });
      queryClientHook.invalidateQueries({ queryKey: ['portfolio'] });
    }
  }, [refreshStatus?.running, queryClientHook]);

  // Compute unique set names for the filter dropdown
  const allCards = useMemo(() => [...(ownedCards || []), ...(wantList || [])], [ownedCards, wantList]);
  const uniqueSets = useMemo(() => {
    const sets = new Set(allCards.map(c => c.set_name));
    return Array.from(sets).sort();
  }, [allCards]);

  // Apply filters
  const filteredOwned = useMemo(() => applyFilters(ownedCards || [], filters), [ownedCards, filters]);
  const filteredWantList = useMemo(() => applyFilters(wantList || [], filters), [wantList, filters]);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(value);
  };

  const formatPercent = (value: number) => {
    return `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`;
  };

  const handleAddCard = (cardData: CardFormData) => {
    createCard.mutate(cardData);
  };

  const handleUpdateCard = (cardId: number, cardData: CardFormData) => {
    updateCard.mutate({ cardId, data: cardData });
  };

  const handleEditCard = (card: Card) => {
    setCardToEdit(card);
    setShowAddModal(true);
  };

  const handleDeleteCard = (card: Card) => {
    setCardToDelete(card);
    setShowDeleteModal(true);
  };

  const confirmDelete = () => {
    if (cardToDelete) {
      deleteCard.mutate(cardToDelete.id);
      setCardToDelete(null);
    }
  };

  const handleAcquireClick = (card: Card) => {
    setCardToAcquire(card);
    setShowAcquireModal(true);
  };

  const handleAcquire = (cardId: number, dateAcquired: string, costBasis: number) => {
    acquireCard.mutate({ cardId, date_acquired: dateAcquired, cost_basis: costBasis });
  };

  const openAddModal = (toWantList: boolean = false) => {
    setCardToEdit(null);
    setAddToWantList(toWantList);
    setShowAddModal(true);
  };

  const tabs = [
    { id: 'collection' as TabType, label: 'My Collection', icon: Trophy, count: ownedCards?.length || 0 },
    { id: 'wantlist' as TabType, label: 'Want List', icon: ListTodo, count: wantList?.length || 0 },
    { id: 'notable' as TabType, label: 'Notable Sales', icon: Newspaper, count: notableSales?.length || 0 },
  ];

  const isRefreshing = refreshStatus?.running || false;

  return (
    <div className="min-h-screen bg-bears-navy">
      {/* Header */}
      <header className="border-b border-bears-gray/20 bg-bears-navy-light">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 py-3 sm:py-0 sm:h-16">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-bears-orange rounded-lg flex items-center justify-center flex-shrink-0">
                <span className="text-white font-bold text-lg">CW</span>
              </div>
              <div className="min-w-0">
                <h1 className="text-white font-bold text-base sm:text-lg truncate">Caleb Williams Rookie Collection</h1>
                <p className="text-bears-gray text-xs">2024 Donruss Optic Rainbow Chase</p>
              </div>
            </div>
            <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
              {isRefreshing && refreshStatus && (
                <span className="text-bears-orange text-xs">
                  Refreshing {refreshStatus.progress}/{refreshStatus.total}...
                </span>
              )}
              {summary?.last_updated && !isRefreshing && (
                <span className="text-bears-gray text-xs hidden sm:inline">
                  Updated: {new Date(summary.last_updated).toLocaleTimeString()}
                </span>
              )}
              <button
                onClick={() => refreshPrices.mutate()}
                disabled={isRefreshing}
                className="inline-flex items-center gap-2 px-3 sm:px-4 py-2 bg-bears-orange hover:bg-bears-orange-light disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
              >
                <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                <span className="hidden sm:inline">{isRefreshing ? 'Refreshing...' : 'Refresh Prices'}</span>
              </button>
              <button
                onClick={() => setShowImportModal(true)}
                className="inline-flex items-center gap-2 px-3 sm:px-4 py-2 bg-bears-navy-light border border-bears-gray/30 hover:border-bears-orange/50 text-white text-sm font-medium rounded-lg transition-colors"
              >
                <Upload className="w-4 h-4" />
                <span className="hidden sm:inline">Import</span>
              </button>
              <button
                onClick={() => exportCSV.mutate()}
                className="inline-flex items-center gap-2 px-3 sm:px-4 py-2 bg-bears-navy-light border border-bears-gray/30 hover:border-bears-orange/50 text-white text-sm font-medium rounded-lg transition-colors"
              >
                <Download className="w-4 h-4" />
                <span className="hidden sm:inline">Export</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-8">
        {/* KPI Cards */}
        <div className="flex overflow-x-auto gap-4 mb-8 pb-2 snap-x snap-mandatory md:grid md:grid-cols-2 lg:grid-cols-4 md:overflow-visible md:pb-0">
          <KPICard
            title="Cost Basis"
            value={summaryLoading ? '...' : formatCurrency(summary?.total_cost_basis || 0)}
            subtitle={`${summary?.owned_count || 0} cards owned`}
          />
          <KPICard
            title="Current Value"
            value={summaryLoading ? '...' : formatCurrency(summary?.total_estimated_value || 0)}
            trend={summary?.net_appreciation_dollars && summary.net_appreciation_dollars > 0 ? 'up' : summary?.net_appreciation_dollars && summary.net_appreciation_dollars < 0 ? 'down' : 'neutral'}
          />
          <KPICard
            title="Net P/L ($)"
            value={summaryLoading ? '...' : formatCurrency(summary?.net_appreciation_dollars || 0)}
            trend={summary?.net_appreciation_dollars && summary.net_appreciation_dollars > 0 ? 'up' : summary?.net_appreciation_dollars && summary.net_appreciation_dollars < 0 ? 'down' : 'neutral'}
          />
          <KPICard
            title="Net P/L (%)"
            value={summaryLoading ? '...' : formatPercent(summary?.net_appreciation_percent || 0)}
            trend={summary?.net_appreciation_percent && summary.net_appreciation_percent > 0 ? 'up' : summary?.net_appreciation_percent && summary.net_appreciation_percent < 0 ? 'down' : 'neutral'}
          />
        </div>

        {/* Portfolio Chart */}
        <div className="mb-8">
          <PortfolioChart data={history || []} isLoading={historyLoading} />
        </div>

        {/* Tab Navigation — desktop inline, mobile bottom bar */}
        <div className="hidden sm:flex items-center justify-between mb-6 border-b border-bears-gray/20">
          <div className="flex items-center gap-1">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors border-b-2 -mb-px ${
                  activeTab === tab.id
                    ? 'text-bears-orange border-bears-orange'
                    : 'text-bears-gray hover:text-white border-transparent'
                }`}
              >
                <tab.icon className="w-4 h-4" />
                {tab.label}
                <span className={`px-2 py-0.5 rounded-full text-xs ${
                  activeTab === tab.id
                    ? 'bg-bears-orange/20 text-bears-orange'
                    : 'bg-bears-gray/20 text-bears-gray'
                }`}>
                  {tab.count}
                </span>
              </button>
            ))}
          </div>

          {/* Add Card Button */}
          {(activeTab === 'collection' || activeTab === 'wantlist') && (
            <button
              onClick={() => openAddModal(activeTab === 'wantlist')}
              className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-500 text-white text-sm font-medium rounded-lg transition-colors mb-2"
            >
              <Plus className="w-4 h-4" />
              Add Card
            </button>
          )}
        </div>

        {/* Mobile: Add Card button above content */}
        {(activeTab === 'collection' || activeTab === 'wantlist') && (
          <div className="sm:hidden flex justify-end mb-4">
            <button
              onClick={() => openAddModal(activeTab === 'wantlist')}
              className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-500 text-white text-sm font-medium rounded-lg transition-colors"
            >
              <Plus className="w-4 h-4" />
              Add Card
            </button>
          </div>
        )}

        {/* Tab Content */}
        <div className="bg-bears-navy-light border border-bears-gray/20 rounded-xl p-3 sm:p-6">
          {activeTab === 'collection' && (
            <>
              <FilterBar filters={filters} onFilterChange={setFilters} sets={uniqueSets} />
              <CardTable
                cards={filteredOwned}
                isLoading={ownedLoading}
                onRefreshCard={(id) => refreshSingleCard.mutate(id)}
                onDeleteCard={handleDeleteCard}
                onEditCard={handleEditCard}
                onReorder={(order) => reorderCards.mutate(order)}
                isRefreshing={isRefreshing}
              />
            </>
          )}
          {activeTab === 'wantlist' && (
            <>
              <FilterBar filters={filters} onFilterChange={setFilters} sets={uniqueSets} />
              <WantListTable
                cards={filteredWantList}
                isLoading={wantListLoading}
                onAcquire={handleAcquireClick}
                onDelete={handleDeleteCard}
                onEdit={handleEditCard}
                isRefreshing={isRefreshing}
              />
            </>
          )}
          {activeTab === 'notable' && (
            <NotableSales
              sales={notableSales || []}
              isLoading={salesLoading}
            />
          )}
        </div>
      </main>

      {/* Footer — hidden on mobile where bottom nav takes its place */}
      <footer className="hidden sm:block border-t border-bears-gray/20 mt-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <p className="text-center text-bears-gray text-sm">
            Caleb Williams Rookie Card Portfolio Tracker
          </p>
        </div>
      </footer>

      {/* Mobile Bottom Tab Bar */}
      <nav className="sm:hidden fixed bottom-0 left-0 right-0 bg-bears-navy-light border-t border-bears-gray/20 z-50">
        <div className="flex items-center justify-around">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex flex-col items-center gap-1 py-3 px-2 flex-1 transition-colors ${
                activeTab === tab.id
                  ? 'text-bears-orange'
                  : 'text-bears-gray'
              }`}
            >
              <tab.icon className="w-5 h-5" />
              <span className="text-[10px] font-medium">{tab.label}</span>
              <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${
                activeTab === tab.id
                  ? 'bg-bears-orange/20 text-bears-orange'
                  : 'bg-bears-gray/20 text-bears-gray'
              }`}>
                {tab.count}
              </span>
            </button>
          ))}
        </div>
      </nav>

      {/* Spacer for mobile bottom nav */}
      <div className="sm:hidden h-20" />

      {/* Modals */}
      <AddCardModal
        isOpen={showAddModal}
        onClose={() => {
          setShowAddModal(false);
          setCardToEdit(null);
        }}
        onAdd={handleAddCard}
        onUpdate={handleUpdateCard}
        defaultToWantList={addToWantList}
        editCard={cardToEdit}
      />

      <AcquireCardModal
        isOpen={showAcquireModal}
        card={cardToAcquire}
        onClose={() => {
          setShowAcquireModal(false);
          setCardToAcquire(null);
        }}
        onAcquire={handleAcquire}
      />

      <ConfirmModal
        isOpen={showDeleteModal}
        title="Remove Card"
        message={cardToDelete ? `Are you sure you want to remove "${cardToDelete.parallel_rarity}" from your ${cardToDelete.is_owned ? 'collection' : 'want list'}?` : ''}
        confirmLabel="Remove"
        confirmVariant="danger"
        onClose={() => {
          setShowDeleteModal(false);
          setCardToDelete(null);
        }}
        onConfirm={confirmDelete}
      />

      <ImportModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        onSuccess={() => {
          queryClientHook.invalidateQueries({ queryKey: ['cards'] });
          queryClientHook.invalidateQueries({ queryKey: ['portfolio'] });
        }}
      />
    </div>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Dashboard />
    </QueryClientProvider>
  );
}

export default App;
