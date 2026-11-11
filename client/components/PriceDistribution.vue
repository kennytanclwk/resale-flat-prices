<script setup lang="ts">
import { computed } from 'vue';
import type { PriceDistribution } from '../../shared/types';
import { integer, money } from '../lib/format';

const props = defineProps<{ distribution: PriceDistribution | null; count: number }>();
const transactionLabel = computed(() => (props.count === 1 ? 'transaction' : 'transactions'));
const position = (value: number) => {
  const distribution = props.distribution;
  if (!distribution || distribution.max === distribution.min) return 50;
  return ((value - distribution.min) / (distribution.max - distribution.min)) * 100;
};
const boxStyle = computed(() =>
  props.distribution
    ? {
        left: `${position(props.distribution.lowerQuartile)}%`,
        width: `${position(props.distribution.upperQuartile) - position(props.distribution.lowerQuartile)}%`,
      }
    : {},
);
const description = computed(() => {
  const d = props.distribution;
  return d
    ? `Price distribution across ${integer(props.count)} ${transactionLabel.value}. Minimum ${money(d.min)}, lower quartile ${money(d.lowerQuartile)}, median ${money(d.median)}, upper quartile ${money(d.upperQuartile)}, maximum ${money(d.max)}.`
    : '';
});
</script>

<template>
  <section class="panel distribution-panel" aria-labelledby="distribution-heading">
    <div class="distribution-header">
      <div>
        <h3 id="distribution-heading">More than a median</h3>
        <p>See the spread of resale prices in your selection.</p>
      </div>
      <span class="sample-count">{{ integer(count) }} {{ transactionLabel }}</span>
    </div>
    <template v-if="distribution && count">
      <p class="distribution-summary">
        The middle 50% price range (25th–75th percentile) is
        <strong>{{ money(distribution.lowerQuartile) }}</strong> to
        <strong>{{ money(distribution.upperQuartile) }}</strong
        >.
      </p>
      <div class="distribution-chart" role="img" :aria-label="description">
        <template v-if="distribution.max > distribution.min"
          ><div class="range-line"></div>
          <div class="range-cap start"></div>
          <div class="range-cap end"></div
        ></template>
        <div class="quartile-box" :style="boxStyle"></div>
        <div class="median-marker" :style="{ left: `${position(distribution.median)}%` }"></div>
      </div>
      <div class="range-endpoints">
        <span>Minimum {{ money(distribution.min) }}</span
        ><span>Maximum {{ money(distribution.max) }}</span>
      </div>
      <dl class="distribution-values">
        <div>
          <dt>Lower quartile · 25th percentile</dt>
          <dd>{{ money(distribution.lowerQuartile) }}</dd>
        </div>
        <div class="median-value">
          <dt>Median · 50th percentile</dt>
          <dd>{{ money(distribution.median) }}</dd>
        </div>
        <div>
          <dt>Upper quartile · 75th percentile</dt>
          <dd>{{ money(distribution.upperQuartile) }}</dd>
        </div>
      </dl>
      <p v-if="count < 30" class="sample-note">
        Small sample: {{ integer(count) }} {{ transactionLabel }}. Widen the period or filters for a
        more stable summary.
      </p>
      <p v-else class="distribution-footnote">
        Calculated from all matching transactions, including those beyond the current table page.
        Quartiles use linear interpolation; prices are rounded for display.
      </p>
    </template>
    <p v-else class="distribution-empty">
      No prices to summarise. Widen your filters to explore the price distribution.
    </p>
  </section>
</template>

<style scoped>
.distribution-panel {
  margin-top: 20px;
  padding: 23px;
}
.distribution-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 15px;
}
.distribution-header h3 {
  font-size: 14px;
  font-weight: 650;
  letter-spacing: -0.25px;
}
.distribution-header p {
  font-size: 11px;
  color: #78877e;
  margin-top: 5px;
}
.sample-count {
  color: #547c64;
  background: #eff5ef;
  border-radius: 5px;
  padding: 5px 8px;
  font-size: 11px;
  white-space: nowrap;
}
.distribution-summary {
  margin-top: 20px;
  font-size: 12px;
  color: #718175;
  line-height: 1.8;
}
.distribution-summary strong {
  color: #36664b;
  font-weight: 600;
}
.distribution-chart {
  position: relative;
  height: 38px;
  margin-top: 22px;
}
.range-line {
  position: absolute;
  top: 18px;
  height: 2px;
  width: 100%;
  background: #c3d5c8;
}
.range-cap {
  position: absolute;
  top: 11px;
  height: 16px;
  width: 2px;
  background: #9cb9a5;
}
.start {
  left: 0;
}
.end {
  right: 0;
}
.quartile-box {
  position: absolute;
  top: 4px;
  height: 30px;
  min-width: 2px;
  background: #d8ece3;
  border: 1px solid #8db9a5;
  border-radius: 4px;
}
.median-marker {
  position: absolute;
  top: 0;
  height: 38px;
  width: 3px;
  background: #137f73;
  transform: translateX(-50%);
  border-radius: 2px;
}
.range-endpoints {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  font-size: 10px;
  color: #7e9081;
  margin-top: 7px;
}
.range-endpoints span:last-child {
  text-align: right;
}
.distribution-values {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 15px;
  margin: 22px 0 0;
  padding: 18px 0 0;
  border-top: 1px solid #edf1e8;
}
.distribution-values dt {
  color: #7e8d7e;
  font-size: 11px;
}
.distribution-values dd {
  margin: 7px 0 0;
  color: #4d7058;
  font-family: 'Manrope', sans-serif;
  font-size: 20px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
.median-value dd {
  color: #137f73;
}
.distribution-footnote,
.sample-note {
  font-size: 10px;
  color: #82927e;
  line-height: 1.8;
  margin-top: 18px;
}
.sample-note {
  background: #fbf5e8;
  color: #8b7345;
  border-radius: 5px;
  padding: 9px 12px;
}
.distribution-empty {
  padding: 28px 0 10px;
  color: #7e8d7e;
  font-size: 12px;
}
@media (max-width: 560px) {
  .distribution-panel {
    padding: 17px 15px;
    margin-top: 15px;
  }
  .distribution-header {
    align-items: flex-start;
    flex-direction: column;
    gap: 10px;
  }
  .distribution-summary {
    margin-top: 15px;
    font-size: 11px;
  }
  .distribution-values {
    gap: 8px;
  }
  .distribution-values dt {
    font-size: 9px;
    line-height: 1.7;
  }
  .distribution-values dd {
    font-size: clamp(12px, 3.4vw, 17px);
    letter-spacing: -0.5px;
  }
  .range-endpoints {
    font-size: 9px;
  }
}
</style>
