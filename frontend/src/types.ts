// Shared types mirroring the backend Content contract.
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

export interface CategoryRow {
  slug: string;
  name: string;
  items: Content[];
}

export interface HomePayload {
  featured: Content | null;
  categories: CategoryRow[];
}

export interface Pagination {
  total: number;
  limit: number;
  offset: number;
}
