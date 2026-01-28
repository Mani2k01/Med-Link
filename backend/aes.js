const crypto = require("crypto");


const KEY = Buffer.from(
  "0123456789abcdef0123456789abcdef",
  "hex"
);

class Encryption {
  encrypt(data) {
    try {
      if (!data) throw new Error("Data is null");

      const iv = crypto.randomBytes(12); // nonce / IV
      const cipher = crypto.createCipheriv(
        "aes-128-gcm",
        KEY,
        iv
      );

      const ciphertext = Buffer.concat([
        cipher.update(Buffer.from(data)),
        cipher.final()
      ]);

      const tag = cipher.getAuthTag();

      return {
        iv,
        ciphertext,
        tag,
        key:KEY
      };

    } catch (err) {
      console.error("Encryption Error:", err.message);
      return null;
    }
  }

  decrypt(iv, ciphertext, tag, key) {
    try {
      const decipher = crypto.createDecipheriv(
        "aes-128-gcm",
        key,
        iv
      );

      decipher.setAuthTag(tag);

      const plaintext = Buffer.concat([
        decipher.update(ciphertext),
        decipher.final()
      ]);

      return plaintext.toString();

    } catch (err) {
      console.error("Decryption Error: Key incorrect or data corrupted");
      return null;
    }
  }
}

module.exports = Encryption;
