export const integer = (value: number) =>
  new Intl.NumberFormat('en-SG', { maximumFractionDigits: 0 }).format(value);
export const money = (value: number | null) => (value === null ? '—' : `S$${integer(value)}`);
export const titleCase = (value: string) =>
  value.toLowerCase().replace(/\b\w/g, (char) => char.toUpperCase());
export function monthLabel(value: string, long = false) {
  if (!/^\d{4}-\d{2}$/.test(value)) return value;
  const [year, month] = value.split('-').map(Number);
  return new Intl.DateTimeFormat('en-SG', {
    month: long ? 'long' : 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year!, month! - 1, 1)));
}
export function shiftMonth(value: string, offset: number) {
  const [year, month] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year!, month! - 1 + offset, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}
