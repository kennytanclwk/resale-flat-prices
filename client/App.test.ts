// @vitest-environment jsdom
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App.vue';
import type { Dashboard, Metadata } from '../shared/types';

const meta: Metadata = {
  towns: ['BEDOK', 'BISHAN'],
  flatTypes: ['3 ROOM', '4 ROOM'],
  minMonth: '2017-01',
  maxMonth: '2025-12',
  latestCompleteMonth: '2025-12',
  totalRecords: 240_000,
  source: {
    name: 'HDB resale prices',
    url: 'https://data.gov.sg/datasets/d_8b84c4ee58e3cfc0ece0d773c8ca6abc/view',
    datasetId: 'd_8b84c4ee58e3cfc0ece0d773c8ca6abc',
    retrievedAt: '2026-01-15T08:00:00Z',
    coverageStart: '2017-01',
    coverageEnd: '2025-12',
    mode: 'snapshot',
  },
};
const transaction = {
  id: '1',
  month: '2025-12',
  town: 'BEDOK',
  flatType: '4 ROOM',
  block: '123',
  streetName: 'BEDOK NTH RD',
  storeyRange: '07 TO 09',
  floorAreaSqm: 100,
  flatModel: 'Improved',
  leaseCommenceDate: 1990,
  remainingLease: '63 years 03 months',
  resalePrice: 600_000,
  pricePerSqm: 6_000,
};
const dashboard: Dashboard = {
  summary: {
    count: 16,
    medianPrice: 600_000,
    medianPsm: 6_000,
    medianArea: 100,
    millionDollarCount: 2,
    priceChangePercent: 10 as number | null,
    comparisonLabel: 'Jan–Dec 2025 vs Jan–Dec 2024',
    comparisonUnavailableReason: null,
    priceDistribution: {
      min: 400_000,
      lowerQuartile: 500_000,
      median: 600_000,
      upperQuartile: 700_000,
      max: 1_000_000,
    },
  },
  trend: [{ month: '2025-12', count: 16, medianPrice: 600_000, medianPsm: 6_000 }],
  towns: [{ town: 'BEDOK', count: 16, medianPrice: 600_000, medianPsm: 6_000 }],
  flatTypes: [{ flatType: '4 ROOM', count: 16, medianPrice: 600_000 }],
  transactions: [transaction],
  pagination: { page: 1, pageSize: 8, total: 16, totalPages: 2 },
  insights: ['The median resale price is S$600,000 across these 16 transactions.'],
};

function response(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => structuredClone(body),
  } as Response;
}
const fetchMock = vi.fn<typeof fetch>();
let wrapper: VueWrapper | undefined;

function serveDashboard(result = dashboard, metadata = meta) {
  fetchMock.mockImplementation(async (input) => {
    const url = String(input);
    if (url === '/api/meta') return response(metadata);
    if (url.startsWith('/api/dashboard?')) {
      const page = Number(new URL(url, window.location.origin).searchParams.get('page'));
      return response({ ...result, pagination: { ...result.pagination, page } });
    }
    throw new Error(`Unexpected request: ${url}`);
  });
}
function requests() {
  return fetchMock.mock.calls
    .map(([input]) => String(input))
    .filter((url) => url.startsWith('/api/dashboard?'));
}
function buttonWithText(text: string) {
  const button = wrapper!.findAll('button').find((button) => button.text() === text);
  if (!button) throw new Error(`Missing button: ${text}`);
  return button;
}
async function render() {
  wrapper = mount(App, { attachTo: document.body });
  await flushPromises();
  return wrapper;
}

beforeEach(() => {
  window.history.replaceState(null, '', '/');
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  serveDashboard();
});
afterEach(() => {
  wrapper?.unmount();
  wrapper = undefined;
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
});

