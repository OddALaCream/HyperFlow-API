import os
import sys
import json
import argparse
from pathlib import Path

from dotenv import load_dotenv
from google import genai
from google.genai import types
from supabase import create_client

# pip install google-genai supabase python-dotenv
# Environment variables required (see .env.example):
#   GEMINI_API_KEY=...
#   SUPABASE_URL=...
#   SUPABASE_SERVICE_ROLE_KEY=...  (an anon key also works for read-only queries)

load_dotenv(Path(__file__).parent / '.env')

EMBED_MODEL = 'gemini-embedding-001'
LLM_MODEL = os.environ.get('GEMINI_LLM_MODEL', 'gemini-2.5-flash')

SYSTEM_PROMPT = (
    "Eres el asistente del Portal Web de Proveedores de Hipermaxi. "
    "Respondes en español, de forma clara, breve y profesional. "
    "Usa ÚNICAMENTE la información del CONTEXTO proporcionado; no inventes datos, "
    "correos, plazos ni procedimientos. Si el contexto no contiene la respuesta, "
    "dilo explícitamente y sugiere escribir a soportehub@hipermaxi.com. "
    "Cuando menciones un proceso, cita el documento o código SOP de origen."
)


def require_env(name):
    value = os.environ.get(name)
    if not value:
        sys.exit(
            f"Missing required environment variable: {name}\n"
            f"Set it in your shell or in a .env file (see .env.example)."
        )
    return value


def embed_query(client, question):
    # task_type=RETRIEVAL_QUERY is the query-side counterpart to the
    # RETRIEVAL_DOCUMENT used when ingesting the chunks.
    resp = client.models.embed_content(
        model=EMBED_MODEL,
        contents=question,
        config=types.EmbedContentConfig(task_type='RETRIEVAL_QUERY'),
    )
    return resp.embeddings[0].values


def retrieve(supabase, question, query_embedding, top_k, filter_dict, vector_only):
    if vector_only:
        resp = supabase.rpc('match_rag_chunks', {
            'query_embedding': query_embedding,
            'match_count': top_k,
            'filter': filter_dict,
        }).execute()
    else:
        resp = supabase.rpc('match_rag_chunks_hybrid', {
            'query_text': question,
            'query_embedding': query_embedding,
            'match_count': top_k,
            'filter': filter_dict,
        }).execute()
    return resp.data or []


def build_context(chunks):
    blocks = []
    for i, c in enumerate(chunks, start=1):
        source = c.get('sop_code') or c.get('document_name') or 'desconocido'
        blocks.append(
            f"[Fuente {i} | {source} | {c.get('process_name', '')}]\n"
            f"{c.get('title', '')}\n{c.get('content', '')}"
        )
    return "\n\n".join(blocks)


def main():
    parser = argparse.ArgumentParser(description="Consulta RAG del portal de proveedores Hipermaxi (Gemini).")
    parser.add_argument('question', help="Pregunta del usuario")
    parser.add_argument('--top-k', type=int, default=5, help="Cantidad de chunks a recuperar (default 5)")
    parser.add_argument('--filter', default='{}', help="Filtro de metadata como JSON, ej '{\"module\":\"Accesos\"}'")
    parser.add_argument('--vector-only', action='store_true', help="Usar solo búsqueda vectorial (sin híbrida)")
    parser.add_argument('--show-sources', action='store_true', help="Imprimir los chunks recuperados")
    args = parser.parse_args()

    try:
        filter_dict = json.loads(args.filter)
    except json.JSONDecodeError as exc:
        sys.exit(f"--filter no es JSON válido: {exc}")

    gemini_api_key = require_env('GEMINI_API_KEY')
    supabase_url = require_env('SUPABASE_URL')
    supabase_key = require_env('SUPABASE_SERVICE_ROLE_KEY')

    client = genai.Client(api_key=gemini_api_key)
    supabase = create_client(supabase_url, supabase_key)

    query_embedding = embed_query(client, args.question)
    chunks = retrieve(
        supabase, args.question, query_embedding,
        args.top_k, filter_dict, args.vector_only,
    )

    if not chunks:
        print("No se encontraron chunks relevantes. "
              "Para más ayuda escribe a soportehub@hipermaxi.com.")
        return

    if args.show_sources:
        print("=== Chunks recuperados ===")
        for i, c in enumerate(chunks, start=1):
            score = c.get('rrf_score', c.get('similarity'))
            print(f"  {i}. [{c.get('sop_code') or c.get('document_name')}] "
                  f"{c.get('title')}  (score={score})")
        print()

    context = build_context(chunks)
    prompt = (
        f"CONTEXTO:\n{context}\n\n"
        f"PREGUNTA DEL PROVEEDOR:\n{args.question}\n\n"
        f"Responde usando solo el contexto anterior."
    )

    resp = client.models.generate_content(
        model=LLM_MODEL,
        contents=prompt,
        config=types.GenerateContentConfig(
            system_instruction=SYSTEM_PROMPT,
            temperature=0.2,
        ),
    )

    print("=== Respuesta ===")
    print(resp.text)


if __name__ == '__main__':
    main()
