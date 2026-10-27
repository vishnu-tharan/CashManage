require("dotenv").config();
const express = require("express");
const crypto = require("node:crypto");
const { promisify } = require("node:util");
const path = require("node:path");
const db = require("./db");
const scrypt = promisify(crypto.scrypt);
// SQLite uses callbacks. These wrappers let routes wait for a query with await.
function run(sql, parameters = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, parameters, function (error) {
      if (error) {
        reject(error);
        return;
      }
      resolve(this); // SQLite reports the affected row count on this object.
    });
  });
}

function get(sql, parameters = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, parameters, (error, row) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(row);
    });
  });
}

const app = express();
app.disable("x-powered-by");
app.use((request, response, next) => {
  response.set({
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    "Content-Security-Policy":
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; frame-src 'none'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'",
    "Cross-Origin-Opener-Policy": "same-origin",
  });
  if (process.env.NODE_ENV === "production") {
    response.set("Strict-Transport-Security", "max-age=31536000");
  }
  if (request.path.startsWith("/api")) {
    response.set("Cache-Control", "no-store");
    if (
      !["GET", "HEAD"].includes(request.method) &&
      request.get("Origin") !==
        (process.env.APP_ORIGIN || "http://localhost:5173")
    ) {
      return response.status(403).json({
        error: "Invalid request origin",
      });
    }
  }
  next();
});
app.use(
  express.json({
    limit: "5mb",
  }),
);
const hash = (value) => crypto.createHash("sha256").update(value).digest("hex");
const attempts = new Map();
setInterval(() => {
  for (const [key, value] of attempts) {
    if (value.until < Date.now()) {
      attempts.delete(key);
    }
  }
}, 60000).unref();
app.use(["/api/auth", "/api/security"], (request, response, next) => {
  const key = request.ip;
  const entry = attempts.get(key) || {
    count: 0,
    until: Date.now() + 900000,
  };
  if (entry.until < Date.now()) {
    entry.count = 0;
    entry.until = Date.now() + 900000;
  }
  attempts.set(key, entry);
  if (++entry.count > 30) {
    return response.status(429).json({
      error: "Too many attempts. Try again in 15 minutes.",
    });
  }
  next();
});
const validVault = (v) =>
  v &&
  v.version === 1 &&
  /^[a-f0-9]{32}$/.test(v.salt || "") &&
  /^[a-f0-9]{24}$/.test(v.iv || "") &&
  typeof v.cipher === "string" &&
  /^[a-f0-9]+$/.test(v.cipher) &&
  v.cipher.length <= 9000000;
