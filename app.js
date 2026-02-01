// app.js (ES Module)

// ---- Firebase (Modular SDK via CDN) ----
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  addDoc,
  collection,
  query,
  where,
  getDocs,
  orderBy,
  limit,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

// 1) PASTE YOUR FIREBASE CONFIG HERE (Project Settings → Web App)
const firebaseConfig = {
  apiKey: "AIzaSyBsJ2TtO7oiYmt5LjY4swB8U_61eEQuZBE",
  authDomain: "bestbuydebitcards.firebaseapp.com",
  projectId: "bestbuydebitcards",
  storageBucket: "bestbuydebitcards.firebasestorage.app",
  messagingSenderId: "226717997778",
  appId: "1:226717997778:web:de9a0bcd7d0a04e6a32b0b",
  measurementId: "G-R69995EWFH"
};


const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// ---- PIN (Option 1) ----
// Writes require this PIN to match Firestore rules.
const REQUIRED_PIN = "1031";
const PIN_KEY = "bb_points_pin";

function getPin() {
  let pin = localStorage.getItem(PIN_KEY);
  if (!pin) {
    pin = prompt("Enter PIN:");
    if (pin) localStorage.setItem(PIN_KEY, pin);
  }
  return pin || "";
}

function resetPin() {
  localStorage.removeItem(PIN_KEY);
  alert("PIN reset. Next write will prompt again.");
}

function requireValidPinOrThrow() {
  const pin = getPin();
  if (pin !== REQUIRED_PIN) {
    // Still let them browse; just block writes cleanly in UI.
    throw new Error("Wrong PIN.");
  }
  return pin;
}

// ---- Helpers ----
const $ = (id) => document.getElementById(id);
const page = location.pathname.split("/").pop() || "index.html";

function setText(id, text) {
  const el = $(id);
  if (el) el.textContent = text;
}

function show(id, yes = true) {
  const el = $(id);
  if (!el) return;
  el.classList.toggle("hidden", !yes);
}

function qs(name) {
  const u = new URL(location.href);
  return u.searchParams.get(name);
}

function go(url) {
  location.href = url;
}

function cleanCode(raw) {
  return String(raw || "").trim();
}

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

// ---- Cards mapping ----
// /cards/{code} -> { employeeId, assignedAt, disabled?, pin? }
async function lookupEmployeeIdByCode(code) {
  const ref = doc(db, "cards", code);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  const data = snap.data();
  if (data.disabled) return null;
  return data.employeeId || null;
}

async function getEmployee(employeeId) {
  const ref = doc(db, "employees", employeeId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() };
}

// ---- Scanner helper (html5-qrcode) ----
function createScanner(containerId, onResult) {
  const scanner = new Html5Qrcode(containerId);

  const start = async () => {
    const config = {
      fps: 10,
      qrbox: { width: 250, height: 250 },
      rememberLastUsedCamera: true
    };

    const cameras = await Html5Qrcode.getCameras();
    if (!cameras || cameras.length === 0) throw new Error("No camera found.");

    const backCam = cameras.find(c => /back|rear|environment/i.test(c.label));
    const camId = (backCam || cameras[0]).id;

    await scanner.start(
      camId,
      config,
      (decodedText) => onResult(decodedText),
      () => {}
    );
  };

  const stop = async () => {
    try { await scanner.stop(); } catch {}
    try { await scanner.clear(); } catch {}
  };

  return { start, stop };
}

