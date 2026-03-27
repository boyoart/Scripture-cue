import { formatHistoryTime, type HistoryEntry } from "../features/history";

type HistoryListProps = {
  items: HistoryEntry[];
  onSelect: (entry: HistoryEntry) => void;
};

export default function HistoryList({ items, onSelect }: HistoryListProps) {
  if (items.length === 0) {
    return <p className="history-empty">No successful searches yet.</p>;
  }

  return (
    <ul className="history-list" aria-label="Recent search history">
      {items.map((item) => (
        <li key={`${item.reference}-${item.translation}-${item.timestamp}`}>
          <button type="button" className="history-list__item" onClick={() => onSelect(item)}>
            <span className="history-list__reference">{item.reference}</span>
            <span className="history-list__meta">{item.translation}</span>
            <span className="history-list__time">{formatHistoryTime(item.timestamp)}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
