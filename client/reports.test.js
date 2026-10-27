import test from "node:test";
import assert from "node:assert/strict";
import { buildCSV } from "./src/lib/exportCSV.js";
import { getReportSummary } from "./src/domain/reportSummary.js";
const books = [
  {
    id: "wallet",
    name: "Personal wallet",
    currency: "LKR",
  },
  {
    id: "savings",
    name: "Savings",
    currency: "LKR",
  },
  {
    id: "foreign",
    name: "Travel",
    currency: "USD",
  },
];
const entry = (id, book, type, amount, extra = {}) => ({
  id,
  book,
  type,
  amount,
  date: "2026-10-01",
  category: "Other",
  note: "Entry",
  ...extra,
});
test("Reports separate currencies and exclude transfers from cash flow", () => {
  const data = {
    books,
    transactions: [
      entry("salary", "wallet", "income", 10000),
      entry("food", "wallet", "expense", 2000),
      entry("out", "wallet", "expense", 3000, {
        transfer: "pair",
      }),
      entry("in", "savings", "income", 3000, {
        transfer: "pair",
      }),
      entry("usd", "foreign", "income", 99999),
    ],
  };
  const filters = {
    data,
    unit: "LKR",
    book: "all",
    type: "all",
    from: "",
    to: "",
    search: "",
  };
  const summary = getReportSummary(filters);
  assert.equal(summary.balance, 8000);
  assert.equal(summary.income, 10000);
  assert.equal(summary.expense, 2000);
  assert.equal(summary.selected.length, 4);
  assert.equal(summary.categoryTotals[0].total, 2000);
  assert.equal(
    getReportSummary({
      ...filters,
      search: "missing",
    }).selected.length,
    0,
  );
});
test("CSV preserves precision, escapes quotes and neutralizes formulas", () => {
  const csv = buildCSV(
    books,
    [
      entry("one", "wallet", "income", 12345, {
        note: '  =SUM(1,2) "example"',
        transfer: "pair",
      }),
    ],
    "LKR",
  );
  assert.ok(csv.includes('"123.45"'));
  assert.ok(csv.includes('"transfer in"'));
  assert.ok(csv.includes('"\'  =SUM(1,2) ""example"""'));
  assert.equal(csv.split("\r\n").length, 2);
});
