import {
  SEEDED_ALIASES,
  SEEDED_BOOKS,
  SEEDED_TRANSLATIONS,
  SEEDED_VERSES,
  type BookAliasRow,
  type BookRow,
  type TranslationRow,
  type VerseRow
} from "./seed";
import { SQLITE_SCHEMA } from "./schema";

const LOCAL_DATABASE_KEY = "scripture-cue.local-db.v1";

type LocalDatabaseState = {
  seededAt: string;
  schema: string;
  translations: TranslationRow[];
  books: BookRow[];
  aliases: BookAliasRow[];
  verses: VerseRow[];
};

export class LocalBibleDatabase {
  private state: LocalDatabaseState;

  private constructor(state: LocalDatabaseState) {
    this.state = state;
  }

  static initialize(): LocalBibleDatabase {
    const existing = window.localStorage.getItem(LOCAL_DATABASE_KEY);

    if (existing) {
      return new LocalBibleDatabase(JSON.parse(existing) as LocalDatabaseState);
    }

    const seeded: LocalDatabaseState = {
      seededAt: new Date().toISOString(),
      schema: SQLITE_SCHEMA,
      translations: SEEDED_TRANSLATIONS,
      books: SEEDED_BOOKS,
      aliases: SEEDED_ALIASES,
      verses: SEEDED_VERSES
    };

    window.localStorage.setItem(LOCAL_DATABASE_KEY, JSON.stringify(seeded));
    return new LocalBibleDatabase(seeded);
  }

  get translations() {
    return this.state.translations;
  }

  get books() {
    return this.state.books;
  }

  get aliases() {
    return this.state.aliases;
  }

  get verses() {
    return this.state.verses;
  }
}
