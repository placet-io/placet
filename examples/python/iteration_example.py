"""Placet iteration workflow — review → interpret response → revise → re-submit → approve.

Demonstrates:
  - Sending a review message with metadata (agent run context)
  - Interpreting the review response to decide whether to iterate
  - Sending an iteration via `iterationOf` to chain messages
  - Waiting for final approval

Usage:
    pip install requests python-dotenv
    python iteration_example.py
"""

import os
import sys
import time

import requests
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

BASE_URL = os.environ.get("PLACET_URL", "http://localhost:3001").rstrip("/")
API_KEY = os.environ.get("PLACET_API_KEY", "")
CHANNEL = os.environ.get("PLACET_CHANNEL", "")

if not API_KEY or not CHANNEL:
    print("Set PLACET_API_KEY and PLACET_CHANNEL in ../.env")
    sys.exit(1)

session = requests.Session()
session.headers["x-api-key"] = API_KEY


def send_review_message(text: str, iteration_of: str | None = None) -> dict:
    """Send a message with an approval review, optionally as an iteration."""
    body: dict = {
        "channelId": CHANNEL,
        "text": text,
        "status": "warning",
        "metadata": {"agent": "iteration-example", "generatedAt": time.time()},
        "review": {
            "type": "approval",
            "payload": {
                "options": [
                    {"id": "approve", "label": "Approve", "style": "primary"},
                    {"id": "reject", "label": "Reject", "style": "danger"},
                ],
            },
        },
    }
    if iteration_of:
        body["iterationOf"] = iteration_of

    resp = session.post(f"{BASE_URL}/api/v1/messages", json=body)
    resp.raise_for_status()
    return resp.json()


def wait_for_review(message_id: str, timeout_ms: int = 120000) -> dict:
    """Wait for the human to respond to a review."""
    resp = session.get(
        f"{BASE_URL}/api/v1/reviews/{message_id}/wait",
        params={"channel": CHANNEL, "timeout": str(timeout_ms)},
    )
    resp.raise_for_status()
    return resp.json()


def get_iteration_chain(message_id: str) -> list[dict]:
    """Fetch all iterations linked to a message."""
    resp = session.get(f"{BASE_URL}/api/v1/messages/iterations/{message_id}", params={"channel": CHANNEL})
    resp.raise_for_status()
    data = resp.json()
    return data.get("iterations", [])


# ── Step 1: Agent sends initial content for review ───────────────

print("1) Sending initial content for review...")
msg = send_review_message(
    "Here is the first draft of the report.\n\n"
    "- Revenue: $1.2M\n"
    "- Growth: 15% YoY\n"
    "- Forecast: stable"
)
print(f"   Message sent: {msg['id']} (iteration #{msg.get('iteration', 1)})")
print("   Waiting for human response (up to 120s)...")

result = wait_for_review(msg["id"])
status = result["status"]
review_response = result["message"]["review"].get("response", {})
chosen = review_response.get("selectedOption", "")
feedback = review_response.get("feedback", "")

print(f"   Status: {status}")

if status == "completed" and chosen == "reject":
    print(f"   Human rejected! Feedback: {feedback!r}")
elif status == "completed" and chosen == "approve":
    print("   Approved on first try!")
    sys.exit(0)
else:
    print(f"   Unexpected: status={status}, option={chosen}")
    sys.exit(1)


# ── Step 2: Agent revises and sends iteration #2 ────────────────

print("\n2) Revising based on feedback and sending iteration #2...")
revised_msg = send_review_message(
    "Here is the **revised** report incorporating your feedback.\n\n"
    "- Revenue: $1.2M (updated methodology)\n"
    "- Growth: 18% YoY (corrected calculation)\n"
    "- Forecast: moderately positive\n"
    f"- Addressed: {feedback}",
    iteration_of=msg["id"],
)
print(f"   Iteration sent: {revised_msg['id']} (iteration #{revised_msg.get('iteration', '?')})")
print("   Waiting for human response...")

result = wait_for_review(revised_msg["id"])
status = result["status"]
review_response = result["message"]["review"].get("response", {})
chosen = review_response.get("selectedOption", "")

print(f"   Status: {status}")

if status == "completed" and chosen == "approve":
    print("   Approved!")
elif status == "completed" and chosen == "reject":
    print("   Rejected again — in production, loop until approved.")
else:
    print(f"   Result: status={status}, option={chosen}")


# ── Step 3: Inspect the iteration chain ──────────────────────────

print("\n3) Fetching iteration chain...")
chain = get_iteration_chain(revised_msg["id"])
print(f"   Chain has {len(chain)} iteration(s):")
for it in chain:
    it_status = it.get("review", {}).get("status", "—") if it.get("review") else "—"
    print(f"   #{it.get('iteration', '?')} — {it['id'][:8]}… — review: {it_status}")

print("\nDone!")
