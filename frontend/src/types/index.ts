export interface Card {
  id: number;
  year: number;
  set_name: string;
  parallel_rarity: string;
  serial_number: string | null;
  population: number | null;
  date_acquired: string | null;
  is_graded: boolean;
  grading_company: string | null;
  grade: number | null;
  cost_basis: number | null;
  authenticity_guaranteed: boolean;
  is_owned: boolean;
  sort_order: number;
  last_sale_price: number | null;
  last_sale_date: string | null;
  avg_30_day_price: number | null;
  num_sales_30_day: number | null;
  price_trend: 'up' | 'down' | 'stable' | null;
  lowest_active_price: number | null;
  lowest_active_url: string | null;
  estimated_value: number | null;
  last_price_update: string | null;
  // eBay search URLs
  ebay_sold_url?: string;
  ebay_active_url?: string;
}

export interface PortfolioSummary {
  total_cost_basis: number;
  total_estimated_value: number;
  net_appreciation_dollars: number;
  net_appreciation_percent: number;
  owned_count: number;
  want_list_count: number;
  last_updated: string | null;
}

export interface PortfolioSnapshot {
  snapshot_date: string;
  total_cost_basis: number;
  total_estimated_value: number;
}

export interface NotableSale {
  id: number;
  card_description: string;
  price: number;
  sale_date: string;
  platform: string;
  url: string | null;
  set_name: string | null;
  parallel_type: string | null;
}

export interface RefreshStatus {
  running: boolean;
  progress: number;
  total: number;
  current_card: string;
}

export type TabType = 'collection' | 'wantlist' | 'notable';
