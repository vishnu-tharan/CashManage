import { validateData } from "../domain/validation.js";
const textEncoder = new TextEncoder();
const PASSWORD_ITERATIONS = 600000;
export function toHex(buffer) {
  const values = new Uint8Array(buffer);
  return Array.from(values, (value) =>
    value.toString(16).padStart(2, "0"),
  ).join("");
}
export function fromHex(text) {
  const pairs = text.match(/.{2}/g) || [];
  return Uint8Array.from(pairs, (pair) => parseInt(pair, 16));
}
export function randomSalt() {
  return toHex(crypto.getRandomValues(new Uint8Array(16)));
}
export async function digest(text) {
  const hash = await crypto.subtle.digest("SHA-256", textEncoder.encode(text));
  return toHex(hash);
}

// A slow password derivation makes guessing passwords more expensive.
export async function derive(password, salt) {
  const passwordKey = await crypto.subtle.importKey(
    "raw",
    textEncoder.encode(password),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: fromHex(salt),
      iterations: PASSWORD_ITERATIONS,
      hash: "SHA-256",
    },
    passwordKey,
    {
      name: "AES-GCM",
      length: 256,
    },
    true,
    ["encrypt", "decrypt"],
  );
}

// Sign-in uses a separate proof so the server never receives the encryption key.
export async function proof(username, password) {
  const passwordKey = await crypto.subtle.importKey(
    "raw",
    textEncoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const result = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: textEncoder.encode(`cashmanage-auth:${username}`),
      iterations: PASSWORD_ITERATIONS,
      hash: "SHA-256",
    },
    passwordKey,
    256,
  );
  return toHex(result);
}
export async function seal(data, key, salt) {
  // AES-GCM needs a new random initialization vector for each encryption.
  const initializationVector = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = textEncoder.encode(JSON.stringify(data));
  const ciphertext = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv: initializationVector,
    },
    key,
    plaintext,
  );
  return {
    version: 1,
    salt,
    iv: toHex(initializationVector),
    cipher: toHex(ciphertext),
  };
}

// Recovery envelopes contain a key, so they are decrypted without workspace validation.
export async function decryptJSON(vault, key) {
  const plaintext = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: fromHex(vault.iv),
    },
    key,
    fromHex(vault.cipher),
  );
  const json = new TextDecoder().decode(plaintext);
  return JSON.parse(json);
}
export async function unseal(vault, key) {
  const data = await decryptJSON(vault, key);
  return validateData(data);
}
