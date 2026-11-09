// manumaniac – Coach dashboard (Preact + htm, no build step)
import { h, render } from "https://esm.sh/preact@10.24.3";
import { useState, useEffect, useMemo, useRef, useCallback } from "https://esm.sh/preact@10.24.3/hooks";
import htm from "https://esm.sh/htm@3.1.1";
import { createDb, DEMO } from "./db.js";
import { APP_STORE_URL } from "./config.js";

const html = htm.bind(h);
let db;

// ───────────────────────── helpers ─────────────────────────
const DAY = 86400000;
const iso = (d) => { const x = new Date(d); x.setMinutes(x.getMinutes() - x.getTimezoneOffset()); return x.toISOString().slice(0, 10); };
const parseDay = (s) => new Date(s + "T00:00:00");
const addDays = (s, n) => iso(parseDay(s).getTime() + n * DAY);
const monday = (s) => { const d = parseDay(s); const wd = (d.getDay() + 6) % 7; return iso(d.getTime() - wd * DAY); };
const today = () => iso(new Date());
const fmtDate = (s, opt = { day: "numeric", month: "short" }) => s ? parseDay(s.slice(0, 10)).toLocaleDateString("de-DE", opt) : "–";
const num = (v, d = 1) => v == null || v === "" || isNaN(v) ? "–" : Number(v).toLocaleString("de-DE", { maximumFractionDigits: d });
const avg = (a) => { const v = a.filter((x) => x != null && !isNaN(x)); return v.length ? v.reduce((s, x) => s + Number(x), 0) / v.length : null; };
const WD = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
const e1rm = (sets) => Math.max(0, ...sets.filter((s) => s.w && s.r).map((s) => s.w * (1 + s.r / 30)));
function summary(log) {
  if (!log) return "";
  if (!log.sets?.length) return log.raw || "";
  const ws = new Set(log.sets.map((s) => s.w ?? 0));
  const reps = log.sets.map((s) => s.r).join("/");
  if (ws.size === 1) { const w = log.sets[0].w; return w ? `${num(w)}×${reps}` : reps; }
  return log.sets.map((s) => `${num(s.w ?? 0)}×${s.r}`).join(" ");
}
/** Inverse of summary(): "32×8/7/7", "30x8 32x6", "10/10/8" → sets */
function parseSets(t) {
  t = (t || "").replace(/×/g, "x").replace(/,/g, ".").trim();
  if (!t) return [];
  const out = [];
  for (const tok of t.split(/\s+/)) {
    const m = /^(\d+(?:\.\d+)?)x([\d/]+)$/.exec(tok);
    if (m) m[2].split("/").filter(Boolean).forEach((r) => out.push({ w: +m[1], r: +r }));
    else if (/^[\d/]+$/.test(tok)) tok.split("/").filter(Boolean).forEach((r) => out.push({ w: null, r: +r }));
    else return null;
  }
  return out;
}
const must = async (p) => { const { data, error } = await p; if (error) { alert(error.message || String(error)); throw error; } return data; };

// ───────────────────────── App ─────────────────────────
function App() {
  const [session, setSession] = useState(undefined);
  const [profile, setProfile] = useState(null);

  useEffect(() => {
    (async () => {
      try { db = await createDb(); } catch (e) {
        const root = document.getElementById("app");
        root.textContent = "manumaniac: Dashboard noch nicht eingerichtet. Bitte Backend-Konfiguration ergänzen.";
        return;
      }
      const { data } = await db.auth.getSession();
      setSession(data.session);
      db.auth.onAuthStateChange((_e, s) => setSession(s));
    })();
  }, []);

  useEffect(() => {
    if (!session) { setProfile(null); return; }
    db.from("profiles").select("*").eq("id", session.user.id).maybeSingle().then(({ data }) => setProfile(data));
  }, [session]);

  if (session === undefined) return html`<div class="center"><${Wordmark} size=${36} /></div>`;
  if (!session) return html`<${Login} />`;
  if (!profile) return html`<div class="center muted">Lade…</div>`;
  if (profile.role !== "coach" || !profile.onboarded) return html`<${CoachSetup} profile=${profile} onDone=${setProfile} />`;
  return html`<${Dashboard} profile=${profile} />`;
}

const Wordmark = ({ size = 20 }) => html`<span class="wordmark" style=${{ fontSize: size + "px" }}>manu<b>maniac</b></span>`;

function Login() {
  const [mode, setMode] = useState("in");
  const [f, setF] = useState({ name: "", email: "", pw: "" });
  const [msg, setMsg] = useState("");
  const submit = async (e) => {
    e.preventDefault(); setMsg("");
    const r = mode === "in"
      ? await db.auth.signInWithPassword({ email: f.email, password: f.pw })
      : await db.auth.signUp({ email: f.email, password: f.pw, options: { data: { name: f.name, role: "coach" } } });
    if (r.error) setMsg(r.error.message);
    else if (mode === "up" && !r.data.session) setMsg("Bitte bestätige deine E-Mail und melde dich dann an.");
  };
  return html`
    <div class="login">
      <${Wordmark} size=${40} />
      <p class="muted">Coach-Dashboard</p>
      <form onSubmit=${submit}>
        ${mode === "up" && html`<input placeholder="Name" value=${f.name} onInput=${(e) => setF({ ...f, name: e.target.value })} />`}
        <input type="email" placeholder="E-Mail" value=${f.email} onInput=${(e) => setF({ ...f, email: e.target.value })} />
        <input type="password" placeholder="Passwort" value=${f.pw} onInput=${(e) => setF({ ...f, pw: e.target.value })} />
        <button class="primary">${mode === "in" ? "Anmelden" : "Als Coach registrieren"}</button>
        ${msg && html`<p class="msg">${msg}</p>`}
      </form>
      <button class="link" onClick=${() => setMode(mode === "in" ? "up" : "in")}>
        ${mode === "in" ? "Neu hier? Als Coach registrieren" : "Ich habe schon einen Account"}</button>
      ${mode === "in" && html`<button class="link" onClick=${async () => { await db.auth.resetPasswordForEmail(f.email); setMsg("Link zum Zurücksetzen ist unterwegs."); }}>Passwort vergessen?</button>`}
    </div>`;
}

