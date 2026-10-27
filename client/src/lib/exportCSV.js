import { digits } from "../domain/currency.js";
import { download } from "./download.js";

// Quote every field and prevent spreadsheet programs from executing formulas.
function quoteCell(value) {
  const text = String(value ?? "").replace(/^[\s]*[=+@-]/, "'$&");
  return '"' + text.replaceAll('"', '""') + '"';
}
export function buildCSV(books, transactions, currency) {
  const rows = [
    ["Date", "Cashbook", "Type", "Category", "Note", "Currency", "Amount"],
  ];
  for (const transaction of transactions) {
    const book = books.find((book) => book.id === transaction.book);
    const type = transaction.transfer
      ? `transfer ${transaction.type === "income" ? "in" : "out"}`
      : transaction.type;
    rows.push([
      transaction.date,
      book?.name,
      type,
      transaction.category,
      transaction.note,
      currency,
      transaction.amount / 10 ** digits(currency),
    ]);
  }
  return rows.map((row) => row.map(quoteCell).join(",")).join("\r\n");
}
export function exportCSV(books, transactions, currency) {
  download(
    "cashmanage-report.csv",
    buildCSV(books, transactions, currency),
    "text/csv",
  );
}
