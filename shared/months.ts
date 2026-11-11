export function monthIndex(month: string): number {
  const [year, value] = month.split('-').map(Number);
  return year * 12 + value - 1;
}

export function indexMonth(index: number): string {
  return `${Math.floor(index / 12)}-${String((((index % 12) + 12) % 12) + 1).padStart(2, '0')}`;
}

export function singaporeMonth(timestamp: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Singapore',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(new Date(timestamp));
  return `${parts.find((part) => part.type === 'year')!.value}-${parts.find((part) => part.type === 'month')!.value}`;
}