// ---- INDEX ----
function initIndex() {
  $("btnAdmin")?.addEventListener("click", () => go("./admin.html"));

  let scanner = null;
  let scanning = false;

  function handleScanResult(raw) {
    const code = cleanCode(raw);
    if (!code) return;
    stopScan();
    go(`./employee.html?code=${encodeURIComponent(code)}`);
  }

  async function startScan() {
    if (scanning) return;
    scanning = true;
    show("btnStopScan", true);
    setText("scanMsg", "Starting camera…");

    try {
      scanner = createScanner("reader", handleScanResult);
      await scanner.start();
      setText("scanMsg", "Scanning…");
    } catch (e) {
      setText("scanMsg", `Scan error: ${e.message}`);
      scanning = false;
      show("btnStopScan", false);
    }
  }

  async function stopScan() {
    if (!scanning) return;
    scanning = false;
    show("btnStopScan", false);
    if (scanner) await scanner.stop();
    setText("scanMsg", "");
  }

  $("btnStartScan")?.addEventListener("click", startScan);
  $("btnStopScan")?.addEventListener("click", stopScan);

  $("btnLookup")?.addEventListener("click", () => {
    const code = cleanCode($("manualCode")?.value);
    if (!code) return setText("scanMsg", "Type a code first.");
    go(`./employee.html?code=${encodeURIComponent(code)}`);
  });
}

// ---- EMPLOYEE ----
async function initEmployee() {
  $("btnBack")?.addEventListener("click", () => go("./index.html"));
  $("btnResetPin")?.addEventListener("click", resetPin);

  const code = cleanCode(qs("code"));
  if (!code) {
    setText("loading", "Missing code.");
    return;
  }

  setText("loading", "Looking up card…");

  const employeeId = await lookupEmployeeIdByCode(code);
  if (!employeeId) {
    setText("loading", "No employee found for this code (or card disabled).");
    return;
  }

  const emp = await getEmployee(employeeId);
  if (!emp) {
    setText("loading", "Employee record missing.");
    return;
  }

  show("loading", false);
  show("empSection", true);

  setText("empName", emp.name || "(No name)");
  setText("empPoints", String(emp.points ?? 0));

  await loadRecentTransactions(emp.id);

  document.querySelectorAll("button.delta").forEach(btn => {
    btn.addEventListener("click", async () => {
      const delta = Number(btn.dataset.delta);
      const reason = cleanCode($("reason")?.value);
      await tryApplyDelta(emp.id, delta, reason);
    });
  });

  $("btnApplyCustom")?.addEventListener("click", async () => {
    const raw = cleanCode($("customDelta")?.value);
    const delta = Number(raw);
    if (!Number.isFinite(delta) || raw === "") {
      setText("msg", "Enter a valid number, like 7 or -3.");
      return;
    }
    const reason = cleanCode($("reason")?.value);
    await tryApplyDelta(emp.id, delta, reason);
  });
}

async function tryApplyDelta(employeeId, delta, reason) {
  const msg = $("msg");
  if (msg) msg.textContent = "Saving…";

  let pin;
  try {
    pin = requireValidPinOrThrow();
  } catch (e) {
    if (msg) msg.textContent = "Wrong PIN. (No changes made.)";
    return;
  }

  try {
    await applyDelta(employeeId, delta, reason, pin);
    if (msg) msg.textContent = `Done (${delta > 0 ? "+" : ""}${delta}).`;
  } catch (e) {
    if (msg) msg.textContent = `Error: ${e.message}`;
  }
}

async function applyDelta(employeeId, delta, reason, pin) {
  const empRef = doc(db, "employees", employeeId);
  const empSnap = await getDoc(empRef);
  if (!empSnap.exists()) throw new Error("Employee not found.");

  const current = Number(empSnap.data().points ?? 0);
  const next = current + delta;

  // Update balance (include pin for rules)
  await updateDoc(empRef, { points: next, pin });

  // Write transaction log (include pin for rules)
  await addDoc(collection(db, "employees", employeeId, "transactions"), {
    delta,
    reason: reason || "",
    createdAt: serverTimestamp(),
    pin
  });

  setText("empPoints", String(next));
  await loadRecentTransactions(employeeId);
}

async function loadRecentTransactions(employeeId) {
  const txList = $("txList");
  if (!txList) return;

  txList.innerHTML = `<div class="muted">Loading…</div>`;

  const qy = query(
    collection(db, "employees", employeeId, "transactions"),
    orderBy("createdAt", "desc"),
    limit(10)
  );
  const snap = await getDocs(qy);

  if (snap.empty) {
    txList.innerHTML = `<div class="muted">No activity yet.</div>`;
    return;
  }

  const items = [];
  snap.forEach(docSnap => {
    const d = docSnap.data();
    const delta = d.delta ?? 0;
    const reason = d.reason ?? "";
    items.push(`
      <div class="item">
        <div class="title">${delta > 0 ? "+" : ""}${delta} pts</div>
        <div class="sub">${reason ? escapeHtml(reason) : ""}</div>
      </div>
    `);
  });

  txList.innerHTML = items.join("");
}

