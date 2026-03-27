export interface HistoryEntry {
  query: string;
  reference: string;
  translation: string;
  createdAt: number;
}

const MAX_HISTORY = 8;

export function addHistoryEntry(history: HistoryEntry[], entry: HistoryEntry): HistoryEntry[] {
  const deduped = history.filter(
    (item) => !(item.reference === entry.reference && item.translation === entry.translation)
  );
  return [entry, ...deduped].slice(0, MAX_HISTORY);
}

export function formatRelativeTime(timestamp: number): string {
  const minutes = Math.max(1, Math.round((Date.now() - timestamp) / 60000));
  if (minutes < 60) {
    return `${minutes} min${minutes === 1 ? "" : "s"} ago`;
  }

  const hours = Math.round(minutes / 60);
  return `${hours} hr${hours === 1 ? "" : "s"} ago`;
}
