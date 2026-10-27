const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { encode, totp } = require("./totp");
module.exports = function security({
  app,
  run,
  get,
  scrypt,
  validVault,
  hash,
}) {
  let key;
  async function init() {
    if (process.env.DB_PATH === ":memory:") {
      key = crypto.randomBytes(32);
    } else {
      const file = process.env.MFA_KEY_PATH || path.join(__dirname, ".mfa-key");
      try {
        key = fs.readFileSync(file);
      } catch (error) {
        if (error.code !== "ENOENT") {
          throw error;
        }
        key = crypto.randomBytes(32);
        try {
          fs.writeFileSync(file, key, {
            flag: "wx",
            mode: 0o600,
          });
        } catch (error) {
          if (error.code !== "EEXIST") {
            throw error;
          }
          key = fs.readFileSync(file);
        }
      }
      if (key.length !== 32) {
        throw new Error("Invalid MFA encryption key");
      }
    }
    await run(
      "CREATE TABLE IF NOT EXISTS security(username TEXT PRIMARY KEY,secret TEXT,pending TEXT,lastCounter INTEGER DEFAULT -1,recoveryHash TEXT,recoveryEnvelope TEXT)",
    );
  }
  function encrypt(secret) {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
    return Buffer.concat([
      iv,
      cipher.update(secret),
      cipher.final(),
      cipher.getAuthTag(),
    ]).toString("hex");
  }
  function decrypt(value) {
    const buffer = Buffer.from(value, "hex");
    const decipher = crypto.createDecipheriv(
      "aes-256-gcm",
      key,
      buffer.subarray(0, 12),
    );
    decipher.setAuthTag(buffer.subarray(-16));
    return Buffer.concat([
      decipher.update(buffer.subarray(12, -16)),
      decipher.final(),
    ]).toString();
  }
  async function verifyMfa(username, code) {
    const row = await get("SELECT * FROM security WHERE username=?", [
      username,
    ]);
    if (!row?.secret) {
      return true;
    }
    if (!/^\d{6}$/.test(code || "")) {
      return false;
    }
    const step = Math.floor(Date.now() / 30000);
    for (const n of [step - 1, step, step + 1]) {
      if (n > row.lastCounter && totp(decrypt(row.secret), n) === code) {
        const result = await run(
          "UPDATE security SET lastCounter=? WHERE username=? AND lastCounter<?",
          [n, username, n],
        );
        return !!result.changes;
      }
    }
    return false;
  }
  async function verifyPassword(username, proof) {
    if (!/^[a-f0-9]{64}$/.test(proof || "")) {
      return false;
    }
    const user = await get("SELECT * FROM users WHERE username=?", [username]);
    return (
      user &&
      crypto.timingSafeEqual(
        await scrypt(proof, user.salt, 64),
        Buffer.from(user.password, "hex"),
      )
    );
  }
  function publicRoutes() {
    require("./routes/recovery")({
      app,
      get,
      crypto,
      hash,
      validVault,
      scrypt,
      run,
    });
  }
  function privateRoutes() {
    require("./routes/security")({
      app,
      get,
      verifyPassword,
      encode,
      crypto,
      run,
      encrypt,
      totp,
      decrypt,
      verifyMfa,
      validVault,
      hash,
      scrypt,
    });
  }
  return {
    init,
    verifyMfa,
    publicRoutes,
    privateRoutes,
  };
};
