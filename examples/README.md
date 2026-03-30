# Placet Examples

Runnable integration examples for the Placet Agent API.

## Prerequisites

1. A running Placet instance (see [Quickstart](../docs/quickstart.mdx))
2. An agent created in **Settings → Agents**
3. An API key created in **Settings → API Keys**

## Setup

Copy the environment template and fill in your credentials:

```bash
cp .env.example .env
```

## Examples

| Directory | Description |
| --- | --- |
| `python/` | File upload, messaging, approval & download |
| `typescript/` | Same flow in TypeScript using `fetch` |
| `websocket/` | Real-time echo bot & event logger |
| `langchain/` | AI chat agent with approvals, selections & forms (WebSocket) |

## Running

```bash
# Python
cd python && pip install -r requirements.txt && python example.py

# TypeScript
cd typescript && npm install && npx tsx example.ts

# WebSocket echo bot
cd websocket && npm install && npx tsx ws_echo.ts

# LangChain agent (requires OPENAI_API_KEY)
cd langchain && pip install -r requirements.txt && python agent.py
```
