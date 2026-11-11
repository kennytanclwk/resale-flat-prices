<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, reactive, ref } from 'vue';
import {
  ArrowDown,
  ArrowDownToLine,
  ArrowRight,
  ArrowUp,
  ArrowUpDown,
  Building2,
  ChartNoAxesCombined,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Database,
  ExternalLink,
  House,
  Info,
  MapPin,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Sparkles,
  X,
} from 'lucide-vue-next';
import PriceTrend from './components/PriceTrend.vue';
import TownComparison from './components/TownComparison.vue';
import PriceDistribution from './components/PriceDistribution.vue';
import { indexMonth, monthIndex } from '../shared/months';
import { getJson } from './lib/api';
import { integer, money, monthLabel, shiftMonth, titleCase } from './lib/format';
import type { Dashboard, Metadata as Meta, Transaction } from '../shared/types';

const meta = ref<Meta | null>(null);
const dashboard = ref<Dashboard | null>(null);
const loading = ref(true);
const error = ref('');
const metric = ref<'price' | 'psm'>('price');
const activeView = ref('overview');
const showMethodology = ref(false);
const showAdvanced = ref(false);
const selected = ref<Transaction | null>(null);
const copied = ref(false);
const downloading = ref(false);
const filters = reactive({
  town: '',
  flatType: '',
  from: '',
  to: '',
  minPrice: '',
  maxPrice: '',
  search: '',
  page: 1,
  pageSize: 8,
  sort: 'month',
  order: 'desc',
});
let controller: AbortController | undefined;
let searchTimer: ReturnType<typeof setTimeout> | undefined;
let dialogTrigger: HTMLElement | null = null;
const sourceDate = computed(() =>
  meta.value
    ? new Intl.DateTimeFormat('en-SG', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        timeZone: 'Asia/Singapore',
      }).format(new Date(meta.value.source.retrievedAt))
    : '',
);
const periodLabel = computed(() => `${monthLabel(filters.from)} – ${monthLabel(filters.to)}`);
const summary = computed(() => dashboard.value?.summary);
const comparisonExplanation = computed(() => {
  switch (summary.value?.comparisonUnavailableReason) {
    case 'no_transactions':
      return 'No matching transactions';
    case 'incomplete_month':
      return 'Latest month is incomplete';
    case 'insufficient_coverage':
      return 'Prior period outside data coverage';
    case 'no_prior_transactions':
      return 'No matching prior-period transactions';
    default:
      return summary.value?.count ? 'No comparable prior period' : 'No matching transactions';
  }
});
const activeFilters = computed(() =>
  Boolean(
    filters.town || filters.flatType || filters.search || filters.minPrice || filters.maxPrice,
  ),
);
const pageStart = computed(() =>
  dashboard.value?.pagination.total
    ? (dashboard.value.pagination.page - 1) * filters.pageSize + 1
    : 0,
);
const pageEnd = computed(() =>
  Math.min(
    (dashboard.value?.pagination.page ?? 1) * filters.pageSize,
    dashboard.value?.pagination.total ?? 0,
  ),
);
const flatMixMax = computed(() =>
  Math.max(1, ...(dashboard.value?.flatTypes.map((item) => item.count) ?? [])),
);
const filtersValid = computed(
  () =>
    filters.from <= filters.to &&
    (!filters.minPrice ||
      !filters.maxPrice ||
      Number(filters.minPrice) <= Number(filters.maxPrice)),
);
const filterValidation = computed(() =>
  filters.from > filters.to
    ? 'Start month must be before or equal to end month.'
    : 'Minimum price must be less than or equal to maximum price.',
);

