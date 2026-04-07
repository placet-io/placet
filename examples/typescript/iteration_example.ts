/**
 * Placet iteration workflow — review → interpret response → revise → re-submit → approve.
 *
 * Demonstrates:
 *   - Sending a review message with metadata (agent run context)
 *   - Interpreting the review response to decide whether to iterate
 *   - Sending an iteration via `iterationOf` to chain messages
 *   - Waiting for final approval
 *
 * Usage:
 *   npm install
 *   npx tsx iteration_example.ts
 */

import { config } from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

config({ path: resolve(dirname(fileURLToPath(import.meta.url)), "..", ".env") });

const BASE_URL = (process.env.PLACET_URL ?? "http://localhost:3001").replace(/\/$/, "");
const API_KEY = process.env.PLACET_API_KEY ?? "";
const CHANNEL = process.env.PLACET_CHANNEL ?? "";

if (!API_KEY || !CHANNEL) {
  console.error("Set PLACET_API_KEY and PLACET_CHANNEL in ../.env");
  process.exit(1);
}

const headers = {
  "x-api-key": API_KEY,
  "Content-Type": "application/json",
};

async function sendReviewMessage(text: string, iterationOf?: string) {
  const body: Record<string, unknown> = {
    channelId: CHANNEL,
    text,
    status: "warning",
    metadata: { agent: "iteration-example", generatedAt: Date.now() },
    review: {
      type: "approval",
      payload: {
        options: [
          { id: "approve", label: "Approve", style: "primary" },
          { id: "reject", label: "Reject", style: "danger" },
        ],
      },
    },
  };
  if (iterationOf) body.iterationOf = iterationOf;

  const resp = await fetch(`${BASE_URL}/api/v1/messages`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  if (!resp.ok) throw new Error(`Send failed: ${resp.status} ${await resp.text()}`);
  return resp.json();
}

async function waitForReview(messageId: string, timeoutMs = 120_000) {
  const resp = await fetch(
    `${BASE_URL}/api/v1/reviews/${messageId}/wait?channel=${CHANNEL}&timeout=${timeoutMs}`,
    { headers },
  );
  if (!resp.ok) throw new Error(`Wait failed: ${resp.status}`);
  return resp.json();
}

async function getIterationChain(messageId: string) {
  const resp = await fetch(`${BASE_URL}/api/v1/messages/iterations/${messageId}?channel=${CHANNEL}`, { headers });
  if (!resp.ok) throw new Error(`Chain failed: ${resp.status}`);
  const data = await resp.json();
  return data.iterations as Array<Record<string, unknown>>;
}

// ── Step 1: Agent sends initial content for review ───────────────

console.log("1) Sending initial content for review...");
const msg = await sendReviewMessage(
  "Here is the first draft of the report.\n\n" +
  "- Revenue: $1.2M\n" +
  "- Growth: 15% YoY\n" +
  "- Forecast: stable",
);
console.log(`   Message sent: ${msg.id} (iteration #${msg.iteration ?? 1})`);
console.log("   Waiting for human response (up to 120s)...");

const result = await waitForReview(msg.id);
const status = result.status;
const reviewResponse = result.message?.review?.response ?? {};
const chosen = reviewResponse.selectedOption ?? "";
const feedback = result.message?.review?.feedback ?? "";

console.log(`   Status: ${status}`);

if (status === "completed" && chosen === "reject") {
  console.log(`   Human rejected! Feedback: "${feedback}"`);
} else if (status === "completed" && chosen === "approve") {
  console.log("   Approved on first try!");
  process.exit(0);
} else {
  console.log(`   Unexpected: status=${status}, option=${chosen}`);
  process.exit(1);
}

// ── Step 2: Agent revises and sends iteration #2 ────────────────

console.log("\n2) Revising based on feedback and sending iteration #2...");
const revisedMsg = await sendReviewMessage(
  "Here is the **revised** report incorporating your feedback.\n\n" +
  "- Revenue: $1.2M (updated methodology)\n" +
  "- Growth: 18% YoY (corrected calculation)\n" +
  "- Forecast: moderately positive\n" +
  `- Addressed: ${feedback}`,
  msg.id,
);
console.log(`   Iteration sent: ${revisedMsg.id} (iteration #${revisedMsg.iteration ?? "?"})`);
console.log("   Waiting for human response...");

const result2 = await waitForReview(revisedMsg.id);
const status2 = result2.status;
const chosen2 = result2.message?.review?.response?.selectedOption ?? "";

console.log(`   Status: ${status2}`);

if (status2 === "completed" && chosen2 === "approve") {
  console.log("   Approved!");
} else if (status2 === "completed" && chosen2 === "reject") {
  console.log("   Rejected again — in production, loop until approved.");
} else {
  console.log(`   Result: status=${status2}, option=${chosen2}`);
}

// ── Step 3: Inspect the iteration chain ──────────────────────────

console.log("\n3) Fetching iteration chain...");
const chain = await getIterationChain(revisedMsg.id);
console.log(`   Chain has ${chain.length} iteration(s):`);
for (const it of chain) {
  const itReview = it.review as Record<string, unknown> | undefined;
  const itStatus = itReview?.status ?? "—";
  console.log(`   #${it.iteration ?? "?"} — ${String(it.id).slice(0, 8)}… — review: ${itStatus}`);
}

console.log("\nDone!");
