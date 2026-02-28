import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { Card, PortfolioSummary, PortfolioSnapshot, NotableSale, RefreshStatus } from '../types';

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

const api = axios.create({
  baseURL: API_BASE_URL,
});

// Portfolio
export function usePortfolioSummary() {
  return useQuery<PortfolioSummary>({
    queryKey: ['portfolio', 'summary'],
    queryFn: async () => {
      const { data } = await api.get('/portfolio/summary');
      return data;
    },
    refetchInterval: 30000, // Refetch every 30 seconds
  });
}

export function usePortfolioHistory(days: number = 90) {
  return useQuery<PortfolioSnapshot[]>({
    queryKey: ['portfolio', 'history', days],
    queryFn: async () => {
      const { data } = await api.get(`/portfolio/history?days=${days}`);
      return data;
    },
  });
}

// Cards
export function useCards() {
  return useQuery<Card[]>({
    queryKey: ['cards'],
    queryFn: async () => {
      const { data } = await api.get('/cards');
      return data;
    },
  });
}

export function useOwnedCards() {
  return useQuery<Card[]>({
    queryKey: ['cards', 'owned'],
    queryFn: async () => {
      const { data } = await api.get('/cards/owned');
      return data;
    },
  });
}

export function useWantList() {
  return useQuery<Card[]>({
    queryKey: ['cards', 'wantlist'],
    queryFn: async () => {
      const { data } = await api.get('/cards/wantlist');
      return data;
    },
  });
}

export function useRefreshStatus() {
  return useQuery<RefreshStatus>({
    queryKey: ['prices', 'status'],
    queryFn: async () => {
      const { data } = await api.get('/prices/status');
      return data;
    },
    refetchInterval: 2000, // Poll every 2 seconds when running
  });
}

export function useRefreshPrices() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const { data } = await api.post('/prices/refresh');
      return data;
    },
    onSuccess: () => {
      // Start polling for status updates
      queryClient.invalidateQueries({ queryKey: ['prices', 'status'] });
    },
  });
}

export function useRefreshSingleCard() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (cardId: number) => {
      const { data } = await api.post(`/prices/refresh/${cardId}`);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cards'] });
      queryClient.invalidateQueries({ queryKey: ['portfolio'] });
    },
  });
}

export function useAcquireCard() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ cardId, date_acquired, cost_basis }: { cardId: number; date_acquired: string; cost_basis: number }) => {
      const { data } = await api.post(`/cards/${cardId}/acquire?date_acquired=${date_acquired}&cost_basis=${cost_basis}`);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cards'] });
      queryClient.invalidateQueries({ queryKey: ['portfolio'] });
    },
  });
}

// Notable Sales
export function useNotableSales(limit: number = 50) {
  return useQuery<NotableSale[]>({
    queryKey: ['notable-sales', limit],
    queryFn: async () => {
      const { data } = await api.get(`/notable-sales?limit=${limit}`);
      return data;
    },
  });
}

// Export
export function useExportCSV() {
  return useMutation({
    mutationFn: async () => {
      const response = await api.get('/export/csv', { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'caleb_williams_collection.csv');
      document.body.appendChild(link);
      link.click();
      link.remove();
    },
  });
}

// Create card
export interface CreateCardData {
  year: number;
  set_name: string;
  parallel_rarity: string;
  date_acquired: string | null;
  is_graded: boolean;
  grading_company: string | null;
  grade: number | null;
  cost_basis: number | null;
  authenticity_guaranteed: boolean;
}

export function useCreateCard() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (cardData: CreateCardData) => {
      const { data } = await api.post('/cards', cardData);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cards'] });
      queryClient.invalidateQueries({ queryKey: ['portfolio'] });
    },
  });
}

// Update card
export interface UpdateCardData {
  year?: number;
  set_name?: string;
  parallel_rarity?: string;
  date_acquired?: string | null;
  is_graded?: boolean;
  grading_company?: string | null;
  grade?: number | null;
  cost_basis?: number | null;
  authenticity_guaranteed?: boolean;
}

export function useUpdateCard() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ cardId, data }: { cardId: number; data: UpdateCardData }) => {
      const { data: result } = await api.put(`/cards/${cardId}`, data);
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cards'] });
      queryClient.invalidateQueries({ queryKey: ['portfolio'] });
    },
  });
}

// Reorder cards
export function useReorderCards() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (order: { card_id: number; sort_order: number }[]) => {
      const { data } = await api.put('/cards/reorder', { order });
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cards'] });
    },
  });
}

// Delete card
export function useDeleteCard() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (cardId: number) => {
      const { data } = await api.delete(`/cards/${cardId}`);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cards'] });
      queryClient.invalidateQueries({ queryKey: ['portfolio'] });
    },
  });
}

// Invalidate all data (used after refresh completes)
export function useInvalidateAll() {
  const queryClient = useQueryClient();

  return () => {
    queryClient.invalidateQueries({ queryKey: ['cards'] });
    queryClient.invalidateQueries({ queryKey: ['portfolio'] });
    queryClient.invalidateQueries({ queryKey: ['notable-sales'] });
  };
}