function query(includePagination = true) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== '' && (includePagination || !['page', 'pageSize'].includes(key)))
      params.set(key, String(value));
  });
  return params;
}
async function load(resetPage = false) {
  if (!filtersValid.value) {
    controller?.abort();
    dashboard.value = null;
    loading.value = false;
    return;
  }
  if (resetPage) filters.page = 1;
  controller?.abort();
  const request = new AbortController();
  controller = request;
  loading.value = true;
  error.value = '';
  try {
    const result = await getJson<Dashboard>(`/api/dashboard?${query()}`, request.signal);
    if (request.signal.aborted) return;
    dashboard.value = result;
    filters.page = result.pagination.page;
    window.history.replaceState(null, '', `${window.location.pathname}?${query()}`);
  } catch (cause) {
    if (!request.signal.aborted) {
      error.value = cause instanceof Error ? cause.message : 'Unable to load transactions.';
      dashboard.value = null;
    }
  } finally {
    if (!request.signal.aborted) loading.value = false;
  }
}
async function initialize() {
  loading.value = true;
  error.value = '';
  try {
    meta.value = await getJson<Meta>('/api/meta');
    const params = new URLSearchParams(window.location.search);
    for (const key of [
      'town',
      'flatType',
      'from',
      'to',
      'minPrice',
      'maxPrice',
      'search',
    ] as const) {
      const value = params.get(key);
      if (value !== null) filters[key] = value;
    }
    filters.sort = ['month', 'price', 'area'].includes(params.get('sort') ?? '')
      ? params.get('sort')!
      : 'month';
    filters.order = params.get('order') === 'asc' ? 'asc' : 'desc';
    const requestedPage = Number(params.get('page'));
    filters.page =
      Number.isSafeInteger(requestedPage) && requestedPage > 0 && requestedPage <= 1_000_000
        ? requestedPage
        : 1;
    filters.to ||= meta.value.maxMonth;
    filters.from ||= [meta.value.minMonth, shiftMonth(meta.value.maxMonth, -11)].sort().at(-1)!;
    showAdvanced.value = Boolean(filters.minPrice || filters.maxPrice);
    await load();
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Unable to connect to the server.';
    loading.value = false;
  }
}
function setPeriod(months: number) {
  if (!meta.value) return;
  filters.to = meta.value.maxMonth;
  filters.from =
    months === 0
      ? meta.value.minMonth
      : [meta.value.minMonth, shiftMonth(filters.to, -(months - 1))].sort().at(-1)!;
  void load(true);
}
function useCompleteMonths() {
  const latest = meta.value?.latestCompleteMonth;
  if (!latest) return;
  const length = monthIndex(filters.to) - monthIndex(filters.from) + 1;
  filters.to = latest;
  filters.from = [meta.value!.minMonth, indexMonth(monthIndex(latest) - length + 1)].sort().at(-1)!;
  void load(true);
}
function isPeriod(months: number) {
  return Boolean(
    meta.value &&
      filters.to === meta.value.maxMonth &&
      filters.from ===
        (months === 0
          ? meta.value.minMonth
          : [meta.value.minMonth, shiftMonth(filters.to, -(months - 1))].sort().at(-1)!),
  );
}
function reset() {
  Object.assign(filters, {
    town: '',
    flatType: '',
    minPrice: '',
    maxPrice: '',
    search: '',
    sort: 'month',
    order: 'desc',
  });
  setPeriod(12);
}
function search() {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => void load(true), 350);
}
function changeSort(sort: string) {
  filters.order = filters.sort === sort && filters.order === 'desc' ? 'asc' : 'desc';
  filters.sort = sort;
  void load(true);
}
function chooseTown(town: string) {
  filters.town = town;
  void load(true);
}
function goTransactions() {
  activeView.value = 'transactions';
  nextTick(() =>
    document.getElementById('transactions')?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
  );
}
function openDialog(transaction?: Transaction) {
  dialogTrigger = document.activeElement as HTMLElement;
  if (transaction) selected.value = transaction;
  else showMethodology.value = true;
  nextTick(() => document.querySelector<HTMLButtonElement>('.dialog-close')?.focus());
}
function closeDialog() {
  selected.value = null;
  showMethodology.value = false;
  dialogTrigger?.focus();
}
function dialogKey(event: KeyboardEvent) {
  if (event.key === 'Escape') closeDialog();
  if (event.key !== 'Tab') return;
  const elements = Array.from(
    document.querySelectorAll<HTMLElement>('.dialog button, .dialog a[href]'),
  );
  const first = elements[0],
    last = elements.at(-1);
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last?.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first?.focus();
  }
}
async function download() {
  if (downloading.value || !filtersValid.value) return;
  downloading.value = true;
  try {
    const response = await fetch(`/api/export?${query(false)}`);
    if (!response.ok) throw new Error('CSV download failed. Please try again.');
    const url = URL.createObjectURL(await response.blob());
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'hdb-lens-transactions.csv';
    anchor.click();
    URL.revokeObjectURL(url);
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Download failed.';
  } finally {
    downloading.value = false;
  }
}
async function copyLink() {
  try {
    await navigator.clipboard.writeText(window.location.href);
    copied.value = true;
    setTimeout(() => (copied.value = false), 2000);
  } catch {
    error.value =
      'Your browser could not copy the link. Copy the address from your browser instead.';
  }
}
onMounted(initialize);
onUnmounted(() => {
  controller?.abort();
  clearTimeout(searchTimer);
});
</script>

