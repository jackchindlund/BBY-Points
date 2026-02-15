import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getFirestore,
  collection,
  query,
  orderBy,
  limit,
  getDocs
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

/**
 * Paste the SAME Firebase config you used in app.js here.
 * Firebase Console → Project Settings → Your apps → Web app config
 */
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

const REFRESH_SECONDS = 5; // "live" refresh interval
const TOP_N = 10;

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

function setPodium(list) {
  const p1 = list[0] || null;
  const p2 = list[1] || null;
  const p3 = list[2] || null;

  setText("p1Name", p1 ? p1.name : "—");
  setText("p1Points", p1 ? `${p1.points} pts` : "—");

  setText("p2Name", p2 ? p2.name : "—");
  setText("p2Points", p2 ? `${p2.points} pts` : "—");

  setText("p3Name", p3 ? p3.name : "—");
  setText("p3Points", p3 ? `${p3.points} pts` : "—");
}

function renderRows(list) {
  const rows = $("rows");
  if (!rows) return;

  if (!list.length) {
    rows.innerHTML = `<tr><td colspan="3" style="color: rgba(242,246,255,0.65);">No employees yet.</td></tr>`;
    return;
  }

  // If you want tie-aware ranks later, we can do that. For now: 1..10.
  rows.innerHTML = list.map((e, idx) => `
    <tr>
      <td class="rankCell">#${idx + 1}</td>
      <td>${escapeHtml(e.name)}</td>
      <td class="pointsCell"><span class="score">${e.points}</span></td>
    </tr>
  `).join("");
}

function formatTime(d = new Date()) {
  // Looks nice on a scoreboard
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

async function fetchTopEmployees() {
  // Pull top 10 employees by points
  const qy = query(
    collection(db, "employees"),
    orderBy("points", "desc"),
    limit(TOP_N)
  );

  const snap = await getDocs(qy);

  const list = [];
  snap.forEach(docSnap => {
    const d = docSnap.data();
    list.push({
      id: docSnap.id,
      name: d.name || "(no name)",
      points: Number(d.points ?? 0)
    });
  });

  return list;
}

let refreshing = false;

async function refreshLeaderboard() {
  if (refreshing) return;
  refreshing = true;

  setText("msg", ""); // clear previous error

  try {
    const list = await fetchTopEmployees();

    setPodium(list);
    renderRows(list);

    setText("lastUpdated", formatTime(new Date()));
  } catch (e) {
    setText("msg", `Error loading leaderboard: ${e?.message || e}`);
  } finally {
    refreshing = false;
  }
}

function wireUI() {
  // Show refresh interval on page
  setText("refreshEvery", `${REFRESH_SECONDS}s`);

  $("btnRefresh")?.addEventListener("click", () => {
    refreshLeaderboard();
  });

  // First load
  refreshLeaderboard();

  // Auto refresh (live)
  setInterval(() => {
    refreshLeaderboard();
  }, REFRESH_SECONDS * 1000);
}

wireUI();
