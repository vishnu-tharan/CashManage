import { useEffect, useSyncExternalStore } from "react";
import { subscribe, getDialog, finishDialog } from "./dialogs";
export default function DialogHost() {
  const dialog = useSyncExternalStore(subscribe, getDialog);
  useEffect(() => {
    if (!dialog) {
      return;
    }
    const handler = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        finishDialog(dialog.confirm ? false : null);
      }
      if (event.key === "Tab") {
        const elements = [
          ...document.querySelectorAll(
            "[data-input-dialog] input,[data-input-dialog] button",
          ),
        ];
        const first = elements[0];
        const last = elements[elements.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [dialog]);
  if (!dialog) {
    return null;
  }
  function handleSubmit(event) {
    event.preventDefault();
    finishDialog(
      dialog.confirm ? true : String(new FormData(event.target).get("answer")),
    );
  }
  return (
    <div className="modal-overlay input-dialog">
      <section
        data-input-dialog
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="input-dialog-title"
      >
        <h2 id="input-dialog-title">
          {dialog.confirm ? "Please confirm" : "Enter details"}
        </h2>
        <form key={dialog.id} onSubmit={handleSubmit}>
          {dialog.confirm ? (
            <p className="dialog-message">{dialog.message}</p>
          ) : (
            <label className="field">
              <span>{dialog.message}</span>
              <input
                autoFocus
                autoComplete="off"
                name="answer"
                type={dialog.secret ? "password" : "text"}
                maxLength={512}
              />
            </label>
          )}
          <div className="dialog-actions">
            <button
              type="button"
              onClick={() => finishDialog(dialog.confirm ? false : null)}
            >
              Cancel
            </button>
            <button
              autoFocus={dialog.confirm}
              className="primary"
              type="submit"
            >
              {dialog.confirm ? "Confirm" : "Continue"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
