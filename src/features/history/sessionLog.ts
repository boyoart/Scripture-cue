export type SessionSourceType = "typed" | "spoken";

export type SessionLogEntry = {
  id: string;
  reference: string;
  timestampMs: number;
  sourceType: SessionSourceType;
};

export function addSessionLogEntry(
  previous: SessionLogEntry[],
  next: { reference: string; sourceType: SessionSourceType }
): SessionLogEntry[] {
  const timestampMs = Date.now();
  const id = `${timestampMs}-${Math.random().toString(36).slice(2, 8)}`;

  return [
    ...previous,
    {
      id,
      reference: next.reference,
      sourceType: next.sourceType,
      timestampMs
    }
  ];
}

export function formatSessionTimestamp(timestampMs: number): string {
  return new Date(timestampMs).toLocaleString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    month: "2-digit",
    day: "2-digit",
    year: "numeric"
  });
}

export function toSessionLogText(entries: SessionLogEntry[]): string {
  if (entries.length === 0) {
    return "No verses were presented in this session.";
  }

  const lines = entries.map((entry, index) => {
    return `${index + 1}. ${entry.reference} | ${entry.sourceType.toUpperCase()} | ${formatSessionTimestamp(entry.timestampMs)}`;
  });

  return ["Scripture Cue Session Log", "", ...lines].join("\n");
}

export function toSessionLogCsv(entries: SessionLogEntry[]): string {
  const header = "index,reference,source_type,timestamp";

  if (entries.length === 0) {
    return `${header}\n`;
  }

  const rows = entries.map((entry, index) => {
    const escapedReference = `\"${entry.reference.replace(/\"/g, "\"\"")}\"`;
    const escapedTimestamp = `\"${new Date(entry.timestampMs).toISOString()}\"`;
    return `${index + 1},${escapedReference},${entry.sourceType},${escapedTimestamp}`;
  });

  return [header, ...rows].join("\n");
}
