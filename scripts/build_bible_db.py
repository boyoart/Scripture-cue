import sqlite3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DB_PATH = ROOT / "src-tauri" / "resources" / "bibles" / "bible.db"
DB_PATH.parent.mkdir(parents=True, exist_ok=True)

conn = sqlite3.connect(DB_PATH)
cur = conn.cursor()

cur.executescript(
    """
    PRAGMA journal_mode=WAL;
    PRAGMA foreign_keys=ON;

    DROP TABLE IF EXISTS verses;
    DROP TABLE IF EXISTS book_aliases;
    DROP TABLE IF EXISTS books;
    DROP TABLE IF EXISTS translations;

    CREATE TABLE translations (
      id INTEGER PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      language TEXT NOT NULL,
      is_default INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE books (
      id INTEGER PRIMARY KEY,
      osis_id TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      testament TEXT NOT NULL,
      canonical_order INTEGER NOT NULL UNIQUE
    );

    CREATE TABLE verses (
      id INTEGER PRIMARY KEY,
      translation_id INTEGER NOT NULL,
      book_id INTEGER NOT NULL,
      chapter INTEGER NOT NULL,
      verse INTEGER NOT NULL,
      text TEXT NOT NULL,
      UNIQUE (translation_id, book_id, chapter, verse),
      FOREIGN KEY (translation_id) REFERENCES translations(id) ON DELETE CASCADE,
      FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE
    );

    CREATE TABLE book_aliases (
      id INTEGER PRIMARY KEY,
      book_id INTEGER NOT NULL,
      alias TEXT NOT NULL,
      normalized_alias TEXT NOT NULL,
      UNIQUE(book_id, normalized_alias),
      FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE
    );

    CREATE INDEX idx_verses_lookup ON verses(translation_id, book_id, chapter, verse);
    CREATE INDEX idx_verses_text ON verses(text);
    CREATE INDEX idx_alias_lookup ON book_aliases(normalized_alias);
    """
)

translations = [
    ("KJV", "King James Version", "en", 1),
    ("WEB", "World English Bible", "en", 0),
]
cur.executemany("INSERT INTO translations(code, name, language, is_default) VALUES (?, ?, ?, ?)", translations)

books = [
    ("GEN", "Genesis", "OT", 1, ["genesis", "gen"]),
    ("PSA", "Psalms", "OT", 19, ["psalms", "psalm", "psa", "ps"]),
    ("JHN", "John", "NT", 43, ["john", "jn", "jhn"]),
    ("ROM", "Romans", "NT", 45, ["romans", "rom"]),
    ("ISA", "Isaiah", "OT", 23, ["isaiah", "isa"]),
]

for osis, name, testament, order, aliases in books:
    cur.execute(
        "INSERT INTO books(osis_id, name, testament, canonical_order) VALUES (?, ?, ?, ?)",
        (osis, name, testament, order),
    )
    book_id = cur.lastrowid
    cur.executemany(
        "INSERT INTO book_aliases(book_id, alias, normalized_alias) VALUES (?, ?, ?)",
        [(book_id, a, a.lower().replace(" ", "")) for a in aliases],
    )

cur.execute("SELECT id, code FROM translations")
translation_ids = {code: id_ for id_, code in cur.fetchall()}
cur.execute("SELECT id, osis_id FROM books")
book_ids = {osis: id_ for id_, osis in cur.fetchall()}

# NOTE: This starter seed keeps repo size small. Replace with full import for production bundles.
sample_verses = [
    ("KJV", "GEN", 1, 1, "In the beginning God created the heaven and the earth."),
    ("KJV", "PSA", 23, 1, "The LORD is my shepherd; I shall not want."),
    ("KJV", "PSA", 23, 2, "He maketh me to lie down in green pastures: he leadeth me beside the still waters."),
    ("KJV", "PSA", 23, 3, "He restoreth my soul: he leadeth me in the paths of righteousness for his name's sake."),
    ("KJV", "JHN", 3, 16, "For God so loved the world, that he gave his only begotten Son, that whosoever believeth in him should not perish, but have everlasting life."),
    ("KJV", "ROM", 8, 28, "And we know that all things work together for good to them that love God, to them who are the called according to his purpose."),
    ("KJV", "ISA", 40, 31, "But they that wait upon the LORD shall renew their strength; they shall mount up with wings as eagles; they shall run, and not be weary; and they shall walk, and not faint."),
    ("WEB", "GEN", 1, 1, "In the beginning, God created the heavens and the earth."),
    ("WEB", "PSA", 23, 1, "Yahweh is my shepherd: I shall lack nothing."),
    ("WEB", "PSA", 23, 2, "He makes me lie down in green pastures. He leads me beside still waters."),
    ("WEB", "PSA", 23, 3, "He restores my soul. He guides me in the paths of righteousness for his name's sake."),
    ("WEB", "JHN", 3, 16, "For God so loved the world, that he gave his one and only Son, that whoever believes in him should not perish, but have eternal life."),
    ("WEB", "ROM", 8, 28, "We know that all things work together for good for those who love God, to those who are called according to his purpose."),
    ("WEB", "ISA", 40, 31, "but those who wait for Yahweh will renew their strength. They will mount up with wings like eagles. They will run, and not be weary. They will walk, and not faint."),
]

cur.executemany(
    """
    INSERT INTO verses(translation_id, book_id, chapter, verse, text)
    VALUES (?, ?, ?, ?, ?)
    """,
    [
        (translation_ids[t], book_ids[b], ch, vs, txt)
        for (t, b, ch, vs, txt) in sample_verses
    ],
)

conn.commit()
conn.close()
print(f"Built {DB_PATH}")
