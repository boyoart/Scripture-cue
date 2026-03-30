INSERT INTO translations(id, code, name) VALUES (1, 'KJV', 'King James Version');

INSERT INTO books(id, translation_id, name, testament, sort_order) VALUES
  (1, 1, 'Psalm', 'OT', 19),
  (2, 1, 'John', 'NT', 43),
  (3, 1, 'Romans', 'NT', 45),
  (4, 1, 'Isaiah', 'OT', 23),
  (5, 1, '1 Corinthians', 'NT', 46),
  (6, 1, '2 Timothy', 'NT', 55);

INSERT INTO book_aliases(id, translation_id, book_id, alias, normalized_alias) VALUES
  (1, 1, 1, 'Psalm', 'psalm'),
  (2, 1, 1, 'Psalms', 'psalms'),
  (3, 1, 2, 'John', 'john'),
  (4, 1, 3, 'Romans', 'romans'),
  (5, 1, 4, 'Isaiah', 'isaiah'),
  (6, 1, 5, '1 Corinthians', '1 corinthians'),
  (7, 1, 5, 'First Corinthians', 'first corinthians'),
  (8, 1, 6, '2 Timothy', '2 timothy'),
  (9, 1, 6, 'Second Timothy', 'second timothy');

INSERT INTO verses(id, translation_id, book_id, chapter, verse, text) VALUES
  (1, 1, 1, 23, 1, 'The LORD is my shepherd; I shall not want.'),
  (2, 1, 1, 23, 2, 'He maketh me to lie down in green pastures: he leadeth me beside the still waters.'),
  (3, 1, 1, 23, 3, 'He restoreth my soul: he leadeth me in the paths of righteousness for his name''s sake.'),
  (4, 1, 2, 3, 16, 'For God so loved the world, that he gave his only begotten Son, that whosoever believeth in him should not perish, but have everlasting life.'),
  (5, 1, 3, 8, 28, 'And we know that all things work together for good to them that love God, to them who are the called according to his purpose.'),
  (6, 1, 4, 40, 31, 'But they that wait upon the LORD shall renew their strength; they shall mount up with wings as eagles; they shall run, and not be weary; and they shall walk, and not faint.'),
  (7, 1, 5, 13, 4, 'Charity suffereth long, and is kind; charity envieth not; charity vaunteth not itself, is not puffed up.'),
  (8, 1, 6, 1, 7, 'For God hath not given us the spirit of fear; but of power, and of love, and of a sound mind.');
