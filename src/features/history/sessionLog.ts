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
    return [
      `Entry ${index + 1}`,
      `  Timestamp: ${new Date(entry.timestampMs).toISOString()}`,
      `  Reference: ${entry.reference}`,
      `  Source Type: ${entry.sourceType}`
    ].join("\n");
  });

  return ["Scripture Cue Session Log", `Total Entries: ${entries.length}`, "", ...lines].join("\n\n");
}

export function toSessionLogCsv(entries: SessionLogEntry[]): string {
  const header = "timestamp,reference,source_type";

  if (entries.length === 0) {
    return `${header}\n`;
  }

  const rows = entries.map((entry) => {
    const escapedTimestamp = `\"${new Date(entry.timestampMs).toISOString()}\"`;
    const escapedReference = `\"${entry.reference.replace(/\"/g, "\"\"")}\"`;
    return `${escapedTimestamp},${escapedReference},${entry.sourceType}`;
  });

  return [header, ...rows].join("\n");
}
