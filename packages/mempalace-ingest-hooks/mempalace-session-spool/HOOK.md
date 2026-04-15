---
name: mempalace-session-spool
description: "Persist command and compaction events into a local MemPalace spool."
metadata:
  {
    "openclaw": {
      "emoji": "🧠",
      "events": [
        "command:new",
        "command:reset",
        "command:stop",
        "session:compact:before"
      ],
      "requires": { "bins": ["node"] }
    }
  }
---

# mempalace-session-spool

Captura eventos de sessão do OpenClaw, normaliza para `HookEnvelope` canônico, escreve no spool local append-only e dispara o processor embutido sem bloquear o loop principal.
