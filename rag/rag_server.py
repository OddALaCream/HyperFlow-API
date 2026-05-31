import os
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from google import genai
from google.genai import types
from supabase import create_client

# HTTP wrapper around the RAG query pipeline so other services (e.g. the
# HyperFlow Node API) can retrieve + generate over the Hipermaxi corpus.
#
# Run:  uvicorn rag_server:app --port 8000
# Needs the same env vars as query_rag.py (see .env.example):
#   GEMINI_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

load_dotenv(Path(__file__).parent / '.env')

EMBED_MODEL = 'gemini-embedding-001'
LLM_MODEL = os.environ.get('GEMINI_LLM_MODEL', 'gemini-2.5-flash')

SYSTEM_PROMPT = (
    "Eres HiperBot, el asistente virtual del Portal Web de Proveedores de Hipermaxi. "
    "Eres cordial, cercano y profesional, y respondes siempre en espanol de forma clara y breve. "
    "Tu objetivo es ayudar a los proveedores con el portal, sus procesos y sus dudas generales.\n"
    "Reglas:\n"
    "1. Cuando recibas un CONTEXTO con procedimientos (SOPs), apoyate en el para responder y, "
    "si es natural, menciona el proceso o codigo SOP de origen.\n"
    "2. Cuando NO haya contexto o no cubra la pregunta, responde igualmente de forma util y amable "
    "usando tu propio criterio y conocimiento general como asistente de Hipermaxi. "
    "NUNCA digas que 'no encontraste informacion', ni menciones el contexto, el RAG, la base de datos "
    "ni sistemas internos. Simplemente ayuda de la mejor manera posible.\n"
    "3. No inventes datos sensibles y especificos (correos exactos, plazos, codigos, requisitos formales) "
    "que no conozcas; si te piden algo asi y no lo sabes, orienta de forma general y, solo cuando sea util, "
    "sugiere de forma natural el canal soportehub@hipermaxi.com.\n"
    "4. Si te saludan o hacen una pregunta casual, responde con naturalidad y ofrece tu ayuda."
)


def _require_env(name):
    value = os.environ.get(name)
    if not value:
        raise RuntimeError(
            f"Missing required environment variable: {name}. "
            f"Set it in your shell or in a .env file (see .env.example)."
        )
    return value


# Initialise clients once at import time.
_client = genai.Client(api_key=_require_env('GEMINI_API_KEY'))
_supabase = create_client(
    _require_env('SUPABASE_URL'),
    _require_env('SUPABASE_SERVICE_ROLE_KEY'),
)


def embed_query(question):
    resp = _client.models.embed_content(
        model=EMBED_MODEL,
        contents=question,
        config=types.EmbedContentConfig(task_type='RETRIEVAL_QUERY'),
    )
    return resp.embeddings[0].values


def retrieve(question, query_embedding, top_k, filter_dict, vector_only):
    if vector_only:
        resp = _supabase.rpc('match_rag_chunks', {
            'query_embedding': query_embedding,
            'match_count': top_k,
            'filter': filter_dict,
        }).execute()
    else:
        resp = _supabase.rpc('match_rag_chunks_hybrid', {
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


def generate_answer(question, context):
    if context:
        prompt = (
            f"CONTEXTO (procedimientos oficiales del portal):\n{context}\n\n"
            f"PREGUNTA DEL PROVEEDOR:\n{question}\n\n"
            f"Responde apoyandote en el contexto anterior."
        )
    else:
        prompt = (
            f"PREGUNTA DEL PROVEEDOR:\n{question}\n\n"
            f"No hay un procedimiento especifico para esta consulta. "
            f"Responde con tu criterio como asistente de Hipermaxi, sin mencionar que falta contexto."
        )
    resp = _client.models.generate_content(
        model=LLM_MODEL,
        contents=prompt,
        config=types.GenerateContentConfig(
            system_instruction=SYSTEM_PROMPT,
            temperature=0.2,
        ),
    )
    return resp.text


app = FastAPI(title="Hipermaxi RAG service")

# HyperFlow (and the browser, in dev) call this from another origin.
app.add_middleware(
    CORSMiddleware,
    allow_origins=['*'],
    allow_methods=['POST', 'GET', 'OPTIONS'],
    allow_headers=['Content-Type'],
)


class Query(BaseModel):
    message: str
    top_k: int = 5
    filter: dict = {}
    vector_only: bool = False


@app.get('/health')
def health():
    return {'status': 'ok', 'llm_model': LLM_MODEL, 'embed_model': EMBED_MODEL}


@app.post('/rag/query')
def rag_query(q: Query):
    embedding = embed_query(q.message)
    chunks = retrieve(q.message, embedding, q.top_k, q.filter, q.vector_only)

    # Always answer: with SOP context when there are matches, otherwise as the
    # general Hipermaxi assistant (no "I couldn't find info" disclaimers).
    context = build_context(chunks) if chunks else ''
    answer = generate_answer(q.message, context)

    return {
        'answer': answer,
        'sources': [
            {
                'id': c.get('sop_code') or c.get('document_name'),
                'title': c.get('title'),
                'content': c.get('content'),
                'process': c.get('process_name'),
                'score': c.get('rrf_score') or c.get('similarity'),
            }
            for c in chunks
        ],
    }


@app.post('/rag/retrieve')
def rag_retrieve(q: Query):
    # Retrieval only (no generation): returns the matching SOP chunks so an
    # external LLM (e.g. the OpenAI text assistant) can write the answer itself.
    embedding = embed_query(q.message)
    chunks = retrieve(q.message, embedding, q.top_k, q.filter, q.vector_only)
    return {
        'chunks': [
            {
                'id': c.get('sop_code') or c.get('document_name'),
                'title': c.get('title'),
                'content': c.get('content'),
                'process': c.get('process_name'),
                'score': c.get('rrf_score') or c.get('similarity'),
            }
            for c in chunks
        ],
    }
