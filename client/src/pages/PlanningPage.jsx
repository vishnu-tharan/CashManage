import { ask } from "../dialogs";
import { money, today } from "../storage";
import {
  transfer,
  uid,
  amountOf,
  postRecurring,
  createDebt,
  debtRemaining,
  repay,
  budgetAlerts,
  isCashFlow,
} from "../ledger";
import { Field } from "../components/forms";
export default function PlanningPage({ data, save, runAction }) {
  const books = (
    <>
      {data.books.map((cashbook) => (
        <option key={cashbook.id} value={cashbook.id}>
          {cashbook.name} ({cashbook.currency})
        </option>
      ))}
    </>
  );
  function handleSubmit(event, action) {
    event.preventDefault();
    const form = event.target;
    const formValues = Object.fromEntries(new FormData(form));
    runAction(async () => {
      await action(formValues);
      form.reset();
    });
  }
  const alerts = budgetAlerts(data, today().slice(0, 7));
  function postDueEntries() {
    return runAction(async () => {
      const result = postRecurring(data, today());
      if (result.count) {
        await save(result.data, `Posted ${result.count} recurring entries`);
      }
    });
  }
  function saveTransfer(formValues) {
    return save(transfer(data, formValues), "Wallet transfer");
  }
  function saveRecurringSchedule(formValues) {
    const cashbook = data.books.find(
      (candidateBook) => candidateBook.id === formValues.book,
    );
    return save(
      {
        ...data,
        recurring: [
          ...(data.recurring || []),
          {
            ...formValues,
            id: uid(),
            amount: amountOf(formValues.amount, cashbook.currency),
            anchor: Number(formValues.next.slice(-2)),
            active: true,
            category: "Other",
          },
        ],
      },
      "Created recurring schedule",
    );
  }
  function saveDebt(formValues) {
    return save(createDebt(data, formValues), "Recorded debt");
  }
  function saveSavingsGoal(formValues) {
    return save(
      {
        ...data,
        goals: [
          ...(data.goals || []),
          {
            ...formValues,
            id: uid(),
            target: amountOf(
              formValues.target,
              data.books.find((cashbook) => cashbook.id === formValues.book)
                .currency,
            ),
            saved: 0,
          },
        ],
      },
      "Created savings goal",
    );
  }
  return (
    <>
      <section className="card alerts">
        <h3>Budget alerts</h3>
        {alerts.length ? (
          alerts.map((cashbook) => (
            <p
              className={cashbook.percent >= 100 ? "expense" : ""}
              key={cashbook.id}
            >
              {cashbook.name}: {cashbook.percent}% used ·{" "}
              {money(cashbook.spent, cashbook.currency)} /{" "}
              {money(cashbook.budget, cashbook.currency)}
            </p>
          ))
        ) : (
          <p>No budgets have reached 80% this month.</p>
        )}
        <small>Alerts appear in-app while your workspace is open.</small>
      </section>
      <div className="settings-grid">
        <section className="card">
          <h3>Transfer between wallets</h3>
          <p>
            Transfers change wallet balances, without inflating income or
            expense totals. For different currencies, enter the actual amount
            received.
          </p>
          <form onSubmit={(event) => handleSubmit(event, saveTransfer)}>
            <Field label="From wallet">
              <select name="source">{books}</select>
            </Field>
            <Field label="To wallet">
              <select name="destination" defaultValue={data.books[1]?.id}>
                {books}
              </select>
            </Field>
            <Field label="Amount sent">
              <input
                name="amount"
                type="number"
                min="0.01"
                step="0.01"
                required
              />
            </Field>
            <Field label="Amount received (different currency only)">
              <input name="received" type="number" min="0.01" step="0.01" />
            </Field>
            <Field label="Transfer date">
              <input name="date" type="date" required defaultValue={today()} />
            </Field>
            <input
              name="note"
              aria-label="Transfer note"
              placeholder="Optional note"
              maxLength={200}
            />
            <button className="primary">Record transfer</button>
          </form>
        </section>
        <section className="card">
          <h3>Recurring transactions</h3>
          <p>
            Due entries post when you open this workspace. Nothing runs while
            the app is closed.
          </p>
          <form
            onSubmit={(event) => handleSubmit(event, saveRecurringSchedule)}
          >
            <Field label="Schedule name">
              <input
                name="name"
                placeholder="Salary, rent, subscription…"
                required
                maxLength={100}
              />
            </Field>
            <Field label="Schedule wallet">
              <select name="book">{books}</select>
            </Field>
            <div className="form-row">
              <Field label="Direction">
                <select name="type">
                  <option value="expense">Expense</option>
                  <option value="income">Income</option>
                </select>
              </Field>
              <Field label="Frequency">
                <select name="frequency">
                  <option value="monthly">Monthly</option>
                  <option value="weekly">Weekly</option>
                  <option value="yearly">Yearly</option>
                </select>
              </Field>
            </div>
            <Field label="Recurring amount">
              <input
                name="amount"
                type="number"
                min="0.01"
                step="0.01"
                required
              />
            </Field>
            <Field label="First date">
              <input name="next" type="date" required defaultValue={today()} />
            </Field>
            <button>Create schedule</button>
          </form>
          {(data.recurring || []).map((schedule) => (
            <div className="rate" key={schedule.id}>
              <span>
                {schedule.name} · next {schedule.next}
              </span>
              <button
                onClick={() =>
                  runAction(() =>
                    save(
                      {
                        ...data,
                        recurring: data.recurring.map((entry) =>
                          entry.id === schedule.id
                            ? {
                                ...entry,
                                active: !entry.active,
                              }
                            : entry,
                        ),
                      },
                      "Changed schedule",
                    ),
                  )
                }
              >
                {schedule.active ? "Pause" : "Resume"}
              </button>
            </div>
          ))}
          <button onClick={postDueEntries}>Post due entries now</button>
        </section>
        <section className="card">
          <h3>Debts & partial repayments</h3>
          <form onSubmit={(event) => handleSubmit(event, saveDebt)}>
            <Field label="Debt description">
              <input name="name" required maxLength={100} />
            </Field>
            <Field label="Person">
              <input name="person" required maxLength={80} />
            </Field>
            <Field label="Debt direction">
              <select name="direction">
                <option value="borrowed">I borrowed / I owe</option>
                <option value="lent">I lent / owed to me</option>
              </select>
            </Field>
            <Field label="Debt wallet">
              <select name="book">{books}</select>
            </Field>
            <Field label="Original amount">
              <input
                name="amount"
                type="number"
                min="0.01"
                step="0.01"
                required
              />
            </Field>
            <div className="form-row">
              <Field label="Debt date">
                <input
                  name="date"
                  type="date"
                  required
                  defaultValue={today()}
                />
              </Field>
              <Field label="Repayment due">
                <input name="due" type="date" required />
              </Field>
            </div>
            <button>Record debt and cash movement</button>
          </form>
          {(data.debts || []).map((debt) => {
            const remaining = debtRemaining(data, debt);
            return (
              <div className="history-row" key={debt.id}>
                <div>
                  <strong>
                    {debt.person} · {debt.name}
                  </strong>
                  <small
                    className={
                      remaining > 0 && debt.due < today() ? "expense" : ""
                    }
                  >
                    {money(remaining, debt.currency)} remaining ·{" "}
                    {remaining === 0
                      ? "Settled"
                      : debt.due < today()
                        ? "Overdue"
                        : "Due " + debt.due}
                  </small>
                </div>
                <button
                  disabled={remaining <= 0}
                  onClick={() =>
                    runAction(async () => {
                      const value = await ask(
                        `Repayment amount (${debt.currency}):`,
                      );
                      if (value) {
                        await save(
                          repay(data, debt, value, today()),
                          "Debt repayment",
                        );
                      }
                    })
                  }
                >
                  Repay
                </button>
              </div>
            );
          })}
        </section>
        <section className="card">
          <h3>Savings goals</h3>
          <p>
            Progress tracks money you earmark toward a target. Contributions do
            not create cash transactions.
          </p>
          <form onSubmit={(event) => handleSubmit(event, saveSavingsGoal)}>
            <Field label="Goal name">
              <input name="name" required maxLength={80} />
            </Field>
            <Field label="Goal wallet">
              <select name="book">{books}</select>
            </Field>
            <Field label="Target amount">
              <input
                name="target"
                type="number"
                required
                min="0.01"
                step="0.01"
              />
            </Field>
            <Field label="Target date">
              <input name="date" type="date" required defaultValue={today()} />
            </Field>
            <button>Create goal</button>
          </form>
          {(data.goals || []).map((goal) => {
            const currency =
              data.books.find((cashbook) => cashbook.id === goal.book)
                ?.currency || "LKR";
            const months = Math.max(
              1,
              Math.ceil(
                (Date.parse(goal.date) - Date.parse(today())) /
                  (30.44 * 86400000),
              ),
            );
            return (
              <div className="goal" key={goal.id}>
                <h3>{goal.name}</h3>
                <progress max={goal.target} value={goal.saved} />
                <small>
                  {money(goal.saved, currency)} of{" "}
                  {money(goal.target, currency)} · Suggested monthly:{" "}
                  {money(
                    Math.max(0, Math.ceil((goal.target - goal.saved) / months)),
                    currency,
                  )}
                </small>
                <button
                  onClick={() =>
                    runAction(async () => {
                      const value = await ask(`Contribution (${currency}):`);
                      if (value) {
                        await save(
                          {
                            ...data,
                            goals: data.goals.map((entry) =>
                              entry.id === goal.id
                                ? {
                                    ...entry,
                                    saved:
                                      entry.saved + amountOf(value, currency),
                                  }
                                : entry,
                            ),
                          },
                          "Updated goal progress",
                        );
                      }
                    })
                  }
                >
                  Add progress
                </button>
              </div>
            );
          })}
        </section>
      </div>
      <section className="card trend">
        <h3>Month-to-month comparison</h3>
        {data.books.map((cashbook) => {
          const month = today().slice(0, 7);
          const previousMonthDate = new Date();
          previousMonthDate.setDate(1);
          previousMonthDate.setMonth(previousMonthDate.getMonth() - 1);
          const previous = `${previousMonthDate.getFullYear()}-${String(previousMonthDate.getMonth() + 1).padStart(2, "0")}`;
          const sum = (monthPrefix) =>
            data.transactions
              .filter(
                (transaction) =>
                  transaction.book === cashbook.id &&
                  transaction.type === "expense" &&
                  isCashFlow(transaction) &&
                  transaction.date.startsWith(monthPrefix),
              )
              .reduce((total, transaction) => total + transaction.amount, 0);
          const spentThisMonth = sum(month);
          const last = sum(previous);
          return (
            <div className="rate" key={cashbook.id}>
              <span>{cashbook.name}</span>
              <span>
                This month {money(spentThisMonth, cashbook.currency)} · Previous{" "}
                {money(last, cashbook.currency)} ·{" "}
                {last
                  ? `${Math.round(((spentThisMonth - last) / last) * 100)}% change`
                  : "No previous spending"}
              </span>
            </div>
          );
        })}
      </section>
    </>
  );
}
