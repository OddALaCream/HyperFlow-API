import os
import sys
import json
import time
from pathlib import Path

from dotenv import load_dotenv
from google import genai
from google.genai import types
from supabase import create_client

# pip install google-genai supabase python-dotenv
# Environment variables required (see .env.example):
#   GEMINI_API_KEY=...
#   SUPABASE_URL=...
#   SUPABASE_SERVICE_ROLE_KEY=...  # backend/local script only, never in frontend

# Load variables from a local .env file (if present). Real environment
# variables always take precedence over .env values.
load_dotenv(Path(__file__).parent / '.env')

# Resolve the data file relative to this script so it works from any CWD.
CHUNKS_FILE = Path(__file__).parent / 'hipermaxi_chunks_source.jsonl'
EMBED_MODEL = 'gemini-embedding-001'  # 3072 dimensions, L2-normalized
BATCH_SIZE = 50                       # contents per embedding request
MAX_RETRIES = 5
RETRY_BASE_DELAY = 2.0  # seconds; exponential backoff
BATCH_PAUSE = 1.0       # seconds between batches (free-tier rate limits)


def require_env(name):
    value = os.environ.get(name)
    if not value:
        sys.exit(
            f"Missing required environment variable: {name}\n"
            f"Set it in your shell or in a .env file (see .env.example)."
        )
    return value


def with_retries(label, fn):
    """Run fn() with exponential backoff. Re-raises the last error if all fail."""
    last_error = None
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            return fn()
        except Exception as exc:  # noqa: BLE001 - we want to retry on any transient error
            last_error = exc
            if attempt == MAX_RETRIES:
                break
            delay = RETRY_BASE_DELAY * (2 ** (attempt - 1))
            print(f"  [{label}] attempt {attempt} failed: {exc}. Retrying in {delay:.1f}s...")
            time.sleep(delay)
    raise last_error


def batched(items, n):
    for i in range(0, len(items), n):
        yield items[i:i + n]


def main():
    gemini_api_key = require_env('GEMINI_API_KEY')
    supabase_url = require_env('SUPABASE_URL')
    supabase_key = require_env('SUPABASE_SERVICE_ROLE_KEY')

    client = genai.Client(api_key=gemini_api_key)
    supabase = create_client(supabase_url, supabase_key)

    if not CHUNKS_FILE.exists():
        sys.exit(f"Chunks file not found: {CHUNKS_FILE}")

    chunks = [
        json.loads(line)
        for line in CHUNKS_FILE.read_text(encoding='utf-8').splitlines()
        if line.strip()
    ]
    total = len(chunks)
    print(f"Loaded {total} chunks from {CHUNKS_FILE.name}")

    succeeded = 0
    failed_batches = []

    for batch_num, batch in enumerate(batched(chunks, BATCH_SIZE), start=1):
        try:
            texts = [c['embedding_text'] for c in batch]

            # task_type=RETRIEVAL_DOCUMENT tells Gemini these are corpus documents
            # (the query side uses RETRIEVAL_QUERY), which improves retrieval quality.
            resp = with_retries(
                f"embed batch {batch_num}",
                lambda: client.models.embed_content(
                    model=EMBED_MODEL,
                    contents=texts,
                    config=types.EmbedContentConfig(task_type='RETRIEVAL_DOCUMENT'),
                ),
            )

            rows = []
            for c, e in zip(batch, resp.embeddings):
                rows.append({
                    'id': c['id'],
                    'document_name': c['document_name'],
                    'sop_code': c.get('sop_code'),
                    'module': c.get('module'),
                    'process_name': c['process_name'],
                    'chunk_type': c['chunk_type'],
                    'title': c['title'],
                    'content': c['content'],
                    'embedding_text': c['embedding_text'],
                    'keywords': c.get('keywords', []),
                    'questions': c.get('questions', []),
                    'metadata': c.get('metadata', {}),
                    'embedding': e.values,
                })

            with_retries(
                f"upsert batch {batch_num}",
                lambda: supabase.table('rag_chunks').upsert(rows, on_conflict='id').execute(),
            )

            succeeded += len(rows)
            print(f"Batch {batch_num}: inserted/updated {len(rows)} chunks ({succeeded}/{total})")
            time.sleep(BATCH_PAUSE)
        except Exception as exc:  # noqa: BLE001 - keep going so one bad batch doesn't abort the run
            failed_batches.append(batch_num)
            print(f"Batch {batch_num} FAILED after retries: {exc}", file=sys.stderr)

    print(f"\nDone. {succeeded}/{total} chunks loaded.")
    if failed_batches:
        print(f"Failed batches: {failed_batches}", file=sys.stderr)
        sys.exit(1)


if __name__ == '__main__':
    main()
