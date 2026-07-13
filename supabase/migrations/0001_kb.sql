-- Phase 2a.2 — Knowledge base (replaces Gradient Knowledge Bases).
-- kb_documents.id is the frozen §E source id (docs/CONTRACTS.md), e.g.
-- 'dpw-182101' — Permit Copilot citations survive the migration unchanged.
--
-- Embedding model: Gradient inference `bge-m3` (verified live on this account,
-- 1024 dimensions). See scripts in backend/scripts/ingest_kb.py.

create extension if not exists vector;

create table if not exists kb_documents (
  id text primary key,          -- §E source id, e.g. 'dpw-182101'
  title text not null,
  body_md text not null,
  updated_at timestamptz default now()
);

create table if not exists kb_chunks (
  id bigint generated always as identity primary key,
  document_id text references kb_documents(id) on delete cascade,
  chunk_index int not null,
  content text not null,
  embedding vector(1024)        -- bge-m3 on Gradient inference
);

create index if not exists kb_chunks_embedding_idx
  on kb_chunks using hnsw (embedding vector_cosine_ops);
create index if not exists kb_chunks_document_idx on kb_chunks (document_id);

-- Retrieval RPC the FastAPI backend calls via PostgREST:
--   select * from match_kb_chunks(query_embedding, 6);
create or replace function match_kb_chunks(
  query_embedding vector(1024),
  match_count int default 6
)
returns table (
  document_id text,
  chunk_index int,
  content text,
  similarity float
)
language sql stable
as $$
  select
    c.document_id,
    c.chunk_index,
    c.content,
    1 - (c.embedding <=> query_embedding) as similarity
  from kb_chunks c
  where c.embedding is not null
  order by c.embedding <=> query_embedding
  limit match_count;
$$;

-- The KB is public reference material (SF permit rules); RLS on, read for all,
-- writes only via the service key (ingest script).
alter table kb_documents enable row level security;
alter table kb_chunks enable row level security;
create policy kb_documents_read on kb_documents for select using (true);
create policy kb_chunks_read on kb_chunks for select using (true);
