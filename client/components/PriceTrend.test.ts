// @vitest-environment jsdom
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import { nextTick } from 'vue';
import PriceTrend from './PriceTrend.vue';

const points = [
  { month: '2025-01', count: 5, medianPrice: 500_000, medianPsm: 5_000 },
  { month: '2025-02', count: 7, medianPrice: 550_000, medianPsm: 5_500 },
  { month: '2025-03', count: 9, medianPrice: 600_000, medianPsm: 6_000 },
];

describe('PriceTrend', () => {
  it('provides an empty state rather than rendering an invalid scale', () => {
    const wrapper = mount(PriceTrend, { props: { points: [] } });
    expect(wrapper.text()).toContain('No monthly data');
    expect(wrapper.find('svg').exists()).toBe(false);
  });

  it('lets keyboard users inspect every month and dismiss details', async () => {
    const wrapper = mount(PriceTrend, { props: { points } });
    const chart = wrapper.get('[tabindex="0"]');
    await chart.trigger('focus');
    expect(wrapper.get('[aria-live]').text()).toContain('March 2025: S$600,000');
    await chart.trigger('keydown', { key: 'ArrowLeft' });
    expect(wrapper.get('[aria-live]').text()).toContain('February 2025: S$550,000');
    await chart.trigger('keydown', { key: 'Home' });
    expect(wrapper.get('[aria-live]').text()).toContain('January 2025');
    await chart.trigger('keydown', { key: 'ArrowLeft' });
    expect(wrapper.get('[aria-live]').text()).toContain('January 2025');
    await chart.trigger('keydown', { key: 'End' });
    expect(wrapper.get('[aria-live]').text()).toContain('9 transactions');
    await chart.trigger('keydown', { key: 'Escape' });
    expect(wrapper.find('.chart-active').exists()).toBe(false);
  });

  it('shows price per square metre when the metric changes', async () => {
    const wrapper = mount(PriceTrend, { props: { points, metric: 'psm' } });
    await wrapper.get('[tabindex="0"]').trigger('focus');
    expect(wrapper.get('[aria-live]').text()).toContain('S$6,000 per square metre');
  });

  it('selects the closest month on pointer movement', async () => {
    const wrapper = mount(PriceTrend, { props: { points } });
    const chart = wrapper.get('[tabindex="0"]');
    chart.element.getBoundingClientRect = () => ({
      left: 0,
      width: 760,
      right: 760,
      top: 0,
      bottom: 244,
      height: 244,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
    chart.element.dispatchEvent(new MouseEvent('pointermove', { clientX: 61, bubbles: true }));
    await nextTick();
    expect(wrapper.get('[aria-live]').text()).toContain('January 2025');
    chart.element.dispatchEvent(new MouseEvent('pointermove', { clientX: 760, bubbles: true }));
    await nextTick();
    expect(wrapper.get('[aria-live]').text()).toContain('March 2025');
    await chart.trigger('pointerleave');
    expect(wrapper.find('.chart-active').exists()).toBe(false);
  });

  it('preserves elapsed time for sparse months and chooses the nearest observation', async () => {
    const sparse = [points[0]!, points[1]!, { ...points[2]!, month: '2025-12' }];
    const wrapper = mount(PriceTrend, { props: { points: sparse } });
    const positions = [
      ...wrapper
        .get('.trend-line')
        .attributes('d')!
        .matchAll(/[ML]([\d.]+),/g),
    ].map((match) => Number(match[1]));
    const [january, february, december] = positions as [number, number, number];
    expect((february - january) / (december - january)).toBeCloseTo(1 / 11, 3);
    const chart = wrapper.get('[tabindex="0"]');
    chart.element.getBoundingClientRect = () => ({
      left: 0,
      width: 760,
      right: 760,
      top: 0,
      bottom: 244,
      height: 244,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
    chart.element.dispatchEvent(new MouseEvent('pointermove', { clientX: 250, bubbles: true }));
    await nextTick();
    expect(wrapper.get('[aria-live]').text()).toContain('February 2025');
    chart.element.dispatchEvent(new MouseEvent('pointermove', { clientX: 550, bubbles: true }));
    await nextTick();
    expect(wrapper.get('[aria-live]').text()).toContain('December 2025');
  });

  it.each([
    { series: [points[0]!] },
    { series: [points[0]!, { ...points[0]!, month: '2025-02' }] },
  ])('handles a single observation and a constant series without invalid SVG', ({ series }) => {
    const wrapper = mount(PriceTrend, { props: { points: series } });
    expect(wrapper.get('.trend-line').attributes('d')).not.toMatch(/NaN|Infinity/);
  });
});
