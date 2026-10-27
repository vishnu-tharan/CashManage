const crypto = require("node:crypto");
const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

// Authenticator apps expect setup secrets written in Base32.
function encode(buffer) {
  let availableBits = 0;
  let value = 0;
  let encoded = "";
  for (const byte of buffer) {
    value = (value << 8) | byte;
    availableBits += 8;
    while (availableBits >= 5) {
      const index = (value >>> (availableBits - 5)) & 31;
      encoded += BASE32_ALPHABET[index];
      availableBits -= 5;
    }
  }
  if (availableBits > 0) {
    const index = (value << (5 - availableBits)) & 31;
    encoded += BASE32_ALPHABET[index];
  }
  return encoded;
}

function decode(text) {
  let availableBits = 0;
  let value = 0;
  const decoded = [];
  for (const character of text) {
    const index = BASE32_ALPHABET.indexOf(character);
    if (index < 0) throw new Error("Invalid secret");
    value = (value << 5) | index;
    availableBits += 5;
    if (availableBits >= 8) {
      decoded.push((value >>> (availableBits - 8)) & 255);
      availableBits -= 8;
    }
  }
  return Buffer.from(decoded);
}

// Follow the TOTP standard: sign the time counter, then take six digits.
function totp(secret, counter) {
  const counterBytes = Buffer.alloc(8);
  counterBytes.writeBigUInt64BE(BigInt(counter));
  const signature = crypto
    .createHmac("sha1", decode(secret))
    .update(counterBytes)
    .digest();
  const offset = signature[19] & 15;
  const positiveNumber = signature.readUInt32BE(offset) & 0x7fffffff;
  return String(positiveNumber % 1000000).padStart(6, "0");
}

module.exports = { encode, totp };