// ---- ADMIN ----
async function initAdmin() {
  $("btnBack")?.addEventListener("click", () => go("./index.html"));
  $("btnResetPin")?.addEventListener("click", resetPin);

  // Tabs
  document.querySelectorAll(".tab").forEach(t => {
    t.addEventListener("click", () => {
      document.querySelectorAll(".tab").forEach(x => x.classList.remove("active"));
      t.classList.add("active");

      const key = t.dataset.tab;
      ["create", "replace", "list"].forEach(k => show(`tab-${k}`, k === key));
    });
  });

  // Scanner wiring for Create + Replace
  function wireScanner(btnStartId, btnStopId, readerId, outputInputId, msgId) {
    let scanning = false;
    const startBtn = $(btnStartId);
    const stopBtn = $(btnStopId);
    const out = $(outputInputId);
    const msg = $(msgId);

    const scannerObj = createScanner(readerId, (raw) => {
      const code = cleanCode(raw);
      if (!code) return;
      out.value = code;
      stop();
      msg.textContent = "Scanned.";
    });

    const start = async () => {
      if (scanning) return;
      scanning = true;
      stopBtn.classList.remove("hidden");
      msg.textContent = "Starting camera…";
      try {
        await scannerObj.start();
        msg.textContent = "Scanning…";
      } catch (e) {
        msg.textContent = `Scan error: ${e.message}`;
        scanning = false;
        stopBtn.classList.add("hidden");
      }
    };

    const stop = async () => {
      if (!scanning) return;
      scanning = false;
      stopBtn.classList.add("hidden");
      await scannerObj.stop();
    };

    startBtn?.addEventListener("click", start);
    stopBtn?.addEventListener("click", stop);
  }

  wireScanner("btnStartCreateScan", "btnStopCreateScan", "createReader", "createCode", "createMsg");
  wireScanner("btnStartReplaceScan", "btnStopReplaceScan", "replaceReader", "replaceCode", "replaceMsg");

  $("btnCreate")?.addEventListener("click", createEmployeeAndCard);
  $("btnReplace")?.addEventListener("click", replaceCard);

  $("btnRefresh")?.addEventListener("click", refreshEmployeeList);
  $("search")?.addEventListener("input", refreshEmployeeList);

  await refreshEmployeeDropdown();
  await refreshEmployeeList();
}

async function createEmployeeAndCard() {
  const code = cleanCode($("createCode")?.value);
  const name = cleanCode($("createName")?.value);
  const pts = Number(cleanCode($("createPoints")?.value || "0")) || 0;
  const msg = $("createMsg");

  if (!code) return (msg.textContent = "Scan or type a code first.");
  if (!name) return (msg.textContent = "Enter a name.");

  let pin;
  try {
    pin = requireValidPinOrThrow();
  } catch {
    msg.textContent = "Wrong PIN. (No changes made.)";
    return;
  }

  msg.textContent = "Checking code…";

  const existing = await getDoc(doc(db, "cards", code));
  if (existing.exists() && !existing.data().disabled) {
    msg.textContent = "That code is already assigned to someone.";
    return;
  }

  msg.textContent = "Creating…";

  // Create employee with auto ID
  const empRef = doc(collection(db, "employees"));
  await setDoc(empRef, {
    name,
    points: pts,
    createdAt: serverTimestamp(),
    pin
  });

  // Assign card
  await setDoc(doc(db, "cards", code), {
    employeeId: empRef.id,
    assignedAt: serverTimestamp(),
    disabled: false,
    pin
  });

  // Optional: starting transaction
  if (pts !== 0) {
    await addDoc(collection(db, "employees", empRef.id, "transactions"), {
      delta: pts,
      reason: "starting points",
      createdAt: serverTimestamp(),
      pin
    });
  }

  msg.textContent = `Created ${name} + assigned code.`;
  $("createName").value = "";
  $("createPoints").value = "0";

  await refreshEmployeeDropdown();
  await refreshEmployeeList();
}

