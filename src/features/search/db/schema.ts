export const SQLITE_SCHEMA = `
CREATE TABLE IF NOT EXISTS translations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS books (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  translation_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  testament TEXT NOT NULL,
  sort_order INTEGER NOT NULL,
  UNIQUE(translation_id, name),
  FOREIGN KEY (translation_id) REFERENCES translations(id)
);

CREATE TABLE IF NOT EXISTS verses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  translation_id INTEGER NOT NULL,
  book_id INTEGER NOT NULL,
  chapter INTEGER NOT NULL,
  verse INTEGER NOT NULL,
  text TEXT NOT NULL,
  UNIQUE(translation_id, book_id, chapter, verse),
  FOREIGN KEY (translation_id) REFERENCES translations(id),
  FOREIGN KEY (book_id) REFERENCES books(id)
);

CREATE TABLE IF NOT EXISTS book_aliases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  translation_id INTEGER NOT NULL,
  book_id INTEGER NOT NULL,
  alias TEXT NOT NULL,
  normalized_alias TEXT NOT NULL,
  UNIQUE(translation_id, normalized_alias),
  FOREIGN KEY (translation_id) REFERENCES translations(id),
  FOREIGN KEY (book_id) REFERENCES books(id)
);
`;
