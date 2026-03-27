interface HistoryItem {
  reference: string;
  translation: string;
  timeLabel: string;
}

const items: HistoryItem[] = [
  { reference: "Psalm 23:1-3", translation: "KJV", timeLabel: "3 mins ago" },
  { reference: "John 3:16", translation: "WEB", timeLabel: "12 mins ago" },
  { reference: "Romans 8:28", translation: "KJV", timeLabel: "25 mins ago" },
  { reference: "Isaiah 40:31", translation: "WEB", timeLabel: "Yesterday" }
];

export default function HistoryList() {
  return (
    <ul className="history-list" aria-label="Recent search history">
      {items.map((item) => (
        <li key={`${item.reference}-${item.translation}`}>
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
