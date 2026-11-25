/* Shows a red box on the page if anything breaks, instead of a blank screen */
window.addEventListener("error", function (e) {
  var f = document.getElementById("fatal");
  if (!f) return;
  f.style.display = "block";
  f.textContent = "Something went wrong:\n" + e.message + " (line " + e.lineno + ")";
});

/* ===== PART 1: sample data ===== */
/* Fictional names only. 2 mentors · 3 batches x 30 students · 10 sessions.
 * Dates are relative to "today" so the demo always looks fresh. */
window.buildSampleData = function () {
  const pad = (n) => String(n).padStart(2, "0");
  const toMin = (t) => { const [a, b] = t.split(":").map(Number); return a * 60 + b; };
  const fromMin = (m) => pad(Math.floor(m / 60) % 24) + ":" + pad(m % 60);

  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const dateOff = (o) => {
    const x = new Date(now.getFullYear(), now.getMonth(), now.getDate() + o);
    return x.getFullYear() + "-" + pad(x.getMonth() + 1) + "-" + pad(x.getDate());
  };

  const firsts = ["Aditi","Karan","Meera","Rohan","Sneha","Vikram","Ananya","Imran","Priya","Siddharth",
    "Kavya","Arnav","Divya","Harsh","Ishita","Jay","Kritika","Lakshay","Mansi","Nikhil",
    "Ojas","Pooja","Qasim","Riya","Sahil","Tanvi","Uday","Vani","Yash","Zoya"];
  const lasts = ["Rao","Shah","Iyer","Verma","Nair","Patel","Gupta","Khan","Reddy","Mehta",
    "Joshi","Kapoor","Bose","Sinha","Chopra","Das","Pillai","Menon","Saxena","Bhat",
    "Malhotra","Ghosh","Tiwari","Sharma","Kulkarni","Yadav","Desai","Thakur","Banerjee","Singh"];

  const students = [];
  for (let b = 1; b <= 3; b++) {
    for (let i = 1; i <= 30; i++) {
      students.push({
        rollNo: `B${b}-${String(i).padStart(3, "0")}`,
        name: firsts[(i - 1 + b * 7) % 30] + " " + lasts[((i - 1) * 7 + b * 11) % 30],
        batch: "B" + b,
      });
    }
  }

  const mentors = [
    { id: "m_neha", name: "Neha Kulkarni" },
    { id: "m_arjun", name: "Arjun Menon" },
  ];

  const openStart = fromMin(Math.max(0, nowMin - 3));        // started 3 min ago -> check-ins are "Present"
  const laterStart = fromMin(Math.min(nowMin + 90, 23 * 60 + 30));

  const S = (id, title, batch, mentorId, date, startTime, status, code, graceMin = 10) =>
    ({ id, title, batch, mentorId, date, startTime, durationMin: 60, graceMin, status, code });

  const sessions = [
    S("S001", "HTML Basics — live class",      "B1", "m_neha",  dateOff(-7), "10:00", "Closed",   "3150"),
    S("S002", "CSS Flexbox & Grid",            "B1", "m_arjun", dateOff(-6), "11:00", "Closed",   "7305"),
    S("S003", "JS Promises — live class",      "B2", "m_neha",  "2026-11-04", "10:00", "Closed",   "4821"),
    S("S004", "DOM Events Workshop",           "B2", "m_arjun", dateOff(-3), "14:00", "Closed",   "5582"),
    S("S005", "Git & GitHub Essentials",       "B3", "m_neha",  dateOff(-2), "15:00", "Closed",   "2290"),
    S("S006", "localStorage Deep Dive",        "B3", "m_arjun", dateOff(-1), "10:00", "Closed",   "8413"),
    S("S007", "Bootstrap 5 Layouts",           "B1", "m_neha",  dateOff(0),  openStart, "Open",    "6071"),
    S("S008", "Forms & Validation",            "B2", "m_arjun", dateOff(0),  laterStart, "Upcoming", ""),
    S("S009", "Fetch API & JSON",              "B3", "m_arjun", dateOff(1),  "10:00", "Upcoming", ""),
    S("S010", "Python OOP Basics",             "B1", "m_arjun", dateOff(2),  "11:00", "Upcoming", ""),
  ];

  // Full attendance for Closed sessions (deterministic pseudo-random so counts are stable)
  const records = [];
  sessions.forEach((s, si) => {
    if (s.status !== "Closed") return;
    students.filter((st) => st.batch === s.batch).forEach((st, i) => {
      const r = (i * 37 + si * 17) % 10;
      const start = toMin(s.startTime);
      if (r < 6) {
        records.push({ sessionId: s.id, rollNo: st.rollNo, status: "Present",
          checkInAt: fromMin(start + ((i * 3) % (s.graceMin + 1))), method: "button" });
      } else if (r < 8) {
        records.push({ sessionId: s.id, rollNo: st.rollNo, status: "Late",
          checkInAt: fromMin(start + s.graceMin + 1 + (i % 15)), method: "button" });
      } else {
        records.push({ sessionId: s.id, rollNo: st.rollNo, status: "Absent", checkInAt: null, method: "button" });
      }
    });
  });

  // A few early check-ins on the Open session so the demo isn't empty
  ["B1-001", "B1-002", "B1-003"].forEach((roll, i) =>
    records.push({ sessionId: "S007", rollNo: roll, status: "Present",
      checkInAt: fromMin(toMin(openStart) + i + 1), method: "button" }));

  return { mentors, students, sessions, records };
};


