const SMALL_NUMBERS: Record<string, number> = {
  zero: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
};

const TENS: Record<string, number> = {
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
};

const ORDINAL_WORDS: Record<string, string> = {
  first: "1",
  second: "2",
  third: "3",
};

function parseNumberPhrase(tokens: string[]): number | undefined {
  let total = 0;
  let current = 0;

  for (const token of tokens) {
    if (token in SMALL_NUMBERS) {
      current += SMALL_NUMBERS[token];
      continue;
    }

    if (token in TENS) {
      current += TENS[token];
      continue;
    }

    if (token === "hundred") {
      current = Math.max(current, 1) * 100;
      continue;
    }

    return undefined;
  }

  total += current;
  return total;
}

export function normalizeNumberWords(input: string): string {
  const tokens = input.split(" ");
  const normalized: string[] = [];

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];

    if (ORDINAL_WORDS[token]) {
      normalized.push(ORDINAL_WORDS[token]);
      continue;
    }

    const numberPhrase: string[] = [];
    let lookahead = index;

    while (lookahead < tokens.length) {
      const nextToken = tokens[lookahead];
      if (nextToken in SMALL_NUMBERS || nextToken in TENS || nextToken === "hundred") {
        numberPhrase.push(nextToken);
        lookahead += 1;
      } else {
        break;
      }
    }

    if (numberPhrase.length === 0) {
      normalized.push(token);
      continue;
    }

    const parsedNumber = parseNumberPhrase(numberPhrase);
    if (parsedNumber === undefined) {
      normalized.push(token);
      continue;
    }

    normalized.push(String(parsedNumber));
    index = lookahead - 1;
  }

  return normalized.join(" ");
}
