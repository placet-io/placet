/**
 * Placet WebSocket echo & logger.
 *
 * Connects to the Placet WebSocket gateway, subscribes to a channel,
 * and logs all events. When a user sends a message or completes a review,
 * the bot replies with a random response via the REST API.
 *
 * Usage:
 *   npm install
 *   npx tsx ws_echo.ts
 */

import { config } from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { io } from "socket.io-client";

config({ path: resolve(dirname(fileURLToPath(import.meta.url)), "..", ".env") });

const BASE_URL = (process.env.PLACET_URL ?? "http://localhost:3001").replace(/\/$/, "");
const API_KEY = process.env.PLACET_API_KEY ?? "";
const CHANNEL = process.env.PLACET_CHANNEL ?? "";

if (!API_KEY || !CHANNEL) {
  console.error("Set PLACET_API_KEY and PLACET_CHANNEL in ../.env");
  process.exit(1);
}

// ── Reply templates ───────────────────────────────────────────────

type Reply =
  | { type: "message"; text: string; status: string }
  | { type: "approval"; text: string };

const REPLIES: Reply[] = [
  { type: "message", text: "Got it, thanks! 👍", status: "success" },
  { type: "message", text: "Acknowledged — processing your request now.", status: "info" },
  { type: "message", text: "Roger that. I'll take it from here.", status: "success" },
  { type: "message", text: "⚠️ Heads up — this might take a moment.", status: "warning" },
  { type: "message", text: "Working on it… stand by.", status: "info" },
  { type: "message", text: "Done! Everything looks good.", status: "success" },
  { type: "approval", text: "Should I proceed with this action?" },
  { type: "approval", text: "This requires your approval before I continue." },
];

let replyIndex = 0;
function nextReply(): Reply {
  const reply = REPLIES[replyIndex % REPLIES.length];
  replyIndex++;
  return reply;
}

// Deduplicate events (server may emit to multiple rooms)
const seenIds = new Set<string>();

function ts() {
  return new Date().toISOString().slice(11, 23);
}

const authHeaders = {
  "x-api-key": API_KEY,
  "Content-Type": "application/json",
};

async function sendMessage(text: string, status = "info") {
  const resp = await fetch(`${BASE_URL}/api/v1/messages`, {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({ channelId: CHANNEL, text, status }),
  });
  if (!resp.ok) console.error(`  [send error] ${resp.status}: ${await resp.text()}`);
  return resp;
}

async function sendApproval(text: string) {
  const resp = await fetch(`${BASE_URL}/api/v1/messages`, {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({
      channelId: CHANNEL,
      text,
      status: "warning",
      review: {
        type: "approval",
        payload: {
          options: [
            { id: "approve", label: "Approve", style: "primary" },
            { id: "reject", label: "Reject", style: "danger" },
          ],
        },
      },
    }),
  });
  if (!resp.ok) console.error(`  [send error] ${resp.status}: ${await resp.text()}`);
  return resp;
}

async function main() {
  console.log(`Connecting to ${BASE_URL}/ws...`);
  const socket = io(`${BASE_URL}/ws`, {
    auth: { apiKey: API_KEY },
    transports: ["websocket"],
    reconnection: false,
  });

  let messageCount = 0;
  const MAX_MESSAGES = 10;

  function checkDone() {
    if (messageCount >= MAX_MESSAGES) {
      console.log(`\nReached ${MAX_MESSAGES} messages. Shutting down.`);
      socket.disconnect();
      process.exit(0);
    }
  }

  socket.on("connect", () => {
    console.log(`Connected (id: ${socket.id})`);
    socket.emit("subscribe:channel", CHANNEL);
    console.log(`Subscribed to channel ${CHANNEL}`);
    console.log(`Listening for events (will exit after ${MAX_MESSAGES} messages)...\n`);
  });

  socket.on("connect_error", (err) => {
    console.error("Connection error:", err.message);
  });

  // ── Log & respond to messages ───────────────────────────────────

  socket.on("message:created", async (data) => {
    // Deduplicate — server emits to both channel and user rooms
    if (data.id && seenIds.has(data.id)) return;
    if (data.id) seenIds.add(data.id);

    const sender = data.senderType ?? "unknown";
    const text = data.text ?? "(no text)";

    // Only log and reply to user messages (ignore our own agent messages)
    if (sender !== "user") return;

    messageCount++;
    console.log(`[${ts()}] 📨 [${messageCount}/${MAX_MESSAGES}] user: ${text}`);

    const reply = nextReply();
    if (reply.type === "approval") {
      console.log(`[${ts()}]    ↳ sending approval: "${reply.text}"`);
      await sendApproval(reply.text);
    } else {
      console.log(`[${ts()}]    ↳ replying [${reply.status}]: "${reply.text}"`);
      await sendMessage(reply.text, reply.status);
    }
    checkDone();
  });

  // ── Log & respond to reviews ────────────────────────────────────

  socket.on("review:responded", async (data) => {
    const selected = data.review?.response?.selectedOption ?? "unknown";
    console.log(`[${ts()}] ✅ review:responded — selected: ${selected}`);
    console.log(`[${ts()}]    ↳ replying: "Thanks for your decision!"`);
    await sendMessage(`Thanks for your decision: **${selected}**`, "success");
  });

  socket.on("review:expired", (data) => {
    console.log(`[${ts()}] ⏰ review:expired — message: ${data.messageId}`);
  });

  // ── Other events ────────────────────────────────────────────────

  socket.on("message:updated", (data) => {
    console.log(`[${ts()}] ✏️  message:updated ${data.id ?? ""}`);
  });

  socket.on("message:deleted", (data) => {
    console.log(`[${ts()}] 🗑️  message:deleted ${data.id ?? ""}`);
  });

  socket.on("pong", () => {
    console.log(`[${ts()}] 🏓 pong`);
  });

  socket.on("disconnect", (reason) => {
    console.log(`Disconnected: ${reason}`);
  });

  // Keep alive
  setInterval(() => socket.emit("ping"), 30_000);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
