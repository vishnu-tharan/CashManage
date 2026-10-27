import { mergeVersions } from "../ledger";
import { download } from "../storage";
export default function SyncConflictDialog({
  runAction,
  backup,
  setConflict,
  conflict,
  data,
  save,
  setMessage,
  lock,
}) {
  async function downloadDeviceBackup() {
    return runAction(async () =>
      download("conflict-device-backup.json", JSON.stringify(await backup())),
    );
  }
  function chooseProfile(event) {
    return setConflict({
      ...conflict,
      choices: {
        ...conflict.choices,
        profile: event.target.value,
      },
    });
  }
  async function saveResolution() {
    return runAction(async () => {
      const merged = mergeVersions(data, conflict.remoteData, conflict.choices);
      await save(
        merged,
        "Resolved synchronization conflict",
        conflict.remote.revision,
      );
      setConflict(null);
      setMessage("Merged locally. Automatic sync will upload the result.");
    });
  }
  function chooseVersion(field, id, version) {
    const key = field + ":" + id;
    setConflict({
      ...conflict,
      choices: {
        ...conflict.choices,
        [key]: version,
      },
    });
  }
  const differences = [];
  for (const field of [
    "books",
    "transactions",
    "recurring",
    "goals",
    "debts",
  ]) {
    const deviceEntries = data[field] || [];
    const cloudEntries = conflict.remoteData[field] || [];
    const ids = new Set(
      [...deviceEntries, ...cloudEntries].map((entry) => entry.id),
    );
    for (const id of ids) {
      const deviceEntry = deviceEntries.find((entry) => entry.id === id);
      const cloudEntry = cloudEntries.find((entry) => entry.id === id);
      if (JSON.stringify(deviceEntry) === JSON.stringify(cloudEntry)) {
        continue;
      }
      const label =
        deviceEntry?.note ||
        deviceEntry?.name ||
        cloudEntry?.note ||
        cloudEntry?.name ||
        id;
      differences.push({
        field,
        id,
        deviceEntry,
        cloudEntry,
        label,
      });
    }
  }
  return (
    <div className="modal-overlay">
      <section
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label="Resolve sync conflict"
      >
        <h2>Review device and cloud versions</h2>
        <p>
          Choose which values to keep. Entries present in only one version are
          kept unless you select Delete. Download a backup before resolving
          deletions or linked transfers.
        </p>
        <button onClick={downloadDeviceBackup}>Download device backup</button>
        <label className="field">
          Profile
          <select onChange={chooseProfile}>
            <option value="remote">Cloud profile</option>
            <option value="local">Device profile</option>
          </select>
        </label>
        {differences.map((difference) => (
          <div className="field" key={difference.field + difference.id}>
            <strong>
              {difference.field}: {difference.label}
            </strong>
            <small>
              Device:{" "}
              {JSON.stringify(difference.deviceEntry || "absent").slice(0, 250)}
            </small>
            <small>
              Cloud:{" "}
              {JSON.stringify(difference.cloudEntry || "absent").slice(0, 250)}
            </small>
            <select
              value={
                conflict.choices[difference.field + ":" + difference.id] ||
                "remote"
              }
              onChange={(event) =>
                chooseVersion(
                  difference.field,
                  difference.id,
                  event.target.value,
                )
              }
            >
              <option value="remote">
                Cloud value (keep device-only entry)
              </option>
              <option value="local">Device value</option>
              {difference.field === "transactions" && (
                <option value="delete">Delete entry</option>
              )}
            </select>
          </div>
        ))}
        <button className="primary" onClick={saveResolution}>
          Save resolution
        </button>
        <button
          onClick={async () => {
            setConflict(null);
            lock();
          }}
        >
          Lock and resolve later
        </button>
      </section>
    </div>
  );
}
