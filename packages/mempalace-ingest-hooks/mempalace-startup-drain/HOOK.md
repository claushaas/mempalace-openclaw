---
name: mempalace-startup-drain
description: "Drain pending MemPalace spool records when the gateway starts."
metadata:
  {
    "openclaw": {
      "emoji": "♻️",
      "events": ["gateway:startup"],
      "requires": { "bins": ["node"] }
    }
  }
---

# mempalace-startup-drain

No startup do gateway, dispara o processor embutido para drenar itens pendentes do spool local. Isso cobre retries e eventos internos de pós-ingestão sem transformar hooks em recall pré-resposta.