<template>
  <a class="skip-link" href="#main">Skip to content</a>
  <header class="site-header">
    <div class="header-inner">
      <a class="brand" href="/" aria-label="HDB Lens home"
        ><span class="brand-icon"><Building2 :size="23" :stroke-width="1.7" /></span
        ><span>hdb<span class="brand-light">lens</span><span class="brand-dot">.</span></span></a
      >
      <nav class="main-nav" aria-label="Main navigation">
        <button :class="{ active: activeView === 'overview' }" @click="activeView = 'overview'">
          Overview
        </button>
        <button :class="{ active: activeView === 'transactions' }" @click="goTransactions">
          Transactions
        </button>
        <button @click="openDialog()">About the data <ExternalLink :size="12" /></button>
      </nav>
      <a
        class="source-link"
        href="https://data.gov.sg/datasets/d_8b84c4ee58e3cfc0ece0d773c8ca6abc/view"
        target="_blank"
        rel="noopener noreferrer"
        ><span class="status-dot"></span>Powered by data.gov.sg <ArrowRight :size="14"
      /></a>
    </div>
  </header>
  <main id="main" class="page-shell">
    <section class="hero" aria-labelledby="page-title">
      <div class="hero-copy">
        <div class="eyebrow"><span></span> THE SINGAPORE RESALE MARKET, EXPLAINED</div>
        <h1 id="page-title">Home prices.<br /><span>A clearer picture.</span></h1>
        <p>
          Make sense of HDB resale prices. Explore real transactions,<br class="desktop-break" />
          compare neighbourhoods, and find the story behind the numbers.
        </p>
        <div class="hero-note">
          <Database :size="14" /><span v-if="meta"
            >{{ integer(meta.totalRecords) }} real transactions · {{ monthLabel(meta.minMonth) }} –
            {{ monthLabel(meta.maxMonth) }}</span
          ><span v-else>Public data. A little more perspective.</span>
        </div>
      </div>
      <div class="city-art" aria-hidden="true">
        <svg viewBox="0 0 400 244" fill="none">
          <circle cx="234" cy="113" r="101" fill="#e4efdf" />
          <circle cx="328" cy="45" r="18" fill="#efcf7a" />
          <path d="M25 219h355" stroke="#b5c9b8" />
          <path d="M55 218V95l44-15 45 15v123" fill="#f4f5e9" stroke="#98b8a3" stroke-width="1.5" />
          <path
            d="M99 80v138M55 104h89M60 114h29m17 0h29M60 134h29m17 0h29M60 154h29m17 0h29M60 174h29m17 0h29M60 194h29m17 0h29"
            stroke="#acc4af"
            stroke-width="3"
          />
          <path d="M157 218V53h90v165" fill="#fcfcf3" stroke="#7da58d" stroke-width="1.5" />
          <path
            d="M169 53v-9h66v9M175 65v143M195 65v143M215 65v143M235 65v143"
            stroke="#d5dfcd"
            stroke-width="7"
          />
          <path
            d="M157 81h90m-90 23h90m-90 23h90m-90 23h90m-90 23h90m-90 23h90"
            stroke="#86a992"
            stroke-width="2"
          />
          <path
            d="M266 218V104l38-10 44 10v114"
            fill="#e8eddb"
            stroke="#9ab49a"
            stroke-width="1.5"
          />
          <path
            d="M304 95v123M274 116h23m14 0h28m-65 21h23m14 0h28m-65 21h23m14 0h28m-65 21h23m14 0h28m-65 21h23m14 0h28"
            stroke="#afc2a6"
            stroke-width="4"
          />
          <path d="M35 219v-37m-11 7 11 11 11-18M362 219v-36" stroke="#759e81" stroke-width="2" />
          <ellipse cx="35" cy="176" rx="18" ry="24" fill="#a4bd93" />
          <ellipse cx="363" cy="174" rx="17" ry="26" fill="#85ab8a" />
          <path d="M35 177v42m328-45v45" stroke="#6b947b" stroke-width="2" />
          <path d="M129 219v-13h15v13m56 0v-15h15v15m105 0v-13h13v13" fill="#8aab93" />
          <path d="M18 226h367" stroke="#cedbca" stroke-linecap="round" stroke-width="3" />
        </svg>
        <div class="art-label"><MapPin :size="13" /> A place to call home.</div>
      </div>
    </section>

    <section class="filter-panel" aria-label="Explore filters">
      <div class="filter-heading">
        <span><SlidersHorizontal :size="16" /> Make it your market</span
        ><button v-if="activeFilters" class="text-button" @click="reset">
          Reset filters <RefreshCw :size="12" /></button
        ><span v-else class="filter-hint">A wider view, or a closer look. You choose.</span>
      </div>
      <div class="filter-row">
        <label class="filter-field town-field"
          ><span>Town</span>
          <div class="input-wrap">
            <MapPin :size="16" /><select
              v-model="filters.town"
              aria-label="Town"
              :disabled="!meta"
              @change="load(true)"
            >
              <option value="">All towns</option>
              <option v-for="town in meta?.towns" :key="town" :value="town">
                {{ titleCase(town) }}
              </option></select
            ><ChevronDown :size="14" class="select-chevron" /></div
        ></label>
        <label class="filter-field"
          ><span>Flat type</span>
          <div class="input-wrap">
            <House :size="16" /><select
              v-model="filters.flatType"
              aria-label="Flat type"
              :disabled="!meta"
              @change="load(true)"
            >
              <option value="">All flat types</option>
              <option v-for="flat in meta?.flatTypes" :key="flat" :value="flat">
                {{ titleCase(flat) }}
              </option></select
            ><ChevronDown :size="14" class="select-chevron" /></div
        ></label>
        <label class="filter-field date-field"
          ><span>From</span>
          <div class="input-wrap">
            <input
              v-model="filters.from"
              type="month"
              :min="meta?.minMonth"
              :max="meta?.maxMonth"
              :disabled="!meta"
              @change="load(true)"
            /></div
        ></label>
        <label class="filter-field date-field"
          ><span>To</span>
          <div class="input-wrap">
            <input
              v-model="filters.to"
              type="month"
              :min="meta?.minMonth"
              :max="meta?.maxMonth"
              :disabled="!meta"
              @change="load(true)"
            /></div
        ></label>
        <button
          class="more-filter-button"
          :class="{ selected: showAdvanced }"
          :aria-expanded="showAdvanced"
          @click="showAdvanced = !showAdvanced"
        >
          <SlidersHorizontal :size="16" /> Price range <ChevronDown :size="13" />
        </button>
      </div>
      <div v-if="showAdvanced" class="advanced-filters">
        <label
          >Minimum price (S$)<input
            v-model="filters.minPrice"
            type="number"
            min="0"
            max="10000000"
            step="10000"
            placeholder="No minimum"
            @change="load(true)" /></label
        ><span class="range-dash">—</span
        ><label
          >Maximum price (S$)<input
            v-model="filters.maxPrice"
            type="number"
            min="0"
            max="10000000"
            step="10000"
            placeholder="No maximum"
            @change="load(true)"
        /></label>
        <p>Every chart and transaction uses your price range.</p>
      </div>
      <p v-if="!filtersValid" class="validation-error" role="alert">{{ filterValidation }}</p>
    </section>

    <div class="section-toolbar">
      <div>
        <h2>
          {{ filters.town ? titleCase(filters.town) : 'The market at a glance'
          }}<span v-if="filters.flatType" class="flat-tag">{{ titleCase(filters.flatType) }}</span>
        </h2>
        <p>
          {{ periodLabel }} <span v-if="meta">· Snapshot {{ sourceDate }}</span>
        </p>
      </div>
      <div class="period-switch" aria-label="Date range">
        <button
          v-for="period in [
            { label: '6M', value: 6 },
            { label: '1Y', value: 12 },
            { label: '3Y', value: 36 },
            { label: 'All time', value: 0 },
          ]"
          :key="period.value"
          :class="{ active: isPeriod(period.value) }"
          :disabled="!meta"
          @click="setPeriod(period.value)"
        >
          {{ period.label }}
        </button>
      </div>
    </div>

    <div v-if="error" class="error-state" role="alert">
      <Info :size="20" />
      <div>
        <strong>We couldn’t finish that request.</strong>
        <p>{{ error }}</p>
      </div>
      <button class="button secondary" @click="meta ? load() : initialize()">Try again</button>
    </div>
    <div v-if="loading && !dashboard" class="loading-state" role="status">
      <RefreshCw class="spin" :size="22" />
      <p>Bringing the market into focus…</p>
    </div>
    <div
      v-if="dashboard"
      class="dashboard-body"
      :class="{ refreshing: loading }"
      :aria-busy="loading"
    >
      <div
        v-if="summary?.comparisonUnavailableReason === 'incomplete_month'"
        class="coverage-note"
        role="note"
        aria-label="Data coverage"
      >
        <Info :size="17" />
        <p>
          Your selection includes a month that was still in progress when this snapshot was
          retrieved. Price comparisons are hidden to avoid comparing a partial month with a full
          month.
        </p>
        <button v-if="meta?.latestCompleteMonth" class="text-button" @click="useCompleteMonths">
          Use complete months <ArrowRight :size="13" />
        </button>
      </div>
      <div class="metrics-grid">
        <article class="metric-card">
          <div class="metric-top">
            <span>Median resale price</span
            ><span class="metric-icon green"><House :size="17" /></span>
          </div>
          <div class="metric-value">{{ summary?.count ? money(summary.medianPrice) : '—' }}</div>
          <div v-if="summary?.priceChangePercent != null" class="metric-caption">
            <span class="change-pill" :class="{ negative: summary.priceChangePercent < 0 }"
              ><ArrowUp v-if="summary.priceChangePercent >= 0" :size="11" /><ArrowDown
                v-else
                :size="11"
              />{{ Math.abs(summary.priceChangePercent).toFixed(1) }}%</span
            ><span :title="summary.comparisonLabel"
              >vs. prior period
              <button
                class="inline-help"
                aria-label="Explain the price comparison"
                @click="openDialog()"
              >
                <CircleHelp :size="12" /></button
            ></span>
          </div>
          <p v-else class="metric-caption">
            {{ comparisonExplanation }}
          </p>
        </article>
        <article class="metric-card">
          <div class="metric-top">
            <span>Median price / m²</span
            ><span class="metric-icon blue"><ChartNoAxesCombined :size="17" /></span>
          </div>
          <div class="metric-value">
            {{ summary?.count ? money(summary.medianPsm) : '—' }}<small>/ m²</small>
          </div>
          <p class="metric-caption">A common ground for comparison</p>
        </article>
        <article class="metric-card">
          <div class="metric-top">
            <span>Resale transactions</span
            ><span class="metric-icon amber"><ArrowUpDown :size="17" /></span>
          </div>
          <div class="metric-value">{{ integer(summary?.count ?? 0) }}</div>
          <p class="metric-caption">
            <span class="tiny-dot"></span>Registered in your selected period
          </p>
        </article>
        <article class="metric-card">
          <div class="metric-top">
            <span>Million-dollar flats</span
            ><span class="metric-icon lavender"><Building2 :size="17" /></span>
          </div>
          <div class="metric-value">
            {{ integer(summary?.millionDollarCount ?? 0)
            }}<small class="share-tag"
              >{{
                summary?.count
                  ? ((summary.millionDollarCount / summary.count) * 100).toFixed(1)
                  : '0'
              }}%</small
            >
          </div>
          <p class="metric-caption">Transactions at S$1 million or above</p>
        </article>
      </div>

      <template v-if="activeView === 'overview'">
        <div class="charts-grid">
          <section class="panel trend-panel">
            <div class="panel-header">
              <div>
                <h3>Follow the price story</h3>
                <p>
                  Monthly median
                  {{ metric === 'price' ? 'resale price' : 'price per square metre' }}
                </p>
              </div>
              <div class="metric-switch" aria-label="Chart price measure">
                <button :class="{ active: metric === 'price' }" @click="metric = 'price'">
                  Price</button
                ><button :class="{ active: metric === 'psm' }" @click="metric = 'psm'">
                  Per m²
                </button>
              </div>
            </div>
            <PriceTrend :points="dashboard.trend" :metric="metric" />
            <div class="chart-footer">
              <span
                ><i></i>{{ filters.town ? titleCase(filters.town) : 'All towns'
                }}{{ filters.flatType ? ` · ${titleCase(filters.flatType)}` : '' }}</span
              ><span>Hover or use arrow keys to explore</span>
            </div>
          </section>
          <section class="panel town-panel">
            <div class="panel-header">
              <div>
                <h3>Around the neighbourhoods</h3>
                <p>
                  Highest median {{ metric === 'price' ? 'resale prices' : 'prices per m²' }} · top
                  6 towns
                </p>
              </div>
              <MapPin :size="18" class="muted-icon" />
            </div>
            <TownComparison
              :towns="dashboard.towns"
              :metric="metric"
              :selected-town="filters.town"
              @select="chooseTown"
            />
            <div class="town-footer">
              Select a town to take a closer look <ArrowRight :size="13" />
            </div>
          </section>
        </div>
        <PriceDistribution
          :distribution="dashboard.summary.priceDistribution"
          :count="dashboard.summary.count"
        />
        <section class="insight-strip">
          <span class="insight-icon"><Sparkles :size="20" /></span>
          <div>
            <span class="insight-label">A LITTLE PERSPECTIVE</span>
            <p>
              {{
                dashboard.insights[0] ??
                'Try broadening your filters to discover more about the resale market.'
              }}
            </p>
          </div>
          <button class="insight-link" @click="openDialog()">
            How we calculate <ArrowRight :size="14" />
          </button>
        </section>
      </template>

      <section id="transactions" class="panel transactions-panel">
        <div class="transaction-header">
          <div>
            <div class="heading-with-count">
              <h3>Behind every number, a home.</h3>
              <span>{{ integer(dashboard.pagination.total) }}</span>
            </div>
            <p>Explore the registered transactions behind your selection.</p>
          </div>
          <div class="table-actions">
            <div class="search-input">
              <Search :size="16" /><input
                v-model="filters.search"
                aria-label="Search by block or street"
                placeholder="Search block or street…"
                maxlength="100"
                @input="search"
              /><button
                v-if="filters.search"
                aria-label="Clear search"
                @click="
                  filters.search = '';
                  load(true);
                "
              >
                <X :size="13" />
              </button>
            </div>
            <button
              class="button secondary export-button"
              :disabled="!dashboard.summary.count || downloading || !filtersValid"
              @click="download"
            >
              <ArrowDownToLine :size="15" />{{ downloading ? 'Exporting…' : 'Export CSV' }}
            </button>
          </div>
        </div>
        <div class="table-scroll">
          <table>
            <caption class="sr-only">
              HDB resale transactions for
              {{
                periodLabel
              }}. Select an address for full transaction details.
            </caption>
            <thead>
              <tr>
                <th>
                  <button @click="changeSort('month')">
                    Registration
                    <ArrowDown
                      v-if="filters.sort === 'month' && filters.order === 'desc'"
                      :size="12"
                    /><ArrowUp v-else-if="filters.sort === 'month'" :size="12" /><ArrowUpDown
                      v-else
                      :size="12"
                    />
                  </button>
                </th>
                <th>Address / Town</th>
                <th>Flat type</th>
                <th>
                  <button @click="changeSort('area')">Floor area <ArrowUpDown :size="12" /></button>
                </th>
                <th class="price-column">
                  <button @click="changeSort('price')">
                    Resale price
                    <ArrowDown
                      v-if="filters.sort === 'price' && filters.order === 'desc'"
                      :size="12"
                    /><ArrowUp v-else-if="filters.sort === 'price'" :size="12" /><ArrowUpDown
                      v-else
                      :size="12"
                    />
                  </button>
                </th>
                <th class="price-column">Price / m²</th>
                <th><span class="sr-only">Details</span></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in dashboard.transactions" :key="row.id">
                <td class="month-cell">{{ monthLabel(row.month) }}</td>
                <td>
                  <button class="address-button" @click="openDialog(row)">
                    {{ row.block }} {{ titleCase(row.streetName)
                    }}<span>{{ titleCase(row.town) }}</span>
                  </button>
                </td>
                <td>
                  <span class="flat-badge">{{ titleCase(row.flatType) }}</span>
                </td>
                <td>{{ row.floorAreaSqm }} <span class="muted">m²</span></td>
                <td class="price-column price-cell">{{ money(row.resalePrice) }}</td>
                <td class="price-column psm-cell">{{ money(row.pricePerSqm) }}</td>
                <td>
                  <button
                    class="row-arrow"
                    :aria-label="`View details for ${row.block} ${row.streetName}`"
                    @click="openDialog(row)"
                  >
                    <ChevronRight :size="16" />
                  </button>
                </td>
              </tr>
              <tr v-if="!dashboard.transactions.length">
                <td colspan="7">
                  <div class="empty-state">
                    <Search :size="26" />
                    <h4>No homes in this view just yet.</h4>
                    <p>Try a different town, wider dates, or a higher price limit.</p>
                    <button class="button secondary" @click="reset">Reset filters</button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="pagination">
          <p>
            Showing <strong>{{ integer(pageStart) }}–{{ integer(pageEnd) }}</strong> of
            {{ integer(dashboard.pagination.total) }} transactions
          </p>
          <div>
            <button
              :disabled="dashboard.pagination.page <= 1 || loading"
              aria-label="Previous page"
              @click="
                filters.page--;
                load();
              "
            >
              <ChevronLeft :size="15" /></button
            ><span
              >Page {{ dashboard.pagination.page }} of
              {{ Math.max(1, dashboard.pagination.totalPages) }}</span
            ><button
              :disabled="dashboard.pagination.page >= dashboard.pagination.totalPages || loading"
              aria-label="Next page"
              @click="
                filters.page++;
                load();
              "
            >
              <ChevronRight :size="15" />
            </button>
          </div>
        </div>
      </section>
      <section v-if="activeView === 'overview' && dashboard.flatTypes.length" class="flat-mix">
        <div>
          <span class="eyebrow">THE HOMES IN THIS VIEW</span>
          <h3>Different homes. Different stories.</h3>
          <p>Transaction mix by flat type</p>
        </div>
        <div class="mix-items">
          <button
            v-for="item in dashboard.flatTypes"
            :key="item.flatType"
            class="mix-item"
            :class="{ selected: filters.flatType === item.flatType }"
            @click="
              filters.flatType = filters.flatType === item.flatType ? '' : item.flatType;
              load(true);
            "
          >
            <span
              >{{ titleCase(item.flatType) }}<strong>{{ integer(item.count) }}</strong></span
            ><i><b :style="{ width: `${(item.count / flatMixMax) * 100}%` }"></b></i
            ><small>Median {{ money(item.medianPrice) }}</small>
          </button>
        </div>
      </section>
    </div>
    <footer class="site-footer">
      <div>
        <a class="footer-brand" href="/">hdblens.</a><span>A clearer view of home prices.</span>
      </div>
      <p>
        Source: Housing &amp; Development Board via
        <a
          :href="meta?.source.url ?? 'https://data.gov.sg'"
          target="_blank"
          rel="noopener noreferrer"
          >data.gov.sg <ExternalLink :size="10" /></a
        ><br />Indicative resale data. Prices vary with the homes sold.
      </p>
      <button class="text-button" @click="copyLink">
        <Check v-if="copied" :size="13" /><ExternalLink v-else :size="13" />{{
          copied ? 'Link copied' : 'Share this view'
        }}
      </button>
    </footer>
  </main>

  <Teleport to="body"
    ><div
      v-if="showMethodology || selected"
      class="dialog-backdrop"
      @click.self="closeDialog"
      @keydown="dialogKey"
    >
      <section class="dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title">
        <button class="dialog-close" aria-label="Close dialog" @click="closeDialog">
          <X :size="21" /></button
        ><template v-if="selected"
          ><span class="eyebrow">A CLOSER LOOK</span>
          <h2 id="dialog-title">{{ selected.block }} {{ titleCase(selected.streetName) }}</h2>
          <p class="dialog-subtitle">
            {{ titleCase(selected.town) }} · Registered {{ monthLabel(selected.month, true) }}
          </p>
          <div class="detail-price">
            {{ money(selected.resalePrice) }}<span>{{ money(selected.pricePerSqm) }} / m²</span>
          </div>
          <dl class="detail-grid">
            <div>
              <dt>Flat type</dt>
              <dd>{{ titleCase(selected.flatType) }}</dd>
            </div>
            <div>
              <dt>Floor area</dt>
              <dd>{{ selected.floorAreaSqm }} m²</dd>
            </div>
            <div>
              <dt>Storey range</dt>
              <dd>{{ selected.storeyRange }}</dd>
            </div>
            <div>
              <dt>Flat model</dt>
              <dd>{{ selected.flatModel }}</dd>
            </div>
            <div>
              <dt>Lease commenced</dt>
              <dd>{{ selected.leaseCommenceDate }}</dd>
            </div>
            <div>
              <dt>Remaining lease at sale</dt>
              <dd>{{ selected.remainingLease }}</dd>
            </div>
          </dl>
          <p class="dialog-footnote">
            Registration month is the date recorded by HDB. Remaining lease refers to the
            transaction date, rather than today.
          </p></template
        ><template v-else
          ><span class="eyebrow">OPEN DATA, CLEAR METHODS</span>
          <h2 id="dialog-title">A little context goes a long way.</h2>
          <p class="dialog-subtitle">Real HDB transactions. Transparent calculations.</p>
          <div class="method-section">
            <h3>Where the data comes from</h3>
            <p>
              HDB resale flat prices based on registration date, from January 2017 onwards. We use a
              complete local snapshot from data.gov.sg, with no API key needed to explore it.
            </p>
            <p v-if="meta">
              Snapshot retrieved {{ sourceDate }}. Coverage: {{ monthLabel(meta.minMonth) }} to
              {{ monthLabel(meta.maxMonth) }}. {{ integer(meta.totalRecords) }} transactions.
            </p>
          </div>
          <div class="method-section">
            <h3>How the numbers are calculated</h3>
            <p>
              The price distribution shows the minimum, 25th percentile, median, 75th percentile,
              and maximum across every matching transaction. Quartiles use linear interpolation at
              (n − 1) × p in the sorted prices, so a percentile may lie between observed sale
              prices. The shaded box marks the middle 50%; groups with fewer than 30 transactions
              are labelled as small samples.
            </p>
            <p>
              The median is the middle transaction price, or the average of the two middle prices.
              Price per m² is calculated for each transaction before taking the median.
              Million-dollar flats are transactions of S$1,000,000 or more.
            </p>
            <p>
              All filters apply to every summary, chart, and export. The percentage change compares
              the selected period with the immediately preceding period of the same length, using
              the same town, flat type, search, and price filters. We only show a comparison when
              both complete time windows are covered by the snapshot.
            </p>
            <p v-if="summary?.priceChangePercent != null" class="comparison-note">
              Current comparison: {{ summary.comparisonLabel }}
            </p>
          </div>
          <div class="method-section">
            <h3>Read trends with perspective</h3>
            <p>
              Changes in the types, locations, and ages of flats sold can shift medians. These
              figures are descriptive summaries, rather than a repeat-sales price index or a
              valuation. Small groups can be volatile, and the latest month may be incomplete.
            </p>
            <p>
              The source excludes some transactions that may not reflect full market prices,
              including transfers between relatives and part shares. We display registered
              transactions rather than asking prices.
            </p>
          </div>
          <a
            class="button primary"
            :href="
              meta?.source.url ??
              'https://data.gov.sg/datasets/d_8b84c4ee58e3cfc0ece0d773c8ca6abc/view'
            "
            target="_blank"
            rel="noopener noreferrer"
            >Explore the original dataset <ExternalLink :size="14" /></a
        ></template>
      </section></div
  ></Teleport>
</template>
