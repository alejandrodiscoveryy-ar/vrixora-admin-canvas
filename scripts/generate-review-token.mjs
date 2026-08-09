import { randomBytes, createHash } from "node:crypto";

const hours = Number(process.argv[2] ?? 168);
if (!Number.isFinite(hours) || hours <= 0)
  throw new Error("La duración debe ser un número positivo de horas.");

const token = randomBytes(32).toString("base64url");
const hash = createHash("sha256").update(token).digest("hex");
const expiresAt = new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();

console.log(JSON.stringify({ token, record: { hash, expiresAt, revokedAt: null } }, null, 2));
