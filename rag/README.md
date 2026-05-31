# Hipermaxi RAG para Supabase (Gemini)

Pipeline RAG completo (ingesta + consulta) con **Gemini** para embeddings y generación, y **Supabase/pgvector** como almacén.

Archivos:

- `hipermaxi_chunks_source.jsonl`: chunks semánticos listos para generar embeddings.
- `supabase_schema.sql`: tabla `rag_chunks`, índices, búsqueda full-text en español y funciones `match_rag_chunks` (vectorial) y `match_rag_chunks_hybrid` (híbrida) para pgvector.
- `load_chunks_to_supabase.py`: genera embeddings con Gemini y sube los chunks a Supabase.
- `query_rag.py`: lado de consulta — recupera chunks (híbrido) y responde con Gemini.
- `.env.example`: plantilla de variables de entorno.
- `requirements.txt`: dependencias.

## Modelos

- Embeddings: `gemini-embedding-001` (**3072 dimensiones**, L2-normalizadas → coseno).
- Generación: `gemini-2.5-flash` (configurable con `GEMINI_LLM_MODEL`).

## Orden de uso

1. En Supabase SQL Editor, ejecuta `supabase_schema.sql`.
2. Instala dependencias:

```bash
pip install -r requirements.txt
```

3. Configura las variables de entorno. Copia `.env.example` a `.env` y rellena tus valores:

```bash
cp .env.example .env   # luego edita .env
```

Los scripts cargan `.env` automáticamente. Las variables reales del entorno tienen prioridad sobre `.env`.

4. Carga los chunks (genera embeddings y los sube):

```bash
python load_chunks_to_supabase.py
```

5. Consulta:

```bash
python query_rag.py "Soy proveedor nuevo, ¿cómo solicito credenciales?"
python query_rag.py "¿A qué correo escribo?" --filter '{"module":"Accesos"}' --show-sources
python query_rag.py "..." --vector-only --top-k 8
```

## Búsqueda híbrida

`match_rag_chunks_hybrid` combina búsqueda full-text (español) y vectorial mediante
Reciprocal Rank Fusion (RRF). Recibe el texto de la consulta y su embedding, y permite
ajustar `full_text_weight` / `semantic_weight`. Ideal para consultas con jerga y nombres
propios (NIT, "Encargado HUB", correos, etc.) donde la búsqueda solo vectorial falla.

`match_rag_chunks` (solo vectorial) se mantiene para cuando únicamente tienes un embedding
(usa `--vector-only` en `query_rag.py`).

## Notas

- La dimensión del vector es **3072** (Gemini). Si vienes de un schema con `vector(1536)`
  (OpenAI), debes `drop table public.rag_chunks cascade;`, re-ejecutar `supabase_schema.sql`
  y re-embeber, porque los vectores de distintos modelos no son compatibles.
- No se crea índice ivfflat/hnsw sobre `embedding` a propósito: con ~92 filas el scan
  secuencial es instantáneo y da recall exacto. (Además pgvector no indexa vectores de
  más de 2000 dimensiones, y estos tienen 3072.)
- La ingesta es reanudable: usa `upsert` por `id`, reintenta con backoff exponencial y
  un batch fallido no aborta el resto (los batches con error se reportan al final).
- El embedding de documentos usa `task_type=RETRIEVAL_DOCUMENT` y el de consultas
  `RETRIEVAL_QUERY`, como recomienda Gemini para retrieval.

Total chunks generados: 92