function CoachSetup({ profile, onDone }) {
  const [name, setName] = useState(profile.name || "");
  if (profile.role === "athlete" && profile.onboarded) {
    return html`<div class="login"><${Wordmark} size=${32} /><p>Dieses Dashboard ist für Coaches. Als Kunde nutzt du die iOS-App.</p>
      <button class="link" onClick=${() => db.auth.signOut()}>Abmelden</button></div>`;
  }
  const save = async () => {
    await must(db.from("profiles").update({ role: "coach", name, onboarded: true }).eq("id", profile.id));
    await db.rpc("ensure_coach_code");
    const { data } = await db.from("profiles").select("*").eq("id", profile.id).maybeSingle();
    onDone(data);
  };
  return html`<div class="login"><${Wordmark} size=${32} /><h2>Dein Coach-Profil</h2>
    <input placeholder="Name" value=${name} onInput=${(e) => setName(e.target.value)} />
    <button class="primary" disabled=${!name} onClick=${save}>Weiter</button></div>`;
}

// ───────────────────────── Dashboard ─────────────────────────
function Dashboard({ profile }) {
  const [clients, setClients] = useState([]);
  const [sel, setSel] = useState(null);
  const [code, setCode] = useState(profile.coach_code);
  const loadClients = useCallback(async () => {
    const { data } = await db.from("coach_overview").select("*").eq("coach_id", profile.id).order("name");
    setClients(data || []);
    if (!sel && data?.length) setSel(data[0].athlete_id);
  }, [sel]);
  useEffect(() => { loadClients(); if (!code) db.rpc("ensure_coach_code").then(({ data }) => setCode(data)); }, []);
  const invite = code ? `${location.origin}${location.pathname.replace(/[^/]*$/, "")}join.html?code=${code}` : "";

  return html`
    <div class="layout">
      <aside>
        <div class="side-head"><${Wordmark} size=${20} />${DEMO && html`<span class="tag accent">Demo</span>`}</div>
        <div class="side-label">Kunden</div>
        ${clients.map((c) => html`
          <button class=${"client" + (c.athlete_id === sel ? " on" : "")} onClick=${() => setSel(c.athlete_id)}>
            <span>${c.name}</span>
            <small>${c.last_weight ? num(c.last_weight) + " kg" : ""}${c.last_session ? " · " + fmtDate(c.last_session) : ""}</small>
          </button>`)}
        ${!clients.length && html`<p class="muted small">Noch keine Kunden.</p>`}
        <div class="invite">
          <div class="side-label">Einladen</div>
          <div class="code">${code || "…"}</div>
          <button class="small-btn" onClick=${() => { navigator.clipboard.writeText(`Hey! Ich coache dich ab jetzt über manumaniac. Lade die App${APP_STORE_URL ? " (" + APP_STORE_URL + ")" : ""}, wähle "Ich werde gecoacht" und gib meinen Code ein: ${code}\n${invite}`); }}>Einladung kopieren</button>
        </div>
        <div class="side-foot">
          <span class="muted small">${profile.name}</span>
          <button class="link small" onClick=${() => db.auth.signOut()}>Abmelden</button>
        </div>
      </aside>
      <main>${sel ? html`<${Client} key=${sel} athleteId=${sel} onChange=${loadClients} />` : html`<div class="empty">
        <h2>Willkommen, ${profile.name}</h2><p class="muted">Lade deinen ersten Kunden ein: Code <b>${code}</b> in der App eingeben lassen.</p></div>`}</main>
    </div>`;
}

async function loadAthlete(id) {
  const q = (t, o, asc = true) => db.from(t).select("*").eq("athlete_id", id).order(o, { ascending: asc });
  const [profile, phases, workouts, items, sessions, logs, runs, daily, targets, checkins, ts, lib] = await Promise.all([
    db.from("profiles").select("*").eq("id", id).maybeSingle(),
    q("phases", "start_date"), q("workouts", "position"), q("workout_items", "position"),
    q("sessions", "date", false), q("exercise_logs", "created_at", false), q("runs", "date", false),
    q("daily_logs", "date"), q("weekly_targets", "week_start", false), q("checkins", "week_start", false),
    db.from("tracker_settings").select("*").eq("athlete_id", id).maybeSingle(),
    db.from("exercises").select("name,category,video_url").order("name"),
  ]);
  return {
    profile: profile.data, phases: phases.data || [], workouts: workouts.data || [], items: items.data || [],
    sessions: sessions.data || [], logs: logs.data || [], runs: runs.data || [], daily: daily.data || [],
    targets: targets.data || [], checkins: checkins.data || [],
    fields: ts.data?.fields ?? ["protein", "carbs", "fat", "steps", "rhr", "hrv", "appetite", "readiness", "note"],
    library: lib.data || [],
  };
}

function Client({ athleteId, onChange }) {
  const [A, setA] = useState(null);
  const [tab, setTab] = useState("program");
  const [showImport, setShowImport] = useState(false);
  const reload = useCallback(async () => setA(await loadAthlete(athleteId)), [athleteId]);
  useEffect(() => { reload(); }, [athleteId]);
  if (!A) return html`<div class="center muted">Lade…</div>`;

  const w = A.daily.filter((d) => d.weight != null);
  const last7 = avg(w.slice(-7).map((d) => d.weight)), prev7 = avg(w.slice(-14, -7).map((d) => d.weight));
  const tabs = [["program", "Programm"], ["tracker", "Tracker"], ["stats", "Statistik"], ["checkins", "Pit-Stops"]];
  return html`
    <div class="client-head">
      <div>
        <h1>${A.profile?.name}</h1>
        <div class="muted small">${[A.profile?.goal, A.profile?.height_cm && A.profile.height_cm + " cm", A.sessions[0] && "letztes Training " + fmtDate(A.sessions[0].date)].filter(Boolean).join(" · ")}</div>
      </div>
      <div class="kpis">
        <${Kpi} label="Ø Gewicht (7 Einträge)" value=${last7 ? num(last7) + " kg" : "–"} delta=${last7 && prev7 ? (last7 - prev7 >= 0 ? "+" : "") + num(last7 - prev7) + " kg" : ""} />
        <${Kpi} label="Trainings (30 Tage)" value=${A.sessions.filter((s) => s.date >= addDays(today(), -30)).length} />
        <${Kpi} label="Pit-Stops" value=${A.checkins.length} />
      </div>
    </div>
    <nav class="tabs">
      ${tabs.map(([k, l]) => html`<button class=${tab === k ? "on" : ""} onClick=${() => setTab(k)}>${l}</button>`)}
      <span class="grow"></span>
      <button class="small-btn" onClick=${() => setShowImport(true)}>Sheet importieren</button>
    </nav>
    ${tab === "program" && html`<${Program} A=${A} athleteId=${athleteId} reload=${reload} />`}
    ${tab === "tracker" && html`<${Tracker} A=${A} athleteId=${athleteId} reload=${reload} />`}
    ${tab === "stats" && html`<${Stats} A=${A} />`}
    ${tab === "checkins" && html`<${Checkins} A=${A} />`}
    ${showImport && html`<${ImportModal} athleteId=${athleteId} onClose=${() => setShowImport(false)} onDone=${() => { reload(); onChange(); }} />`}
  `;
}

