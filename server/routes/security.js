module.exports = function security({
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
}) {
  app.get("/api/security", async (request, response) => {
    const securitySettings = await get(
      "SELECT * FROM security WHERE username=?",
      [request.username],
    );
    response.json({
      mfa: !!securitySettings?.secret,
      recovery: !!securitySettings?.recoveryHash,
    });
  });
  app.post("/api/security/mfa/setup", async (request, response) => {
    if (!(await verifyPassword(request.username, request.body.proof))) {
      return response.status(401).json({
        error: "Incorrect password",
      });
    }
    const securitySettings = await get(
      "SELECT * FROM security WHERE username=?",
      [request.username],
    );
    if (securitySettings?.secret) {
      return response.status(409).json({
        error: "MFA is already enabled",
      });
    }
    const secret = encode(crypto.randomBytes(20));
    await run(
      "INSERT INTO security(username,pending) VALUES(?,?) ON CONFLICT(username) DO UPDATE SET pending=excluded.pending",
      [request.username, encrypt(secret)],
    );
    response.json({
      secret,
      uri: `otpauth://totp/CashManage:${request.username}?secret=${secret}&issuer=CashManage&algorithm=SHA1&digits=6&period=30`,
    });
  });
  app.post("/api/security/mfa/enable", async (request, response) => {
    const securitySettings = await get(
      "SELECT * FROM security WHERE username=?",
      [request.username],
    );
    const counter = Math.floor(Date.now() / 30000);
    if (
      !securitySettings?.pending ||
      totp(decrypt(securitySettings.pending), counter) !== request.body.code
    ) {
      return response.status(400).json({
        error: "Invalid authenticator code",
      });
    }
    await run(
      "UPDATE security SET secret=pending,pending=NULL,lastCounter=? WHERE username=?",
      [counter, request.username],
    );
    await run("DELETE FROM sessions WHERE username=? AND token<>?", [
      request.username,
      request.token,
    ]);
    response.json({
      ok: true,
    });
  });
  app.post("/api/security/mfa/disable", async (request, response) => {
    if (
      !(await verifyPassword(request.username, request.body.proof)) ||
      !(await verifyMfa(request.username, request.body.code))
    ) {
      return response.status(401).json({
        error: "Incorrect password or authenticator code",
      });
    }
    await run(
      "UPDATE security SET secret=NULL,lastCounter=-1 WHERE username=?",
      [request.username],
    );
    response.json({
      ok: true,
    });
  });
  app.post("/api/security/recovery", async (request, response) => {
    const { proof, recoveryProof, envelope, code } = request.body;
    if (
      !(await verifyPassword(request.username, proof)) ||
      !(await verifyMfa(request.username, code))
    ) {
      return response.status(401).json({
        error: "Incorrect password or authenticator code",
      });
    }
    if (!/^[a-f0-9]{64}$/.test(recoveryProof || "") || !validVault(envelope)) {
      return response.status(400).json({
        error: "Invalid recovery setup",
      });
    }
    await run(
      "INSERT INTO security(username,recoveryHash,recoveryEnvelope) VALUES(?,?,?) ON CONFLICT(username) DO UPDATE SET recoveryHash=excluded.recoveryHash,recoveryEnvelope=excluded.recoveryEnvelope",
      [request.username, hash(recoveryProof), JSON.stringify(envelope)],
    );
    response.json({
      ok: true,
    });
  });
  app.post("/api/security/password", async (request, response) => {
    const { proof, newProof, vault, revision, code } = request.body;
    if (
      !(await verifyPassword(request.username, proof)) ||
      !(await verifyMfa(request.username, code))
    ) {
      return response.status(401).json({
        error: "Incorrect password or authenticator code",
      });
    }
    if (
      !validVault(vault) ||
      !Number.isSafeInteger(revision) ||
      !/^[a-f0-9]{64}$/.test(newProof || "")
    ) {
      return response.status(400).json({
        error: "Invalid password change",
      });
    }
    const salt = crypto.randomBytes(16).toString("hex");
    const password = (await scrypt(newProof, salt, 64)).toString("hex");
    const changed = await run(
      "UPDATE users SET password=?,salt=?,vault=?,revision=revision+1 WHERE username=? AND revision=?",
      [password, salt, JSON.stringify(vault), request.username, revision],
    );
    if (!changed.changes) {
      return response.status(409).json({
        error: "Sync and resolve conflicts before changing password",
      });
    }
    await run(
      "UPDATE security SET recoveryHash=NULL,recoveryEnvelope=NULL WHERE username=?",
      [request.username],
    );
    await run("DELETE FROM sessions WHERE username=?", [request.username]);
    response.clearCookie("session", {
      path: "/api",
    });
    response.json({
      revision: revision + 1,
    });
  });
};
