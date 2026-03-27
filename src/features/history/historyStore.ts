export type HistoryEntry = {
  reference: string;
  translation: string;
  timestamp: number;
};

export function addHistoryEntry(history: HistoryEntry[], next: Omit<HistoryEntry, "timestamp">): HistoryEntry[] {
  const entry: HistoryEntry = { ...next, timestamp: Date.now() };
  const deduped = history.filter(
    (item) => !(item.reference === entry.reference && item.translation === entry.translation)
  );

  return [entry, ...deduped].slice(0, 12);
}

export function formatHistoryTime(timestamp: number): string {
  const deltaSeconds = Math.round((Date.now() - timestamp) / 1000);

  if (deltaSeconds < 30) {
    return "just now";
  }

  if (deltaSeconds < 3600) {
    return `${Math.max(1, Math.round(deltaSeconds / 60))} min ago`;
  }

  return new Date(timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
