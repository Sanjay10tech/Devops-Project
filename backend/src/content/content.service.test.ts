import { describe, it, expect, vi, beforeEach } from "vitest";
import { ContentService } from "./content.service";
import { ContentRepository } from "./content.repository";
import { AppError } from "../errors/AppError";
import { Content } from "./content.types";

function makeContent(overrides: Partial<Content> = {}): Content {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    title: "Neon Horizon",
    type: "movie",
    description: "desc",
    releaseYear: 2023,
    maturityRating: "PG-13",
    durationMinutes: 128,
    seasons: null,
    genres: ["Sci-Fi"],
    categorySlug: "scifi",
    categoryName: "Sci-Fi & Fantasy",
    thumbnailUrl: "t",
    backdropUrl: "b",
    trailerUrl: null,
    rating: 8.6,
    featured: true,
    ...overrides,
  };
}

// A typed mock of the repository.
function makeRepo(): ContentRepository {
  return {
    list: vi.fn(),
    findById: vi.fn(),
    search: vi.fn(),
    listCategoriesWithContent: vi.fn(),
    findFeatured: vi.fn(),
  } as unknown as ContentRepository;
}

describe("ContentService", () => {
  let repo: ContentRepository;
  let service: ContentService;

  beforeEach(() => {
    repo = makeRepo();
    service = new ContentService(repo);
  });

  describe("listContent", () => {
    it("returns paginated items with echoed limit/offset", async () => {
      const item = makeContent();
      (repo.list as any).mockResolvedValue({ items: [item], total: 1 });

      const result = await service.listContent({ limit: 20, offset: 0 });

      expect(result).toEqual({
        items: [item],
        total: 1,
        limit: 20,
        offset: 0,
      });
      expect(repo.list).toHaveBeenCalledWith({
        category: undefined,
        type: undefined,
        limit: 20,
        offset: 0,
      });
    });

    it("passes category and type filters through to the repository", async () => {
      (repo.list as any).mockResolvedValue({ items: [], total: 0 });

      await service.listContent({
        category: "action",
        type: "movie",
        limit: 10,
        offset: 5,
      });

      expect(repo.list).toHaveBeenCalledWith({
        category: "action",
        type: "movie",
        limit: 10,
        offset: 5,
      });
    });
  });

  describe("getContentById", () => {
    it("returns the content when found", async () => {
      const item = makeContent();
      (repo.findById as any).mockResolvedValue(item);

      await expect(service.getContentById(item.id)).resolves.toEqual(item);
    });

    it("throws a 404 AppError when not found", async () => {
      (repo.findById as any).mockResolvedValue(null);

      await expect(service.getContentById("missing")).rejects.toBeInstanceOf(
        AppError
      );
      await expect(
        service.getContentById("missing")
      ).rejects.toMatchObject({ statusCode: 404, code: "NOT_FOUND" });
    });
  });

  describe("search", () => {
    it("returns matches with pagination metadata", async () => {
      const item = makeContent({ title: "Neon Horizon" });
      (repo.search as any).mockResolvedValue({ items: [item], total: 1 });

      const result = await service.search({ q: "neon", limit: 20, offset: 0 });

      expect(result.items).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(repo.search).toHaveBeenCalledWith("neon", 20, 0);
    });
  });

  describe("getHomeCategories", () => {
    it("filters out categories that have no content", async () => {
      (repo.listCategoriesWithContent as any).mockResolvedValue([
        { category: { slug: "a", name: "A" }, items: [makeContent()] },
        { category: { slug: "b", name: "B" }, items: [] },
      ]);

      const result = await service.getHomeCategories();

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({ slug: "a", name: "A" });
      expect(result[0].items).toHaveLength(1);
    });
  });
});
