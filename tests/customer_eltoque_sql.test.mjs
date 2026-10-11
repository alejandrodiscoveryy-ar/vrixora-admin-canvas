// PostgreSQL in memory only. No connection strings or remote clients.
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { deepStrictEqual as equal, rejects, ok } from "node:assert/strict";

const db = new PGlite();
const project = "dfb41cea-a812-46f2-b511-7a60bd3d78af";
const schema = await readFile(new URL("../docs/audits/eltoque-shared-push-20261011/applied-schema.sql.txt", import.meta.url), "utf8");
const activation = await readFile(new URL("../docs/sql/PENDIENTE_customer_eltoque_shared_activation.sql", import.meta.url), "utf8");
const rollback = await readFile(new URL("../docs/sql/PENDIENTE_customer_eltoque_shared_rollback.sql", import.meta.url), "utf8");
let passed = 0;
async function check(name, test) { await test(); passed++; console.log("PASS " + name); }
await db.exec(`
  create schema auth; create schema app_private;
  create role anon; create role authenticated; create role service_role;
  create function auth.role() returns text language sql stable as
    $$ select current_setting('request.jwt.claim.role', true) $$;
  set request.jwt.claim.role = 'service_role';
  create table public.project_exchange_settings (
    project_id uuid primary key, current_rate numeric, auto_sync_enabled boolean,
    rate_mode text, last_auto_sync_status text, last_auto_sync_at timestamptz,
    base_currency text, charge_currency text, auto_currency text, auto_provider text
  );
  create table public.project_exchange_rate_history (
    id bigint generated always as identity primary key, project_id uuid,
    base_currency text default 'USD', charge_currency text default 'CUP',
    rate numeric, rate_mode text default 'automatic', rate_source text default 'elTOQUE',
    changed_by uuid, created_at timestamptz default now()
  );
  insert into public.project_exchange_settings values
    ('${project}',400,true,'automatic','ok',now(),'USD','CUP','USD','eltoque');
`);
await db.exec(schema);
const count = async () => Number((await db.query("select count(*) n from public.marketplace_customer_eltoque_push_deliveries")).rows[0].n);
const subscriptions = [];
for (const [index, enabled, expired] of [[0, true, false], [1, true, false], [2, false, false], [3, true, true]]) {
  const result = await db.query(`insert into public.marketplace_customer_eltoque_push_subscriptions
    (token_hash,fcm_token,secret_hash,enabled,created_at,expires_at)
    values ($1,$2,$3,$4,now()-interval '1 day',now()+($5::int * interval '1 day')) returning id`,
    [String(index).repeat(64), "synthetic".repeat(20) + index, String(index + 4).repeat(64), enabled, expired ? -1 : 180]);
  subscriptions.push(result.rows[0].id);
}
await db.query("insert into public.project_exchange_rate_history(project_id,rate) values ($1,400)", [project]);
await db.exec(activation);
await check("activation does not backfill historical observations", async () => equal(await count(), 0));
await check("first observation for another project does not queue", async () => {
  await db.query("insert into public.project_exchange_rate_history(project_id,rate) values ('11111111-1111-1111-1111-111111111111',410)");
  equal(await count(), 0);
});
async function history(rate, columns = "", values = "") {
  await db.query("update public.project_exchange_settings set current_rate=$1,last_auto_sync_at=now()", [rate]);
  return (await db.query(`insert into public.project_exchange_rate_history(project_id,rate${columns})
    values ($1,$2${values}) returning id`, [project, rate])).rows[0].id;
}
await check("same USD/CUP observation does not queue", async () => { await history(400); equal(await count(), 0); });
let rateId;
await check("real automatic change queues each active unexpired device once", async () => {
  rateId = await history(410); equal(await count(), 2);
});
await check("database unique constraint prevents duplicate per device and rate", async () => {
  await db.query("insert into public.marketplace_customer_eltoque_push_deliveries(subscription_id,rate_history_id) values ($1,$2) on conflict do nothing", [subscriptions[0], rateId]);
  equal(await count(), 2);
});
await check("manual, other currency, old history and disabled sync do not queue", async () => {
  await history(420, ",rate_mode", ",'manual'");
  await history(430, ",base_currency", ",'EUR'");
  await history(440, ",created_at", ",now()-interval '1 day'");
  await db.exec("update public.project_exchange_settings set auto_sync_enabled=false");
  await history(450);
  equal(await count(), 2);
  await db.exec("update public.project_exchange_settings set auto_sync_enabled=true");
});
await check("RLS enabled and public roles denied direct token reads and claims", async () => {
  equal((await db.query("select relrowsecurity r from pg_class where relname like 'marketplace_customer_eltoque_push_%' and relkind='r'")).rows.map(r => r.r), [true, true]);
  for (const role of ["anon", "authenticated"]) {
    await db.exec("set role " + role);
    await rejects(() => db.query("select fcm_token from public.marketplace_customer_eltoque_push_subscriptions"));
    await rejects(() => db.query("select * from public.marketplace_customer_eltoque_push_claim(10)"));
    await db.exec("reset role");
  }
});
let claims;
await check("claim batch limits, disjoint leases and maximum attempts", async () => {
  await rejects(() => db.query("select * from public.marketplace_customer_eltoque_push_claim(0)"));
  await rejects(() => db.query("select * from public.marketplace_customer_eltoque_push_claim(101)"));
  await db.exec("set role service_role");
  claims = (await db.query("select * from public.marketplace_customer_eltoque_push_claim(1)")).rows;
  const second = (await db.query("select * from public.marketplace_customer_eltoque_push_claim(10)")).rows;
  equal(claims.length, 1); equal(second.length, 1); ok(claims[0].delivery_id !== second[0].delivery_id);
  equal((await db.query("select * from public.marketplace_customer_eltoque_push_claim(10)")).rows.length, 0);
  await db.exec("reset role");
});
await check("expired lease rotates claim and old completion cannot overwrite it", async () => {
  const old = claims[0];
  await db.query("update public.marketplace_customer_eltoque_push_deliveries set claimed_until=now()-interval '1 second' where id=$1", [old.delivery_id]);
  const fresh = (await db.query("select * from public.marketplace_customer_eltoque_push_claim(10)")).rows[0];
  ok(fresh.claim_uuid !== old.claim_uuid); equal(fresh.attempt_number, 2);
  equal((await db.query("update public.marketplace_customer_eltoque_push_deliveries set status='sent' where id=$1 and claim_id=$2 returning id", [old.delivery_id, old.claim_uuid])).rows.length, 0);
  await db.query("update public.marketplace_customer_eltoque_push_deliveries set attempt_count=5,claimed_until=now()-interval '1 second' where id=$1", [old.delivery_id]);
  equal((await db.query("select * from public.marketplace_customer_eltoque_push_claim(10)")).rows.length, 0);
});
await check("revocation, expiration and old rate suppress pending claims", async () => {
  await db.exec("update public.marketplace_customer_eltoque_push_deliveries set status='pending',attempt_count=0,claim_id=null,claimed_until=null");
  await db.exec("update public.marketplace_customer_eltoque_push_subscriptions set enabled=false");
  equal((await db.query("select * from public.marketplace_customer_eltoque_push_claim(10)")).rows.length, 0);
  await db.exec("update public.marketplace_customer_eltoque_push_subscriptions set enabled=true,expires_at=now()-interval '1 second'");
  equal((await db.query("select * from public.marketplace_customer_eltoque_push_claim(10)")).rows.length, 0);
  await db.exec("update public.marketplace_customer_eltoque_push_subscriptions set expires_at=now()+interval '1 day'");
  await db.query("update public.project_exchange_rate_history set created_at=now()-interval '13 hours' where id=$1", [rateId]);
  equal((await db.query("select * from public.marketplace_customer_eltoque_push_claim(10)")).rows.length, 0);
});
await check("rollback disables trigger and conserves subscriptions, deliveries and history", async () => {
  const before = await count();
  await db.exec(rollback); await history(460);
  equal(await count(), before);
  equal((await db.query("select count(*) n from public.marketplace_customer_eltoque_push_subscriptions")).rows[0].n, 4);
});
await db.close();
console.log(`SQL_TESTS=${passed} PASSED; in-memory PostgreSQL only; real multi-session locking remains independent validation.`);
