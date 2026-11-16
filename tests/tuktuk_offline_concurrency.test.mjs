/**
 * TUKTUK: modelo de concurrencia totalmente local y determinista.
 * Sin conexiones, SQL, FCM, cargos ni cuentas reales.
 * Los resultados NO certifican comportamiento concurrente real de PostgreSQL.
 */
import test from "node:test";
import assert from "node:assert/strict";

class LocalLab {
  constructor() {
    this.jobs = new Map();
    this.queue = new Map();
    this.outbox = new Set();
    this.walletWrites = 0;
    this.externalCalls = 0;
  }
  publish(id, { service = "passenger", expiresAt = 10000, allowed = null } = {}) {
    if (this.jobs.has(id)) throw Error("DUPLICATE_ID");
    this.jobs.set(id, { id, service, status: "published", expiresAt, driver: null, key: null, allowed });
  }
  available(driver, { service = "passenger", now = 100 } = {}) {
    return [...this.jobs.values()].filter(j =>
      j.status === "published" && j.driver === null && j.expiresAt > now &&
      j.service === service && (j.allowed === null || j.allowed.includes(driver))
    ).map(j => j.id);
  }
  async locked(id, operation) {
    const prior = this.queue.get(id) ?? Promise.resolve();
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    this.queue.set(id, prior.then(() => gate));
    await prior;
    try { return operation(); } finally { release(); }
  }
  async accept(id, driver, key) {
    return this.locked(id, () => {
      const job = this.jobs.get(id);
      if (!job) return { ok: false, code: "JOB_NOT_FOUND" };
      if (job.status === "accepted" && job.driver === driver && job.key === key)
        return { ok: true, replay: true, winner: driver };
      if (job.status !== "published" || job.driver !== null || job.expiresAt <= 100)
        return { ok: false, code: "JOB_NOT_AVAILABLE" };
      job.status = "accepted"; job.driver = driver; job.key = key;
      return { ok: true, replay: false, winner: driver };
    });
  }
  async cancel(id, key) {
    return this.locked(id, () => {
      const job = this.jobs.get(id);
      if (!job) return { ok: false, code: "JOB_NOT_FOUND" };
      if (job.status === "cancelled" && job.cancelKey === key)
        return { ok: true, replay: true };
      if (job.status !== "published") return { ok: false, code: "STATE_REJECTED" };
      job.status = "cancelled"; job.cancelKey = key;
      return { ok: true, replay: false };
    });
  }
  enqueue(jobId, driverId) {
    const key = `mock:${jobId}:${driverId}:marketplace_job_available`;
    if (this.outbox.has(key)) return false;
    this.outbox.add(key); return true;
  }
}

for (const contenders of [2, 10, 25, 50, 100, 200]) {
  test(`una carrera y ${contenders} intentos simultaneos: solo un ganador`, async () => {
    const lab = new LocalLab(); lab.publish("test-job");
    const drivers = Array.from({length: contenders}, (_, i) => `test-driver-${i}`);
    const results = await Promise.all(drivers.map((driver, i) => lab.accept("test-job", driver, `attempt-${i}`)));
    assert.equal(results.filter(r => r.ok).length, 1);
    assert.equal(results.filter(r => !r.ok && r.code === "JOB_NOT_AVAILABLE").length, contenders - 1);
    const index = results.findIndex(r => r.ok);
    const winner = results[index].winner;
    assert.deepEqual(await lab.accept("test-job", winner, `attempt-${index}`), {ok:true,replay:true,winner});
    assert.equal(lab.walletWrites, 0); assert.equal(lab.externalCalls, 0);
  });
}

test("100 carreras distintas y 100 ganadores sin colisiones", async () => {
  const lab = new LocalLab();
  for (let i=0; i<100; i++) lab.publish(`test-job-${i}`);
  const results = await Promise.all(Array.from({length:100}, (_,i) =>
    lab.accept(`test-job-${i}`, `test-driver-${i}`, `try-${i}`)
  ));
  assert.equal(results.filter(r=>r.ok && !r.replay).length,100);
  assert.equal(new Set([...lab.jobs.values()].map(j=>j.id)).size,100);
  assert.equal(lab.walletWrites,0);
});

test("un conductor recien conectado ve una carrera publicada y pendiente", () => {
  const lab=new LocalLab();lab.publish("pending");
  assert.deepEqual(lab.available("driver-offline-before"),["pending"]);
  assert.deepEqual(lab.available("driver-connected-late",{now:500}),["pending"]);
  assert.deepEqual(lab.available("driver-too-late",{now:10000}),[]);
});

test("un destinatario no autorizado o una modalidad incompatible no ven oferta", () => {
  const lab = new LocalLab(); lab.publish("restricted",{allowed:["approved"]});
  assert.deepEqual(lab.available("other"),[]);
  assert.deepEqual(lab.available("approved",{service:"cargo"}),[]);
  assert.deepEqual(lab.available("approved"),["restricted"]);
});

test("cancelar primero evita aceptacion posterior y reintentos duplicados", async () => {
  const lab = new LocalLab();lab.publish("cancel-me");
  assert.deepEqual(await lab.cancel("cancel-me","cancel-key"),{ok:true,replay:false});
  assert.deepEqual(await lab.cancel("cancel-me","cancel-key"),{ok:true,replay:true});
  assert.equal((await lab.accept("cancel-me","reconnecting-driver","try-late")).ok,false);
  assert.deepEqual(lab.available("reconnecting-driver"),[]);
});

test("500 reintentos de aviso crean una sola entrada ficticia por destinatario", () => {
  const lab=new LocalLab();lab.publish("offer");
  for(let i=0;i<500;i++)lab.enqueue("offer","test-driver");
  assert.equal(lab.outbox.size,1);
  lab.enqueue("offer","another-driver");
  assert.equal(lab.outbox.size,2);
  assert.equal(lab.externalCalls,0);
});

test("el laboratorio no registra cargos ni llamadas externas", () => {
  const lab=new LocalLab();lab.publish("test-financial");
  assert.equal(lab.walletWrites,0);
  assert.equal(lab.externalCalls,0);
});
