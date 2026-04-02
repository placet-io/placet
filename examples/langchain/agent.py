"""LangChain chat agent via Placet (WebSocket).

Uses GPT as a conversational AI that talks to users through a Placet
channel. Receives messages in real-time via Socket.IO and can ask
follow-up questions using approval buttons or custom forms.

Usage:
    pip install -r requirements.txt
    python agent.py
"""

import os
import sys
import threading

import requests
import socketio
from dotenv import load_dotenv
from langchain.agents import AgentExecutor, create_tool_calling_agent
from langchain_core.messages import HumanMessage
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain_core.tools import tool
from langchain_openai import ChatOpenAI

load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

BASE_URL = os.environ.get("PLACET_URL", "http://localhost:3001").rstrip("/")
API_KEY = os.environ.get("PLACET_API_KEY", "")
CHANNEL = os.environ.get("PLACET_CHANNEL", "")

if not API_KEY or not CHANNEL:
    sys.exit("Set PLACET_API_KEY and PLACET_CHANNEL in ../.env")
if not os.environ.get("OPENAI_API_KEY"):
    sys.exit("Set OPENAI_API_KEY in ../.env")

_api = {"x-api-key": API_KEY, "Content-Type": "application/json"}

# ── Review response store (filled by WebSocket) ──────────────────

_review_events = {}   # message_id → threading.Event
_review_results = {}  # message_id → response data


def _wait_review(message_id, timeout=300):
    """Block until the WebSocket delivers review:responded for this message."""
    event = threading.Event()
    _review_events[message_id] = event
    event.wait(timeout=timeout)
    _review_events.pop(message_id, None)
    return _review_results.pop(message_id, None)


# ── Placet helpers ────────────────────────────────────────────────


def _post_message(**kwargs):
    resp = requests.post(f"{BASE_URL}/api/v1/messages", headers=_api, json={"channelId": CHANNEL, **kwargs})
    resp.raise_for_status()
    return resp.json()


# ── LangChain tools ──────────────────────────────────────────────


@tool
def send_message(text: str, status: str = "info") -> str:
    """Send a plain message to the user. No response expected.

    Args:
        text: Markdown-formatted message text.
        status: One of 'info', 'success', 'warning', 'error'.
    """
    msg = _post_message(text=text, status=status)
    return f"Message sent."


@tool
def ask_approval(question: str) -> str:
    """Present the user with an Approve / Reject decision.
    Blocks until the user clicks a button (up to 5 minutes).
    Use before any critical or irreversible action.

    Returns: 'approve', 'reject', or 'timeout'.
    If the result is 'timeout', do NOT retry — inform the user and stop.
    """
    msg = _post_message(
        text=question,
        status="warning",
        review={
            "type": "approval",
            "payload": {
                "options": [
                    {"id": "approve", "label": "Approve", "style": "primary"},
                    {"id": "reject", "label": "Reject", "style": "danger"},
                ],
            },
        },
    )
    data = _wait_review(msg["id"])
    if data:
        return data["review"]["response"]["selectedOption"]
    return "timeout"


@tool
def ask_selection(question: str, options: str) -> str:
    """Present multiple options for the user to choose from (up to 5 minutes).
    Use whenever you need the user to pick one choice out of several.

    Args:
        question: The question to display above the options.
        options: Comma-separated list of choices, e.g. "Option A, Option B, Option C"

    Returns: The id of the selected option (lowercase, underscored), or 'timeout'.
    If the result is 'timeout', do NOT retry — inform the user and stop.
    """
    items = [
        {"id": o.strip().lower().replace(" ", "_"), "label": o.strip()}
        for o in options.split(",")
    ]
    msg = _post_message(
        text=question,
        status="info",
        review={"type": "selection", "payload": {"mode": "single", "items": items}},
    )
    data = _wait_review(msg["id"])
    if data:
        ids = data["review"]["response"].get("selectedIds", [])
        return ids[0] if ids else "unknown"
    return "timeout"


