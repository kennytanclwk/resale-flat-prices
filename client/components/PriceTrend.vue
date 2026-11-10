<script setup lang="ts">
import { computed, ref, useId, watch } from 'vue';

type TrendPoint = { month: string; count: number; medianPrice: number; medianPsm: number };
const props = withDefaults(defineProps<{ points: TrendPoint[]; metric?: 'price' | 'psm' }>(), {
  metric: 'price',
});

const chart = ref<HTMLDivElement | null>(null);
const gradientId = `trend-area-${useId()}`;
const activeIndex = ref<number | null>(null);
const focused = ref(false);
const width = 760;
const height = 244;
const bounds = { left: 61, right: 18, top: 24, bottom: 38 };
const plotWidth = width - bounds.left - bounds.right;
const plotHeight = height - bounds.top - bounds.bottom;
const number = new Intl.NumberFormat('en-SG', { maximumFractionDigits: 0 });
const money = (value: number) => `S$${number.format(value)}`;
const shortMoney = (value: number) =>
  value >= 1_000_000
    ? `$${(value / 1_000_000).toFixed(1)}m`
    : value >= 10_000
      ? `$${Math.round(value / 1_000)}k`
      : value >= 1_000
        ? `$${(value / 1_000).toFixed(1).replace(/\.0$/, '')}k`
        : `$${Math.round(value)}`;
