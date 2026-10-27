import { Wallet, Plus, Pencil } from "lucide-react";
import { money, today } from "../storage";
export default function CashbooksPage({
  setModal,
  data,
  setUnit,
  setBook,
  setPage,
  setRange,
}) {
  return (
    <>
      <div className="section-heading">
        <h3>A place for every purpose</h3>
        <button
          onClick={async () =>
            setModal({
              kind: "book",
            })
          }
        >
          <Plus size={17} />
          New cashbook
        </button>
      </div>
      <div className="book-grid">
        {data.books.map((cashbook) => {
          const transactions = data.transactions.filter(
            (transaction) => transaction.book === cashbook.id,
          );
          const total = transactions.reduce(
            (s, transaction) =>
              s +
              (transaction.type === "income"
                ? transaction.amount
                : -transaction.amount),
            0,
          );
          const spent = transactions
            .filter(
              (transaction) =>
                transaction.type === "expense" &&
                !transaction.transfer &&
                transaction.date.startsWith(today().slice(0, 7)),
            )
            .reduce((s, transaction) => s + transaction.amount, 0);
          return (
            <article className="card book-card" key={cashbook.id}>
              <div className="card-heading">
                <span className="book-icon">
                  <Wallet />
                </span>
                <button
                  className="icon"
                  aria-label={`Edit ${cashbook.name}`}
                  onClick={async () =>
                    setModal({
                      kind: "book",
                      value: cashbook,
                    })
                  }
                >
                  <Pencil size={16} />
                </button>
              </div>
              <span className="eyebrow">{cashbook.kind}</span>
              <h3>{cashbook.name}</h3>
              <h2>{money(total, cashbook.currency)}</h2>
              <p>
                {cashbook.kind.startsWith("Borrowed")
                  ? "Positive balance = remaining amount to return"
                  : cashbook.kind.startsWith("Lent")
                    ? "Negative balance = amount still owed to you"
                    : `${transactions.length} transactions · ${cashbook.currency}`}
              </p>
              {cashbook.budget > 0 && (
                <>
                  <progress max={cashbook.budget} value={spent} />
                  <small className={spent > cashbook.budget ? "expense" : ""}>
                    {money(spent, cashbook.currency)} of{" "}
                    {money(cashbook.budget, cashbook.currency)} monthly budget
                  </small>
                </>
              )}
              <button
                onClick={async () => {
                  setUnit(cashbook.currency);
                  setBook(cashbook.id);
                  setPage("Transactions");
                  setRange("all");
                }}
              >
                View cashbook →
              </button>
            </article>
          );
        })}
      </div>
      <div className="notice">
        Debt books: record borrowed money as income and repayments as expenses.
        Record money lent as an expense and repayments received as income. Add a
        person and due date to track who and when.
      </div>
    </>
  );
}