@tool
def ask_form(question: str, fields: str) -> str:
    """Ask the user to fill in a form with one or more fields (up to 5 minutes).
    Use when you need structured input (names, emails, numbers, etc.).

    Args:
        question: Instruction text displayed above the form.
        fields: Comma-separated field names, e.g. "Name, Email, Environment"

    Returns: The filled values as "field: value" pairs, or 'timeout'.
    If the result is 'timeout', do NOT retry — inform the user and stop.
    """
    field_list = [
        {"name": f.strip().lower().replace(" ", "_"), "type": "text", "label": f.strip(), "required": True}
        for f in fields.split(",")
    ]
    msg = _post_message(
        text=question,
        status="info",
        review={"type": "form", "payload": {"fields": field_list, "submitLabel": "Submit"}},
    )
    data = _wait_review(msg["id"])
    if data:
        resp = data["review"]["response"]
        return ", ".join(f"{k}: {v}" for k, v in resp.items() if k != "selectedOption")
    return "timeout"


# ── Agent setup ───────────────────────────────────────────────────

llm = ChatOpenAI(model="gpt-5.2-instant")
tools = [send_message, ask_approval, ask_selection, ask_form]

prompt = ChatPromptTemplate.from_messages([
    ("system",
     "You are a helpful AI assistant communicating through Placet.\n\n"
     "IMPORTANT: You MUST use the provided tools to communicate. "
     "NEVER reply with plain text — the user cannot see it.\n\n"
     "Available tools:\n"
     "- send_message: Send a one-way message (status update, answer, etc.)\n"
     "- ask_approval: Show Approve/Reject buttons. Blocks until the user decides. "
     "Use before critical actions.\n"
     "- ask_selection: Show a list of options for the user to pick from. "
     "Use when you need the user to choose between multiple alternatives.\n"
     "- ask_form: Show a form with input fields. "
     "Use when you need structured info (name, email, config values, etc.).\n\n"
     "Guidelines:\n"
     "- When you have follow-up questions with fixed choices → use ask_selection.\n"
     "- When you need free-text input → use ask_form.\n"
     "- When you need a yes/no or go/no-go decision → use ask_approval.\n"
     "- For everything else (replies, explanations) → use send_message.\n"
     "- If any tool returns 'timeout', do NOT retry. Send a message that you're "
     "stopping because the user didn't respond in time.\n"
     "- Keep messages concise. Use markdown."),
    MessagesPlaceholder("chat_history"),
    ("human", "{input}"),
    MessagesPlaceholder("agent_scratchpad"),
])

agent = create_tool_calling_agent(llm, tools, prompt)
executor = AgentExecutor(agent=agent, tools=tools, verbose=True, handle_parsing_errors=True)

chat_history = []


def handle_user_message(text):
    """Process a user message through the LangChain agent."""
    print(f"\nUser: {text}")
    chat_history.append(HumanMessage(content=text))

    result = executor.invoke({"input": text, "chat_history": chat_history})
    print(f"Agent: {result['output']}\n")


# ── WebSocket connection ─────────────────────────────────────────


def main():
    sio = socketio.Client(reconnection=False)
    seen = set()

    @sio.on("connect", namespace="/ws")
    def on_connect():
        sio.emit("subscribe:channel", CHANNEL, namespace="/ws")
        print(f"Connected & subscribed to {CHANNEL}")
        print("Waiting for messages… (Ctrl+C to stop)\n")
        _post_message(text="👋 Hi! I'm an AI assistant. Send me a message!", status="success")

    @sio.on("message:created", namespace="/ws")
    def on_message(data):
        if data.get("id") in seen or data.get("senderType") != "user":
            return
        seen.add(data["id"])
        text = (data.get("text") or "").strip()
        if text:
            handle_user_message(text)

    @sio.on("review:responded", namespace="/ws")
    def on_review(data):
        msg_id = data.get("id")
        if msg_id and msg_id in _review_events:
            _review_results[msg_id] = data
            _review_events[msg_id].set()

    @sio.on("disconnect", namespace="/ws")
    def on_disconnect():
        print("Disconnected.")

    print("LangChain Chat Agent (WebSocket)")
    sio.connect(BASE_URL, namespaces=["/ws"], auth={"apiKey": API_KEY}, transports=["websocket"])

    try:
        sio.wait()
    except KeyboardInterrupt:
        print("\nShutting down.")
        _post_message(text="👋 Agent disconnected. Bye!", status="info")
        sio.disconnect()


if __name__ == "__main__":
    main()
