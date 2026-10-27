import test from "node:test";
import assert from "node:assert/strict";
import { initial, validateData } from "./src/storage.js";
import {
  transfer,
  amountOf,
  nextDate,
  postRecurring,
  record,
  undo,
  createDebt,
  repay,
  debtRemaining,
  prepareImport,
  parseCSV,
  mergeVersions,
  budgetAlerts,
} from "./src/ledger.js";
test("Transfers preserve total cash and reject broken pairs", () => {
  const data = initial();
  const updatedData = transfer(data, {
    source: data.books[0].id,
    destination: data.books[1].id,
    amount: "150.25",
    date: "2026-09-12",
  });
  assert.equal(updatedData.transactions.length, 2);
  assert.equal(
    updatedData.transactions.reduce(
      (total, transaction) =>
        total +
        (transaction.type === "income"
          ? transaction.amount
          : -transaction.amount),
      0,
    ),
    0,
  );
  validateData(updatedData);
  assert.throws(() =>
    validateData({
      ...updatedData,
      transactions: updatedData.transactions.slice(1),
    }),
  );
  assert.throws(() =>
    transfer(data, {
      source: data.books[0].id,
      destination: data.books[0].id,
      amount: "1",
    }),
  );
  assert.throws(() => amountOf("1.234", "USD"));
  assert.throws(() => amountOf("1.5", "JPY"));
});
test("Monthly recurrence clamps days without drifting, and posts once", () => {
  assert.equal(nextDate("2024-01-31", "monthly", 31), "2024-02-29");
  assert.equal(nextDate("2024-02-29", "monthly", 31), "2024-03-31");
  const data = initial();
  data.recurring = [
    {
      id: "rent",
      name: "Rent",
      book: data.books[0].id,
      type: "expense",
      amount: 10000,
      category: "Bills",
      next: "2026-01-31",
      frequency: "monthly",
      anchor: 31,
      active: true,
    },
  ];
  const result = postRecurring(data, "2026-03-31");
  assert.equal(result.count, 3);
  assert.equal(result.data.recurring[0].next, "2026-04-30");
  assert.equal(postRecurring(result.data, "2026-03-31").count, 0);
  validateData(result.data);
});
test("Partial debt repayment cannot exceed outstanding amount", () => {
  const data = initial();
  const updatedData = createDebt(data, {
    name: "Loan",
    person: "Test",
    book: data.books[0].id,
    direction: "borrowed",
    amount: "100",
    date: "2026-09-01",
    due: "2026-10-01",
  });
  const debt = updatedData.debts[0];
  const result = repay(updatedData, debt, "30", "2026-09-12");
  assert.equal(debtRemaining(result, debt), 7000);
  assert.throws(() => repay(result, debt, "71", "2026-09-12"));
  validateData(result);
});
test("Undo restores a deleted entry and refuses stale edits", () => {
  const data = initial();
  data.transactions = [
    {
      id: "t",
      book: data.books[0].id,
      type: "income",
      amount: 100,
      date: "2026-09-12",
      note: "Test",
      category: "Other",
    },
  ];
  const updatedData = record(
    data,
    {
      ...data,
      transactions: [],
    },
    "Delete",
  );
  assert.deepEqual(
    undo(updatedData, updatedData.history[0]).transactions,
    data.transactions,
  );
  assert.throws(() =>
    undo(
      {
        ...updatedData,
        transactions: [
          {
            ...data.transactions[0],
            amount: 200,
          },
        ],
      },
      updatedData.history[0],
    ),
  );
});
test("CSV quoting, duplicate detection, invalid dates and currencies", () => {
  const rows = parseCSV(
    'date,amount,type,note,currency\r\n2026-09-12,10,expense,"Lunch, coffee",LKR\r\n2026-09-12,10,expense,"Lunch, coffee",LKR\r\n2026-02-31,1,expense,x,LKR\r\n2026-09-12,1,expense,x,USD',
  );
  const data = initial();
  const result = prepareImport(data, rows, data.books[0].id);
  assert.equal(result.accepted.length, 1);
  assert.equal(result.accepted[0].note, "Lunch, coffee");
  assert.equal(result.duplicates, 1);
  assert.equal(result.errors.length, 2);
  assert.equal(
    prepareImport(
      {
        ...data,
        transactions: result.accepted,
      },
      rows,
      data.books[0].id,
    ).accepted.length,
    0,
  );
});
test("Explicit merge choices handle remote-only deletions", () => {
  const data = initial();
  const remote = {
    ...data,
    transactions: [
      {
        id: "remote",
      },
    ],
  };
  const local = {
    ...data,
    transactions: [
      {
        id: "local",
      },
    ],
  };
  const mergedData = mergeVersions(local, remote, {
    "transactions:remote": "delete",
  });
  assert.deepEqual(mergedData.transactions, [
    {
      id: "local",
    },
  ]);
});
test("Budget alerts exclude outgoing transfers", () => {
  const data = initial();
  data.books[0].budget = 10000;
  const updatedData = transfer(data, {
    source: data.books[0].id,
    destination: data.books[1].id,
    amount: "100",
    date: "2026-09-12",
  });
  assert.equal(budgetAlerts(updatedData, "2026-09").length, 0);
  updatedData.transactions.push({
    book: data.books[0].id,
    type: "expense",
    amount: 8500,
    date: "2026-09-12",
  });
  assert.equal(budgetAlerts(updatedData, "2026-09")[0].percent, 85);
});