/* ===== PART 2: data module (attendance API, PRD section 9) ===== */
/* No server: every function reads/writes localStorage.
 * Every write function re-checks role + mentor (PRD section 11). */
const Att = (function () {
  "use strict";

  const K = {
    mentors: "att_mentors",
    students: "att_students",
    sessions: "att_sessions",
    records: "att_records",
    context: "att_session",
  };
  const DEFAULT_CTX = { role: "mentor", mentorId: "m_neha", rollNo: "B1-001" };

  /* ---------- storage (all wrapped in try/catch) ---------- */
  let storageOk = true;
  const memory = {}; // fallback if localStorage is blocked

  function read(key, fallback) {
    try {
      const v = localStorage.getItem(key);
      if (v !== null) return JSON.parse(v);
    } catch (e) { storageOk = false; }
    return key in memory ? memory[key] : fallback;
  }
  function write(key, value) {
    memory[key] = value;
    try { localStorage.setItem(key, JSON.stringify(value)); }
    catch (e) { storageOk = false; }
  }

  /* ---------- time helpers (ONE place for time maths) ---------- */
  const pad = (n) => String(n).padStart(2, "0");
  function toMinutes(hhmm) { const [h, m] = hhmm.split(":").map(Number); return h * 60 + m; } // "10:14" -> 614
  function fromMinutes(min) { return pad(Math.floor(min / 60) % 24) + ":" + pad(min % 60); }
  function nowHHMM() { const d = new Date(); return pad(d.getHours()) + ":" + pad(d.getMinutes()); } // device clock only

  /* ---------- init / reset ---------- */
  function init() {
    const existing = read(K.sessions, null);
    if (existing && existing.length) return { seeded: false };
    seed();
    return { seeded: true };
  }
  function seed() {
    const d = window.buildSampleData();
    write(K.mentors, d.mentors);
    write(K.students, d.students);
    write(K.sessions, d.sessions);
    write(K.records, d.records);
  }
  function resetDemo() { seed(); }
  const storageWorks = () => storageOk;

  /* ---------- role context (demo toggle, NOT real security) ---------- */
  const getContext = () => Object.assign({}, DEFAULT_CTX, read(K.context, {}));
  function setContext(patch) { write(K.context, Object.assign(getContext(), patch)); }

  /* ---------- lookups ---------- */
  const getMentors = () => read(K.mentors, []);
  const getStudents = () => read(K.students, []);
  const allSessions = () => read(K.sessions, []);
  const allRecords = () => read(K.records, []);
  const findSession = (id) => allSessions().find((s) => s.id === id);

  function requireMentorOf(session) {
    const c = getContext();
    if (c.role !== "mentor") throw new Error("Only mentors can do this.");
    if (session.mentorId !== c.mentorId) throw new Error("This isn't your session.");
  }
  function mustFind(id) {
    const s = findSession(id);
    if (!s) throw new Error("Session not found.");
    return s;
  }
  const sortSessions = (a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime);

  /* ---------- FR-01 list sessions ---------- */
  function listSessions(filters = {}) {
    const c = getContext();
    let list = allSessions();
    if (c.role === "mentor") list = list.filter((s) => s.mentorId === c.mentorId);
    if (filters.mentorId) list = list.filter((s) => s.mentorId === filters.mentorId);
    if (filters.batch) list = list.filter((s) => s.batch === filters.batch);
    if (filters.date) list = list.filter((s) => s.date === filters.date);
    return list.sort(sortSessions);
  }

  /* Student view: upcoming + open sessions of their batch (read-only) */
  function studentSessions(rollNo) {
    const st = getStudents().find((x) => x.rollNo === rollNo);
    if (!st) return [];
    const recs = allRecords();
    return allSessions()
      .filter((s) => s.batch === st.batch && s.status !== "Closed")
      .sort(sortSessions)
      .map((s) => {
        const r = recs.find((x) => x.sessionId === s.id && x.rollNo === rollNo);
        return Object.assign({}, s, { myStatus: r ? r.status : null, myCheckInAt: r ? r.checkInAt : null });
      });
  }

  /* ---------- FR-02 / BR-06 attendance + summary (computed, never typed) ---------- */
  function getAttendance(sessionId) {
    const session = mustFind(sessionId);
    const c = getContext();
    if (c.role === "student") throw new Error("Students can't open the attendance table.");
    if (c.role === "mentor" && session.mentorId !== c.mentorId) throw new Error("This isn't your session.");

    const recs = allRecords().filter((r) => r.sessionId === sessionId);
    const rows = getStudents()
      .filter((s) => s.batch === session.batch) // BR-03
      .map((s) => {
        const r = recs.find((x) => x.rollNo === s.rollNo);
        return {
          rollNo: s.rollNo, name: s.name,
          status: r ? r.status : "Not marked",
          checkInAt: r ? r.checkInAt : null,
          method: r ? r.method : null,
        };
      });
    const count = (st) => rows.filter((r) => r.status === st).length;
    const summary = { present: count("Present"), late: count("Late"), absent: count("Absent"), notMarked: count("Not marked"), total: rows.length };
    return { session, rows, summary };
  }

  /* ---------- start / check in / undo / close ---------- */
  function startSession(sessionId) {
    const sessions = allSessions();
    const s = sessions.find((x) => x.id === sessionId);
    if (!s) throw new Error("Session not found.");
    requireMentorOf(s);
    if (s.status === "Closed") throw new Error("Session is already closed.");
    if (s.status === "Open") return s;
    s.status = "Open";
    if (!s.code) s.code = String(Math.floor(1000 + Math.random() * 9000));
    write(K.sessions, sessions);
    return s;
  }

  function doCheckIn(sessionId, rollNo, now, method) {
    const s = mustFind(sessionId);
    requireMentorOf(s);
    if (!/^B[1-3]-\d{3}$/.test(rollNo)) throw new Error("Roll number looks wrong (example: B2-017).");
    if (s.status !== "Open") throw new Error("Session is not open.");
    const student = getStudents().find((x) => x.rollNo === rollNo);
    if (!student || student.batch !== s.batch) throw new Error(`${rollNo} isn't in batch ${s.batch}`);

    const records = allRecords(); // re-read before write
    if (records.some((r) => r.sessionId === sessionId && r.rollNo === rollNo)) throw new Error("Already checked in.");

    // BR-02: Present if time <= start + grace, else Late (boundary included)
    const status = toMinutes(now) <= toMinutes(s.startTime) + s.graceMin ? "Present" : "Late";
    const rec = { sessionId, rollNo, status, checkInAt: now, method };
    records.push(rec);
    write(K.records, records);
    return rec;
  }
  const checkIn = (sessionId, rollNo, now = nowHHMM()) => doCheckIn(sessionId, rollNo, now, "button");

  function checkInByCode(sessionId, rollNo, code, now = nowHHMM()) {
    if (!/^\d{4}$/.test(code)) throw new Error("Code doesn't match");
    const s = mustFind(sessionId);
    if (s.status !== "Open" || String(s.code) !== code) throw new Error("Code doesn't match"); // BR-08
    return doCheckIn(sessionId, rollNo, now, "code");
  }

  function undoCheckIn(sessionId, rollNo) {
    const s = mustFind(sessionId);
    requireMentorOf(s);
    if (s.status !== "Open") throw new Error("Session is closed — attendance is locked."); // BR-05
    write(K.records, allRecords().filter((r) => !(r.sessionId === sessionId && r.rollNo === rollNo)));
  }

  function closeSession(sessionId) {
    const sessions = allSessions();
    const s = sessions.find((x) => x.id === sessionId);
    if (!s) throw new Error("Session not found.");
    requireMentorOf(s);
    if (s.status === "Closed") throw new Error("Session is already closed.");
    const records = allRecords();
    getStudents().filter((x) => x.batch === s.batch).forEach((st) => {
      if (!records.some((r) => r.sessionId === sessionId && r.rollNo === st.rollNo)) {
        records.push({ sessionId, rollNo: st.rollNo, status: "Absent", checkInAt: null, method: "button" }); // BR-04
      }
    });
    s.status = "Closed";
    write(K.records, records);
    write(K.sessions, sessions);
    return s;
  }

  /* ---------- FR-06 CSV export ---------- */
  const q = (v) => '"' + String(v ?? "").replace(/"/g, '""') + '"'; // quote every value
  function exportCsv(sessionId) {
    const { session, rows } = getAttendance(sessionId); // role check happens inside
    const lines = [["Name", "Roll No", "Status", "Check-in Time"].map(q).join(",")];
    rows.forEach((r) => lines.push([r.name, r.rollNo, r.status, r.checkInAt || ""].map(q).join(",")));
    const suffix = session.status === "Open" ? "_open" : "";
    const filename = `${session.id}_${session.date}${suffix}.csv`;
    const blob = new Blob(["\ufeff" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    return filename;
  }

  return {
    init, resetDemo, storageWorks, getContext, setContext,
    getMentors, getStudents, listSessions, studentSessions, getAttendance,
    startSession, checkIn, checkInByCode, undoCheckIn, closeSession, exportCsv,
    toMinutes, fromMinutes, nowHHMM,
  };
})();


/* ===== PART 3: user interface ===== */
/* All dynamic text goes through textContent (never innerHTML). */
(function () {
  "use strict";

  const $ = (s) => document.querySelector(s);
  const state = { view: "list", sessionId: null, batch: "", date: "", q: "" };

  /* ---------- tiny DOM helper (safe: strings become text nodes) ---------- */
  function h(tag, props = {}, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (v === false || v == null) continue;
      if (k === "class") el.className = v;
      else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
      else if (v === true) el.setAttribute(k, "");
      else el.setAttribute(k, v);
    }
    kids.flat().forEach((c) => { if (c != null && c !== false) el.append(c); });
    return el;
  }

  let toastTimer;
  function toast(msg, type = "info") {
    const t = $("#toast");
    t.textContent = msg;
    t.className = "show " + type;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (t.className = ""), 2600);
  }
  function safe(fn) {
    try { return { ok: true, value: fn() }; }
    catch (e) { toast(e.message, "error"); return { ok: false, error: e }; }
  }

  const fmtDate = (d) => new Date(d + "T00:00").toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
  const mentorName = (id) => (Att.getMentors().find((m) => m.id === id) || {}).name || "—";
  const lateAfter = (s) => Att.fromMinutes(Att.toMinutes(s.startTime) + s.graceMin);
  const statusBadge = (st) => {
    const map = { Open: "b-open", Upcoming: "b-upcoming", Closed: "b-closed", Present: "b-present", Late: "b-late", Absent: "b-absent", "Not marked": "b-notmarked" };
    return h("span", { class: "badge-g " + (map[st] || "") }, st === "Open" ? "Live now" : st);
  };
  function qrPlaceholder() {
    const pattern = "1110111101010101110111010110110101011101110111101".split("");
    return h("div", { class: "qr-ph", "aria-hidden": "true" }, pattern.map((c) => h("i", { class: c === "1" ? "" : "o" })));
  }

  /* ---------- sidebar ---------- */
  const ROLES = [
    { id: "mentor", label: "🎓 Mentor" },
    { id: "ops", label: "📊 Ops Analyst" },
    { id: "student", label: "🧑‍💻 Student" },
  ];

  function setRole(role) {
    Att.setContext({ role });
    state.view = "list"; state.sessionId = null; state.batch = ""; state.date = ""; state.q = "";
    renderAll();
  }

  function renderSidebar() {
    const c = Att.getContext();
    let picker;
    if (c.role === "mentor") {
      picker = [
        h("div", { class: "label" }, "Mentor"),
        h("select", { onchange: (e) => { Att.setContext({ mentorId: e.target.value }); state.view = "list"; renderAll(); } },
          Att.getMentors().map((m) => h("option", { value: m.id, selected: m.id === c.mentorId }, m.name))),
      ];
    } else if (c.role === "student") {
      const students = Att.getStudents();
      const groups = ["B1", "B2", "B3"].map((b) =>
        h("optgroup", { label: "Batch " + b },
          students.filter((s) => s.batch === b).map((s) => h("option", { value: s.rollNo, selected: s.rollNo === c.rollNo }, `${s.rollNo} · ${s.name}`))));
      picker = [
        h("div", { class: "label" }, "Student"),
        h("select", { onchange: (e) => { Att.setContext({ rollNo: e.target.value }); renderAll(); } }, groups),
      ];
    } else {
      picker = [h("div", { class: "note" }, "Read-only access: view all sessions, filter by batch and date, download CSVs.")];
    }

    $("#sidebar").replaceChildren(
      h("div", { class: "brand" }, h("div", { class: "logo" }, "◆"), h("span", {}, "PRESENTLY")),
      h("div", { class: "label" }, "Viewing as"),
      h("div", { class: "seg" }, ROLES.map((r) =>
        h("button", { class: "seg-btn" + (c.role === r.id ? " active" : ""), onclick: () => setRole(r.id) }, r.label))),
      ...picker,
      h("div", { class: "label" }, "Menu"),
      h("div", { class: "nav-item active", onclick: () => { state.view = "list"; renderView(); } }, "🗂️ Sessions"),
      h("div", { class: "nav-item soon" }, "📱 QR check-in", h("small", {}, "soon")),
      h("div", { class: "nav-item soon" }, "📈 Reports", h("small", {}, "soon")),
      h("div", { class: "spacer" }),
      h("div", { class: "note" }, "Demo role switch — not real security. No login this month."),
      h("button", { class: "btn-g", onclick: () => {
        if (confirm("Reset all demo data? Every check-in will be lost.")) {
          Att.resetDemo(); state.view = "list"; renderAll(); toast("Demo data reset", "ok");
        } } }, "↺ Reset demo data")
    );
  }

  /* ---------- top bar ---------- */
  function who() {
    const c = Att.getContext();
    if (c.role === "mentor") return mentorName(c.mentorId).split(" ")[0];
    if (c.role === "student") { const s = Att.getStudents().find((x) => x.rollNo === c.rollNo); return s ? s.name.split(" ")[0] : "there"; }
    return "Analyst";
  }
  function renderTopbar() {
    const hr = new Date().getHours();
    const greet = hr < 12 ? "Good morning" : hr < 17 ? "Good afternoon" : "Good evening";
    const c = Att.getContext();
    const sub = c.role === "mentor" ? "Here are your live sessions and check-ins today."
      : c.role === "student" ? "See what's live and what's coming up for your batch."
      : "All mentors' sessions at a glance — read-only.";
    $("#topbar").replaceChildren(
      h("div", {}, h("h1", {}, `${greet}, ${who()} 👋`), h("p", {}, sub)),
      h("div", { class: "clock" }, h("strong", { id: "clock" }, Att.nowHHMM()),
        h("span", {}, new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })))
    );
  }
  setInterval(() => { const el = $("#clock"); if (el) el.textContent = Att.nowHHMM(); }, 1000);

  function renderBanner(extra) {
    const box = $("#banner");
    box.replaceChildren();
    if (!Att.storageWorks()) box.append(h("div", { class: "banner warn" }, "⚠️ Your browser is blocking storage — attendance won't be saved."));
    if (extra) box.append(h("div", { class: "banner info" }, extra));
  }

  /* =====================================================
   *  SESSION LIST  (Mentor + Ops)
   * ===================================================== */
  function renderList() {
    const c = Att.getContext();
    if (c.role === "student") return renderStudent();

    const all = Att.listSessions({});
    const list = Att.listSessions({ batch: state.batch, date: state.date });
    const stat = (ico, k, v) => h("div", { class: "glass stat" }, h("div", { class: "ico" }, ico), h("div", {}, h("div", { class: "k" }, k), h("div", { class: "v" }, String(v))));

    const filters = h("div", { class: "filters" },
      h("select", { onchange: (e) => { state.batch = e.target.value; renderList(); } },
        [["", "All batches"], ["B1", "Batch B1"], ["B2", "Batch B2"], ["B3", "Batch B3"]].map(([v, l]) => h("option", { value: v, selected: v === state.batch }, l))),
      h("input", { type: "date", value: state.date, onchange: (e) => { state.date = e.target.value; renderList(); } }),
      (state.batch || state.date) ? h("button", { class: "btn-g", onclick: () => { state.batch = ""; state.date = ""; renderList(); } }, "Clear") : null
    );

    const cards = list.length
      ? h("div", { class: "grid" }, list.map(sessionCard))
      : h("div", { class: "glass empty" }, "No sessions match these filters.");

    $("#view").replaceChildren(
      h("div", { class: "stats" },
        stat("🗂️", c.role === "mentor" ? "My sessions" : "All sessions", all.length),
        stat("🟢", "Live now", all.filter((s) => s.status === "Open").length),
        stat("⏳", "Upcoming", all.filter((s) => s.status === "Upcoming").length),
        stat("✅", "Closed", all.filter((s) => s.status === "Closed").length)),
      h("div", { class: "section-head" }, h("h2", {}, c.role === "mentor" ? "Your sessions" : "All sessions"), filters),
      cards
    );
  }

  function sessionCard(s) {
    const c = Att.getContext();
    const isMentor = c.role === "mentor";
    const actions = [];
    if (isMentor && s.status === "Upcoming")
      actions.push(h("button", { class: "btn-g btn-p", onclick: () => { if (safe(() => Att.startSession(s.id)).ok) { toast("Session started — check-ins are open", "ok"); openSession(s.id); } } }, "▶ Start session"));
    if (isMentor && s.status === "Open")
      actions.push(h("button", { class: "btn-g btn-p", onclick: () => openSession(s.id) }, "Take attendance"));
    if (!(isMentor && s.status === "Open"))
      actions.push(h("button", { class: "btn-g", onclick: () => openSession(s.id) }, isMentor && s.status === "Upcoming" ? "Preview" : "View table"));
    actions.push(h("button", { class: "btn-g", title: "Download CSV", onclick: () => { const r = safe(() => Att.exportCsv(s.id)); if (r.ok) toast("Downloaded " + r.value, "ok"); } }, "⬇ CSV"));

    return h("article", { class: "glass session" + (s.status === "Open" ? " live" : "") },
      h("div", { class: "row-between" }, statusBadge(s.status), h("span", { class: "chip" }, "Batch " + s.batch)),
      h("h3", {}, s.title),
      h("div", { class: "meta" },
        h("span", {}, "📅 " + fmtDate(s.date)),
        h("span", {}, `🕒 ${s.startTime} · ${s.durationMin} min · Present until ${lateAfter(s)}`),
        !isMentor ? h("span", {}, "👩‍🏫 " + mentorName(s.mentorId)) : null),
      h("div", { class: "card-actions" }, actions));
  }

  function openSession(id) { state.sessionId = id; state.view = "detail"; state.q = ""; renderView(); }

  /* =====================================================
   *  SESSION DETAIL  (attendance table)
   * ===================================================== */
  function renderDetail() {
    const c = Att.getContext();
    const res = safe(() => Att.getAttendance(state.sessionId));
    if (!res.ok) { state.view = "list"; return renderList(); }
    const s = res.value.session;
    const isMentor = c.role === "mentor";

    renderBanner(
      s.status === "Upcoming" && isMentor ? "Start the session to take attendance."
        : !isMentor ? "Read-only view — Ops Analysts can't change attendance." : null);

    const actions = h("div", { class: "actions" },
      h("button", { class: "btn-g", onclick: () => { state.view = "list"; renderView(); } }, "← Back"),
      isMentor && s.status === "Upcoming" ? h("button", { class: "btn-g btn-p", onclick: () => { if (safe(() => Att.startSession(s.id)).ok) { toast("Session started", "ok"); renderDetail(); } } }, "▶ Start session") : null,
      isMentor && s.status === "Open" ? h("button", { class: "btn-g btn-danger", onclick: () => closeIt(s.id) }, "■ Close session") : null,
      h("button", { class: "btn-g", onclick: () => { const r = safe(() => Att.exportCsv(s.id)); if (r.ok) toast("Downloaded " + r.value, "ok"); } }, "⬇ Download CSV"));

    const head = h("div", { class: "glass detail-head" },
      h("div", { class: "row-between" }, h("div", {}, h("h2", {}, s.title),
        h("div", { class: "meta" }, `Batch ${s.batch} · ${fmtDate(s.date)} · ${s.startTime} · Present until ${lateAfter(s)} (grace ${s.graceMin} min)` + (!isMentor ? " · " + mentorName(s.mentorId) : ""))),
        statusBadge(s.status)),
      actions,
      h("div", { class: "summary", id: "summary" }));

    const codePanel = isMentor && s.status === "Open" ? buildCodePanel(s) : null;

    const search = h("input", { type: "text", placeholder: "Search name or roll no…", value: state.q, oninput: (e) => { state.q = e.target.value; paintBody(); } });
    const table = h("div", { class: "glass table-card" },
      h("div", { class: "table-tools" }, h("h2", { style: "font-size:1.05rem;margin:0;font-weight:600" }, "Attendance table"), search),
      h("div", { class: "tbl-wrap", id: "tblWrap" }));

    $("#view").replaceChildren(head, codePanel, table);
    paintBody();
  }

  function buildCodePanel(s) {
    const roll = h("input", { type: "text", placeholder: "Roll no. e.g. " + s.batch + "-017", maxlength: "6", autocomplete: "off" });
    const code = h("input", { type: "text", placeholder: "4-digit code", maxlength: "4", inputmode: "numeric", autocomplete: "off" });
    const err = h("div", { class: "err" });
    const submit = () => {
      err.textContent = "";
      try { const r = Att.checkInByCode(s.id, roll.value.trim().toUpperCase(), code.value.trim()); toast(`${r.rollNo} marked ${r.status}`, "ok"); roll.value = ""; code.value = ""; paintBody(); }
      catch (e) { err.textContent = e.message; }
    };
    return h("div", { class: "glass code-panel" },
      qrPlaceholder(),
      h("div", {},
        h("div", { class: "meta" }, "Session code (QR check-in for students comes later)"),
        h("div", { class: "big-code mono" }, s.code),
        h("div", { class: "code-form" }, roll, code, h("button", { class: "btn-g btn-p", onclick: submit }, "Check in by code")),
        err));
  }

  function closeIt(id) {
    const { summary } = Att.getAttendance(id);
    if (!confirm(`Close session? ${summary.notMarked} students not marked will be Absent. This can't be undone.`)) return;
    if (safe(() => Att.closeSession(id)).ok) { toast("Session closed", "ok"); renderDetail(); }
  }

  /* repaint summary + table only (keeps search box focus) */
  function paintBody() {
    const res = safe(() => Att.getAttendance(state.sessionId));
    if (!res.ok) return;
    const { session: s, rows, summary: m } = res.value;
    const isMentor = Att.getContext().role === "mentor";
    const canAct = isMentor && s.status === "Open";

    const sum = (cls, n, t) => h("div", { class: "sum " + cls }, h("div", { class: "n" }, String(n)), h("div", { class: "t" }, t));
    $("#summary").replaceChildren(sum("p", m.present, "Present"), sum("l", m.late, "Late"), sum("a", m.absent, "Absent"), sum("", m.notMarked, "Not marked"));

    const q = state.q.trim().toLowerCase();
    let shown = rows.filter((r) => !q || r.name.toLowerCase().includes(q) || r.rollNo.toLowerCase().includes(q));
    if (s.status === "Open") // checked-in students sink to the bottom
      shown = shown.slice().sort((a, b) => (a.status === "Not marked" ? 0 : 1) - (b.status === "Not marked" ? 0 : 1) || a.rollNo.localeCompare(b.rollNo));

    const tbody = h("tbody", {}, shown.map((r, i) =>
      h("tr", {},
        h("td", { class: "mono" }, String(i + 1)),
        h("td", {}, r.name),
        h("td", { class: "mono" }, r.rollNo),
        h("td", {}, statusBadge(r.status)),
        h("td", { class: "mono" }, r.checkInAt || "—"),
        h("td", {}, actionCell(r, s, canAct)))));

    $("#tblWrap").replaceChildren(
      shown.length
        ? h("table", { class: "att" },
            h("thead", {}, h("tr", {}, ["#", "Name", "Roll no.", "Status", "Check-in", canAct ? "Action" : ""].map((t, i) => h("th", { style: i === 5 ? "text-align:right" : null }, t)))),
            tbody)
        : h("div", { class: "empty" }, "No students match your search."));
  }

  function actionCell(r, s, canAct) {
    if (!canAct) return "";
    if (r.status === "Not marked")
      return h("button", { class: "btn-g btn-ok", onclick: () => { const x = safe(() => Att.checkIn(s.id, r.rollNo)); if (x.ok) { if (x.value.status === "Late") toast(`${r.name} marked LATE (${x.value.checkInAt})`); paintBody(); } } }, "Check in");
    return h("span", {}, h("span", { class: "mono", style: "color:var(--muted);font-size:.85rem" }, `${r.status} ${r.checkInAt}`),
      h("button", { class: "btn-link", onclick: () => { if (safe(() => Att.undoCheckIn(s.id, r.rollNo)).ok) paintBody(); } }, "Undo"));
  }

  /* =====================================================
   *  STUDENT VIEW  (live + upcoming sessions, QR later)
   * ===================================================== */
  function renderStudent() {
    const c = Att.getContext();
    const me = Att.getStudents().find((s) => s.rollNo === c.rollNo);
    const sessions = Att.studentSessions(c.rollNo);
    const live = sessions.filter((s) => s.status === "Open");
    const up = sessions.filter((s) => s.status === "Upcoming");

    const card = (s) => h("article", { class: "glass session" + (s.status === "Open" ? " live" : "") },
      h("div", { class: "row-between" }, statusBadge(s.status), h("span", { class: "chip" }, "Batch " + s.batch)),
      h("h3", {}, s.title),
      h("div", { class: "meta" },
        h("span", {}, "📅 " + fmtDate(s.date)),
        h("span", {}, `🕒 ${s.startTime} · ${s.durationMin} min`),
        h("span", {}, "👩‍🏫 " + mentorName(s.mentorId))),
      s.status === "Open"
        ? h("div", {},
            s.myStatus ? h("div", { class: "row-between" }, h("span", { class: "meta" }, "Your attendance"), h("span", {}, statusBadge(s.myStatus), " ", h("span", { class: "mono" }, s.myCheckInAt || ""))) : null,
            h("div", { class: "scan-box" }, qrPlaceholder(),
              h("div", {}, h("button", { class: "btn-g btn-p", disabled: true }, "📷 Scan QR to check in"),
                h("div", {}, h("small", {}, "Coming soon — your mentor will show a QR code. For now the mentor marks you present."))))
          )
        : h("div", { class: "meta" }, "Opens when your mentor starts the session."));

    $("#view").replaceChildren(
      h("div", { class: "glass stat" }, h("div", { class: "ico" }, "🧑‍💻"),
        h("div", {}, h("div", { class: "k" }, me ? `${me.rollNo} · Batch ${me.batch}` : ""), h("div", { class: "v", style: "font-size:1.3rem" }, me ? me.name : ""))),
      h("div", { class: "section-head" }, h("h2", {}, "🟢 Live now")),
      live.length ? h("div", { class: "grid" }, live.map(card)) : h("div", { class: "glass empty" }, "No live session for your batch right now."),
      h("div", { class: "section-head" }, h("h2", {}, "⏳ Upcoming")),
      up.length ? h("div", { class: "grid" }, up.map(card)) : h("div", { class: "glass empty" }, "Nothing scheduled yet."));
  }

  /* ---------- render orchestration ---------- */
  function renderView() {
    renderBanner();
    if (state.view === "detail" && Att.getContext().role !== "student") renderDetail();
    else renderList();
  }
  function renderAll() { renderSidebar(); renderTopbar(); renderView(); }

  // keep two tabs in sync (PRD risk table)
  window.addEventListener("storage", () => { renderAll(); });

  /* ---------- boot ---------- */
  const { seeded } = Att.init();
  renderAll();
  if (seeded) toast("Sample data loaded", "ok");
})();