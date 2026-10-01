import crypto from "node:crypto";

export type EncryptedProviderToken = {
  ciphertext: string;
  iv: string;
  authTag: string;
};

function getEncryptionKey(): Buffer {
  const raw = process.env.EMAIL_TOKEN_ENCRYPTION_KEY?.trim();

  if (!raw) {
    throw new Error("EMAIL_TOKEN_ENCRYPTION_KEY is not configured.");
  }

  const key = Buffer.from(raw, "base64");

  if (key.length !== 32) {
    throw new Error(
      "EMAIL_TOKEN_ENCRYPTION_KEY must decode to exactly 32 bytes."
    );
  }

  return key;
}

export function encryptProviderToken(
  plaintext: string
): EncryptedProviderToken {
  if (!plaintext) {
    throw new Error("Cannot encrypt an empty provider token.");
  }

  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12);

  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);

  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);

  const authTag = cipher.getAuthTag();

  return {
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    authTag: authTag.toString("base64"),
  };
}

export function decryptProviderToken(input: EncryptedProviderToken): string {
  const key = getEncryptionKey();

  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(input.iv, "base64")
  );

  decipher.setAuthTag(Buffer.from(input.authTag, "base64"));

  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(input.ciphertext, "base64")),
    decipher.final(),
  ]);

  return plaintext.toString("utf8");
}
