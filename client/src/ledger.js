import { digits } from "./storage.js";
export const uid = () => crypto.randomUUID();
export const isCashFlow = (transaction) => !transaction.transfer;
export function amountOf(value, currency) {
  // Store cents (or the equivalent currency unit) as whole numbers.
  const amount = Number(value) * 10 ** digits(currency);
  const roundedAmount = Math.round(amount);
  const hasExtraDecimals = Math.abs(amount - roundedAmount) > 0.00001;
  if (
    !Number.isFinite(amount) ||
    !Number.isSafeInteger(roundedAmount) ||
    hasExtraDecimals ||
    amount <= 0
  ) {
    throw new Error(
      "Enter a positive amount with the correct currency precision",
    );
  }
  return roundedAmount;
}
export function upgrade(data) {
  return {
    ...data,
    recurring: data.recurring || [],
    goals: data.goals || [],
    debts: data.debts || [],
    history: data.history || [],
  };
}
export function record(before, next, label = "Workspace updated") {
  const previous = new Map(
    before.transactions.map((transaction) => [transaction.id, transaction]),
  );
  const after = new Map(
    next.transactions.map((transaction) => [transaction.id, transaction]),
  );
  const changes = [];
  for (const id of new Set([...previous.keys(), ...after.keys()])) {
    if (JSON.stringify(previous.get(id)) !== JSON.stringify(after.get(id))) {
      changes.push({
        id,
        before: previous.get(id) || null,
        after: after.get(id) || null,
      });
    }
  }
  const result = {
    ...upgrade(next),
    history: [
      {
        id: uid(),
        at: new Date().toISOString(),
        label,
        changes,
      },
      ...(next.history || before.history || []),
    ].slice(0, 200),
  };
  while (result.history.length && JSON.stringify(result).length > 1800000) {
    result.history.pop();
  }
  return result;
}
export function undo(data, event) {
  if (!event.changes.length) {
    throw new Error("This event has no transaction changes to undo");
  }
  let transactions = [...data.transactions];
  for (const change of event.changes) {
    const currentTransaction =
      transactions.find((transaction) => transaction.id === change.id) || null;
    if (JSON.stringify(currentTransaction) !== JSON.stringify(change.after)) {
      throw new Error(
        "A transaction changed later. Review its current value before undoing.",
      );
    }
    transactions = transactions.filter(
      (transaction) => transaction.id !== change.id,
    );
    if (change.before) {
      transactions.push(change.before);
    }
  }
  let debts = data.debts || [];
  for (const change of event.changes) {
    if (!change.before && change.after?.debt && !change.after.repayment) {
      const id = change.after.debt;
      if (transactions.some((transaction) => transaction.debt === id)) {
        throw new Error("Undo the repayments before undoing this debt");
      }
      debts = debts.filter((debt) => debt.id !== id);
    }
  }
  return {
    ...data,
    debts,
    transactions: transactions,
  };
}
export function transfer(data, input) {
  const source = data.books.find((cashbook) => cashbook.id === input.source);
  const destination = data.books.find(
    (cashbook) => cashbook.id === input.destination,
  );
  if (!source || !destination || source.id === destination.id) {
    throw new Error("Choose two different cashbooks");
  }
  const amount = amountOf(input.amount, source.currency);
  const received =
    source.currency === destination.currency
      ? amount
      : amountOf(input.received, destination.currency);
  const id = uid();
  const base = {
    date: input.date,
    category: "Transfer",
    note: input.note || `${source.name} → ${destination.name}`,
    transfer: id,
    person: "",
    due: "",
  };
  return {
    ...data,
    transactions: [
      ...data.transactions,
      {
        ...base,
        id: uid(),
        book: source.id,
        type: "expense",
        amount,
      },
      {
        ...base,
        id: uid(),
        book: destination.id,
        type: "income",
        amount: received,
      },
    ],
  };
}
export function nextDate(date, frequency, anchor) {
  const currentDate = new Date(`${date}T12:00:00Z`);
  if (frequency === "weekly") {
    currentDate.setUTCDate(currentDate.getUTCDate() + 7);
  } else {
    // Keep the original day when a shorter month needs a temporary adjustment.
    const day = anchor || currentDate.getUTCDate();
    currentDate.setUTCDate(1);
    currentDate.setUTCMonth(
      currentDate.getUTCMonth() + (frequency === "yearly" ? 12 : 1),
    );
    const last = new Date(
      Date.UTC(currentDate.getUTCFullYear(), currentDate.getUTCMonth() + 1, 0),
    ).getUTCDate();
    currentDate.setUTCDate(Math.min(day, last));
  }
  return currentDate.toISOString().slice(0, 10);
}
export function postRecurring(data, date) {
  let transactions = [...data.transactions];
  let count = 0;
  const recurring = (data.recurring || []).map((rule) => {
    let next = rule.next;
    if (!rule.active) {
      return rule;
    }
    let steps = 0;
    while (next <= date && steps++ < 366) {
      // A stable ID prevents the same scheduled entry from being posted twice.
      const id = `rec:${rule.id}:${next}`;
      if (!transactions.some((transaction) => transaction.id === id)) {
        transactions.push({
          id,
          book: rule.book,
          type: rule.type,
          amount: rule.amount,
          date: next,
          category: rule.category,
          note: rule.name,
          person: "",
          due: "",
          recurring: rule.id,
        });
        count++;
      }
      next = nextDate(next, rule.frequency, rule.anchor);
    }
    return {
      ...rule,
      next,
    };
  });
  return {
    data: {
      ...data,
      transactions: transactions,
      recurring,
    },
    count,
  };
}
export function debtRemaining(data, debt) {
  return (
    debt.amount -
    data.transactions
      .filter(
        (transaction) => transaction.debt === debt.id && transaction.repayment,
      )
      .reduce((total, transaction) => total + transaction.amount, 0)
  );
}
export function createDebt(data, input) {
  const book = data.books.find((cashbook) => cashbook.id === input.book);
  const amount = amountOf(input.amount, book.currency);
  const id = uid();
  return {
    ...data,
    debts: [
      ...(data.debts || []),
      {
        ...input,
        id,
        amount,
        currency: book.currency,
      },
    ],
    transactions: [
      ...data.transactions,
      {
        id: uid(),
        book: book.id,
        type: input.direction === "borrowed" ? "income" : "expense",
        amount,
        date: input.date,
        category: "Debt",
        note: input.name,
        person: input.person,
        due: input.due,
        debt: id,
      },
    ],
  };
}
export function repay(data, debt, value, date) {
  const amount = amountOf(value, debt.currency);
  if (amount > debtRemaining(data, debt)) {
    throw new Error("Repayment exceeds the remaining debt");
  }
  return {
    ...data,
    transactions: [
      ...data.transactions,
      {
        id: uid(),
        book: debt.book,
        type: debt.direction === "borrowed" ? "expense" : "income",
        amount,
        date,
        category: "Debt",
        note: `Repayment: ${debt.name}`,
        person: debt.person,
        due: "",
        debt: debt.id,
        repayment: true,
      },
    ],
  };
}
export function parseCSV(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const character = text[i];
    if (character === '"') {
      if (quoted && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else {
        quoted = !quoted;
      }
    } else if (character === "," && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && text[i + 1] === "\n") {
        i++;
      }
      row.push(cell);
      if (row.some((v) => v.trim())) {
        rows.push(row);
      }
      row = [];
      cell = "";
    } else {
      cell += character;
    }
  }
  if (quoted) {
    throw new Error("Unclosed CSV quotation");
  }
  row.push(cell);
  if (row.some((v) => v.trim())) {
    rows.push(row);
  }
  const headers =
    rows.shift()?.map((h) =>
      h
        .replace(/^\uFEFF/, "")
        .trim()
        .toLowerCase(),
    ) || [];
  return rows.map((r) =>
    Object.fromEntries(headers.map((h, i) => [h, r[i] || ""])),
  );
}
export function prepareImport(data, rows, bookId, mapping = {}) {
  const book = data.books.find((cashbook) => cashbook.id === bookId);
  if (!book) {
    throw new Error("Choose a destination cashbook");
  }
  const fingerprint = (transaction) =>
    JSON.stringify([
      transaction.book,
      transaction.date,
      transaction.type,
      transaction.amount,
      transaction.note.trim().toLowerCase(),
    ]);
  const known = new Set(data.transactions.map(fingerprint));
  const accepted = [];
  const errors = [];
  let duplicates = 0;
  rows.forEach((row, index) => {
    try {
      const read = (k) => row[mapping[k] || k];
      const rawAmount = String(read("amount") ?? "")
        .replace(/,/g, "")
        .trim();
      const numericAmount = Number(rawAmount);
      if (!rawAmount || !Number.isFinite(numericAmount)) {
        throw new Error("Invalid amount");
      }
      const rawType = String(read("type") || "").toLowerCase();
      if (rawType.startsWith("transfer")) {
        throw new Error(
          "Recreate wallet transfers through Planning to preserve both sides",
        );
      }
      if (
        rawType &&
        ![
          "income",
          "credit",
          "in",
          "expense",
          "outcome",
          "debit",
          "out",
        ].includes(rawType)
      ) {
        throw new Error(
          "Unknown direction; map credit/debit values to income/expense",
        );
      }
      let type = numericAmount < 0 ? "expense" : "income";
      if (["income", "credit", "in"].includes(rawType)) {
        type = "income";
      } else if (["expense", "outcome", "debit", "out"].includes(rawType)) {
        type = "expense";
      }
      const date = String(read("date") || "").slice(0, 10);
      if (
        !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
        !Number.isFinite(Date.parse(date)) ||
        new Date(date).toISOString().slice(0, 10) !== date
      ) {
        throw new Error("Date must be YYYY-MM-DD");
      }
      if (read("currency") && read("currency") !== book.currency) {
        throw new Error("Currency differs from destination wallet");
      }
      const transaction = {
        id: uid(),
        book: bookId,
        date,
        type,
        amount: amountOf(Math.abs(numericAmount), book.currency),
        note: String(read("note") || row.remark || "Imported entry").slice(
          0,
          200,
        ),
        category: String(read("category") || "Other").slice(0, 80),
        person: "",
        due: "",
      };
      const key = fingerprint(transaction);
      if (known.has(key)) {
        duplicates++;
        return;
      }
      known.add(key);
      accepted.push(transaction);
    } catch (error) {
      errors.push(`Row ${index + 2}: ${error.message}`);
    }
  });
  return {
    accepted,
    duplicates,
    errors,
  };
}
export function budgetAlerts(data, month) {
  return data.books
    .filter((cashbook) => cashbook.budget > 0)
    .map((cashbook) => {
      const spent = data.transactions
        .filter(
          (transaction) =>
            transaction.book === cashbook.id &&
            transaction.type === "expense" &&
            isCashFlow(transaction) &&
            transaction.date.startsWith(month),
        )
        .reduce((total, transaction) => total + transaction.amount, 0);
      return {
        ...cashbook,
        spent,
        percent: Math.round((spent / cashbook.budget) * 100),
      };
    })
    .filter((cashbook) => cashbook.percent >= 80);
}
export function mergeVersions(local, remote, choices = {}) {
  const result = {
    ...remote,
    profile: choices.profile === "local" ? local.profile : remote.profile,
  };
  for (const field of [
    "books",
    "transactions",
    "recurring",
    "goals",
    "debts",
    "history",
  ]) {
    const map = new Map(
      (remote[field] || []).map((entry) => [entry.id, entry]),
    );
    for (const item of local[field] || []) {
      const choice = choices[`${field}:${item.id}`];
      if (!map.has(item.id) || choice === "local") {
        map.set(item.id, item);
      }
      if (choice === "delete") {
        map.delete(item.id);
      }
    }
    for (const id of map.keys()) {
      if (choices[`${field}:${id}`] === "delete") {
        map.delete(id);
      }
    }
    result[field] = [...map.values()];
  }
  return upgrade(result);
}