const Kpi = ({ label, value, delta }) => html`<div class="kpi"><small>${label}</small><b>${value}</b>${delta && html`<small>${delta}</small>`}</div>`;

// ───────────────────────── Program (sheet) ─────────────────────────
function currentPhaseId(phases) {
  const t = today(); const act = phases.filter((p) => !p.archived);
  const inP = act.filter((p) => p.start_date <= t && addDays(p.start_date, p.weeks * 7) > t);
  return (inP.at(-1) || act.at(-1) || phases.at(-1))?.id;
}

function Program({ A, athleteId, reload }) {
  const [phaseId, setPhaseId] = useState(() => currentPhaseId(A.phases));
  const [scope, setScope] = useState("all");      // "all" | week index
  const [showArchived, setShowArchived] = useState(false);
  const phase = A.phases.find((p) => p.id === phaseId);
  const phases = [...A.phases].filter((p) => showArchived || !p.archived).sort((a, b) => b.start_date.localeCompare(a.start_date));
  const workouts = A.workouts.filter((w) => w.phase_id === phaseId).sort((a, b) => a.position - b.position);

  const savePhase = async (patch) => { await must(db.from("phases").update(patch).eq("id", phaseId)); reload(); };
  const newPhase = async () => {
    const last = [...A.phases].sort((a, b) => a.start_date.localeCompare(b.start_date)).at(-1);
    const start = last ? addDays(last.start_date, last.weeks * 7) : monday(today());
    const [p] = await must(db.from("phases").insert({ athlete_id: athleteId, name: "Neue Phase", start_date: start, weeks: 4,
      week_offset: 0, schedule: {}, week_info: {} }).select());
    await reload(); setPhaseId(p.id);
  };
  const duplicate = async () => {
    const start = addDays(phase.start_date, phase.weeks * 7);
    const [p] = await must(db.from("phases").insert({ athlete_id: athleteId, name: phase.name, subtitle: null, start_date: start,
      weeks: phase.weeks, week_offset: phase.week_offset + phase.weeks, schedule: {}, week_info: {} }).select());
    const map = {};
    for (const w of workouts) {
      const [nw] = await must(db.from("workouts").insert({ phase_id: p.id, athlete_id: athleteId, name: w.name, kind: w.kind, warmup: w.warmup, position: w.position }).select());
      map[w.id] = nw.id;
      const its = A.items.filter((i) => i.workout_id === w.id).map(({ id, workout_id, ...rest }) => ({ ...rest, workout_id: nw.id, week_overrides: {} }));
      if (its.length) await must(db.from("workout_items").insert(its));
    }
    const sched = Object.fromEntries(Object.entries(phase.schedule || {}).map(([d, wid]) => [d, map[wid]]).filter(([, v]) => v));
    await must(db.from("phases").update({ schedule: sched }).eq("id", p.id));
    await reload(); setPhaseId(p.id);
  };
  const delPhase = async () => {
    if (!confirm(`Phase "${phase.name}" mit allen Workouts löschen? Bereits geloggte Trainings bleiben erhalten.`)) return;
    await must(db.from("phases").delete().eq("id", phaseId)); await reload(); setPhaseId(currentPhaseId(A.phases.filter((p) => p.id !== phaseId)));
  };
  const addWorkout = async (kind) => {
    await must(db.from("workouts").insert({ phase_id: phaseId, athlete_id: athleteId, name: kind === "run" ? "Run" : "Neues Workout", kind, position: workouts.length }));
    reload();
  };

  return html`
    <div class="phase-tabs">
      ${phases.map((p) => html`<button class=${"chip" + (p.id === phaseId ? " on" : "") + (p.archived ? " dim" : "")} onClick=${() => { setPhaseId(p.id); setScope("all"); }}>
        ${p.name}${p.subtitle ? html` <small>${p.subtitle}</small>` : ""}</button>`)}
      <button class="chip add" onClick=${newPhase}>+ Phase</button>
      <label class="muted small check"><input type="checkbox" checked=${showArchived} onChange=${(e) => setShowArchived(e.target.checked)} /> Archiv</label>
    </div>
    ${!phase ? html`<div class="empty"><p class="muted">Noch kein Programm. Lege eine Phase an oder importiere das Sheet.</p></div>` : html`
      <div class="phase-bar">
        <${Field} label="Name" value=${phase.name} onSave=${(v) => savePhase({ name: v })} />
        <${Field} label="Untertitel" value=${phase.subtitle || ""} onSave=${(v) => savePhase({ subtitle: v || null })} w=${90} />
        <${Field} label="Start (Montag)" type="date" value=${phase.start_date} onSave=${(v) => savePhase({ start_date: monday(v) })} w=${150} />
        <${Field} label="Wochen" type="number" value=${phase.weeks} onSave=${(v) => savePhase({ weeks: Math.max(1, +v || 1) })} w=${70} />
        <${Field} label="Erste Woche Nr." type="number" value=${phase.week_offset + 1} onSave=${(v) => savePhase({ week_offset: Math.max(0, (+v || 1) - 1) })} w=${90} />
        <span class="grow"></span>
        <button class="small-btn" onClick=${duplicate}>Duplizieren als nächste Phase</button>
        <button class="small-btn" onClick=${() => savePhase({ archived: !phase.archived })}>${phase.archived ? "Wiederherstellen" : "Archivieren"}</button>
        <button class="small-btn danger" onClick=${delPhase}>Löschen</button>
      </div>
      <${Weeks} phase=${phase} scope=${scope} setScope=${setScope} savePhase=${savePhase} />
      <${Schedule} phase=${phase} workouts=${workouts} savePhase=${savePhase} />
      <datalist id="exlib">${A.library.map((e) => html`<option value=${e.name} />`)}</datalist>
      <div class="blocks">
        ${workouts.map((w) => html`<${WorkoutBlock} key=${w.id} w=${w} A=${A} phase=${phase} scope=${scope} reload=${reload} />`)}
        <div class="block-add">
          <button class="chip add" onClick=${() => addWorkout("strength")}>+ Kraft-Workout</button>
          <button class="chip add" onClick=${() => addWorkout("run")}>+ Lauf</button>
        </div>
      </div>`}
  `;
}

