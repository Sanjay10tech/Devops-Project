-- Development seed data. Idempotent: safe to run repeatedly.
-- Sample content uses generic placeholder titles/images (no real proprietary data).

-- Categories -----------------------------------------------------------------
INSERT INTO categories (slug, name, sort_order) VALUES
  ('trending',   'Trending Now',        1),
  ('originals',  'Netflix-style Originals', 2),
  ('action',     'Action & Adventure',  3),
  ('comedy',     'Comedies',            4),
  ('scifi',      'Sci-Fi & Fantasy',    5)
ON CONFLICT (slug) DO NOTHING;

-- Genres ---------------------------------------------------------------------
INSERT INTO genres (name) VALUES
  ('Action'), ('Adventure'), ('Comedy'), ('Drama'),
  ('Sci-Fi'), ('Fantasy'), ('Thriller'), ('Documentary')
ON CONFLICT (name) DO NOTHING;

-- Content --------------------------------------------------------------------
-- Insert only if the title does not already exist (keeps seed idempotent).
INSERT INTO content
  (title, type, description, release_year, maturity_rating, duration_minutes, seasons, category_id, thumbnail_url, backdrop_url, trailer_url, rating, featured)
SELECT v.title, v.type, v.description, v.release_year, v.maturity_rating,
       v.duration_minutes, v.seasons,
       (SELECT id FROM categories WHERE slug = v.category_slug),
       v.thumbnail_url, v.backdrop_url, v.trailer_url, v.rating, v.featured
FROM (VALUES
  ('Neon Horizon',        'movie', 'A rogue pilot races across a dying galaxy to deliver the last seed of humanity.', 2023, 'PG-13', 128, NULL, 'scifi',    'https://picsum.photos/seed/neon/300/450',   'https://picsum.photos/seed/neon/1280/720',   NULL, 8.6, true),
  ('The Quiet Streets',   'show',  'Detectives unravel a conspiracy hidden beneath a peaceful coastal town.',          2022, 'TV-MA', NULL, 3,    'trending', 'https://picsum.photos/seed/quiet/300/450',  'https://picsum.photos/seed/quiet/1280/720',  NULL, 8.1, false),
  ('Laugh Track',         'show',  'A washed-up comedian mentors a group of misfit stand-ups.',                         2021, 'TV-14', NULL, 2,    'comedy',   'https://picsum.photos/seed/laugh/300/450',  'https://picsum.photos/seed/laugh/1280/720',  NULL, 7.4, false),
  ('Ironclad',            'movie', 'A retired soldier is pulled back for one last impossible mission.',                 2024, 'R',     141,  NULL, 'action',   'https://picsum.photos/seed/iron/300/450',   'https://picsum.photos/seed/iron/1280/720',   NULL, 7.9, false),
  ('Dreamweavers',        'show',  'Teenagers discover they can enter and reshape each other''s dreams.',               2023, 'TV-14', NULL, 1,    'scifi',    'https://picsum.photos/seed/dream/300/450',  'https://picsum.photos/seed/dream/1280/720',  NULL, 8.3, false),
  ('The Last Recipe',     'movie', 'A grieving chef travels the world to recreate her grandmother''s lost dish.',       2022, 'PG',    112,  NULL, 'trending', 'https://picsum.photos/seed/recipe/300/450', 'https://picsum.photos/seed/recipe/1280/720', NULL, 7.7, false),
  ('Origin Protocol',     'show',  'An AI awakens and must decide the fate of the company that built it.',              2024, 'TV-MA', NULL, 1,    'originals','https://picsum.photos/seed/origin/300/450', 'https://picsum.photos/seed/origin/1280/720', NULL, 8.9, false),
  ('Crown of Ash',        'show',  'Rival heirs battle for a throne as an ancient magic returns.',                      2021, 'TV-MA', NULL, 4,    'originals','https://picsum.photos/seed/crown/300/450',  'https://picsum.photos/seed/crown/1280/720',  NULL, 8.5, false),
  ('Midnight Comedy Club','movie', 'One chaotic night at a comedy club changes five strangers'' lives.',                2020, 'R',     98,   NULL, 'comedy',   'https://picsum.photos/seed/mcc/300/450',    'https://picsum.photos/seed/mcc/1280/720',    NULL, 6.9, false),
  ('Velocity',            'movie', 'A street racer is recruited by an elite covert driving unit.',                      2023, 'PG-13', 119,  NULL, 'action',   'https://picsum.photos/seed/velo/300/450',   'https://picsum.photos/seed/velo/1280/720',   NULL, 7.2, false)
) AS v(title, type, description, release_year, maturity_rating, duration_minutes, seasons, category_slug, thumbnail_url, backdrop_url, trailer_url, rating, featured)
WHERE NOT EXISTS (SELECT 1 FROM content c WHERE c.title = v.title);

-- Attach a couple of genres to each seeded title (idempotent).
INSERT INTO content_genres (content_id, genre_id)
SELECT c.id, g.id FROM content c, genres g
WHERE (c.title = 'Neon Horizon'        AND g.name IN ('Sci-Fi', 'Adventure'))
   OR (c.title = 'The Quiet Streets'   AND g.name IN ('Drama', 'Thriller'))
   OR (c.title = 'Laugh Track'         AND g.name IN ('Comedy'))
   OR (c.title = 'Ironclad'            AND g.name IN ('Action', 'Thriller'))
   OR (c.title = 'Dreamweavers'        AND g.name IN ('Sci-Fi', 'Fantasy'))
   OR (c.title = 'The Last Recipe'     AND g.name IN ('Drama'))
   OR (c.title = 'Origin Protocol'     AND g.name IN ('Sci-Fi', 'Thriller'))
   OR (c.title = 'Crown of Ash'        AND g.name IN ('Fantasy', 'Drama'))
   OR (c.title = 'Midnight Comedy Club' AND g.name IN ('Comedy', 'Drama'))
   OR (c.title = 'Velocity'            AND g.name IN ('Action', 'Adventure'))
ON CONFLICT DO NOTHING;
