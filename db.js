// Data layer: real Supabase client or in-memory demo client with the same tiny API surface.
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";

export const DEMO = ["localhost", "127.0.0.1"].includes(location.hostname) && (!SUPABASE_URL || new URLSearchParams(location.search).has("demo"));

export async function createDb() {
  if (!DEMO) {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) throw new Error("Dashboard noch nicht eingerichtet. Supabase-Konfiguration fehlt.");
    const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2.45.4");
    return createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
  let data;
  try { data = (await import("./demo-data.local.js")).default; }
  catch { data = { profiles: [{ id: "c1", role: "coach", name: "Demo Coach", coach_code: "DEMO-0001", onboarded: true }], coach_clients: [] }; }
  return demoClient(structuredClone(data));
}

const uuid = () => crypto.randomUUID();

function demoClient(T) {
  const coach = T.profiles.find((p) => p.role === "coach");
  const views = {
    coach_overview: () => (T.coach_clients || []).filter((c) => c.status === "active").map((cc) => {
      const p = T.profiles.find((x) => x.id === cc.athlete_id);
      const d = (T.daily_logs || []).filter((x) => x.athlete_id === p.id);
      const s = (T.sessions || []).filter((x) => x.athlete_id === p.id).sort((a, b) => b.date.localeCompare(a.date));
      const w = d.filter((x) => x.weight != null).sort((a, b) => a.date.localeCompare(b.date));
      return { coach_id: cc.coach_id, athlete_id: p.id, name: p.name, last_session: s[0]?.date ?? null,
        last_weight: w.at(-1)?.weight ?? null, avg_weight_week: w.at(-1)?.weight ?? null, avg_weight_prev_week: w.at(-2)?.weight ?? null,
        avg_kcal_week: null, sessions_week: 0, last_checkin: (T.checkins || []).filter((c) => c.athlete_id === p.id)[0]?.created_at ?? null };
    }),
    integration_status: () => [],
  };
  class Q {
    constructor(t) { this.t = t; this.f = []; this.op = "select"; this.o = null; this.lim = null; this.single = false; }
    rows() { return views[this.t] ? views[this.t]() : (T[this.t] ||= []); }
    select() { if (this.op === "select") this.op = "select"; this.ret = true; return this; }
    eq(k, v) { this.f.push((r) => String(r[k]) === String(v)); return this; }
    in(k, vs) { this.f.push((r) => vs.map(String).includes(String(r[k]))); return this; }
    gte(k, v) { this.f.push((r) => r[k] >= v); return this; }
    lte(k, v) { this.f.push((r) => r[k] <= v); return this; }
    order(k, o = {}) { this.o = [k, o.ascending !== false]; return this; }
    limit(n) { this.lim = n; return this; }
    maybeSingle() { this.single = true; return this; }
    insert(rows) { this.op = "insert"; this.payload = [].concat(rows); return this; }
    upsert(rows, opt = {}) { this.op = "upsert"; this.payload = [].concat(rows); this.conflict = (opt.onConflict || "id").split(","); return this; }
    update(p) { this.op = "update"; this.payload = p; return this; }
    delete() { this.op = "delete"; return this; }
    run() {
      const all = this.rows(); const match = (r) => this.f.every((fn) => fn(r));
      if (this.op === "insert") { const ins = this.payload.map((r) => ({ id: uuid(), created_at: new Date().toISOString(), ...r })); all.push(...ins); return ins; }
      if (this.op === "upsert") {
        const out = [];
        for (const r of this.payload) {
          const ex = all.find((x) => this.conflict.every((k) => String(x[k]) === String(r[k])));
          if (ex) Object.assign(ex, r); else all.push({ ...r });
          out.push(ex || r);
        }
        return out;
      }
      if (this.op === "update") { const hit = all.filter(match); hit.forEach((r) => Object.assign(r, this.payload)); return hit; }
      if (this.op === "delete") { const keep = all.filter((r) => !match(r)); const del = all.length - keep.length; all.length = 0; all.push(...keep); cascade(this.t); return del; }
      let res = all.filter(match);
      if (this.o) { const [k, asc] = this.o; res = [...res].sort((a, b) => (a[k] > b[k] ? 1 : a[k] < b[k] ? -1 : 0) * (asc ? 1 : -1)); }
      if (this.lim) res = res.slice(0, this.lim);
      return structuredClone(res);
    }
    then(ok, err) {
      try { const d = this.run(); return Promise.resolve({ data: this.single ? (d[0] ?? null) : d, error: null }).then(ok, err); }
      catch (e) { return Promise.resolve({ data: null, error: e }).then(ok, err); }
    }
  }
  function cascade() {
    const ids = (t) => new Set((T[t] || []).map((r) => r.id));
    const ph = ids("phases"); T.workouts = (T.workouts || []).filter((w) => ph.has(w.phase_id));
    const wo = ids("workouts"); T.workout_items = (T.workout_items || []).filter((i) => wo.has(i.workout_id));
    const se = ids("sessions"); T.exercise_logs = (T.exercise_logs || []).filter((l) => se.has(l.session_id));
  }
  const session = { user: { id: coach?.id, email: "coach@demo.local" } };
  return {
    demo: true,
    from: (t) => new Q(t),
    rpc: async (fn) => {
      if (fn === "ensure_coach_code") return { data: coach.coach_code, error: null };
      return { data: null, error: null };
    },
    auth: {
      getSession: async () => ({ data: { session } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      signInWithPassword: async () => ({ data: { session }, error: null }),
      signUp: async () => ({ data: { session }, error: null }),
      signOut: async () => ({}),
      resetPasswordForEmail: async () => ({}),
    },
    storage: { from: () => ({ createSignedUrl: async () => ({ data: { signedUrl: "" } }) }) },
    functions: { invoke: async () => ({ data: { error: "Im Demo-Modus nicht verfügbar" }, error: null }) },
  };
}
