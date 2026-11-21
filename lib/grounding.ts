// Grounding guard for Ask-the-coach: every number, id and name in an answer must come from the DATA sent to the
// model. TS twin of engine/sarvam.py:valid. No "@/" imports so `node --test` can load it directly.

const INDIC = "०१२३४५६७८९೦೧೨೩೪೫೬೭೮೯";
const ID = /\b(?:[A-Z]{3}-\d{2}|SP\d{4}|AM-\d{2})\b/g;
const NAME = /\b[A-Z][a-z]+ [A-Z]\./g; // salesperson names are "Tushar N." style

export function numbersIn(text: string): string[] {
  const t = text.replace(/[०-९೦-೯]/g, (d) => String(INDIC.indexOf(d) % 10)).replace(/(\d),(?=\d)/g, "$1");
  return t.match(/\d+(?:\.\d+)?/g) ?? [];
}

export type Facts = { nums: number[]; ids: Set<string>; names: Set<string> };

export function facts(data: unknown): Facts {
  const nums = new Set<number>(), ids = new Set<string>(), names = new Set<string>();
  const walk = (x: unknown): void => {
    if (typeof x === "number") nums.add(x);
    else if (typeof x === "string") {
      numbersIn(x).forEach((n) => nums.add(Number(n)));
      x.match(ID)?.forEach((i) => ids.add(i));
      x.match(NAME)?.forEach((n) => names.add(n));
    } else if (x && typeof x === "object") Object.values(x).forEach(walk);
  };
  walk(data);
  return { nums: [...nums], ids, names };
}

// n is grounded if some DATA value, as written or shown as a percent / thousand / lakh / crore, rounds or
// truncates to it at n's precision. ponytail: large DATA makes small integers easy to match; ids and names
// carry the rest of the check.
export function grounded(n: string, nums: number[]): boolean {
  const want = Number(n), f = 10 ** (n.split(".")[1]?.length ?? 0);
  const near = (x: number) => Math.abs(Math.round(x * f) - want * f) < 1e-6 || Math.abs(Math.floor(x * f + 1e-9) - want * f) < 1e-6;
  return nums.some((v) =>
    near(v) || (Math.abs(v) <= 1 && near(v * 100)) || (Math.abs(v) >= 1000 && (near(v / 1e3) || near(v / 1e5) || near(v / 1e7))));
}

export function check(answer: string, f: Facts): { ok: boolean; bad: string[] } {
  const bad = [
    ...numbersIn(answer.replace(ID, "")).filter((n) => !grounded(n, f.nums)),
    ...(answer.match(ID) ?? []).filter((i) => !f.ids.has(i)),
    ...(answer.match(NAME) ?? []).filter((n) => !f.names.has(n)),
  ];
  return { ok: bad.length === 0, bad: [...new Set(bad)] };
}
