// @vitest-environment jsdom
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import TownComparison from './TownComparison.vue';

const towns = [
  { town: 'BEDOK', count: 10, medianPrice: 500_000, medianPsm: 6_000 },
  { town: 'BISHAN', count: 20, medianPrice: 800_000, medianPsm: 5_000 },
];

describe('TownComparison', () => {
  it('ranks towns by price and emits the original town value when selected', async () => {
    const wrapper = mount(TownComparison, { props: { towns } });
    expect(wrapper.findAll('.town-name').map((node) => node.text())).toEqual(['Bishan', 'Bedok']);
    await wrapper.findAll('button')[0]!.trigger('click');
    expect(wrapper.emitted('select')).toEqual([['BISHAN']]);
    expect(towns[0]!.town).toBe('BEDOK');
  });

  it('reorders the ranking for price per square metre and announces selection', () => {
    const wrapper = mount(TownComparison, {
      props: { towns, metric: 'psm', selectedTown: 'BEDOK' },
    });
    expect(wrapper.get('button').attributes('aria-pressed')).toBe('true');
    expect(wrapper.get('button').attributes('aria-label')).toContain(
      'S$6,000 per square metre, 10 transactions',
    );
  });

  it('limits the ranking to six towns and excludes empty groups', () => {
    const many = Array.from({ length: 9 }, (_, i) => ({
      ...towns[0]!,
      town: `TOWN ${i}`,
      count: i,
      medianPrice: i * 100_000,
    }));
    const wrapper = mount(TownComparison, { props: { towns: many } });
    expect(wrapper.findAll('button')).toHaveLength(6);
    expect(wrapper.findAll('.town-name')[0]!.text()).toBe('Town 8');
  });

  it('shows a clear empty state', () => {
    expect(mount(TownComparison, { props: { towns: [] } }).text()).toContain('No towns match');
  });
});
