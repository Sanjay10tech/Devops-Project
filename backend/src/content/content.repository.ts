import { Pool } from "pg";
import { Category, Content, ContentType } from "./content.types";

interface ContentRow {
  id: string;
  title: string;
  type: ContentType;
  description: string;
  release_year: number;
  maturity_rating: string;
  duration_minutes: number | null;
  seasons: number | null;
  genres: string[] | null;
  category_slug: string;
  category_name: string;
  thumbnail_url: string;
  backdrop_url: string;
  trailer_url: string | null;
  rating: string; // numeric comes back as string from pg
  featured: boolean;
}

function mapRow(row: ContentRow): Content {
  return {
    id: row.id,
    title: row.title,
    type: row.type,
    description: row.description,
    releaseYear: row.release_year,
    maturityRating: row.maturity_rating,
    durationMinutes: row.duration_minutes,
    seasons: row.seasons,
    genres: row.genres ?? [],
    categorySlug: row.category_slug,
    categoryName: row.category_name,
    thumbnailUrl: row.thumbnail_url,
    backdropUrl: row.backdrop_url,
    trailerUrl: row.trailer_url,
    rating: Number(row.rating),
    featured: row.featured,
  };
}

const BASE_SELECT = `
  SELECT
    c.id, c.title, c.type, c.description, c.release_year,
    c.maturity_rating, c.duration_minutes, c.seasons,
    c.thumbnail_url, c.backdrop_url, c.trailer_url, c.rating, c.featured,
    cat.slug AS category_slug, cat.name AS category_name,
    COALESCE(
      ARRAY(
        SELECT g.name FROM genres g
        JOIN content_genres cg ON cg.genre_id = g.id
        WHERE cg.content_id = c.id
        ORDER BY g.name
      ), '{}'
    ) AS genres
  FROM content c
  JOIN categories cat ON cat.id = c.category_id
`;

export interface ListParams {
  category?: string;
  type?: ContentType;
  limit: number;
  offset: number;
}

export class ContentRepository {
  constructor(private readonly pool: Pool) {}

  async list(params: ListParams): Promise<{ items: Content[]; total: number }> {
    const conditions: string[] = [];
    const values: unknown[] = [];

    if (params.category) {
      values.push(params.category);
      conditions.push(`cat.slug = $${values.length}`);
    }
    if (params.type) {
      values.push(params.type);
      conditions.push(`c.type = $${values.length}`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

    const countResult = await this.pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM content c JOIN categories cat ON cat.id = c.category_id ${where}`,
      values
    );
    const total = Number(countResult.rows[0]?.count ?? 0);

    const limitIdx = values.length + 1;
    const offsetIdx = values.length + 2;
    const rows = await this.pool.query<ContentRow>(
      `${BASE_SELECT} ${where} ORDER BY c.rating DESC, c.title ASC LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
      [...values, params.limit, params.offset]
    );

    return { items: rows.rows.map(mapRow), total };
  }

  async findById(id: string): Promise<Content | null> {
    const result = await this.pool.query<ContentRow>(
      `${BASE_SELECT} WHERE c.id = $1`,
      [id]
    );
    const row = result.rows[0];
    return row ? mapRow(row) : null;
  }

  async search(
    q: string,
    limit: number,
    offset: number
  ): Promise<{ items: Content[]; total: number }> {
    const pattern = `%${q}%`;

    const countResult = await this.pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count
       FROM content c
       WHERE c.title ILIKE $1 OR c.description ILIKE $1`,
      [pattern]
    );
    const total = Number(countResult.rows[0]?.count ?? 0);

    const rows = await this.pool.query<ContentRow>(
      `${BASE_SELECT}
       WHERE c.title ILIKE $1 OR c.description ILIKE $1
       ORDER BY c.rating DESC, c.title ASC
       LIMIT $2 OFFSET $3`,
      [pattern, limit, offset]
    );

    return { items: rows.rows.map(mapRow), total };
  }

  async listCategoriesWithContent(itemsPerCategory: number): Promise<
    { category: Category; items: Content[] }[]
  > {
    const cats = await this.pool.query<{ slug: string; name: string }>(
      `SELECT slug, name FROM categories ORDER BY sort_order ASC, name ASC`
    );

    const result: { category: Category; items: Content[] }[] = [];
    for (const cat of cats.rows) {
      const rows = await this.pool.query<ContentRow>(
        `${BASE_SELECT} WHERE cat.slug = $1 ORDER BY c.rating DESC, c.title ASC LIMIT $2`,
        [cat.slug, itemsPerCategory]
      );
      result.push({
        category: { slug: cat.slug, name: cat.name },
        items: rows.rows.map(mapRow),
      });
    }
    return result;
  }

  async findFeatured(): Promise<Content | null> {
    const result = await this.pool.query<ContentRow>(
      `${BASE_SELECT} WHERE c.featured = true ORDER BY c.rating DESC LIMIT 1`
    );
    const row = result.rows[0];
    return row ? mapRow(row) : null;
  }
}