const monthLabel = (month: string, long = false) => {
  const [year, monthNumber] = month.split('-').map(Number);
  return new Intl.DateTimeFormat('en-SG', {
    month: long ? 'long' : 'short',
    year: long ? 'numeric' : '2-digit',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year!, monthNumber! - 1, 1)));
};
const monthOrdinal = (month: string) => {
  const [year, monthNumber] = month.split('-').map(Number);
  return year! * 12 + monthNumber! - 1;
};
const values = computed(() =>
  props.points.map((point) => (props.metric === 'psm' ? point.medianPsm : point.medianPrice)),
);
const calendarScale = computed(() => {
  const months = props.points.map((point) => monthOrdinal(point.month));
  return { min: Math.min(...months), max: Math.max(...months) };
});
const scale = computed(() => {
  if (!values.value.length) return { min: 0, max: 1 };
  const min = Math.min(...values.value);
  const max = Math.max(...values.value);
  const padding = Math.max((max - min) * 0.22, max * 0.035, 1);
  return { min: Math.max(0, min - padding), max: max + padding };
});
const coordinates = computed(() =>
  props.points.map((point, index) => ({
    ...point,
    value: values.value[index]!,
    x:
      bounds.left +
      (calendarScale.value.min === calendarScale.value.max
        ? plotWidth / 2
        : ((monthOrdinal(point.month) - calendarScale.value.min) /
            (calendarScale.value.max - calendarScale.value.min)) *
          plotWidth),
    y:
      bounds.top +
      ((scale.value.max - values.value[index]!) / (scale.value.max - scale.value.min)) * plotHeight,
  })),
);
const line = computed(() =>
  coordinates.value
    .map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x.toFixed(2)},${point.y.toFixed(2)}`)
    .join(' '),
);
const area = computed(() => {
  const first = coordinates.value[0];
  const last = coordinates.value.at(-1);
  return first && last
    ? `${line.value} L${last.x},${height - bounds.bottom} L${first.x},${height - bounds.bottom} Z`
    : '';
});
const ticks = computed(() =>
  Array.from({ length: 4 }, (_, index) => ({
    y: bounds.top + (index / 3) * plotHeight,
    value: scale.value.max - (index / 3) * (scale.value.max - scale.value.min),
  })),
);
const labels = computed(() => {
  const result: typeof coordinates.value = [];
  for (const point of coordinates.value) {
    if (!result.length || point.x - result.at(-1)!.x >= plotWidth / 5) result.push(point);
  }
  const last = coordinates.value.at(-1);
  if (last && result.at(-1) !== last) {
    if (result.length > 1 && last.x - result.at(-1)!.x < plotWidth / 7) result.pop();
    result.push(last);
  }
  return result;
});
const active = computed(() =>
  activeIndex.value === null ? null : (coordinates.value[activeIndex.value] ?? null),
);
const tooltipX = computed(() =>
  Math.min(width - 191, Math.max(bounds.left, (active.value?.x ?? 0) - 86)),
);
const metricLabel = computed(() =>
  props.metric === 'psm' ? 'median price per square metre' : 'median resale price',
);

function pointerMove(event: PointerEvent) {
  const rect = chart.value?.getBoundingClientRect();
  if (!rect || rect.width <= 0 || !coordinates.value.length) return;
  const x = ((event.clientX - rect.left) / rect.width) * width;
  activeIndex.value = coordinates.value.reduce(
    (closest, point, index, all) =>
      Math.abs(point.x - x) < Math.abs(all[closest]!.x - x) ? index : closest,
    0,
  );
}
function onKeydown(event: KeyboardEvent) {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End', 'Escape'].includes(event.key)) return;
  event.preventDefault();
  if (!props.points.length) return;
  if (event.key === 'Escape') activeIndex.value = null;
  else if (event.key === 'Home') activeIndex.value = 0;
  else if (event.key === 'End') activeIndex.value = props.points.length - 1;
  else
    activeIndex.value = Math.min(
      props.points.length - 1,
      Math.max(
        0,
        (activeIndex.value ?? props.points.length - 1) + (event.key === 'ArrowLeft' ? -1 : 1),
      ),
    );
}
watch(
  () => props.points,
  () => {
    activeIndex.value = null;
  },
);
</script>

<template>
  <div v-if="!points.length" class="chart-empty">
    No monthly data for these filters. Try a wider date range.
  </div>
  <div
    v-else
    ref="chart"
    class="price-chart"
    tabindex="0"
    role="group"
    :aria-label="`Monthly ${metricLabel}. Use left and right arrow keys to explore the chart, Home or End to jump, and Escape to dismiss details.`"
    @pointermove="pointerMove"
    @pointerdown="pointerMove"
    @pointerleave="!focused && (activeIndex = null)"
    @focus="
      focused = true;
      activeIndex = points.length - 1;
    "
    @blur="
      focused = false;
      activeIndex = null;
    "
    @keydown="onKeydown"
  >
    <svg
      :viewBox="`0 0 ${width} ${height}`"
      role="img"
      :aria-label="`${metricLabel} from ${monthLabel(points[0]!.month, true)} to ${monthLabel(points[points.length - 1]!.month, true)}`"
    >
      <title>Monthly {{ metricLabel }}</title>
      <desc>
        Each point shows the median across matching registered resale transactions for one month.
        Horizontal spacing follows elapsed calendar months; months without transactions have no
        observation. Focus this chart and use arrow keys to inspect the values.
      </desc>
      <defs>
        <linearGradient :id="gradientId" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#2a9e8c" stop-opacity="0.18" />
          <stop offset="100%" stop-color="#2a9e8c" stop-opacity="0.015" />
        </linearGradient>
      </defs>
      <g v-for="tick in ticks" :key="tick.y" class="chart-grid">
        <line :x1="bounds.left" :x2="width - bounds.right" :y1="tick.y" :y2="tick.y" />
        <text :x="bounds.left - 13" :y="tick.y + 4" text-anchor="end">
          {{ shortMoney(tick.value) }}
        </text>
      </g>
      <path :d="area" :fill="`url(#${gradientId})`" />
      <path
        class="trend-line"
        :d="line"
        fill="none"
        stroke="#137f73"
        stroke-width="2.7"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
      <circle
        v-if="points.length === 1"
        :cx="coordinates[0]!.x"
        :cy="coordinates[0]!.y"
        r="4"
        fill="#137f73"
      />
      <text
        v-for="point in labels"
        :key="point.month"
        :x="point.x"
        :y="height - 11"
        text-anchor="middle"
        class="chart-month"
      >
        {{ monthLabel(point.month) }}
      </text>
      <g v-if="active" class="chart-active" aria-hidden="true">
        <line
          :x1="active.x"
          :x2="active.x"
          :y1="bounds.top"
          :y2="height - bounds.bottom"
          stroke="#137f73"
          stroke-dasharray="4 4"
          opacity="0.4"
        />
        <circle
          :cx="active.x"
          :cy="active.y"
          r="6"
          fill="#137f73"
          stroke="white"
          stroke-width="3"
        />
        <g :transform="`translate(${tooltipX}, 3)`">
          <rect width="178" height="65" rx="7" fill="#172d2b" />
          <text x="12" y="19" fill="#c5e1da" class="tooltip-month">
            {{ monthLabel(active.month, true) }}
          </text>
          <text x="12" y="39" fill="white" class="tooltip-price">
            {{ money(active.value) }}{{ metric === 'psm' ? ' / m²' : '' }}
          </text>
          <text x="12" y="55" fill="#c5e1da" class="tooltip-count">
            {{ number.format(active.count) }} transactions
          </text>
        </g>
      </g>
    </svg>
    <span class="chart-sr-only" aria-live="polite" aria-atomic="true">{{
      active
        ? `${monthLabel(active.month, true)}: ${money(active.value)}${metric === 'psm' ? ' per square metre' : ''}, ${number.format(active.count)} transactions.`
        : ''
    }}</span>
  </div>
</template>

<style scoped>
.price-chart {
  width: 100%;
  border-radius: 6px;
  outline-offset: 5px;
  touch-action: pan-y;
}
.price-chart:focus-visible {
  outline: 2px solid #137f73;
}
svg {
  width: 100%;
  height: auto;
  display: block;
  overflow: visible;
  font-family: inherit;
}
.chart-grid line {
  stroke: #e9eeeb;
  stroke-dasharray: 3 5;
}
.chart-grid text,
.chart-month {
  fill: #7b8883;
  font-size: 11px;
}
.tooltip-month,
.tooltip-count {
  font-size: 10px;
}
.tooltip-price {
  font-size: 15px;
  font-weight: 600;
}
.chart-empty {
  min-height: 220px;
  display: grid;
  place-content: center;
  text-align: center;
  padding: 24px;
  color: #77817f;
  font-size: 14px;
}
.chart-sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
@media (max-width: 600px) {
  .chart-grid text,
  .chart-month {
    font-size: 14px;
  }
  .tooltip-month,
  .tooltip-count {
    font-size: 12px;
  }
}
</style>
