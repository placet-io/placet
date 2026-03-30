# LangChain Agent Example

AI chat agent powered by GPT that communicates through Placet via WebSocket.
Supports interactive reviews: approval buttons, selection lists, and custom forms.

## Setup

```bash
pip install -r requirements.txt
cp ../.env.example ../.env   # if not already done
```

Set `OPENAI_API_KEY` in `../.env`.

## Run

```bash
python agent.py
```

The agent connects via WebSocket, sends a greeting, and waits for messages.
Chat with it through the Placet UI — it uses GPT to respond and can ask
approval questions, selection lists, or forms when needed.
