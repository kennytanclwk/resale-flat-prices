<script setup lang="ts">
import { computed } from 'vue';

type Town = { town: string; count: number; medianPrice: number; medianPsm: number };
const props = withDefaults(
  defineProps<{ towns: Town[]; metric?: 'price' | 'psm'; selectedTown?: string }>(),
  { metric: 'price', selectedTown: '' },
);
const emit = defineEmits<{ select: [town: string] }>();
const value = (town: Town) => (props.metric === 'psm' ? town.medianPsm : town.medianPrice);
const ranked = computed(() =>
  [...props.towns]
    .filter((town) => town.count > 0)
    .sort((a, b) => value(b) - value(a) || a.town.localeCompare(b.town))
    .slice(0, 6),
);
const maximum = computed(() => Math.max(1, ...ranked.value.map(value)));
const titleCase = (text: string) =>
  text.toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
const money = (amount: number) =>
  `S$${new Intl.NumberFormat('en-SG', { maximumFractionDigits: 0 }).format(amount)}`;
</script>

<template>
  <div v-if="!ranked.length" class="town-empty">No towns match these filters.</div>
  <div v-else class="town-list" aria-label="Town price comparison">
    <button
      v-for="(town, index) in ranked"
      :key="town.town"
      type="button"
      class="town-row"
      :class="{ selected: selectedTown === town.town }"
      :aria-pressed="selectedTown === town.town"
      :aria-label="`Filter by ${titleCase(town.town)}, median ${money(value(town))}${metric === 'psm' ? ' per square metre' : ''}, ${town.count} transactions`"
      @click="emit('select', town.town)"
    >
      <span class="town-rank">{{ String(index + 1).padStart(2, '0') }}</span>
      <span class="town-main">
        <span class="town-labels"
          ><span class="town-name">{{ titleCase(town.town) }}</span
          ><span class="town-price"
            >{{ money(value(town))
            }}<span v-if="metric === 'psm'" class="town-unit"> / m²</span></span
          ></span
        >
        <span class="town-track" aria-hidden="true"
          ><span
            class="town-fill"
            :style="{ width: `${Math.max(2, (value(town) / maximum) * 100)}%` }"
        /></span>
      </span>
      <span class="town-arrow" aria-hidden="true">↗</span>
    </button>
  </div>
</template>

<style scoped>
.town-list {
  display: grid;
  gap: 16px;
}
.town-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 0;
  border: 0;
  background: transparent;
  font-family: inherit;
  text-align: left;
  width: 100%;
  cursor: pointer;
  border-radius: 3px;
  color: #172d2b;
  outline-offset: 6px;
}
.town-row:focus-visible {
  outline: 2px solid #137f73;
}
.town-rank {
  width: 17px;
  flex-shrink: 0;
  font-size: 10px;
  color: #98a49e;
  font-variant-numeric: tabular-nums;
}
.town-main {
  flex: 1;
  min-width: 0;
}
.town-labels {
  display: flex;
  gap: 10px;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 8px;
}
.town-name {
  font-size: 12px;
  font-weight: 500;
}
.town-price {
  font-size: 12px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.town-unit {
  font-size: 10px;
  font-weight: 400;
  color: #77817f;
}
.town-track {
  height: 5px;
  background: #f0f4f1;
  border-radius: 3px;
  display: block;
  overflow: hidden;
}
.town-fill {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: #b4d9cc;
  transition: background 150ms;
}
.town-row:first-child .town-fill {
  background: #278f7c;
}
.town-row:hover .town-fill,
.town-row.selected .town-fill {
  background: #137f73;
}
.town-row:hover .town-name,
.town-row.selected .town-name {
  color: #137f73;
}
.town-arrow {
  color: #8ca298;
  font-size: 13px;
}
.town-empty {
  min-height: 220px;
  display: grid;
  place-content: center;
  padding: 24px;
  text-align: center;
  color: #77817f;
  font-size: 14px;
}
</style>
