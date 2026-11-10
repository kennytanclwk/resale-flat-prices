export interface Transaction {
  id: string;
  month: string;
  town: string;
  flatType: string;
  block: string;
  streetName: string;
  storeyRange: string;
  floorAreaSqm: number;
  flatModel: string;
  leaseCommenceDate: number;
  remainingLease: string;
  resalePrice: number;
  pricePerSqm: number;
}

export interface SourceMetadata {
  name: string;
  url: string;
  datasetId: string;
  retrievedAt: string;
  coverageStart: string;
  coverageEnd: string;
  mode: string;
}

export interface Metadata {
  towns: string[];
  flatTypes: string[];
  minMonth: string;
  maxMonth: string;
  totalRecords: number;
  source: SourceMetadata;
}

export interface Filters {
  town?: string;
  flatType?: string;
  from?: string;
  to?: string;
  minPrice?: number;
  maxPrice?: number;
  search?: string;
  page: number;
  pageSize: number;
  sort: 'month' | 'price' | 'area';
  order: 'asc' | 'desc';
}

export interface Dashboard {
  summary: {
    count: number;
    medianPrice: number | null;
    medianPsm: number | null;
    medianArea: number | null;
    millionDollarCount: number;
    priceChangePercent: number | null;
    comparisonLabel: string;
  };
  trend: { month: string; count: number; medianPrice: number; medianPsm: number }[];
  towns: { town: string; count: number; medianPrice: number; medianPsm: number }[];
  flatTypes: { flatType: string; count: number; medianPrice: number }[];
  transactions: Transaction[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
  insights: string[];
}

export type DashboardResponse = Dashboard;
export type MetadataResponse = Metadata;
