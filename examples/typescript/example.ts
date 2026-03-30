/**
 * Placet API example — upload, message, approval with file, download.
 *
 * Usage:
 *   npm install
 *   npx tsx example.ts
 */

import { config } from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { writeFileSync, unlinkSync, readFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

config({ path: resolve(dirname(fileURLToPath(import.meta.url)), "..", ".env") });

const BASE_URL = (process.env.PLACET_URL ?? "http://localhost:3001").replace(/\/$/, "");
const API_KEY = process.env.PLACET_API_KEY ?? "";
const CHANNEL = process.env.PLACET_CHANNEL ?? "";

if (!API_KEY || !CHANNEL) {
  console.error("Set PLACET_API_KEY and PLACET_CHANNEL in ../.env");
  process.exit(1);
}

const headers = {
  Authorization: `Bearer ${API_KEY}`,
  "Content-Type": "application/json",
};

// ── Step 1: Upload a file ────────────────────────────────────────

console.log("1) Uploading file...");

const tmpFile = join(tmpdir(), "placet-example.txt");
writeFileSync(tmpFile, "Hello from Placet TypeScript example!\nThis is a test file.");

const form = new FormData();
form.append("file", new Blob([readFileSync(tmpFile)], { type: "text/plain" }), "example.txt");
form.append("channelId", CHANNEL);

const uploadResp = await fetch(`${BASE_URL}/api/v1/files/store`, {
  method: "POST",
  headers: { Authorization: `Bearer ${API_KEY}` },
  body: form,
});
if (!uploadResp.ok) throw new Error(`Upload failed: ${uploadResp.status} ${await uploadResp.text()}`);

const attachment = await uploadResp.json();
const attachmentId = attachment.id;
console.log(`   Uploaded: ${attachment.filename} (id: ${attachmentId})`);

unlinkSync(tmpFile);

// ── Step 2: Send a normal message ────────────────────────────────

console.log("\n2) Sending a normal message...");

const msgResp = await fetch(`${BASE_URL}/api/v1/messages`, {
  method: "POST",
  headers,
  body: JSON.stringify({
    channelId: CHANNEL,
    text: "Hello from the **TypeScript** example!",
    status: "success",
  }),
});
if (!msgResp.ok) throw new Error(`Message failed: ${msgResp.status}`);

const msg = await msgResp.json();
console.log(`   Message sent: ${msg.id}`);

// ── Step 3: Send message with file + approval ────────────────────

console.log("\n3) Sending approval request with file attachment...");

const approvalResp = await fetch(`${BASE_URL}/api/v1/messages`, {
  method: "POST",
  headers,
  body: JSON.stringify({
    channelId: CHANNEL,
    text: "Please review the attached file. Approve to continue.",
    status: "warning",
    attachmentIds: [attachmentId],
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
if (!approvalResp.ok) throw new Error(`Approval failed: ${approvalResp.status}`);

const approvalMsg = await approvalResp.json();
console.log(`   Approval request sent: ${approvalMsg.id}`);
console.log("   Waiting for human response (up to 60s)...");

const reviewResp = await fetch(
  `${BASE_URL}/api/v1/reviews/${approvalMsg.id}/wait?channel=${CHANNEL}&timeout=60000`,
  { headers },
);
if (!reviewResp.ok) throw new Error(`Review failed: ${reviewResp.status}`);

const review = await reviewResp.json();

if (review.status === "completed") {
  console.log(`   Human chose: ${review.message.review.response.selectedOption}`);
} else {
  console.log(`   Review status: ${review.status}`);
}

// ── Step 4: Download the file ────────────────────────────────────

console.log(`\n4) Downloading file ${attachmentId}...`);

const dlResp = await fetch(`${BASE_URL}/api/v1/files/${attachmentId}/download`, {
  headers: { Authorization: `Bearer ${API_KEY}` },
});
if (!dlResp.ok) throw new Error(`Download failed: ${dlResp.status}`);

console.log(`   Content-Type: ${dlResp.headers.get("content-type")}`);
console.log(`   Content:\n   ${await dlResp.text()}`);

console.log("\nDone!");
