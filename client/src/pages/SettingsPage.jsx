import { confirmAction } from "../dialogs";
import AccountSecurity from "../AccountSecurity";
import { Download } from "lucide-react";
import { api, currencies, today, download } from "../storage";
import { Field } from "../components/forms";
export default function SettingsPage({
  session,
  data,
  runAction,
  lock,
  save,
  setUnit,
  setMessage,
  busy,
  backup,
  restore,
  install,
  setSessions,
  sessions,
}) {
  function saveProfile(event) {
    event.preventDefault();
    const formValues = new FormData(event.target);
    runAction(async () => {
      await save({
        ...data,
        profile: {
          name: formValues.get("name"),
          currency: formValues.get("currency"),
          timeout: Number(formValues.get("timeout")),
        },
      });
      setUnit(formValues.get("currency"));
      setMessage("Profile updated");
    });
  }
  function restoreBackupFile(event) {
    const file = event.target.files[0];
    if (file) {
      runAction(async () => {
        if (file.size > 5000000) {
          throw new Error("Backup exceeds 5 MB");
        }
        await restore(JSON.parse(await file.text()));
      });
    }
    event.target.value = "";
  }
  async function installApp() {
    return runAction(async () => {
      if (!install.current) {
        throw new Error(
          "Use your browser menu → Install app / Add to Home Screen. Installation requires HTTPS or localhost.",
        );
      }
      await install.current.prompt();
      install.current = null;
    });
  }
  async function removeLocalVault() {
    if (
      await confirmAction(
        "Remove this device’s saved vault? Unsynced changes will be lost.",
      )
    ) {
      localStorage.removeItem(`cm:${session.username}`);
      lock();
    }
  }
  return (
    <div className="settings-grid">
      <AccountSecurity
        session={session}
        data={data}
        runAction={runAction}
        lock={lock}
      />
      <section className="card">
        <h3>Your profile</h3>
        <p>Make this space your own.</p>
        <form onSubmit={saveProfile}>
          <Field label="Display name">
            <input
              name="name"
              required
              maxLength={50}
              defaultValue={data.profile.name}
            />
          </Field>
          <Field label="Username">
            <input disabled value={session.username || "Guest (temporary)"} />
          </Field>
          <Field label="Default currency">
            <select name="currency" defaultValue={data.profile.currency}>
              {currencies.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </Field>
          <Field label="Auto-lock after inactivity">
            <select name="timeout" defaultValue={data.profile.timeout}>
              {[5, 15, 30, 60].map((n) => (
                <option value={n} key={n}>
                  {n} minutes
                </option>
              ))}
            </select>
          </Field>
          <button className="primary" disabled={busy}>
            Save profile
          </button>
        </form>
      </section>
      <section className="card">
        <h3>Backups & devices</h3>
        <p>Encrypted copies, wherever you need them.</p>
        <div className="settings-actions">
          <button
            disabled={busy}
            onClick={async () =>
              runAction(async () =>
                download(
                  `cashmanage-${today()}.json`,
                  JSON.stringify(await backup()),
                ),
              )
            }
          >
            <Download size={18} />
            Download encrypted backup
          </button>
          <label className="file-button">
            Restore backup file
            <input
              type="file"
              accept="application/json,.json"
              onChange={restoreBackupFile}
            />
          </label>
          <button onClick={installApp}>Install on this device</button>
        </div>
        <small>Backups contain encrypted data only.</small>
      </section>
      <section className="card">
        <h3>Session control</h3>
        <p>
          Online sessions expire after 24 hours. Local vaults lock after
          inactivity.
        </p>
        <button
          disabled={session.guest || busy}
          onClick={async () =>
            runAction(async () => setSessions(await api("/sessions")))
          }
        >
          Show active sessions
        </button>
        {sessions.map((s) => (
          <p key={s.id}>
            {s.current ? "This session" : "Other session"} · expires{" "}
            {new Date(s.expires).toLocaleString()}
          </p>
        ))}
        <button
          disabled={session.guest || busy}
          onClick={async () =>
            runAction(async () => {
              await api("/sessions", "DELETE");
              lock();
            })
          }
        >
          Sign out all online sessions
        </button>
        <small>
          Revocation ends server access. It cannot erase an offline copy from
          another device.
        </small>
        <button disabled={session.guest} onClick={removeLocalVault}>
          Remove local vault
        </button>
      </section>
    </div>
  );
}