describe('HDB explorer', () => {
  it('loads source metadata and a twelve-month dashboard with real transaction details', async () => {
    const app = await render();
    expect(app.get('h1').text()).toContain('Home prices.');
    expect(app.get('.hero-note').text()).toContain('240,000 real transactions');
    expect(app.get('.metrics-grid').text()).toContain('S$600,000');
    expect(app.get('.distribution-panel').text()).toContain('S$500,000');
    expect(app.get('.distribution-panel').text()).toContain('S$700,000');
    expect(app.get('.insight-strip').text()).toContain('across these 16 transactions');
    expect(app.get('.address-button').text()).toContain('123 Bedok Nth Rd');
    expect(app.find('[role="status"]').exists()).toBe(false);
    const query = new URL(requests()[0]!, window.location.origin).searchParams;
    expect(query.get('from')).toBe('2025-01');
    expect(query.get('to')).toBe('2025-12');
    expect(query.get('page')).toBe('1');
  });

  it('applies a town filter to the API and resets pagination while preserving the date range', async () => {
    window.history.replaceState(null, '', '/?page=2&town=BISHAN&from=2025-06&to=2025-12');
    const app = await render();
    expect(app.get('.pagination').text()).toContain('Page 2 of 2');
    await app.findAll('select')[0]!.setValue('BEDOK');
    await flushPromises();
    const query = new URL(requests().at(-1)!, window.location.origin).searchParams;
    expect(query.get('town')).toBe('BEDOK');
    expect(query.get('page')).toBe('1');
    expect(query.get('from')).toBe('2025-06');
    expect(query.get('to')).toBe('2025-12');
    expect(app.get('.pagination').text()).toContain('Page 1 of 2');
    expect(new URLSearchParams(window.location.search).get('town')).toBe('BEDOK');
  });

  it('recovers from unsupported shared-link sort, order, and page values while preserving valid filters', async () => {
    window.history.replaceState(null, '', '/?sort=unknown&order=sideways&page=Infinity&town=BEDOK');
    const app = await render();
    const query = new URL(requests()[0]!, window.location.origin).searchParams;
    expect(query.get('sort')).toBe('month');
    expect(query.get('order')).toBe('desc');
    expect(query.get('page')).toBe('1');
    expect(query.get('town')).toBe('BEDOK');
    expect(app.find('[role="alert"]').exists()).toBe(false);
    expect(app.get('.address-button').text()).toContain('123 Bedok Nth Rd');
    expect(new URLSearchParams(window.location.search).get('sort')).toBe('month');
  });

  it('shows an API failure and successfully retries the same selection', async () => {
    let failed = false;
    fetchMock.mockImplementation(async (input) => {
      if (String(input) === '/api/meta') return response(meta);
      if (!failed) {
        failed = true;
        return response({ error: { message: 'The transaction snapshot could not be read.' } }, 503);
      }
      return response(dashboard);
    });
    const app = await render();
    expect(app.get('[role="alert"]').text()).toContain(
      'The transaction snapshot could not be read.',
    );
    expect(app.find('.transactions-panel').exists()).toBe(false);
    await buttonWithText('Try again').trigger('click');
    await flushPromises();
    expect(app.find('[role="alert"]').exists()).toBe(false);
    expect(app.get('.address-button').text()).toContain('123 Bedok Nth Rd');
    expect(requests()).toHaveLength(2);
    expect(requests()[1]).toBe(requests()[0]);
  });

  it('provides a no-match state and disables CSV export for an empty selection', async () => {
    serveDashboard({
      ...dashboard,
      summary: {
        ...dashboard.summary,
        count: 0,
        medianPrice: 0,
        medianPsm: 0,
        millionDollarCount: 0,
        priceChangePercent: null,
        comparisonUnavailableReason: 'no_transactions',
        priceDistribution: null,
      },
      trend: [],
      towns: [],
      flatTypes: [],
      transactions: [],
      insights: [],
      pagination: { page: 1, pageSize: 8, total: 0, totalPages: 0 },
    });
    const app = await render();
    expect(app.get('.empty-state').text()).toContain('No homes in this view just yet.');
    expect(app.get('.pagination').text()).toContain('Showing 0–0 of 0 transactions');
    expect(app.get('.export-button').attributes('disabled')).toBeDefined();
    expect(app.get('.chart-empty').text()).toContain('No monthly data');
    expect(app.get('.metric-value').text()).toBe('—');
    expect(app.get('.distribution-empty').text()).toContain('No prices to summarise');
  });

  it('opens transaction details and restores focus when the dialog closes', async () => {
    const app = await render();
    const address = app.get('.address-button');
    (address.element as HTMLButtonElement).focus();
    await address.trigger('click');
    await flushPromises();
    const dialog = document.querySelector('[role="dialog"]')!;
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.querySelector('h2')?.textContent).toContain('123 Bedok Nth Rd');
    expect(dialog.textContent).toContain('63 years 03 months');
    expect(dialog.textContent).toContain('07 TO 09');
    expect(dialog.textContent).toContain('1990');
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Close dialog');
    (dialog.querySelector('[aria-label="Close dialog"]') as HTMLButtonElement).click();
    await flushPromises();
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(address.element);
    await address.trigger('click');
    await flushPromises();
    document
      .querySelector('.dialog-backdrop')!
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await flushPromises();
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  it('shows invalid shared-link date ranges without leaving the initial loading indicator running', async () => {
    window.history.replaceState(null, '', '/?from=2025-12&to=2025-01');
    const app = await render();
    expect(app.get('[role="alert"]').text()).toContain(
      'Start month must be before or equal to end month.',
    );
    expect(app.find('[role="status"]').exists()).toBe(false);
    expect(requests()).toHaveLength(0);
  });

  it('aborts a pending request and prevents stale results when dates become invalid', async () => {
    const app = await render();
    let finishPending!: (value: Response) => void;
    let pendingSignal: AbortSignal | undefined;
    fetchMock.mockImplementation((_input, options) => {
      pendingSignal = options?.signal ?? undefined;
      return new Promise<Response>((resolve) => {
        finishPending = resolve;
      });
    });
    await app.findAll('select')[0]!.setValue('BEDOK');
    expect(pendingSignal?.aborted).toBe(false);
    await app.findAll('input[type="month"]')[0]!.setValue('2026-01');
    expect(pendingSignal?.aborted).toBe(true);
    expect(app.get('[role="alert"]').text()).toContain(
      'Start month must be before or equal to end month.',
    );
    expect(app.find('.dashboard-body').exists()).toBe(false);
    finishPending(response(dashboard));
    await flushPromises();
    expect(app.find('.dashboard-body').exists()).toBe(false);
    expect(app.find('[role="status"]').exists()).toBe(false);
  });
  it('explains partial months and moves to a complete equal-length window while preserving other filters', async () => {
    const currentMeta: Metadata = { ...meta, maxMonth: '2026-01', latestCompleteMonth: '2025-12' };
    const partial: Dashboard = {
      ...dashboard,
      summary: {
        ...dashboard.summary,
        priceChangePercent: null,
        comparisonUnavailableReason: 'incomplete_month',
      },
    };
    window.history.replaceState(
      null,
      '',
      '/?town=BEDOK&from=2025-02&to=2026-01&page=2&maxPrice=800000',
    );
    fetchMock.mockImplementation(async (input) => {
      if (String(input) === '/api/meta') return response(currentMeta);
      const params = new URL(String(input), window.location.origin).searchParams;
      const result = params.get('to') === '2026-01' ? partial : dashboard;
      return response({
        ...result,
        pagination: { ...result.pagination, page: Number(params.get('page')) },
      });
    });
    const app = await render();
    expect(app.get('.coverage-note').text()).toContain('still in progress');
    expect(app.get('.metric-caption').text()).toBe('Latest month is incomplete');
    await buttonWithText('Use complete months').trigger('click');
    await flushPromises();
    const query = new URL(requests().at(-1)!, window.location.origin).searchParams;
    expect(query.get('from')).toBe('2025-01');
    expect(query.get('to')).toBe('2025-12');
    expect(query.get('town')).toBe('BEDOK');
    expect(query.get('maxPrice')).toBe('800000');
    expect(query.get('page')).toBe('1');
    expect(app.find('.coverage-note').exists()).toBe(false);
  });
  it('does not offer a complete-month shortcut when no closed month is covered', async () => {
    serveDashboard(
      {
        ...dashboard,
        summary: {
          ...dashboard.summary,
          priceChangePercent: null,
          comparisonUnavailableReason: 'incomplete_month',
        },
      },
      { ...meta, latestCompleteMonth: null },
    );
    const app = await render();
    expect(app.find('.coverage-note').exists()).toBe(true);
    expect(app.findAll('button').some((button) => button.text() === 'Use complete months')).toBe(
      false,
    );
  });
  it.each([
    ['insufficient_coverage', 'Prior period outside data coverage'],
    ['no_prior_transactions', 'No matching prior-period transactions'],
  ] as const)(
    'shows the specific reason %s for an unavailable comparison',
    async (reason, message) => {
      serveDashboard({
        ...dashboard,
        summary: {
          ...dashboard.summary,
          priceChangePercent: null,
          comparisonUnavailableReason: reason,
        },
      });
      const app = await render();
      expect(app.get('.metric-caption').text()).toBe(message);
      expect(app.find('.coverage-note').exists()).toBe(false);
    },
  );
});
