# HyperFlow API

Backend del asistente del **Portal de Proveedores de Hipermaxi**. Es un repo
**políglota** con dos procesos que corren juntos:

| Proceso | Lenguaje | Puerto | Qué hace |
|---|---|---|---|
| **Backend** (`src/`) | Node.js | `3001` | API HTTP + asistente de texto (OpenAI) + voz en tiempo real + WebSocket de automatización de UI |
| **RAG** (`rag/`) | Python (FastAPI) | `8000` | Recuperación semántica sobre los SOPs (embeddings Gemini + Supabase/pgvector) |

El backend (Node) llama al RAG (Python) por HTTP. El asistente de texto usa
**OpenAI** para responder y el RAG **solo para recuperar** los procedimientos.

```
Frontend ──► Backend Node :3001 ──► RAG Python :8000 ──► Supabase / Gemini (embeddings)
                  │
                  └──► OpenAI (genera respuestas, voz realtime)
```

---

## Requisitos

- **Node.js 18+** (usa `fetch` nativo y ES modules)
- **Python 3.10+**
- Una cuenta de **Supabase** (con `pgvector`)
- **API keys**: OpenAI (backend) y Gemini (RAG, solo embeddings)

---

## Estructura

```
HyperFlow-API/
├── src/                     # Backend Node
│   ├── server.js            # Servidor HTTP + rutas + WebSocket
│   ├── assistant/           # Asistente de texto (OpenAI + tools ui_*)
│   ├── realtime/            # Sesión de voz OpenAI Realtime
│   ├── ws/ , uiAutomation/, mcp/   # Bridge de automatización de UI
│   └── services/            # Lógica (knowledge, validación, guía, logs)
├── rag/                     # RAG Python (FastAPI)
│   ├── rag_server.py        # API del RAG (/rag/query, /rag/retrieve)
│   ├── load_chunks_to_supabase.py
│   ├── supabase_schema.sql
│   ├── hipermaxi_chunks_source.jsonl
│   └── requirements.txt
├── package.json
└── README.md                # este archivo
```

---

## 1. Configuración de variables de entorno

### Backend Node — `./.env`

```bash
# OpenAI (asistente de texto + voz). La key vive SOLO en el backend.
OPENAI_API_KEY=sk-...
# Opcionales:
OPENAI_ASSISTANT_MODEL=gpt-4o-mini          # modelo del chat de texto
OPENAI_REALTIME_MODEL=gpt-realtime          # modelo de voz
OPENAI_REALTIME_VOICE=marin                 # voz
PORT=3001                                   # puerto del backend
RAG_RETRIEVE_URL=http://localhost:8000/rag/retrieve
RAG_URL=http://localhost:8000/rag/query
```

### RAG Python — `./rag/.env`

```bash
GEMINI_API_KEY=AIza...                       # API key de https://aistudio.google.com/apikey
SUPABASE_URL=https://TU-PROYECTO.supabase.co
SUPABASE_SERVICE_ROLE_KEY=...                # uso de backend, nunca en el frontend
# Opcional:
GEMINI_LLM_MODEL=gemini-2.5-flash
```

> Ambos `.env` están en `.gitignore` — no se suben al repo.

---

## 2. Instalación (una sola vez)

### Backend Node
```bash
cd HyperFlow-API
npm install          # el backend no tiene dependencias externas, pero deja el proyecto listo
```

### RAG Python
```bash
cd HyperFlow-API/rag
python -m venv venv
# Windows:
.\venv\Scripts\python.exe -m pip install -r requirements.txt
# macOS/Linux:
# ./venv/bin/pip install -r requirements.txt
```

### Base de datos (una sola vez)
1. En el **SQL Editor de Supabase**, ejecuta el contenido de `rag/supabase_schema.sql`
   (crea la tabla `rag_chunks`, índices y las funciones de búsqueda).
2. Carga y vectoriza los chunks:
   ```bash
   cd HyperFlow-API/rag
   .\venv\Scripts\python.exe load_chunks_to_supabase.py    # Windows
   ```

---

## 3. Cómo correr (orden correcto)

Arranca **el RAG primero**, luego el backend. Usa dos terminales:

```bash
# Terminal 1 — RAG (Python :8000)
cd HyperFlow-API/rag
.\venv\Scripts\python.exe -m uvicorn rag_server:app --port 8000      # Windows
# ./venv/bin/uvicorn rag_server:app --port 8000                       # macOS/Linux

# Terminal 2 — Backend (Node :3001)
cd HyperFlow-API
npm run dev        # equivale a: node src/server.js
```

Verifica que ambos respondan:
- RAG:     `http://localhost:8000/health`
- Backend: `POST http://localhost:3001/api/support-agent/chat`

> Si el RAG está caído, el backend **no se cae**: usa un fallback local de palabras
> clave para las respuestas (sin la potencia del RAG).

---

## Endpoints principales (backend :3001)

| Método | Ruta | Descripción |
|---|---|---|
| POST | `/api/assistant/chat` | Asistente de texto agente (OpenAI + tools `ui_*` + `search_knowledge`) |
| POST | `/api/knowledge/search` | Recupera SOPs del RAG (sin generar) |
| POST | `/api/support-agent/chat` | Chat clásico (RAG/Gemini) con redirección |
| POST | `/api/realtime/session` | Token efímero para la voz OpenAI Realtime |
| GET  | `/api/guides/registro-producto` | Guía visual paso a paso |
| POST | `/api/processes/registro-producto/validate` | Validación de formulario |
| WS   | `/ws/ui-automation` | Bridge de automatización de UI (voz) |

---

## Notas

- El **frontend** (`PortalHipermaxi-Frontend`) apunta al backend con `VITE_API_URL`
  (por defecto `http://localhost:3001`).
- La voz (`/api/realtime/session`) y el asistente de texto requieren `OPENAI_API_KEY`.
- El RAG usa Gemini **solo para embeddings** (cuota alta); la generación de texto la
  hace OpenAI en el backend.
- Plan gratuito de Gemini: la generación (`gemini-2.5-flash`) tiene 20 req/día; los
  embeddings tienen un límite mucho mayor.
