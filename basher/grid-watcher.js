#!/usr/bin/env node
/**
 * Grid Watcher Daemon — routes Firestore events to local programs.
 * Lightweight onSnapshot listener. It routes, it does not think.
 *
 * Wake strategies (abstracted):
 *   1. tmux send-keys — if program has a running tmux session
 *   2. spawn fresh    — launch new claude -p session
 *
 * Usage: CACHEBASH_USER_ID=<uid> node grid-watcher.js
 */
const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { execSync, spawn } = require("child_process");

const USER_ID = process.env.CACHEBASH_USER_ID;
if (!USER_ID) { console.error("CACHEBASH_USER_ID required"); process.exit(1); }

initializeApp();
const db = getFirestore();

// Program → tmux session mapping
const PROGRAMS = { basher: "basher", able: "able", sark: "sark" };

// --- Wake Interface ---
function tmuxExists(session) {
  try { execSync(`tmux has-session -t ${session} 2>/dev/null`); return true; }
  catch { return false; }
}

function wakeTmux(session, msg) {
  execSync(`tmux send-keys -t ${session} '${msg.replace(/'/g, "'\\''")}' Enter`);
  console.log(`[wake:tmux] Sent to ${session}`);
}

function wakeSpawn(program, msg) {
  const child = spawn("claude", ["-p", msg], { detached: true, stdio: "ignore" });
  child.unref();
  console.log(`[wake:spawn] Launched claude -p for ${program} (pid ${child.pid})`);
}

function wake(target, msg) {
  const session = PROGRAMS[target];
  if (session && tmuxExists(session)) wakeTmux(session, msg);
  else wakeSpawn(target, msg);
}

// --- Firestore Listener ---
const query = db.collection(`users/${USER_ID}/messages`)
  .where("direction", "==", "to_claude")
  .where("status", "==", "pending")
  .orderBy("createdAt", "asc");

let init = true;
query.onSnapshot((snap) => {
  if (init) { init = false; console.log(`[watcher] Init: ${snap.size} pending`); return; }

  for (const change of snap.docChanges()) {
    if (change.type !== "added") continue;
    const d = change.doc.data();
    const target = d.target || d.sessionId;
    const preview = (d.content || d.title || "").substring(0, 80);
    console.log(`[watcher] [${d.source || "?"}→${target || "?"}] ${d.message_type || "task"}: ${preview}`);
    if (target && PROGRAMS[target]) wake(target, preview);
  }
});

console.log(`[watcher] Listening: users/${USER_ID}/messages | Programs: ${Object.keys(PROGRAMS).join(", ")}`);
