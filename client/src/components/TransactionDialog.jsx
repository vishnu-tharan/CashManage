import { X } from "lucide-react";
import { digits, currencies, today } from "../storage";
import { categories, kinds } from "../domain/constants.js";
import { Field } from "../components/forms";
export default function TransactionDialog({
  setModal,
  modal,
  runAction,
  save,
  data,
  unit,
  book,
  busy,
  message,
}) {
  function handleSubmit(event) {
    event.preventDefault();
    const formValues = Object.fromEntries(new FormData(event.target));
    runAction(async () => {
      if (modal.kind === "book") {
        const value = {
          ...formValues,
          id: modal.value?.id || crypto.randomUUID(),
          budget: Math.round(
            Number(formValues.budget || 0) * 10 ** digits(formValues.currency),
          ),
        };
        await save({
          ...data,
          books: modal.value
            ? data.books.map((cashbook) =>
                cashbook.id === value.id ? value : cashbook,
              )
            : [...data.books, value],
        });
      } else {
        const cashbook = data.books.find(
          (candidateBook) => candidateBook.id === formValues.book,
        );
        const amount = Math.round(
          Number(formValues.amount) * 10 ** digits(cashbook.currency),
        );
        if (!Number.isSafeInteger(amount) || amount <= 0) {
          throw new Error("Enter a valid positive amount");
        }
        const value = {
          ...modal.value,
          ...formValues,
          amount,
          id: modal.value?.id || crypto.randomUUID(),
        };
        await save({
          ...data,
          transactions: modal.value
            ? data.transactions.map((transaction) =>
                transaction.id === value.id ? value : transaction,
              )
            : [...data.transactions, value],
        });
      }
      setModal(null);
    });
  }
  return (
    <div
      className="modal-overlay"
      onClick={(event) =>
        event.target === event.currentTarget && setModal(null)
      }
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        className="modal"
      >
        <div className="card-heading">
          <h2 id="modal-title">
            {modal.value ? "Edit" : "New"}{" "}
            {modal.kind === "book" ? "cashbook" : "transaction"}
          </h2>
          <button
            aria-label="Close dialog"
            className="icon"
            onClick={async () => setModal(null)}
          >
            <X />
          </button>
        </div>
        <form onSubmit={handleSubmit}>
          {modal.kind === "book" ? (
            <>
              <Field label="Cashbook name">
                <input
                  autoFocus
                  name="name"
                  required
                  maxLength={50}
                  defaultValue={modal.value?.name}
                />
              </Field>
              <Field label="Purpose">
                <select name="kind" defaultValue={modal.value?.kind}>
                  {kinds.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </Field>
              <Field label="Currency (fixed after creation)">
                <select
                  name="currency"
                  defaultValue={modal.value?.currency || unit}
                >
                  {(modal.value ? [modal.value.currency] : currencies).map(
                    (c) => (
                      <option key={c}>{c}</option>
                    ),
                  )}
                </select>
              </Field>
              <Field label="Monthly expense budget (0 = no budget)">
                <input
                  type="number"
                  name="budget"
                  min="0"
                  max="1000000000"
                  step="0.01"
                  defaultValue={
                    modal.value
                      ? modal.value.budget / 10 ** digits(modal.value.currency)
                      : 0
                  }
                />
              </Field>
            </>
          ) : (
            <>
              <div className="form-row">
                <Field label="Type">
                  <select
                    name="type"
                    defaultValue={modal.value?.type || "expense"}
                  >
                    <option value="income">Income (+)</option>
                    <option value="expense">Expense (−)</option>
                  </select>
                </Field>
                <Field label="Cashbook">
                  <select
                    name="book"
                    defaultValue={
                      modal.value?.book ||
                      (book !== "all" ? book : data.books[0].id)
                    }
                  >
                    {data.books.map((cashbook) => (
                      <option key={cashbook.id} value={cashbook.id}>
                        {cashbook.name} ({cashbook.currency})
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
              <div className="form-row">
                <Field label="Amount">
                  <input
                    autoFocus
                    name="amount"
                    required
                    type="number"
                    min="0.01"
                    max="1000000000"
                    step="0.01"
                    defaultValue={
                      modal.value
                        ? modal.value.amount /
                          10 **
                            digits(
                              data.books.find(
                                (cashbook) => cashbook.id === modal.value.book,
                              ).currency,
                            )
                        : ""
                    }
                  />
                </Field>
                <Field label="Date">
                  <input
                    name="date"
                    type="date"
                    required
                    defaultValue={modal.value?.date || today()}
                  />
                </Field>
              </div>
              <Field label="Category">
                <select name="category" defaultValue={modal.value?.category}>
                  {categories.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </Field>
              <Field label="Description">
                <input
                  name="note"
                  maxLength={200}
                  placeholder="What was it for?"
                  defaultValue={modal.value?.note}
                />
              </Field>
              <div className="form-row">
                <Field label="Person (optional)">
                  <input
                    name="person"
                    maxLength={80}
                    defaultValue={modal.value?.person}
                  />
                </Field>
                <Field label="Due date (optional)">
                  <input
                    name="due"
                    type="date"
                    defaultValue={modal.value?.due}
                  />
                </Field>
              </div>
            </>
          )}
          <button className="primary wide" disabled={busy}>
            {busy ? "Saving…" : "Save " + modal.kind}
          </button>
          {message && <p role="alert">{message}</p>}
        </form>
      </section>
    </div>
  );
}
