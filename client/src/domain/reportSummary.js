// Transfers affect balances, but are not income or spending.
function cashFlowTotal(transactions, type) {
  return transactions
    .filter((transaction) => transaction.type === type && !transaction.transfer)
    .reduce((total, transaction) => total + transaction.amount, 0);
}
export function getReportSummary({ data, unit, book, type, from, to, search }) {
  const currencyBooks = data.books.filter(
    (cashbook) => cashbook.currency === unit,
  );
  const searchText = search.trim().toLowerCase();
  const selected = data.transactions
    .filter((transaction) => {
      const cashbook = data.books.find(
        (cashbook) => cashbook.id === transaction.book,
      );
      if (cashbook?.currency !== unit) {
        return false;
      }
      if (book !== "all" && transaction.book !== book) {
        return false;
      }
      if (type !== "all" && transaction.type !== type) {
        return false;
      }
      if (from && transaction.date < from) {
        return false;
      }
      if (to && transaction.date > to) {
        return false;
      }
      const text = `${transaction.note} ${transaction.category} ${cashbook.name} ${transaction.person || ""}`;
      return text.toLowerCase().includes(searchText);
    })
    .sort((first, second) => second.date.localeCompare(first.date));
  const income = cashFlowTotal(selected, "income");
  const expense = cashFlowTotal(selected, "expense");
  // The balance card deliberately shows all cashbooks in this currency, for all time.
  const balance = data.transactions
    .filter((transaction) =>
      currencyBooks.some((cashbook) => cashbook.id === transaction.book),
    )
    .reduce(
      (total, transaction) =>
        total +
        (transaction.type === "income"
          ? transaction.amount
          : -transaction.amount),
      0,
    );
  const spendingByCategory = new Map();
  for (const transaction of selected) {
    if (transaction.type !== "expense" || transaction.transfer) {
      continue;
    }
    const total = spendingByCategory.get(transaction.category) || 0;
    spendingByCategory.set(transaction.category, total + transaction.amount);
  }
  const categoryTotals = Array.from(spendingByCategory, ([name, total]) => ({
    name,
    total,
  })).sort((first, second) => second.total - first.total);
  const months = Array.from(
    {
      length: 6,
    },
    (_, index) => {
      const date = new Date();
      date.setDate(1);
      date.setMonth(date.getMonth() - 5 + index);
      const prefix = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      const transactions = selected.filter((transaction) =>
        transaction.date.startsWith(prefix),
      );
      return {
        label: date.toLocaleDateString(undefined, {
          month: "short",
        }),
        income: cashFlowTotal(transactions, "income"),
        expense: cashFlowTotal(transactions, "expense"),
      };
    },
  );
  const maxChart = Math.max(
    1,
    ...months.flatMap((month) => [month.income, month.expense]),
  );
  return {
    currencyBooks,
    selected,
    income,
    expense,
    balance,
    categoryTotals,
    months,
    maxChart,
  };
}