/** Inline-editable field (saves on blur / enter). */
function Field({ label, value, onSave, type = "text", w }) {
  return html`<label class="field" style=${w ? { width: w + "px" } : {}}><small>${label}</small>
    <input type=${type} defaultValue=${value} key=${value}
      onBlur=${(e) => { if (String(e.target.value) !== String(value ?? "")) onSave(e.target.value); }}
      onKeyDown=${(e) => e.key === "Enter" && e.target.blur()} /></label>`;
}

function Weeks({ phase, scope, setScope, savePhase }) {
  const info = phase.week_info || {};
  const t = today();
  const setInfo = (i, k, v) => { const n = { ...info, [i]: { ...(info[i] || {}), [k]: v || undefined } }; savePhase({ week_info: n }); };
  return html`<div class="weeks">
    <button class=${"week-scope" + (scope === "all" ? " on" : "")} onClick=${() => setScope("all")}>Alle Wochen<small>Vorlage</small></button>
    ${Array.from({ length: phase.weeks }, (_, i) => {
      const start = addDays(phase.start_date, i * 7); const cur = t >= start && t < addDays(start, 7);
      return html`<div class=${"week" + (scope === i ? " on" : "") + (cur ? " cur" : "")}>
        <button class="week-head" onClick=${() => setScope(scope === i ? "all" : i)}>W${phase.week_offset + i + 1} <small>${fmtDate(start)}</small></button>
        <input placeholder="Label" defaultValue=${info[i]?.label || ""} key=${"l" + i + (info[i]?.label || "")} onBlur=${(e) => e.target.value !== (info[i]?.label || "") && setInfo(i, "label", e.target.value)} />
        <input placeholder="Notiz" defaultValue=${info[i]?.note || ""} key=${"n" + i + (info[i]?.note || "")} onBlur=${(e) => e.target.value !== (info[i]?.note || "") && setInfo(i, "note", e.target.value)} />
      </div>`;
    })}
  </div>
  ${scope !== "all" && html`<p class="scope-hint">Änderungen gelten nur für <b>W${phase.week_offset + scope + 1}</b>. Abweichungen von der Vorlage sind gelb markiert.</p>`}`;
}

function Schedule({ phase, workouts, savePhase }) {
  const s = phase.schedule || {};
  return html`<div class="schedule"><span class="muted small">Wochenplan</span>
    ${WD.map((d, i) => html`<label><small>${d}</small>
      <select value=${s[i + 1] || ""} onChange=${(e) => { const n = { ...s }; if (e.target.value) n[i + 1] = e.target.value; else delete n[i + 1]; savePhase({ schedule: n }); }}>
        <option value="">Off</option>${workouts.map((w) => html`<option value=${w.id}>${w.name}</option>`)}
      </select></label>`)}
  </div>`;
}

const STRENGTH_COLS = [["slot", "Slot", 44], ["category", "Kategorie", 120], ["exercise", "Übung", 210], ["sets", "Sätze", 50], ["reps", "Reps", 64],
  ["tempo", "Tempo", 70], ["rir", "RIR", 40], ["coach_note", "Anmerkungen", 180]];
const RUN_COLS = [["duration", "Dauer", 80], ["exercise", "Workout", 160], ["pace", "Pace", 150], ["coach_note", "Anmerkungen", 240]];

