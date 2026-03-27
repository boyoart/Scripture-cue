export type HistoryItem = {
  reference: string;
  translation: string;
  timeLabel: string;
};

interface HistoryListProps {
  items: HistoryItem[];
}

export default function HistoryList({ items }: HistoryListProps) {
  return (
    <ul className="history-list" aria-label="Recent search history">
      {items.map((item) => (
        <li key={`${item.reference}-${item.timeLabel}`}>
          <button type="button" className="history-list__item">
            <span className="history-list__reference">{item.reference}</span>
            <span className="history-list__meta">{item.translation}</span>
            <span className="history-list__time">{item.timeLabel}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
