// Offline adapter for the existing @std/assert test API using Node's built-in assertions.
import { ok, deepStrictEqual, rejects } from "node:assert/strict";
export const assert: typeof ok = ok;
export const assertEquals: typeof deepStrictEqual = deepStrictEqual;
export const assertRejects: typeof rejects = rejects;
