import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Šifrování tajemství banky v DB (client_secret, refresh token).
 * Klíč je v BANK_ENCRYPTION_KEY (32 bajtů v base64, `openssl rand -base64 32`), v produkci ze Secret Manageru.
 * Formát: v1.<iv>.<tag>.<data>, vše base64url.
 */

function key(): Buffer {
  const raw = process.env.BANK_ENCRYPTION_KEY;
  if (!raw) throw new Error("BANK_ENCRYPTION_KEY není nastavené");
  const k = Buffer.from(raw, "base64");
  if (k.length !== 32) throw new Error("BANK_ENCRYPTION_KEY musí mít 32 bajtů (base64)");
  return k;
}

export function seal(plain: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return ["v1", iv.toString("base64url"), c.getAuthTag().toString("base64url"), data.toString("base64url")].join(".");
}

export function unseal(sealed: string): string {
  const [v, iv, tag, data] = sealed.split(".");
  if (v !== "v1" || !iv || !tag || data == null) throw new Error("Neplatný formát zašifrované hodnoty");
  const d = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
  d.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([d.update(Buffer.from(data, "base64url")), d.final()]).toString("utf8");
}
