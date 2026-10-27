import { confirmAction } from "../dialogs";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Plus,
  Trash2,
  Pencil,
} from "lucide-react";
import { money } from "../storage";
export default function TransactionTable({
  selected,
  data,
  unit,
  setModal,
  busy,
  runAction,
  save,
}) {
  async function deleteTransaction(transaction) {
    let message =
      "Delete this transaction? You can restore it from Import & history.";
    if (transaction.transfer) {
      message = "Delete both sides of this wallet transfer?";
    }
    const confirmed = await confirmAction(message);
    if (!confirmed) {
      return;
    }
    await runAction(async () => {
      const transactions = data.transactions.filter((entry) => {
        if (transaction.transfer) {
          return entry.transfer !== transaction.transfer;
        }
        return entry.id !== transaction.id;
      });
      await save({
        ...data,
        transactions,
      });
    });
  }
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Transaction</th>
            <th>Cashbook</th>
            <th>Date</th>
            <th>Amount</th>
            <th className="no-print">Actions</th>
          </tr>
        </thead>
        <tbody>
          {selected.map((transaction) => (
            <tr key={transaction.id}>
              <td>
                <div className="transaction-name">
                  <span className={`transaction-icon ${transaction.type}`}>
                    {transaction.type === "income" ? (
                      <ArrowDownLeft size={19} />
                    ) : (
                      <ArrowUpRight size={19} />
                    )}
                  </span>
                  <div>
                    <strong>{transaction.note || transaction.category}</strong>
                    <small>
                      {transaction.category}
                      {transaction.person && ` · ${transaction.person}`}
                      {transaction.due && ` · Due ${transaction.due}`}
                    </small>
                  </div>
                </div>
              </td>
              <td>
                {
                  data.books.find(
                    (cashbook) => cashbook.id === transaction.book,
                  )?.name
                }
              </td>
              <td>{transaction.date}</td>
              <td className={transaction.type}>
                {transaction.type === "income" ? "+" : "−"}
                {money(transaction.amount, unit)}
              </td>
              <td className="no-print">
                <button
                  disabled={!!transaction.transfer || !!transaction.debt}
                  aria-label={`Edit ${transaction.note || transaction.category}`}
                  className="icon"
                  onClick={async () =>
                    setModal({
                      kind: "transaction",
                      value: transaction,
                    })
                  }
                >
                  <Pencil size={15} />
                </button>
                <button
                  aria-label={`Delete ${transaction.note || transaction.category}`}
                  className="icon"
                  disabled={busy || !!transaction.debt}
                  onClick={() => deleteTransaction(transaction)}
                >
                  <Trash2 size={15} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!selected.length && (
        <div className="empty">
          <div className="empty-icon">
            <ArrowDownLeft />
          </div>
          <h3>A fresh page for your money</h3>
          <p>
            No transactions match this view. Add your first entry or adjust the
            filters.
          </p>
          <button
            onClick={async () =>
              setModal({
                kind: "transaction",
              })
            }
          >
            <Plus size={16} /> Add transaction
          </button>
        </div>
      )}
    </div>
  );
}
