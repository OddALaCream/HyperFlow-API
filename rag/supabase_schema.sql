-- Supabase RAG schema for Hipermaxi supplier assistant
-- Embeddings: Gemini `gemini-embedding-001` (3072 dims, L2-normalized).
--
-- If you previously created this table with vector(1536) (OpenAI), the dimension
-- cannot be changed in place. Drop and recreate, then re-embed:
--   drop table if exists public.rag_chunks cascade;
-- and re-run this whole file.

create extension if not exists vector;

create table if not exists public.rag_chunks (
  id text primary key,
  document_name text not null,
  sop_code text,
  module text,
  process_name text not null,
  chunk_type text not null,
  title text not null,
  content text not null,
  embedding_text text,
  keywords text[] default '{}',
  questions text[] default '{}',
  metadata jsonb default '{}',
  embedding vector(3072),
  -- Full-text search vector (Spanish) over the searchable fields.
  -- Populated by a trigger (see below). A GENERATED column can't be used here
  -- because to_tsvector(regconfig, ...) is not considered IMMUTABLE in Supabase,
  -- which raises: "generation expression is not immutable".
  fts tsvector,
  created_at timestamptz default now()
);

-- Keep `fts` in sync on every insert/update via a trigger.
create or replace function public.rag_chunks_fts_update()
returns trigger
language plpgsql
as $$
begin
  new.fts := to_tsvector(
    'spanish',
    coalesce(new.title, '') || ' ' ||
    coalesce(new.content, '') || ' ' ||
    coalesce(array_to_string(new.keywords, ' '), '') || ' ' ||
    coalesce(array_to_string(new.questions, ' '), '')
  );
  return new;
end;
$$;

drop trigger if exists rag_chunks_fts_trigger on public.rag_chunks;
create trigger rag_chunks_fts_trigger
before insert or update of title, content, keywords, questions
on public.rag_chunks
for each row execute function public.rag_chunks_fts_update();

-- Backfill `fts` for any rows that already exist (no-op on an empty table).
update public.rag_chunks set fts = to_tsvector(
  'spanish',
  coalesce(title, '') || ' ' ||
  coalesce(content, '') || ' ' ||
  coalesce(array_to_string(keywords, ' '), '') || ' ' ||
  coalesce(array_to_string(questions, ' '), '')
);

-- NOTE: no ivfflat/hnsw index on the embedding column on purpose.
-- With this dataset size (~92 rows) a sequential scan is instant and gives
-- exact (recall = 1.0) cosine search. (Also, pgvector cannot build ivfflat/hnsw
-- indexes on vectors with more than 2000 dimensions, and these have 3072.)

create index if not exists rag_chunks_metadata_idx on public.rag_chunks using gin (metadata);
create index if not exists rag_chunks_keywords_idx on public.rag_chunks using gin (keywords);
create index if not exists rag_chunks_fts_idx on public.rag_chunks using gin (fts);

-- Drop first: changing the vector dimension changes the argument type, so a plain
-- CREATE OR REPLACE would create a second overload instead of replacing.
drop function if exists public.match_rag_chunks(vector, int, jsonb);
drop function if exists public.match_rag_chunks_hybrid(text, vector, int, jsonb, int, float, float);

-- Pure vector (semantic) search. Kept for cases where you only have an embedding.
create or replace function public.match_rag_chunks(
  query_embedding vector(3072),
  match_count int default 5,
  filter jsonb default '{}'
)
returns table (
  id text,
  document_name text,
  sop_code text,
  module text,
  process_name text,
  chunk_type text,
  title text,
  content text,
  keywords text[],
  questions text[],
  metadata jsonb,
  similarity float
)
language plpgsql
as $$
begin
  return query
  select
    rc.id, rc.document_name, rc.sop_code, rc.module, rc.process_name, rc.chunk_type,
    rc.title, rc.content, rc.keywords, rc.questions, rc.metadata,
    1 - (rc.embedding <=> query_embedding) as similarity
  from public.rag_chunks rc
  where rc.embedding is not null
    and rc.metadata @> filter
  order by rc.embedding <=> query_embedding
  limit match_count;
end;
$$;

-- Hybrid search: combines full-text (BM25-like) and semantic (vector) ranking
-- using Reciprocal Rank Fusion (RRF). RRF is robust because it fuses the two
-- rankings by position instead of mixing scores on different scales.
create or replace function public.match_rag_chunks_hybrid(
  query_text text,
  query_embedding vector(3072),
  match_count int default 5,
  filter jsonb default '{}',
  rrf_k int default 50,
  full_text_weight float default 1.0,
  semantic_weight float default 1.0
)
returns table (
  id text,
  document_name text,
  sop_code text,
  module text,
  process_name text,
  chunk_type text,
  title text,
  content text,
  keywords text[],
  questions text[],
  metadata jsonb,
  similarity float,
  rrf_score float
)
language sql
as $$
with full_text as (
  select
    rc.id,
    row_number() over (
      order by ts_rank_cd(rc.fts, websearch_to_tsquery('spanish', query_text)) desc
    ) as rank_ix
  from public.rag_chunks rc
  where rc.metadata @> filter
    and rc.fts @@ websearch_to_tsquery('spanish', query_text)
  order by rank_ix
  limit greatest(match_count * 4, 20)
),
semantic as (
  select
    rc.id,
    row_number() over (order by rc.embedding <=> query_embedding) as rank_ix
  from public.rag_chunks rc
  where rc.embedding is not null
    and rc.metadata @> filter
  order by rank_ix
  limit greatest(match_count * 4, 20)
),
fused as (
  select
    coalesce(full_text.id, semantic.id) as id,
    coalesce(1.0 / (rrf_k + full_text.rank_ix), 0.0) * full_text_weight +
    coalesce(1.0 / (rrf_k + semantic.rank_ix), 0.0) * semantic_weight as rrf_score
  from full_text
  full outer join semantic on full_text.id = semantic.id
)
select
  rc.id, rc.document_name, rc.sop_code, rc.module, rc.process_name, rc.chunk_type,
  rc.title, rc.content, rc.keywords, rc.questions, rc.metadata,
  1 - (rc.embedding <=> query_embedding) as similarity,
  fused.rrf_score
from fused
join public.rag_chunks rc on rc.id = fused.id
order by fused.rrf_score desc
limit match_count;
$$;
