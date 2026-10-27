import { confirmAction } from "../dialogs";
import { useState } from "react";
import { money } from "../storage";
import { parseCSV, prepareImport, undo } from "../ledger";
import { Field } from "../components/forms";
export default function ImportHistoryPage({ data, save, runAction }) {
  const [rows, setRows] = useState(null);
  const [mapping, setMapping] = useState({});
  const [target, setTarget] = useState(data.books[0].id);
  const [preview, setPreview] = useState(null);
  const books = (
    <>
      {data.books.map((cashbook) => (
        <option key={cashbook.id} value={cashbook.id}>
          {cashbook.name} ({cashbook.currency})
        </option>
      ))}
    </>
  );
  function readImportFile(event) {
    const file = event.target.files[0];
    if (!file) {
      return;
    }
    runAction(async () => {
      if (!file.name.toLowerCase().endsWith(".csv")) {
        throw new Error("Choose a CSV file. Restore encrypted backups in Settings.");
      }
      if (file.size > 2000000) {
        throw new Error("Import limit is 2 MB");
      }
      const text = await file.text();
      const parsed = parseCSV(text);
      if (!Array.isArray(parsed) || !parsed.length || parsed.length > 10000) {
        throw new Error("Choose a file with 1–10,000 transactions");
      }
      setRows(parsed);
      setPreview(null);
      setMapping({});
    });
    event.target.value = "";
  }
  function importTransactions() {
    return runAction(async () => {
      const checked = prepareImport(data, rows, target, mapping);
      await save(
        {
          ...data,
          transactions: [...data.transactions, ...checked.accepted],
        },
        `Imported ${checked.accepted.length} transactions`,
      );
      setRows(null);
      setPreview(null);
    });
  }
  function clearHistory() {
    return runAction(async () => {
      if (
        await confirmAction(
          "Clear activity history? Existing transactions stay unchanged, but older undo actions will be unavailable.",
        )
      ) {
        await save(
          {
            ...data,
            history: [],
          },
          "Cleared activity history",
        );
      }
    });
  }
  return (
    <div className="settings-grid">
      <section className="card">
        <h3>Import transactions</h3>
        <p>
          Import CSV bank statements. Map columns, inspect the
          preview, then import. Repeated entries are detected by wallet, date,
          direction, amount and description.
        </p>
        <input
          aria-label="Import CSV"
          type="file"
          accept=".csv"
          onChange={readImportFile}
        />
        {rows && (
          <>
            <Field label="Destination cashbook">
              <select
                value={target}
                onChange={(event) => {
                  setTarget(event.target.value);
                  setPreview(null);
                }}
              >
                {books}
              </select>
            </Field>
            {["date", "amount", "type", "note", "category", "currency"].map(
              (k) => (
                <Field key={k} label={`${k} column`}>
                  <select
                    value={mapping[k] || k}
                    onChange={(event) => {
                      setMapping({
                        ...mapping,
                        [k]: event.target.value,
                      });
                      setPreview(null);
                    }}
                  >
                    <option value={k}>{k} (default)</option>
                    <option value="__none__">Not in file</option>
                    {Object.keys(rows[0])
                      .filter((entry) => entry !== k)
                      .map((entry) => (
                        <option key={entry}>{entry}</option>
                      ))}
                  </select>
                </Field>
              ),
            )}
            <button
              onClick={() =>
                runAction(async () =>
                  setPreview(prepareImport(data, rows, target, mapping)),
                )
              }
            >
              Preview import
            </button>
          </>
        )}
        {preview && (
          <>
            <p>
              {preview.accepted.length} ready · {preview.duplicates} duplicates
              skipped · {preview.errors.length} invalid rows
            </p>
            {preview.errors.slice(0, 10).map((event) => (
              <p className="expense" key={event}>
                {event}
              </p>
            ))}
            {preview.accepted.slice(0, 5).map((transaction) => (
              <p key={transaction.id}>
                {transaction.date} · {transaction.note} ·{" "}
                {money(
                  transaction.amount,
                  data.books.find((cashbook) => cashbook.id === target)
                    .currency,
                )}
              </p>
            ))}
            <button
              disabled={!preview.accepted.length}
              onClick={importTransactions}
            >
              Import valid entries
            </button>
          </>
        )}
      </section>
      <section className="card">
        <h3>Activity & undo</h3>
        <button onClick={clearHistory}>Clear history</button>
        <p>
          Up to 200 recent workspace events (older events are trimmed to keep
          backups small). Transaction changes can be undone if they have not
          changed again. This is editable local history, not an immutable audit
          ledger.
        </p>
        {(data.history || []).map((event) => (
          <div className="history-row" key={event.id}>
            <div>
              <strong>{event.label}</strong>
              <small>
                {new Date(event.at).toLocaleString()} · {event.changes.length}{" "}
                transaction changes
              </small>
            </div>
            {event.changes.length > 0 && (
              <button
                onClick={() =>
                  runAction(() =>
                    save(undo(data, event), `Undo: ${event.label}`),
                  )
                }
              >
                Undo
              </button>
            )}
          </div>
        ))}
      </section>
    </div>
  );
}
