import type {
  ComparisonUnavailableReason,
  Dashboard,
  Filters,
  PriceDistribution,
  Transaction,
} from '../shared/types.js';
import { indexMonth, monthIndex, singaporeMonth } from '../shared/months.js';
import type { Repository } from './data.js';

export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

export function describePrices(values: readonly number[]): PriceDistribution | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  // Linear interpolation at (n - 1) * p, also known as the R-7 quantile method.
  const percentile = (p: number) => {
    const index = (sorted.length - 1) * p;
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
  };
  return {
    min: sorted[0],
    lowerQuartile: percentile(0.25),
    median: percentile(0.5),
    upperQuartile: percentile(0.75),
    max: sorted[sorted.length - 1],
  };
}

export function filterTransactions(
  records: readonly Transaction[],
  filters: Filters,
): Transaction[] {
  const search = filters.search?.trim().toUpperCase();
  return records.filter(
    (row) =>
      (!filters.town || row.town === filters.town) &&
      (!filters.flatType || row.flatType === filters.flatType) &&
      (!filters.from || row.month >= filters.from) &&
      (!filters.to || row.month <= filters.to) &&
      (filters.minPrice === undefined || row.resalePrice >= filters.minPrice) &&
      (filters.maxPrice === undefined || row.resalePrice <= filters.maxPrice) &&
      (!search || `${row.block} ${row.streetName} ${row.town}`.includes(search)),
  );
}

function groupBy(records: readonly Transaction[], key: (row: Transaction) => string) {
  const groups = new Map<string, Transaction[]>();
  for (const row of records) {
    const value = key(row);
    const group = groups.get(value);
    if (group) group.push(row);
    else groups.set(value, [row]);
  }
  return [...groups].map(([name, rows]) => ({
    name,
    count: rows.length,
    medianPrice: median(rows.map((row) => row.resalePrice))!,
    medianPsm: median(rows.map((row) => row.pricePerSqm))!,
  }));
}

export function sortTransactions(rows: readonly Transaction[], filters: Filters): Transaction[] {
  const direction = filters.order === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    const primary =
      filters.sort === 'price'
        ? a.resalePrice - b.resalePrice
        : filters.sort === 'area'
          ? a.floorAreaSqm - b.floorAreaSqm
          : a.month.localeCompare(b.month);
    return primary * direction || Number(a.id) - Number(b.id);
  });
}

export function dashboard(repository: Repository, filters: Filters): Dashboard {
  const rows = filterTransactions(repository.records, filters);
  const priceDistribution = describePrices(rows.map((row) => row.resalePrice));
  const medianPrice = priceDistribution?.median ?? null;
  const from = filters.from || repository.meta.minMonth;
  const to = filters.to || repository.meta.maxMonth;
  const length = monthIndex(to) - monthIndex(from) + 1;
  const previousFrom = indexMonth(monthIndex(from) - length);
  const previousTo = indexMonth(monthIndex(from) - 1);
  const retrievalMonth = singaporeMonth(repository.meta.source.retrievedAt);
  // A snapshot retrieved during a month cannot establish that month's completeness.
  const includesIncompleteMonth = to >= retrievalMonth;
  const completeComparison =
    previousFrom >= repository.meta.minMonth &&
    to <= repository.meta.maxMonth &&
    !includesIncompleteMonth;
  const prior = completeComparison
    ? filterTransactions(repository.records, { ...filters, from: previousFrom, to: previousTo })
    : [];
  const priorMedian = median(prior.map((row) => row.resalePrice));
  const change =
    medianPrice !== null && priorMedian !== null && priorMedian > 0
      ? ((medianPrice - priorMedian) / priorMedian) * 100
      : null;
  const comparisonUnavailableReason: ComparisonUnavailableReason | null = !rows.length
    ? 'no_transactions'
    : includesIncompleteMonth
      ? 'incomplete_month'
      : !completeComparison
        ? 'insufficient_coverage'
        : priorMedian === null
          ? 'no_prior_transactions'
          : null;
  const towns = groupBy(rows, (row) => row.town)
    .map(({ name, ...rest }) => ({ town: name, ...rest }))
    .sort((a, b) => b.medianPrice - a.medianPrice || a.town.localeCompare(b.town));
  const trend = groupBy(rows, (row) => row.month)
    .map(({ name, ...rest }) => ({ month: name, ...rest }))
    .sort((a, b) => a.month.localeCompare(b.month));
  const flatTypes = groupBy(rows, (row) => row.flatType)
    .map(({ name, medianPsm: _medianPsm, ...rest }) => ({ flatType: name, ...rest }))
    .sort((a, b) => a.flatType.localeCompare(b.flatType));
  const sorted = sortTransactions(rows, filters);
  const totalPages = Math.max(1, Math.ceil(rows.length / filters.pageSize));
  const page = Math.min(filters.page, totalPages);
  const millionDollarCount = rows.filter((row) => row.resalePrice >= 1_000_000).length;
  const insights: string[] = [];
  if (rows.length) {
    if (towns.length > 1)
      insights.push(
        `${towns[0].town} has the highest median resale price among ${towns.length} towns in this selection (S$${Math.round(towns[0].medianPrice).toLocaleString('en-SG')}; n=${towns[0].count}).`,
      );
    insights.push(
      `${((millionDollarCount / rows.length) * 100).toFixed(1)}% of selected transactions reached S$1 million.`,
    );
    insights.push(
      `${rows.length.toLocaleString('en-SG')} registered transactions match your selection.`,
    );
    if (rows.length < 30)
      insights.push('Fewer than 30 transactions: interpret this small selection with care.');
  }
  return {
    summary: {
      count: rows.length,
      medianPrice,
      medianPsm: median(rows.map((row) => row.pricePerSqm)),
      medianArea: median(rows.map((row) => row.floorAreaSqm)),
      millionDollarCount,
      priceChangePercent: change,
      comparisonLabel: `vs ${previousFrom} to ${previousTo}${includesIncompleteMonth ? ' (latest month incomplete)' : change === null ? ' (comparison unavailable)' : ''}`,
      comparisonUnavailableReason,
      priceDistribution,
    },
    trend,
    towns,
    flatTypes,
    transactions: sorted.slice((page - 1) * filters.pageSize, page * filters.pageSize),
    pagination: { page, pageSize: filters.pageSize, total: rows.length, totalPages },
    insights,
  };
}