function WorkoutBlock({ w, A, phase, scope, reload }) {
  const items = A.items.filter((i) => i.workout_id === w.id).sort((a, b) => a.position - b.position);
  const cols = w.kind === "run" ? RUN_COLS : STRENGTH_COLS;
  const weeks = Array.from({ length: phase.weeks }, (_, i) => i);
  // performance per item per week
  const perf = useMemo(() => {
    const m = {};
    const sess = A.sessions.filter((s) => s.phase_id === phase.id && (s.workout_id === w.id || s.workout_name === w.name));
    for (const s of sess) {
      const wi = s.week_index ?? Math.floor((parseDay(s.date) - parseDay(phase.start_date)) / (7 * DAY));
      for (const l of A.logs.filter((l) => l.session_id === s.id)) {
        const it = items.find((i) => i.id === l.item_id) || items.find((i) => i.exercise.toLowerCase() === l.exercise.toLowerCase());
        if (it) (m[it.id] ||= {})[wi] = l;
      }
    }
    return m;
  }, [A, w.id, phase.id]);

  const resolved = (it, k) => scope !== "all" && it.week_overrides?.[scope] && k in it.week_overrides[scope] ? it.week_overrides[scope][k] : it[k];
  const isOverridden = (it, k) => scope !== "all" && it.week_overrides?.[scope] && k in it.week_overrides[scope];

  const saveCell = async (it, k, v) => {
    v = v === "" ? null : v;
    if (scope === "all") {
      const patch = { [k]: v };
      if (k === "exercise") { const lib = A.library.find((e) => e.name.toLowerCase() === (v || "").toLowerCase()); if (lib) { patch.video_url = lib.video_url; if (!it.category && lib.category) patch.category = lib.category; } }
      await must(db.from("workout_items").update(patch).eq("id", it.id));
    } else {
      const ov = structuredClone(it.week_overrides || {});
      const wk = ov[scope] || {};
      if ((it[k] ?? null) === v) delete wk[k]; else wk[k] = v;
      if (Object.keys(wk).length) ov[scope] = wk; else delete ov[scope];
      await must(db.from("workout_items").update({ week_overrides: ov }).eq("id", it.id));
    }
    reload();
  };
  const savePerf = async (it, wi, text) => {
    const sets = parseSets(text);
    if (sets === null) { alert("Format: 32x8/8/7  oder  30x8 32x6  oder  10/10/8"); return; }
    const existing = perf[it.id]?.[wi];
    if (existing) {
      if (!sets.length) await must(db.from("exercise_logs").delete().eq("id", existing.id));
      else await must(db.from("exercise_logs").update({ sets, raw: null, needs_review: false }).eq("id", existing.id));
    } else if (sets.length) {
      let s = A.sessions.find((x) => x.phase_id === phase.id && x.workout_id === w.id && x.week_index === wi);
      if (!s) {
        const wd = Number(Object.entries(phase.schedule || {}).find(([, v]) => v === w.id)?.[0] || 1);
        [s] = await must(db.from("sessions").insert({ athlete_id: w.athlete_id, workout_id: w.id, phase_id: phase.id, workout_name: w.name,
          week_index: wi, date: addDays(phase.start_date, wi * 7 + wd - 1), source: "coach" }).select());
      }
      await must(db.from("exercise_logs").insert({ session_id: s.id, athlete_id: w.athlete_id, item_id: it.id, exercise: it.exercise, position: it.position, sets }));
    }
    reload();
  };
  const addRow = async () => {
    await must(db.from("workout_items").insert({ workout_id: w.id, athlete_id: w.athlete_id, position: items.length, exercise: w.kind === "run" ? "Easy Run" : "Neue Übung", week_overrides: {} }));
    reload();
  };
  const move = async (it, dir) => {
    const j = items.indexOf(it) + dir; if (j < 0 || j >= items.length) return;
    const other = items[j];
    await Promise.all([db.from("workout_items").update({ position: other.position }).eq("id", it.id), db.from("workout_items").update({ position: it.position }).eq("id", other.id)]);
    reload();
  };
  const del = async (it) => { if (confirm(`"${it.exercise}" entfernen?`)) { await must(db.from("workout_items").delete().eq("id", it.id)); reload(); } };
  const saveW = async (patch) => { await must(db.from("workouts").update(patch).eq("id", w.id)); reload(); };
  const delW = async () => { if (confirm(`Workout "${w.name}" löschen?`)) { await must(db.from("workouts").delete().eq("id", w.id)); reload(); } };

  return html`<section class="block">
    <header>
      <input class="block-title" defaultValue=${w.name} key=${w.name} onBlur=${(e) => e.target.value !== w.name && saveW({ name: e.target.value })} />
      <span class="tag">${w.kind === "run" ? "Lauf" : "Kraft"}</span>
      <input class="warmup" placeholder="Warm-up (optional)" defaultValue=${w.warmup || ""} key=${"wu" + (w.warmup || "")} onBlur=${(e) => e.target.value !== (w.warmup || "") && saveW({ warmup: e.target.value || null })} />
      <button class="icon" title="Workout löschen" onClick=${delW}>✕</button>
    </header>
    <div class="table-wrap"><table class="sheet">
      <thead><tr>${cols.map(([, l, wd]) => html`<th style=${{ minWidth: wd + "px" }}>${l}</th>`)}
        ${w.kind !== "run" && weeks.map((i) => html`<th class=${"perf" + (scope === i ? " on" : "")}>W${phase.week_offset + i + 1}</th>`)}<th></th></tr></thead>
      <tbody>${items.map((it) => html`<tr>
        ${cols.map(([k]) => html`<td class=${isOverridden(it, k) ? "ov" : ""}>
          <input defaultValue=${resolved(it, k) ?? ""} key=${k + scope + (resolved(it, k) ?? "")} list=${k === "exercise" && w.kind !== "run" ? "exlib" : undefined}
            onBlur=${(e) => { if (e.target.value !== String(resolved(it, k) ?? "")) saveCell(it, k, e.target.value); }}
            onKeyDown=${(e) => e.key === "Enter" && e.target.blur()} />
          ${k === "exercise" && it.video_url ? html`<a class="vid" href=${it.video_url} target="_blank" title="Video">▶</a>` : ""}</td>`)}
        ${w.kind !== "run" && weeks.map((i) => {
          const l = perf[it.id]?.[i];
          return html`<td class=${"perf" + (l?.needs_review ? " review" : "") + (scope === i ? " on" : "")} title=${l?.note ? "Notiz: " + l.note : l?.raw && l.needs_review ? "Original: " + l.raw : ""}>
            <input defaultValue=${summary(l)} key=${"p" + i + summary(l)} placeholder="–"
              onBlur=${(e) => { if (e.target.value !== summary(l)) savePerf(it, i, e.target.value); }} onKeyDown=${(e) => e.key === "Enter" && e.target.blur()} />
            ${l?.note ? html`<i class="note-dot"></i>` : ""}</td>`;
        })}
        <td class="row-actions"><button class="icon" onClick=${() => move(it, -1)}>↑</button><button class="icon" onClick=${() => move(it, 1)}>↓</button><button class="icon" onClick=${() => del(it)}>✕</button></td>
      </tr>`)}</tbody>
    </table></div>
    <button class="link small" onClick=${addRow}>+ ${w.kind === "run" ? "Zeile" : "Übung"}</button>
  </section>`;
}

// ───────────────────────── Tracker ─────────────────────────
const TRACK_COLS = [["weight", "Gewicht", "kg", 1], ["kcal", "kcal", "", 0], ["protein", "Protein", "g", 0], ["carbs", "Carbs", "g", 0], ["fat", "Fett", "g", 0],
  ["steps", "Schritte", "", 0], ["rhr", "RHR", "", 0], ["hrv", "HRV", "", 0], ["appetite", "Appetit", "1–5", 0], ["readiness", "Readiness", "1–5", 0]];
const OPTIONAL = ["protein", "carbs", "fat", "steps", "rhr", "hrv", "appetite", "readiness", "note"];
const FIELD_LABEL = { protein: "Protein", carbs: "Carbs", fat: "Fett", steps: "Schritte", rhr: "Ruhepuls", hrv: "HRV", appetite: "Appetit", readiness: "Readiness", note: "Notiz" };
const TARGET_FIELDS = [["kcal", "Kalorien", "number"], ["protein", "Protein (g)", "number"], ["carbs", "Carbs (g)", "number"], ["fat", "Fett (g)", "number"],
  ["steps", "Schritte", "text"], ["goal", "Target", "text"], ["focus", "Fokus Ernährung", "text"], ["training_focus", "Fokus Training", "text"],
  ["strength_freq", "Strength", "text"], ["endurance_freq", "Endurance", "text"], ["lifestyle_focus", "Fokus Lifestyle", "text"]];

