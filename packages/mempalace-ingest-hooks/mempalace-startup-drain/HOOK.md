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

No startup do gateway, registra evidência explícita de que o hook pack está carregado, mas não executa ingestão. A partir da Etapa 6, o spool é drenado exclusivamente pelo `sync-daemon`.
