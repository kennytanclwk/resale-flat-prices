// @vitest-environment jsdom
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import PriceDistribution from './PriceDistribution.vue';

const distribution = {
  min: 400_000,
  lowerQuartile: 500_000,
  median: 600_000,
  upperQuartile: 700_000,
  max: 1_000_000,
};

describe('Price distribution', () => {
  it('presents all five statistics with an accessible text description', () => {
    const view = mount(PriceDistribution, { props: { distribution, count: 100 } });
    const description = view.get('[role="img"]').attributes('aria-label');
    for (const value of ['S$400,000', 'S$500,000', 'S$600,000', 'S$700,000', 'S$1,000,000'])
      expect(description).toContain(value);
    expect(view.get('.distribution-summary').text()).toContain('middle 50%');
    expect(view.get('.distribution-footnote').text()).toContain('beyond the current table page');
    expect(view.find('.sample-note').exists()).toBe(false);
  });
  it('labels a small observed sample, including a single transaction', () => {
    const view = mount(PriceDistribution, { props: { distribution, count: 1 } });
    expect(view.get('.sample-note').text()).toContain('Small sample: 1 transaction.');
    expect(view.find('.distribution-footnote').exists()).toBe(false);
  });
  it('keeps the graphic finite for identical prices', () => {
    const view = mount(PriceDistribution, {
      props: {
        distribution: {
          min: 200_000,
          lowerQuartile: 200_000,
          median: 200_000,
          upperQuartile: 200_000,
          max: 200_000,
        },
        count: 3,
      },
    });
    expect(view.html()).not.toMatch(/NaN|Infinity/);
    expect(view.get('.median-marker').attributes('style')).toContain('left: 50%');
    expect(view.find('.range-line').exists()).toBe(false);
  });
  it('shows an empty state without an invented range', () => {
    const view = mount(PriceDistribution, { props: { distribution: null, count: 0 } });
    expect(view.find('[role="img"]').exists()).toBe(false);
    expect(view.get('.distribution-empty').text()).toContain('No prices to summarise');
    expect(view.find('.distribution-values').exists()).toBe(false);
  });
});