function Tracker({ A, athleteId, reload }) {
  const initial = useMemo(() => {
    const cur = monday(today());
    if (A.daily.some((d) => d.date >= cur)) return cur;
    const lastW = [...A.daily].reverse().find((d) => d.weight != null || d.kcal != null);
    return lastW ? monday(lastW.date) : cur;
  }, []);
  const [ws, setWs] = useState(initial);
  const days = Array.from({ length: 7 }, (_, i) => addDays(ws, i));
  const byDate = Object.fromEntries(A.daily.map((d) => [d.date, d]));
  const target = A.targets.find((t) => t.week_start <= ws);
  const exact = A.targets.find((t) => t.week_start === ws);
  const prevAvg = avg(A.daily.filter((d) => d.date >= addDays(ws, -7) && d.date < ws).map((d) => d.weight));
  const curAvg = avg(days.map((d) => byDate[d]?.weight));
  const plan = (date) => {
    const p = A.phases.find((p) => !p.archived && p.start_date <= date && addDays(p.start_date, p.weeks * 7) > date);
    const wid = p?.schedule?.[((parseDay(date).getDay() + 6) % 7) + 1];
    return A.workouts.find((w) => w.id === wid)?.name || "";
  };
  const done = (date) => [...A.sessions.filter((s) => s.date === date).map((s) => s.workout_name), ...A.runs.filter((r) => r.date === date).map((r) => r.name || "Lauf")];

  const saveDay = async (date, k, v) => {
    const row = { ...(byDate[date] || { athlete_id: athleteId, date, action_done: [false, false, false] }) };
    row[k] = v === "" ? null : (["shift", "note"].includes(k) ? v : Number(String(v).replace(",", ".")));
    await must(db.from("daily_logs").upsert(row, { onConflict: "athlete_id,date" }));
    reload();
  };
  const toggleAction = async (date, i) => {
    const row = { ...(byDate[date] || { athlete_id: athleteId, date }) };
    const a = [...(row.action_done || [false, false, false])]; a[i] = !a[i]; row.action_done = a;
    await must(db.from("daily_logs").upsert(row, { onConflict: "athlete_id,date" })); reload();
  };
  const saveTarget = async (k, v) => {
    const base = exact || { ...(target || {}), athlete_id: athleteId, week_start: ws };
    const row = { ...base, week_start: ws, athlete_id: athleteId };
    row[k] = v === "" ? null : (["kcal", "protein", "carbs", "fat"].includes(k) ? Number(v) : v);
    if (["protein", "carbs", "fat"].includes(k) && row.protein != null && row.carbs != null && row.fat != null) row.kcal = row.protein * 4 + row.carbs * 4 + row.fat * 9;
    await must(db.from("weekly_targets").upsert(row, { onConflict: "athlete_id,week_start" })); reload();
  };
  const saveAction = async (i, v) => { const a = [...(exact?.action_steps || target?.action_steps || ["", "", ""])]; a[i] = v; await saveTarget("action_steps", a); };
  const toggleField = async (f) => {
    const fields = A.fields.includes(f) ? A.fields.filter((x) => x !== f) : [...A.fields, f];
    await must(db.from("tracker_settings").upsert({ athlete_id: athleteId, fields }, { onConflict: "athlete_id" })); reload();
  };
  const t = exact || target || {};
  const actions = t.action_steps || ["", "", ""];

  return html`<div class="tracker">
    <div class="week-nav">
      <button class="icon" onClick=${() => setWs(addDays(ws, -7))}>◀</button>
      <b>Woche ab ${fmtDate(ws, { weekday: "short", day: "numeric", month: "long", year: "numeric" })}</b>
      <button class="icon" onClick=${() => setWs(addDays(ws, 7))}>▶</button>
      <button class="link small" onClick=${() => setWs(monday(today()))}>Diese Woche</button>
      <span class="grow"></span>
      <span class="muted small">Ø Gewicht <b>${num(curAvg)} kg</b>${curAvg && prevAvg ? html` · Vorwoche ${(curAvg - prevAvg >= 0 ? "+" : "") + num(curAvg - prevAvg)} kg (${num((curAvg - prevAvg) / prevAvg * 100, 2)} %)` : ""}</span>
    </div>
    <div class="table-wrap"><table class="sheet tracker-table">
      <thead><tr><th>Tag</th><th>Training</th>${TRACK_COLS.map(([, l, u]) => html`<th>${l}${u && html` <small>${u}</small>`}</th>`)}<th>Dienstplan</th><th style="min-width:200px">Notizen</th>
        ${actions.map((a, i) => html`<th class="act" title=${a}>✓${i + 1}</th>`)}</tr></thead>
      <tbody>${days.map((d) => { const r = byDate[d] || {}; const dn = done(d); return html`<tr class=${d === today() ? "today" : ""}>
        <td class="day">${WD[(parseDay(d).getDay() + 6) % 7]} <small>${fmtDate(d)}</small></td>
        <td class="plan" title=${dn.join(", ")}>${dn.length ? html`<b>✓ ${dn.join(", ")}</b>` : html`<span class="muted">${plan(d)}</span>`}</td>
        ${TRACK_COLS.map(([k]) => html`<td><input defaultValue=${r[k] ?? ""} key=${k + d + (r[k] ?? "")} onBlur=${(e) => e.target.value !== String(r[k] ?? "") && saveDay(d, k, e.target.value)} onKeyDown=${(e) => e.key === "Enter" && e.target.blur()} /></td>`)}
        <td><input defaultValue=${r.shift ?? ""} key=${"s" + d + (r.shift ?? "")} onBlur=${(e) => e.target.value !== (r.shift ?? "") && saveDay(d, "shift", e.target.value)} /></td>
        <td><input defaultValue=${r.note ?? ""} key=${"n" + d + (r.note ?? "")} onBlur=${(e) => e.target.value !== (r.note ?? "") && saveDay(d, "note", e.target.value)} /></td>
        ${actions.map((_, i) => html`<td class="act"><input type="checkbox" checked=${!!r.action_done?.[i]} onChange=${() => toggleAction(d, i)} /></td>`)}
      </tr>`; })}
      <tr class="avg"><td>Ø</td><td></td>${TRACK_COLS.map(([k, , , dg]) => html`<td>${num(avg(days.map((d) => byDate[d]?.[k])), dg)}</td>`)}<td></td><td></td>${actions.map(() => html`<td></td>`)}</tr>
      </tbody></table></div>

    <div class="targets">
      <h3>Vorgaben & Targets <small class="muted">${exact ? "für diese Woche" : target ? "übernommen aus Woche ab " + fmtDate(target.week_start) : "noch keine"}</small></h3>
      <div class="target-grid">
        ${TARGET_FIELDS.map(([k, l, type]) => html`<${Field} label=${l} type=${type} value=${t[k] ?? ""} onSave=${(v) => saveTarget(k, v)} />`)}
      </div>
      <div class="target-grid wide">
        <label class="field"><small>Meal Setup</small><textarea defaultValue=${t.meal_setup ?? ""} key=${"m" + ws + (t.meal_setup ?? "")} onBlur=${(e) => e.target.value !== (t.meal_setup ?? "") && saveTarget("meal_setup", e.target.value)}></textarea></label>
        <label class="field"><small>Notizen / Non-Negotiables</small><textarea defaultValue=${t.notes ?? ""} key=${"no" + ws + (t.notes ?? "")} onBlur=${(e) => e.target.value !== (t.notes ?? "") && saveTarget("notes", e.target.value)}></textarea></label>
      </div>
      <div class="target-grid">
        ${["Action Step Ernährung", "Action Step Training", "Action Step Lifestyle"].map((l, i) => html`<${Field} label=${l} value=${actions[i] ?? ""} onSave=${(v) => saveAction(i, v)} />`)}
      </div>
      <div class="fields-toggle"><span class="muted small">Felder in der App des Kunden:</span>
        ${OPTIONAL.map((f) => html`<label class="check small"><input type="checkbox" checked=${A.fields.includes(f)} onChange=${() => toggleField(f)} /> ${FIELD_LABEL[f]}</label>`)}
      </div>
    </div>
  </div>`;
}

