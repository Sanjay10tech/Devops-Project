/** Domain model for a piece of content (movie or show). */
export type ContentType = "movie" | "show";

export interface Content {
  id: string;
  title: string;
  type: ContentType;
  description: string;
  releaseYear: number;
  maturityRating: string;
  durationMinutes: number | null;
  seasons: number | null;
  genres: string[];
  categorySlug: string;
  categoryName: string;
  thumbnailUrl: string;
  backdropUrl: string;
  trailerUrl: string | null;
  rating: number;
  featured: boolean;
}

export interface Category {
  slug: string;
  name: string;
}

/** A category together with the content that belongs to it (for the home page rows). */
export interface CategoryWithContent {
  slug: string;
  name: string;
  items: Content[];
}

export interface Paginated<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}
