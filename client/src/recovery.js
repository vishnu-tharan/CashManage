import { ask } from "./dialogs";
import { api, derive, proof, seal, randomSalt } from "./storage";
import { fromHex, digest, decryptJSON, unseal } from "./lib/crypto.js";
export async function recoverAccount() {
  const username = (await ask("Account username:"))?.toLowerCase().trim();
  const key = (await ask("Recovery key from your saved file:"))?.trim();
  if (!username || !key) {
    throw new Error("Recovery cancelled");
  }
  const recoveryProof = await digest(key);
  const recoveryResponse = await api("/auth/recovery", "POST", {
    username,
    recoveryProof,
  });
  const envelope = await decryptJSON(
    recoveryResponse.envelope,
    await derive(key, recoveryResponse.envelope.salt),
  );
  const oldKey = await crypto.subtle.importKey(
    "raw",
    fromHex(envelope.raw),
    "AES-GCM",
    true,
    ["encrypt", "decrypt"],
  );
  const data = await unseal(recoveryResponse.vault, oldKey);
  const password = await ask("New password (at least 12 characters):");
  if (!password || password.length < 12) {
    throw new Error("Use at least 12 characters");
  }
  const salt = randomSalt();
  const vault = await seal(data, await derive(password, salt), salt);
  await api("/auth/recovery", "POST", {
    username,
    recoveryProof,
    newProof: await proof(username, password),
    vault,
    revision: recoveryResponse.revision,
  });
  localStorage.setItem(
    `cm:${username}`,
    JSON.stringify({
      vault,
      revision: recoveryResponse.revision + 1,
      dirty: false,
    }),
  );
  return "Password reset. Sign in with your new password and configure MFA and a new recovery key.";
}