// ───────────────────────── Stats ─────────────────────────
let ChartLib;
async function chartLib() {
  if (!ChartLib) { ChartLib = (await import("https://esm.sh/chart.js@4.4.4/auto")).default; ChartLib.defaults.font.family = getComputedStyle(document.body).fontFamily; ChartLib.defaults.font.size = 11; ChartLib.defaults.color = "#8a8a8f"; }
  return ChartLib;
}
function ChartBox({ config, height = 220 }) {
  const ref = useRef();
  useEffect(() => {
    let c; let alive = true;
    chartLib().then((Chart) => { if (alive) c = new Chart(ref.current, config); });
    return () => { alive = false; c?.destroy(); };
  }, [JSON.stringify(config.data)]);
  return html`<div style=${{ height: height + "px", position: "relative" }}><canvas ref=${ref}></canvas></div>`;
}
const ACCENT = "#F5B800", INK = "#141414";
const baseOpts = (y = {}) => ({ responsive: true, maintainAspectRatio: false, animation: { duration: 600 }, plugins: { legend: { display: false } },
  scales: { x: { type: "category", grid: { display: false }, ticks: { maxTicksLimit: 8 } }, y: { grid: { color: "#eee" }, ...y } } });

function Stats({ A }) {
  const exercises = useMemo(() => [...new Set(A.logs.filter((l) => l.sets?.length && !l.needs_review).map((l) => l.exercise))], [A]);
  const [ex, setEx] = useState(exercises[0]);
  const sDate = Object.fromEntries(A.sessions.map((s) => [s.id, s.date]));
  const w = A.daily.filter((d) => d.weight != null);
  const avg7 = w.map((d) => avg(w.filter((x) => x.date <= d.date && x.date > addDays(d.date, -7)).map((x) => x.weight)));
  const k = A.daily.filter((d) => d.kcal != null);
  const hist = A.logs.filter((l) => l.exercise === ex && l.sets?.length && !l.needs_review).sort((a, b) => (sDate[a.session_id] || "").localeCompare(sDate[b.session_id] || ""));
  const prog = exercises.map((e) => {
    const h = A.logs.filter((l) => l.exercise === e && l.sets?.length && !l.needs_review).sort((a, b) => (sDate[a.session_id] || "").localeCompare(sDate[b.session_id] || ""));
    if (h.length < 2) return null; const f = e1rm(h[0].sets), l = e1rm(h.at(-1).sets);
    return f ? { e, f, l, pct: (l - f) / f * 100, n: h.length } : null;
  }).filter(Boolean).sort((a, b) => b.pct - a.pct);
  const weekly = {}; A.runs.forEach((r) => { const m = monday(r.date); weekly[m] = (weekly[m] || 0) + (r.distance_km || 0); });
  const wk = Object.entries(weekly).sort();

  return html`<div class="stats">
    <section class="card">
      <h3>Körpergewicht <small class="muted">Punkte = Messung, Linie = Ø 7 Tage</small></h3>
      ${w.length > 1 ? html`<${ChartBox} config=${{ type: "line", data: { labels: w.map((d) => fmtDate(d.date)), datasets: [
        { data: w.map((d) => d.weight), showLine: false, pointRadius: 3, pointBackgroundColor: ACCENT + "66", borderWidth: 0 },
        { data: avg7, borderColor: ACCENT, borderWidth: 2.5, pointRadius: 0, tension: 0.35 }] }, options: baseOpts() }} />` : html`<p class="muted">Noch keine Daten.</p>`}
    </section>
    <section class="card">
      <h3>Kalorien</h3>
      ${k.length ? html`<${ChartBox} height=${180} config=${{ type: "bar", data: { labels: k.map((d) => fmtDate(d.date)), datasets: [{ data: k.map((d) => d.kcal), backgroundColor: INK + "cc", borderRadius: 3 }] }, options: baseOpts({ beginAtZero: true }) }} />` : html`<p class="muted">Noch keine Kalorien eingetragen.</p>`}
    </section>
    <section class="card">
      <h3>Kraft <select value=${ex} onChange=${(e) => setEx(e.target.value)}>${exercises.map((e) => html`<option>${e}</option>`)}</select></h3>
      ${hist.length ? html`<${ChartBox} config=${{ type: "line", data: { labels: hist.map((l) => fmtDate(sDate[l.session_id])), datasets: [
        { label: "e1RM", data: hist.map((l) => Math.round(e1rm(l.sets) * 10) / 10), borderColor: ACCENT, backgroundColor: ACCENT, borderWidth: 2.5, tension: 0.3 },
        { label: "Top-Gewicht", data: hist.map((l) => Math.max(...l.sets.map((s) => s.w || 0))), borderColor: INK + "55", backgroundColor: INK + "55", borderWidth: 1.5, borderDash: [4, 3], tension: 0.3 }] },
        options: { ...baseOpts(), plugins: { legend: { display: true, position: "bottom", labels: { boxWidth: 10 } } } } }} />
        <div class="hist">${[...hist].reverse().slice(0, 10).map((l) => html`<div><span class="muted">${fmtDate(sDate[l.session_id])}</span><b>${summary(l)}</b>${l.note ? html`<i>${l.note}</i>` : ""}</div>`)}</div>` : ""}
    </section>
    <section class="card">
      <h3>Fortschritt pro Übung <small class="muted">geschätztes 1RM, erstes vs. letztes Training</small></h3>
      <table class="plain">${prog.map((p) => html`<tr><td>${p.e}</td><td class="muted">${p.n}×</td><td>${num(p.f)} → ${num(p.l)} kg</td><td class=${p.pct >= 0 ? "good" : "bad"}>${p.pct >= 0 ? "+" : ""}${num(p.pct, 0)} %</td></tr>`)}</table>
    </section>
    ${wk.length > 0 && html`<section class="card"><h3>Laufen <small class="muted">km pro Woche</small></h3>
      <${ChartBox} height=${180} config=${{ type: "bar", data: { labels: wk.map(([d]) => fmtDate(d)), datasets: [{ data: wk.map(([, v]) => Math.round(v * 10) / 10), backgroundColor: ACCENT, borderRadius: 3 }] }, options: baseOpts({ beginAtZero: true }) }} /></section>`}
  </div>`;
}

