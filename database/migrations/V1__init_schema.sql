-- V1: Initial schema for the Netflix-inspired content service.
-- Migration strategy: forward-only, versioned SQL files (Vx__desc.sql), applied
-- in order and tracked in the schema_migrations table. Compatible with Flyway
-- naming; also runnable via the bundled Node migration runner for local dev.

CREATE EXTENSION IF NOT EXISTS "pgcrypto"; -- for gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS pg_trgm;     -- for trigram (ILIKE) search indexes

-- Categories = the horizontal rows on the home page (e.g. "Trending Now").
CREATE TABLE IF NOT EXISTS categories (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Genres = many-to-many tags on content (e.g. "Sci-Fi", "Drama").
CREATE TABLE IF NOT EXISTS genres (
  id    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name  TEXT NOT NULL UNIQUE
);

-- Content = movies and shows.
CREATE TABLE IF NOT EXISTS content (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title            TEXT NOT NULL,
  type             TEXT NOT NULL CHECK (type IN ('movie', 'show')),
  description      TEXT NOT NULL DEFAULT '',
  release_year     INTEGER NOT NULL CHECK (release_year BETWEEN 1900 AND 2100),
  maturity_rating  TEXT NOT NULL DEFAULT 'PG-13',
  duration_minutes INTEGER CHECK (duration_minutes IS NULL OR duration_minutes > 0),
  seasons          INTEGER CHECK (seasons IS NULL OR seasons > 0),
  category_id      UUID NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
  thumbnail_url    TEXT NOT NULL DEFAULT '',
  backdrop_url     TEXT NOT NULL DEFAULT '',
  trailer_url      TEXT,
  rating           NUMERIC(3,1) NOT NULL DEFAULT 0 CHECK (rating BETWEEN 0 AND 10),
  featured         BOOLEAN NOT NULL DEFAULT false,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Join table for content <-> genres.
CREATE TABLE IF NOT EXISTS content_genres (
  content_id UUID NOT NULL REFERENCES content(id) ON DELETE CASCADE,
  genre_id   UUID NOT NULL REFERENCES genres(id) ON DELETE CASCADE,
  PRIMARY KEY (content_id, genre_id)
);

-- Indexes to support the common queries (filter by category/type, search, sort).
CREATE INDEX IF NOT EXISTS idx_content_category ON content(category_id);
CREATE INDEX IF NOT EXISTS idx_content_type ON content(type);
CREATE INDEX IF NOT EXISTS idx_content_featured ON content(featured) WHERE featured = true;
CREATE INDEX IF NOT EXISTS idx_content_title_trgm ON content USING gin (title gin_trgm_ops);