async function replaceCard() {
  const newCode = cleanCode($("replaceCode")?.value);
  const employeeId = cleanCode($("replaceEmployee")?.value);
  const msg = $("replaceMsg");

  if (!newCode) return (msg.textContent = "Scan the NEW card code first.");
  if (!employeeId) return (msg.textContent = "Pick an employee.");

  let pin;
  try {
    pin = requireValidPinOrThrow();
  } catch {
    msg.textContent = "Wrong PIN. (No changes made.)";
    return;
  }

  msg.textContent = "Checking new code…";

  const newCardSnap = await getDoc(doc(db, "cards", newCode));
  if (newCardSnap.exists() && !newCardSnap.data().disabled) {
    msg.textContent = "That new code is already assigned. Use a different card.";
    return;
  }

  msg.textContent = "Disabling old card…";

  // Find current active card(s) for employee and disable them (no delete needed)
  const qy = query(collection(db, "cards"), where("employeeId", "==", employeeId));
  const snap = await getDocs(qy);

  for (const d of snap.docs) {
    const data = d.data();
    if (!data.disabled) {
      await updateDoc(doc(db, "cards", d.id), { disabled: true, pin });
    }
  }

  // Assign new code
  await setDoc(doc(db, "cards", newCode), {
    employeeId,
    assignedAt: serverTimestamp(),
    disabled: false,
    pin
  });

  msg.textContent = "Card replaced successfully.";
  await refreshEmployeeList();
}

async function refreshEmployeeDropdown() {
  const sel = $("replaceEmployee");
  if (!sel) return;

  sel.innerHTML = `<option value="">Loading…</option>`;

  const snap = await getDocs(collection(db, "employees"));
  const opts = [];
  snap.forEach(docSnap => {
    const d = docSnap.data();
    opts.push({ id: docSnap.id, name: d.name || "(no name)" });
  });

  opts.sort((a, b) => a.name.localeCompare(b.name));

  sel.innerHTML =
    `<option value="">Select…</option>` +
    opts.map(o => `<option value="${o.id}">${escapeHtml(o.name)}</option>`).join("");
}

async function refreshEmployeeList() {
  const list = $("empList");
  const msg = $("listMsg");
  if (!list) return;

  const search = cleanCode($("search")?.value).toLowerCase();
  list.innerHTML = `<div class="muted">Loading…</div>`;
  msg.textContent = "";

  const empSnap = await getDocs(collection(db, "employees"));
  const employees = [];
  empSnap.forEach(docSnap => {
    const d = docSnap.data();
    employees.push({ id: docSnap.id, name: d.name || "(no name)", points: d.points ?? 0 });
  });

  let filtered = employees;
  if (search) filtered = employees.filter(e => e.name.toLowerCase().includes(search));
  filtered.sort((a, b) => a.name.localeCompare(b.name));

  // Map employee -> active code
  const cardsSnap = await getDocs(collection(db, "cards"));
  const empToCode = new Map();
  cardsSnap.forEach(docSnap => {
    const d = docSnap.data();
    if (d.employeeId && !d.disabled) empToCode.set(d.employeeId, docSnap.id);
  });

  list.innerHTML = filtered.map(e => {
    const code = empToCode.get(e.id) || "—";
    return `
      <div class="item">
        <div class="title">${escapeHtml(e.name)}</div>
        <div class="sub">Points: ${e.points} • Code: ${escapeHtml(code)}</div>
      </div>
    `;
  }).join("");

  if (filtered.length === 0) list.innerHTML = `<div class="muted">No matches.</div>`;
}

// ---- Boot ----
if (page === "index.html" || page === "") initIndex();
if (page === "employee.html") initEmployee();
if (page === "admin.html") initAdmin();
