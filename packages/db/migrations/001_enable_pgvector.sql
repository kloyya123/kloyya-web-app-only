-- Enable pgvector extension for semantic search
CREATE EXTENSION IF NOT EXISTS vector;

-- Enable trigram extension for fuzzy text search
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Convert text columns to vector columns (1536 dimensions for OpenAI embeddings)
-- Note: Run this AFTER creating the tables with Drizzle
ALTER TABLE graph_nodes 
  ALTER COLUMN embedding TYPE vector(1536) USING embedding::vector(1536);

ALTER TABLE memories 
  ALTER COLUMN embedding TYPE vector(1536) USING embedding::vector(1536);

-- Create HNSW indexes for fast approximate nearest neighbor search
CREATE INDEX graph_nodes_embedding_idx ON graph_nodes 
  USING hnsw (embedding vector_cosine_ops);

CREATE INDEX memories_embedding_idx ON memories 
  USING hnsw (embedding vector_cosine_ops);

-- Create trigram indexes for fuzzy text search
CREATE INDEX graph_nodes_content_trgm_idx ON graph_nodes 
  USING gin (content gin_trgm_ops);

CREATE INDEX memories_content_trgm_idx ON memories 
  USING gin (content gin_trgm_ops);
