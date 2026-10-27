import { currencies } from "./currency.js";
function isText(value, maximumLength) {
  return typeof value === "string" && value.length <= maximumLength;
}
function isPositiveAmount(value) {
  return Number.isSafeInteger(value) && value > 0;
}
function isDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  if (!Number.isFinite(Date.parse(value))) {
    return false;
  }
  return new Date(value).toISOString().slice(0, 10) === value;
}
function validateProfile(profile) {
  if (!profile || !isText(profile.name, 50) || !profile.name.trim()) {
    throw new Error("Invalid profile name");
  }
  if (!currencies.includes(profile.currency)) {
    throw new Error("Invalid profile currency");
  }
  if (![5, 15, 30, 60].includes(profile.timeout)) {
    throw new Error("Invalid auto-lock timeout");
  }
}
function validateBooks(books) {
  const bookIds = new Set();
  for (const book of books) {
    if (!isText(book.id, 80) || !book.id || bookIds.has(book.id)) {
      throw new Error("Invalid or duplicate cashbook identifier");
    }
    if (!isText(book.name, 50) || !book.name.trim() || !isText(book.kind, 50)) {
      throw new Error("Invalid cashbook name or purpose");
    }
    if (
      !currencies.includes(book.currency) ||
      !Number.isSafeInteger(book.budget) ||
      book.budget < 0
    ) {
      throw new Error("Invalid cashbook currency or budget");
    }
    bookIds.add(book.id);
  }
  return bookIds;
}
function validateTransactions(transactions, bookIds) {
  const transactionIds = new Set();
  for (const transaction of transactions) {
    if (
      !isText(transaction.id, 80) ||
      !transaction.id ||
      transactionIds.has(transaction.id)
    ) {
      throw new Error("Invalid or duplicate transaction identifier");
    }
    if (
      !isPositiveAmount(transaction.amount) ||
      !["income", "expense"].includes(transaction.type)
    ) {
      throw new Error("Invalid transaction amount or direction");
    }
    if (!bookIds.has(transaction.book) || !isDate(transaction.date)) {
      throw new Error("Invalid transaction cashbook or date");
    }
    if (!isText(transaction.note, 200) || !isText(transaction.category, 80)) {
      throw new Error("Invalid transaction description or category");
    }
    if (transaction.person != null && !isText(transaction.person, 80)) {
      throw new Error("Invalid transaction person");
    }
    if (transaction.due && !isDate(transaction.due)) {
      throw new Error("Invalid due date");
    }
    transactionIds.add(transaction.id);
  }
}
function validateRecurring(rule, bookIds) {
  if (
    !isText(rule.id, 80) ||
    !isText(rule.name, 100) ||
    !bookIds.has(rule.book)
  ) {
    throw new Error("Invalid recurring schedule details");
  }
  if (
    !isPositiveAmount(rule.amount) ||
    !isDate(rule.next) ||
    !["income", "expense"].includes(rule.type)
  ) {
    throw new Error("Invalid recurring amount, date or direction");
  }
  if (!["weekly", "monthly", "yearly"].includes(rule.frequency)) {
    throw new Error("Invalid recurring frequency");
  }
  if (
    !Number.isInteger(rule.anchor) ||
    rule.anchor < 1 ||
    rule.anchor > 31 ||
    typeof rule.active !== "boolean"
  ) {
    throw new Error("Invalid recurring schedule settings");
  }
}
function validateGoal(goal, bookIds) {
  if (
    !isText(goal.id, 80) ||
    !isText(goal.name, 80) ||
    !bookIds.has(goal.book)
  ) {
    throw new Error("Invalid savings goal details");
  }
  if (
    !isPositiveAmount(goal.target) ||
    !Number.isSafeInteger(goal.saved) ||
    goal.saved < 0 ||
    !isDate(goal.date)
  ) {
    throw new Error("Invalid savings goal amount or date");
  }
}
function validateDebt(debt, books, transactions) {
  const book = books.find((book) => book.id === debt.book);
  if (
    !isText(debt.id, 80) ||
    !isText(debt.name, 100) ||
    !isText(debt.person, 80) ||
    !book
  ) {
    throw new Error("Invalid debt details");
  }
  if (
    !isPositiveAmount(debt.amount) ||
    !isDate(debt.date) ||
    !isDate(debt.due)
  ) {
    throw new Error("Invalid debt amount or date");
  }
  if (
    !["borrowed", "lent"].includes(debt.direction) ||
    debt.currency !== book.currency
  ) {
    throw new Error("Invalid debt direction or currency");
  }

  // A debt must have one original entry; repayments cannot exceed it.
  const entries = transactions.filter(
    (transaction) => transaction.debt === debt.id,
  );
  const principalEntries = entries.filter(
    (transaction) => !transaction.repayment,
  );
  const repayments = entries.filter((transaction) => transaction.repayment);
  const principalType = debt.direction === "borrowed" ? "income" : "expense";
  const repaymentType = debt.direction === "borrowed" ? "expense" : "income";
  if (principalEntries.length !== 1) {
    throw new Error("A debt must have one principal entry");
  }
  const principal = principalEntries[0];
  if (
    principal.amount !== debt.amount ||
    principal.book !== debt.book ||
    principal.type !== principalType
  ) {
    throw new Error("Debt and principal entry must remain consistent");
  }
  let repaidAmount = 0;
  for (const repayment of repayments) {
    if (repayment.book !== debt.book || repayment.type !== repaymentType) {
      throw new Error("Invalid debt repayment entry");
    }
    repaidAmount += repayment.amount;
  }
  if (repaidAmount > debt.amount) {
    throw new Error("Debt repayments exceed the original amount");
  }
}
function validateReceipt(receipt) {
  if (
    !isText(receipt.name, 100) ||
    !["image/jpeg", "image/png", "application/pdf"].includes(receipt.type)
  ) {
    throw new Error("Invalid receipt name or type");
  }
  if (
    typeof receipt.content !== "string" ||
    !receipt.content.startsWith(`data:${receipt.type};base64,`) ||
    receipt.content.length > 410000
  ) {
    throw new Error("Invalid receipt content");
  }
  if (
    !Number.isSafeInteger(receipt.size) ||
    receipt.size < 0 ||
    receipt.size > 300000
  ) {
    throw new Error("Invalid receipt size");
  }
}
function validateTransfers(transactions, books) {
  const pairs = new Map();
  for (const transaction of transactions) {
    if (!transaction.transfer) {
      continue;
    }
    if (!isText(transaction.transfer, 80)) {
      throw new Error("Invalid transfer identifier");
    }
    const pair = pairs.get(transaction.transfer) || [];
    pair.push(transaction);
    pairs.set(transaction.transfer, pair);
  }
  for (const pair of pairs.values()) {
    if (pair.length !== 2) {
      throw new Error("A transfer must keep its matching debit and credit");
    }
    const [first, second] = pair;
    if (
      first.book === second.book ||
      first.type === second.type ||
      first.date !== second.date
    ) {
      throw new Error(
        "A transfer needs different cashbooks, opposite directions and the same date",
      );
    }
    const firstBook = books.find((book) => book.id === first.book);
    const secondBook = books.find((book) => book.id === second.book);
    if (
      firstBook.currency === secondBook.currency &&
      first.amount !== second.amount
    ) {
      throw new Error(
        "A transfer in the same currency must have equal amounts",
      );
    }
  }
}
export function validateData(data) {
  if (!data || typeof data !== "object") {
    throw new Error("Invalid backup contents");
  }
  validateProfile(data.profile);
  if (
    !Array.isArray(data.books) ||
    !data.books.length ||
    data.books.length > 1000
  ) {
    throw new Error("Invalid cashbook list");
  }
  if (!Array.isArray(data.transactions) || data.transactions.length > 50000) {
    throw new Error("Invalid transaction list");
  }
  const bookIds = validateBooks(data.books);
  validateTransactions(data.transactions, bookIds);
  for (const field of ["recurring", "goals", "debts", "history"]) {
    const entries = data[field];
    if (entries === undefined) {
      continue;
    } // Older backups may not have these lists.
    const limit = field === "history" ? 200 : 1000;
    if (!Array.isArray(entries) || entries.length > limit) {
      throw new Error("Invalid " + field);
    }
    if (
      field !== "history" &&
      new Set(entries.map((entry) => entry.id)).size !== entries.length
    ) {
      throw new Error("Duplicate " + field + " identifier");
    }
  }
  for (const rule of data.recurring || []) {
    validateRecurring(rule, bookIds);
  }
  for (const goal of data.goals || []) {
    validateGoal(goal, bookIds);
  }
  for (const debt of data.debts || []) {
    validateDebt(debt, data.books, data.transactions);
  }
  for (const transaction of data.transactions) {
    if (transaction.receipt) {
      validateReceipt(transaction.receipt);
    }
  }
  validateTransfers(data.transactions, data.books);
  for (const event of data.history || []) {
    if (
      !isText(event.id, 80) ||
      !isText(event.label, 200) ||
      !isText(event.at, 40) ||
      !Array.isArray(event.changes)
    ) {
      throw new Error("Invalid history");
    }
  }
  return data;
}
