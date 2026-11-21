// Offline check of the Ask-the-coach grounding guard. Run: node --test tests/grounding.test.ts
import assert from "node:assert/strict";
import test from "node:test";
import { check, facts, numbersIn } from "../lib/grounding.ts";

const data = {
  metrics_window: ["2026-10-04", "2026-10-31"],
  ranking: [{ name: "Tushar N.", salesperson_id: "SP1015", store_id: "LKO-01", revenue: 699788, abv: 11287, conversion: 0.1046 }],
  card: "Ask Sumit A. to call 10 of Imran C.'s customers on Sat 31 Oct.",
};
const f = facts(data);

test("number formats the model uses are grounded", () => {
  for (const a of [
    "Tushar N. (SP1015, LKO-01) leads with ₹699,788 for 4–31 Oct.",
    "Tushar N. leads with ₹6,99,788.",
    "Tushar N. leads with ₹6.99 lakh, ABV ₹11,287.",
    "LKO-01 conversion is 10.46% (10.5%).",
    "Sumit A. should call 10 customers on Sat 31 Oct.",
    "तुषार ने ₹६,९९,७८८ की बिक्री की।",
  ]) assert.deepEqual(check(a, f), { ok: true, bad: [] }, a);
});

test("invented numbers, ids and names are caught", () => {
  assert.deepEqual(check("LKO-01 made ₹99 lakh.", f).bad, ["99"]);
  assert.deepEqual(check("LKO-09 is behind.", f).bad, ["LKO-09"]);
  assert.deepEqual(check("SP9999 is the best.", f).bad, ["SP9999"]);
  assert.deepEqual(check("Rahul K. is the best.", f).bad, ["Rahul K."]);
  assert.equal(check("Conversion was 23.7%.", f).ok, false);
});

test("Indic digits and commas normalise", () => {
  assert.deepEqual(numbersIn("₹६,९९,७८८ and ೧೦.೪೬%"), ["699788", "10.46"]);
});