// ───────────────────────── Check-ins ─────────────────────────
const Q_LABELS = { rating: "Woche gesamt", sleep: "Schlaf", stress: "Stress", training: "Training", nutrition: "Ernährung", wins: "Erfolge", struggles: "Schwierig", questions: "Fragen an dich" };
function Checkins({ A }) {
  const [urls, setUrls] = useState({});
  useEffect(() => {
    (async () => {
      const out = {};
      for (const c of A.checkins) for (const p of c.photos || []) {
        const { data } = await db.storage.from("photos").createSignedUrl(p, 3600);
        if (data?.signedUrl) out[p] = data.signedUrl;
      }
      setUrls(out);
    })();
  }, [A.checkins]);
  if (!A.checkins.length) return html`<div class="empty"><p class="muted">Noch keine Pit-Stops.</p></div>`;
  return html`<div class="checkins">${A.checkins.map((c) => html`<section class="card">
    <h3>Woche ab ${fmtDate(c.week_start, { day: "numeric", month: "long", year: "numeric" })} <small class="muted">gesendet ${fmtDate(c.created_at)}</small></h3>
    <div class="ratings">${["rating", "sleep", "stress"].filter((k) => c.answers?.[k]).map((k) => html`<span><small>${Q_LABELS[k]}</small><b>${c.answers[k]}/5</b></span>`)}</div>
    ${Object.entries(c.answers || {}).filter(([k]) => !["rating", "sleep", "stress"].includes(k) && c.answers[k]).map(([k, v]) => html`<div class="qa"><small>${Q_LABELS[k] || k}</small><p>${v}</p></div>`)}
    ${c.photos?.length ? html`<div class="photos">${c.photos.map((p) => html`<a href=${urls[p]} target="_blank"><img src=${urls[p]} /></a>`)}</div>` : ""}
  </section>`)}</div>`;
}

// ───────────────────────── Import ─────────────────────────
function ImportModal({ athleteId, onClose, onDone }) {
  const [links, setLinks] = useState(["", ""]);
  const [res, setRes] = useState(null);
  const [busy, setBusy] = useState(false);
  const run = async (dry) => {
    setBusy(true);
    const { data, error } = await db.functions.invoke("import-sheet", { body: { sheet_urls: links.filter((l) => l.includes("docs.google.com")), athlete_id: athleteId, dry_run: dry } });
    setBusy(false);
    if (error || data?.error) { setRes({ error: data?.error || error.message }); return; }
    setRes({ ...data, dry });
    if (!dry) onDone();
  };
  const s = res?.stats;
  return html`<div class="modal-bg" onClick=${(e) => e.target === e.currentTarget && onClose()}><div class="modal">
    <h2>Google Sheet importieren</h2>
    <p class="muted small">TRAINING- und TRACKER-Sheet. Freigabe "Jeder mit dem Link" nötig. Ein erneuter Import ersetzt den vorherigen Import.</p>
    ${links.map((l, i) => html`<input placeholder=${i ? "Link TRACKER-Sheet" : "Link TRAINING-Sheet"} value=${l} onInput=${(e) => { const n = [...links]; n[i] = e.target.value; setLinks(n); setRes(null); }} />`)}
    ${res?.error && html`<p class="msg">${res.error}</p>`}
    ${s && html`<div class="import-res"><b>${res.dry ? "Gefunden" : "Importiert"}:</b> ${s.phases} Phasen · ${s.sessions} Trainings · ${s.logs} Übungs-Einträge · ${s.days_with_weight} Gewichte · ${s.targets} Wochen-Vorgaben
      ${s.review ? html`<details><summary>${s.review} unklare Einträge</summary>${res.review.map((r) => html`<div class="small">${fmtDate(r.date)} · ${r.exercise}: <code>${r.raw}</code></div>`)}</details>` : ""}</div>`}
    <div class="modal-actions">
      <button class="link" onClick=${onClose}>Schließen</button>
      ${res?.dry && !res.error ? html`<button class="primary" disabled=${busy} onClick=${() => run(false)}>${busy ? "…" : "Jetzt importieren"}</button>`
        : html`<button class="primary" disabled=${busy || !links.some((l) => l.includes("docs.google.com"))} onClick=${() => run(true)}>${busy ? "…" : "Prüfen"}</button>`}
    </div>
  </div></div>`;
}

render(html`<${App} />`, document.getElementById("app"));
