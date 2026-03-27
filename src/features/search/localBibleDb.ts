export type TranslationCode = "NIV" | "ESV" | "KJV" | "NLT";

export type VerseRecord = {
  reference: string;
  text: string;
  theme: string;
};

const BIBLE_DB: Record<TranslationCode, VerseRecord[]> = {
  NIV: [
    {
      reference: "Psalm 23:1-3",
      text: "The Lord is my shepherd, I lack nothing. He makes me lie down in green pastures, he leads me beside quiet waters, he refreshes my soul.",
      theme: "Comfort & Assurance"
    },
    {
      reference: "John 3:16",
      text: "For God so loved the world that he gave his one and only Son, that whoever believes in him shall not perish but have eternal life.",
      theme: "Salvation"
    },
    {
      reference: "Romans 8:28",
      text: "And we know that in all things God works for the good of those who love him, who have been called according to his purpose.",
      theme: "Providence"
    }
  ],
  ESV: [
    {
      reference: "Psalm 23:1-3",
      text: "The Lord is my shepherd; I shall not want. He makes me lie down in green pastures. He leads me beside still waters. He restores my soul.",
      theme: "Comfort & Assurance"
    },
    {
      reference: "John 3:16",
      text: "For God so loved the world, that he gave his only Son, that whoever believes in him should not perish but have eternal life.",
      theme: "Salvation"
    },
    {
      reference: "Isaiah 40:31",
      text: "But they who wait for the Lord shall renew their strength; they shall mount up with wings like eagles.",
      theme: "Strength"
    }
  ],
  KJV: [
    {
      reference: "Psalm 23:1-3",
      text: "The Lord is my shepherd; I shall not want. He maketh me to lie down in green pastures: he leadeth me beside the still waters. He restoreth my soul.",
      theme: "Comfort & Assurance"
    },
    {
      reference: "John 3:16",
      text: "For God so loved the world, that he gave his only begotten Son, that whosoever believeth in him should not perish, but have everlasting life.",
      theme: "Salvation"
    },
    {
      reference: "Isaiah 40:31",
      text: "But they that wait upon the Lord shall renew their strength; they shall mount up with wings as eagles.",
      theme: "Strength"
    }
  ],
  NLT: [
    {
      reference: "Psalm 23:1-3",
      text: "The Lord is my shepherd; I have all that I need. He lets me rest in green meadows; he leads me beside peaceful streams. He renews my strength.",
      theme: "Comfort & Assurance"
    },
    {
      reference: "Romans 8:28",
      text: "And we know that God causes everything to work together for the good of those who love God.",
      theme: "Providence"
    },
    {
      reference: "Jeremiah 29:11",
      text: "For I know the plans I have for you, says the Lord. They are plans for good and not for disaster, to give you a future and a hope.",
      theme: "Hope"
    }
  ]
};

export function getTranslationRecords(translation: TranslationCode): VerseRecord[] {
  return BIBLE_DB[translation];
}
