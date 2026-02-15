import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getFirestore,
  collection,
  collectionGroup,
  query,
  orderBy,
  limit,
  getDocs
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

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

const $ = (id) => document.getElementById(id);

const REFRESH_SECONDS = 5;
const TOP_N = 10;
const RECENT_SHOW = 12;
const RECENT_FETCH = 35; // fetch more then filter positive

function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function setText(id, text) {
  const el = $(id);
  if (el) el.textContent = text;
}

function formatTime(d = new Date()) {
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function setPodium(prefix, list) {
  const p1 = list[0] || null;
  const p2 = list[1] || null;
  const p3 = list[2] || null;

  setText(`${prefix}1Name`, p1 ? p1.name : "—");
  setText(`${prefix}1Points`, p1 ? `${p1.points} pts` : "—");

  setText(`${prefix}2Name`, p2 ? p2.name : "—");
  setText(`${prefix}2Points`, p2 ? `${p2.points} pts` : "—");

  setText(`${prefix}3Name`, p3 ? p3.name : "—");
  setText(`${prefix}3Points`, p3 ? `${p3.points} pts` : "—");
}

function renderRows(tbodyId, list, scoreClass = "") {
  const rows = $(tbodyId);
  if (!rows) return;

  if (!list.length) {
    rows.innerHTML = `<tr><td colspan="3" style="color: rgba(242,246,255,0.65);">No employees yet.</td></tr>`;
    return;
  }

  rows.innerHTML = list.map((e, idx) => `
    <tr>
      <td class="rankCell">#${idx + 1}</td>
      <td>${escapeHtml(e.name)}</td>
      <td class="pointsCell"><span class="score ${scoreClass}">${e.points}</span></td>
    </tr>
  `).join("");
}

async function fetchTopEmployees(fieldName) {
  const qy = query(
    collection(db, "employees"),
    orderBy(fieldName, "desc"),
    limit(TOP_N)
  );

  const snap = await getDocs(qy);

  const list = [];
  snap.forEach(docSnap => {
    const d = docSnap.data();
    list.push({
      id: docSnap.id,
      name: d.name || "(no name)",
      points: Number(d[fieldName] ?? 0)
    });
  });

  return list;
}

function tsToDate(ts) {
  try {
    if (!ts) return null;
    if (typeof ts.toDate === "function") return ts.toDate();
  } catch {}
  return null;
}

async function fetchRecentEarns() {
  // Pull latest transactions across all employees
  const qy = query(
    collectionGroup(db, "transactions"),
    orderBy("createdAt", "desc"),
    limit(RECENT_FETCH)
  );

  const snap = await getDocs(qy);

  const earns = [];
  snap.forEach(docSnap => {
    const d = docSnap.data();

    const delta = Number(d.delta ?? 0);
    const dailyEarned = Number(d.dailyEarned ?? (delta > 0 ? delta : 0));
    if (dailyEarned <= 0) return; // only show positive earns

    earns.push({
      employeeName: d.employeeName || "(no name)",
      points: dailyEarned,
      reason: d.reason || "",
      createdAt: tsToDate(d.createdAt)
    });
  });

  return earns.slice(0, RECENT_SHOW);
}

function renderRecentEarns(list) {
  const wrap = $("recentTx");
  if (!wrap) return;

  if (!list.length) {
    wrap.innerHTML = `<div class="txRow" style="color: rgba(242,246,255,0.65);">No earns yet.</div>`;
    return;
  }

  wrap.innerHTML = list.map(tx => {
    const time = tx.createdAt
      ? tx.createdAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
      : "—";
    const reason = tx.reason ? escapeHtml(tx.reason) : "";
    return `
      <div class="txRow">
        <div class="txLeft">
          <div class="txName">${escapeHtml(tx.employeeName)}</div>
          <div class="txReason">${reason}</div>
        </div>
        <div class="txRight">
          <span class="score daily">+${tx.points}</span>
          <div class="txTime">${time}</div>
        </div>
      </div>
    `;
  }).join("");
}

let refreshing = false;

async function refreshAll() {
  if (refreshing) return;
  refreshing = true;

  setText("msg", "");

  try {
    const [overall, daily, recent] = await Promise.all([
      fetchTopEmployees("points"),
      fetchTopEmployees("dailyPoints"),
      fetchRecentEarns()
    ]);

    setPodium("p", overall);
    renderRows("rows", overall, "");

    setPodium("d", daily);
    renderRows("drows", daily, "daily");

    renderRecentEarns(recent);

    setText("lastUpdated", formatTime(new Date()));
  } catch (e) {
    setText("msg", `Error loading leaderboard: ${e?.message || e}`);
  } finally {
    refreshing = false;
  }
}

function wireUI() {
  setText("refreshEvery", `${REFRESH_SECONDS}s`);
  $("btnRefresh")?.addEventListener("click", refreshAll);

  refreshAll();
  setInterval(refreshAll, REFRESH_SECONDS * 1000);
}

wireUI();
