import test from "node:test";
import assert from "node:assert/strict";
import { initial, validateData } from "./src/storage.js";
import { createDebt, repay, transfer } from "./src/ledger.js";

function workspaceWithTransaction() {
  const data = initial();
  data.transactions.push({
    id: "expense",
    book: data.books[0].id,
    type: "expense",
    amount: 1250,
    date: "2026-10-01",
    note: "Lunch",
    category: "Food",
  });
  return data;
}

test("Validation accepts older workspaces without optional lists", () => {
  const data = workspaceWithTransaction();
  assert.equal(validateData(data), data);
  assert.throws(() => validateData(null));
});

test("Validation rejects invalid amounts, dates, references and duplicate IDs", () => {
  for (const changes of [
    { amount: 12.5 },
    { amount: -1 },
    { date: "2026-02-31" },
    { book: "missing" },
  ]) {
    const data = workspaceWithTransaction();
    Object.assign(data.transactions[0], changes);
    assert.throws(() => validateData(data));
  }
  const data = workspaceWithTransaction();
  data.transactions.push({ ...data.transactions[0] });
  assert.throws(() => validateData(data));
});

test("Validation rejects unequal same-currency transfers and orphaned debts", () => {
  const data = initial();
  const transferred = transfer(data, {
    source: data.books[0].id,
    destination: data.books[1].id,
    amount: "10",
    date: "2026-10-01",
  });
  transferred.transactions[1].amount += 1;
  assert.throws(() => validateData(transferred));

  const borrowed = createDebt(data, {
    book: data.books[0].id,
    name: "Loan",
    person: "Example",
    direction: "borrowed",
    amount: "100",
    date: "2026-10-01",
    due: "2026-11-01",
  });
  const repaid = repay(borrowed, borrowed.debts[0], "25", "2026-10-02");
  validateData(repaid);
  repaid.transactions[1].amount = 10001;
  assert.throws(() => validateData(repaid));
  assert.throws(() => validateData({ ...borrowed, transactions: [] }));
});

test("Validation rejects oversized receipts and invalid optional settings", () => {
  const data = workspaceWithTransaction();
  data.transactions[0].receipt = {
    name: "receipt.png",
    type: "image/png",
    content: "data:image/png;base64,AA==",
    size: 300001,
  };
  assert.throws(() => validateData(data));
  delete data.transactions[0].receipt;
  data.profile.timeout = 0;
  assert.throws(() => validateData(data));
});
