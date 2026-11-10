// @vitest-environment jsdom
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App.vue';

const meta = {
  towns: ['BEDOK', 'BISHAN'],
  flatTypes: ['3 ROOM', '4 ROOM'],
  minMonth: '2017-01',
  maxMonth: '2025-12',
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
const dashboard = {
  summary: {
    count: 16,
    medianPrice: 600_000,
    medianPsm: 6_000,
    medianArea: 100,
    millionDollarCount: 2,
    priceChangePercent: 10 as number | null,
    comparisonLabel: 'Jan–Dec 2025 vs Jan–Dec 2024',
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

function serveDashboard(result = dashboard) {
  fetchMock.mockImplementation(async (input) => {
    const url = String(input);
    if (url === '/api/meta') return response(meta);
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
});