const accountSecurity = require("./accountSecurity")({
  app,
  run,
  get,
  scrypt,
  validVault,
  hash,
});
accountSecurity.publicRoutes();
app.post("/api/auth/:action", async (request, response) => {
  const { username, proof, vault } = request.body;
  if (
    !/^[a-z0-9_]{3,24}$/.test(username || "") ||
    !/^[a-f0-9]{64}$/.test(proof || "")
  ) {
    return response.status(400).json({
      error: "Invalid credentials format",
    });
  }
  let user = await get("SELECT * FROM users WHERE username = ?", [username]);
  if (request.params.action === "register") {
    if (!validVault(vault)) {
      return response.status(400).json({
        error: "Invalid encrypted vault",
      });
    }
    if (user) {
      return response.status(409).json({
        error: "Username is already taken",
      });
    }
    const salt = crypto.randomBytes(16).toString("hex");
    const password = (await scrypt(proof, salt, 64)).toString("hex");
    try {
      await run(
        "INSERT INTO users(username,password,salt,vault,revision) VALUES(?,?,?,?,0)",
        [username, password, salt, JSON.stringify(vault)],
      );
    } catch (error) {
      if (error.code === "SQLITE_CONSTRAINT") {
        return response.status(409).json({
          error: "Username is already taken",
        });
      }
      throw error;
    }
    user = await get("SELECT * FROM users WHERE username = ?", [username]);
  } else if (request.params.action === "login") {
    const candidate = await scrypt(proof, user?.salt || "dummy-salt", 64);
    if (
      !user ||
      !crypto.timingSafeEqual(candidate, Buffer.from(user.password, "hex"))
    ) {
      return response.status(401).json({
        error: "Incorrect username or password",
      });
    }
    if (!(await accountSecurity.verifyMfa(username, request.body.otp))) {
      return response.status(401).json({
        error:
          "Authenticator code required or invalid (wait for a fresh code if already used)",
      });
    }
  } else {
    return response.sendStatus(404);
  }
  const token = crypto.randomBytes(32).toString("hex");
  await run("INSERT INTO sessions(token,username,expires) VALUES(?,?,?)", [
    hash(token),
    username,
    Date.now() + 86400000,
  ]);
  response.cookie("session", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: 86400000,
    path: "/api",
  });
  response.json({
    vault: JSON.parse(user.vault),
    revision: user.revision,
  });
});
app.use("/api", async (request, response, next) => {
  const token = (request.headers.cookie || "")
    .split(";")
    .map((securitySettings) => securitySettings.trim())
    .find((securitySettings) => securitySettings.startsWith("session="))
    ?.slice(8);
  if (!token) {
    return response.status(401).json({
      error: "Sign in online to reconnect your session",
    });
  }
  const session = await get(
    "SELECT * FROM sessions WHERE token=? AND expires>?",
    [hash(token), Date.now()],
  );
  if (!session) {
    return response.status(401).json({
      error: "Sign in online to reconnect your session",
    });
  }
  request.username = session.username;
  request.token = session.token;
  next();
});
accountSecurity.privateRoutes();
app.get("/api/vault", async (request, response) => {
  const user = await get("SELECT vault,revision FROM users WHERE username=?", [
    request.username,
  ]);
  response.json({
    vault: JSON.parse(user.vault),
    revision: user.revision,
  });
});
app.put("/api/vault", async (request, response) => {
  if (
    !validVault(request.body.vault) ||
    !Number.isSafeInteger(request.body.revision)
  ) {
    return response.status(400).json({
      error: "Invalid vault",
    });
  }
  const result = await run(
    "UPDATE users SET vault=?,revision=revision+1 WHERE username=? AND revision=?",
    [
      JSON.stringify(request.body.vault),
      request.username,
      request.body.revision,
    ],
  );
  if (!result.changes) {
    return response.status(409).json({
      error:
        "Another device changed this account. Export a backup before loading the cloud version.",
    });
  }
  response.json({
    revision: request.body.revision + 1,
  });
});
app.get("/api/sessions", async (request, response) => {
  db.all(
    "SELECT token,expires FROM sessions WHERE username=? AND expires>?",
    [request.username, Date.now()],
    (error, rows) =>
      error
        ? response.sendStatus(500)
        : response.json(
            rows.map((result) => ({
              id: result.token,
              expires: result.expires,
              current: result.token === request.token,
            })),
          ),
  );
});
app.delete("/api/sessions", async (request, response) => {
  await run("DELETE FROM sessions WHERE username=?", [request.username]);
  response.clearCookie("session", {
    path: "/api",
  });
  response.json({
    ok: true,
  });
});
app.post("/api/logout", async (request, response) => {
  await run("DELETE FROM sessions WHERE token=?", [request.token]);
  response.clearCookie("session", {
    path: "/api",
  });
  response.json({
    ok: true,
  });
});
app.use("/api", (request, response) =>
  response.status(404).json({
    error: "Endpoint not found",
  }),
);
app.use(express.static(path.resolve(__dirname, "../client/dist")));
app.get("/{*path}", (request, response) =>
  response.sendFile(path.resolve(__dirname, "../client/dist/index.html")),
);
app.use((err, request, response, next) => {
  console.error(err.message);
  response.status(err.status || 500).json({
    error: "Request could not be completed",
  });
});
async function start() {
  await run(
    "CREATE TABLE IF NOT EXISTS users(username TEXT PRIMARY KEY,password TEXT NOT NULL,salt TEXT NOT NULL,vault TEXT NOT NULL,revision INTEGER NOT NULL DEFAULT 0)",
  );
  await run(
    "CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,username TEXT NOT NULL,expires INTEGER NOT NULL)",
  );
  await run("DELETE FROM sessions WHERE expires<?", [Date.now()]);
  await accountSecurity.init();
  return app.listen(process.env.PORT || 3000, () =>
    console.log("CashManage server ready"),
  );
}
if (require.main === module) {
  start().catch(console.error);
}
module.exports = {
  app,
  start,
};
