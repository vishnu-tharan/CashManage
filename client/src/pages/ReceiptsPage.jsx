import { download } from "../storage";
function readReceiptFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Could not read receipt"));
    reader.readAsDataURL(file);
  });
}
export default function ReceiptsPage({ data, save, runAction }) {
  function downloadReceipt(receipt) {
    const encodedContent = receipt.content.split(",")[1];
    const binary = atob(encodedContent);
    const bytes = Uint8Array.from(binary, (character) =>
      character.charCodeAt(0),
    );
    download(receipt.name, bytes, receipt.type);
  }
  async function removeReceipt(transactionId) {
    await runAction(async () => {
      const transactions = data.transactions.map((transaction) => {
        if (transaction.id !== transactionId) {
          return transaction;
        }
        return {
          ...transaction,
          receipt: undefined,
        };
      });
      await save(
        {
          ...data,
          transactions,
        },
        "Removed receipt",
      );
    });
  }
  async function attachReceipt(event, transactionId) {
    const file = event.target.files[0];
    event.target.value = "";
    if (!file) {
      return;
    }
    await runAction(async () => {
      const allowedTypes = ["image/jpeg", "image/png", "application/pdf"];
      if (!allowedTypes.includes(file.type) || file.size > 300000) {
        throw new Error("Choose a JPEG, PNG or PDF under 300 KB");
      }
      let totalSize = 0;
      for (const transaction of data.transactions) {
        totalSize += transaction.receipt?.size || 0;
      }
      if (totalSize + file.size > 1000000) {
        throw new Error("Total receipt limit is 1 MB");
      }
      const content = await readReceiptFile(file);
      const receipt = {
        name: file.name.slice(0, 100),
        size: file.size,
        type: file.type,
        content,
      };
      const transactions = data.transactions.map((transaction) => {
        if (transaction.id !== transactionId) {
          return transaction;
        }
        return {
          ...transaction,
          receipt,
        };
      });
      await save(
        {
          ...data,
          transactions,
        },
        "Attached receipt",
      );
    });
  }
  return (
    <section className="card">
      <h3>Receipt library</h3>
      <p>
        Attach a JPEG, PNG or PDF to a transaction. Files are included in
        encrypted backups. Limit: 300 KB per receipt, 1 MB total attachments.
      </p>
      {data.transactions.map((transaction) => (
        <div className="history-row" key={transaction.id}>
          <div>
            <strong>{transaction.note || transaction.category}</strong>
            <small>
              {transaction.date} ·{" "}
              {transaction.receipt?.name || "No attachment"}
            </small>
          </div>
          {transaction.receipt ? (
            <>
              <button onClick={() => downloadReceipt(transaction.receipt)}>
                Download
              </button>
              <button onClick={() => removeReceipt(transaction.id)}>
                Remove
              </button>
            </>
          ) : (
            <input
              aria-label={`Attach receipt to ${transaction.note || transaction.category}`}
              type="file"
              accept="image/jpeg,image/png,application/pdf"
              onChange={(event) => attachReceipt(event, transaction.id)}
            />
          )}
        </div>
      ))}
      {!data.transactions.length && <p>Add a transaction first.</p>}
    </section>
  );
}
