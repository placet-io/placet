"""Placet API example — upload, message, approval with file, download.

Usage:
    pip install requests python-dotenv
    python example.py
"""

import os
import sys
import tempfile

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
session.headers["Authorization"] = f"Bearer {API_KEY}"


# ── Step 1: Upload a file ────────────────────────────────────────

print("1) Uploading file...")
tmp = tempfile.NamedTemporaryFile(suffix=".txt", delete=False)
tmp.write(b"Hello from Placet Python example!\nThis is a test file.")
tmp.close()

with open(tmp.name, "rb") as f:
    resp = session.post(
        f"{BASE_URL}/api/v1/files/store",
        files={"file": ("example.txt", f, "text/plain")},
        data={"channelId": CHANNEL},
    )
resp.raise_for_status()
attachment = resp.json()
attachment_id = attachment["id"]
print(f"   Uploaded: {attachment['filename']} (id: {attachment_id})")

os.unlink(tmp.name)


# ── Step 2: Send a normal message ────────────────────────────────

print("\n2) Sending a normal message...")
resp = session.post(
    f"{BASE_URL}/api/v1/messages",
    json={
        "channelId": CHANNEL,
        "text": "Hello from the **Python** example!",
        "status": "success",
    },
)
resp.raise_for_status()
msg = resp.json()
print(f"   Message sent: {msg['id']}")


# ── Step 3: Send message with file + approval ────────────────────

print("\n3) Sending approval request with file attachment...")
resp = session.post(
    f"{BASE_URL}/api/v1/messages",
    json={
        "channelId": CHANNEL,
        "text": "Please review the attached file. Approve to continue.",
        "status": "warning",
        "attachmentIds": [attachment_id],
        "review": {
            "type": "approval",
            "payload": {
                "options": [
                    {"id": "approve", "label": "Approve", "style": "primary"},
                    {"id": "reject", "label": "Reject", "style": "danger"},
                ],
            },
        },
    },
)
resp.raise_for_status()
approval_msg = resp.json()
print(f"   Approval request sent: {approval_msg['id']}")
print("   Waiting for human response (up to 60s)...")

resp = session.get(
    f"{BASE_URL}/api/v1/reviews/{approval_msg['id']}/wait",
    params={"channel": CHANNEL, "timeout": "60000"},
)
resp.raise_for_status()
review = resp.json()

if review["status"] == "completed":
    chosen = review["message"]["review"]["response"]["selectedOption"]
    print(f"   Human chose: {chosen}")
else:
    print(f"   Review status: {review['status']}")


# ── Step 4: Download the file ────────────────────────────────────

print(f"\n4) Downloading file {attachment_id}...")
resp = session.get(f"{BASE_URL}/api/v1/files/{attachment_id}/download")
resp.raise_for_status()

print(f"   Content-Type: {resp.headers.get('Content-Type')}")
print(f"   Content:\n   {resp.text}")

print("\nDone!")
