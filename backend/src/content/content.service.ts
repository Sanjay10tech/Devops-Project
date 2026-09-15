import { AppError } from "../errors/AppError";
import { ContentRepository, ListParams } from "./content.repository";
import {
  CategoryWithContent,
  Content,
  ContentType,
  Paginated,
} from "./content.types";

/**
 * Business logic for content. Kept free of Express/HTTP concerns so it can be
 * unit-tested against a mock repository.
 */
export class ContentService {
  constructor(private readonly repo: ContentRepository) {}

  async listContent(params: {
    category?: string;
    type?: ContentType;
    limit: number;
    offset: number;
  }): Promise<Paginated<Content>> {
    const listParams: ListParams = {
      category: params.category,
      type: params.type,
      limit: params.limit,
      offset: params.offset,
    };
    const { items, total } = await this.repo.list(listParams);
    return { items, total, limit: params.limit, offset: params.offset };
  }

  async getContentById(id: string): Promise<Content> {
    const content = await this.repo.findById(id);
    if (!content) {
      throw AppError.notFound(`Content with id '${id}' was not found`);
    }
    return content;
  }

  async search(params: {
    q: string;
    limit: number;
    offset: number;
  }): Promise<Paginated<Content>> {
    const { items, total } = await this.repo.search(
      params.q,
      params.limit,
      params.offset
    );
    return { items, total, limit: params.limit, offset: params.offset };
  }

  async getHomeCategories(
    itemsPerCategory = 12
  ): Promise<CategoryWithContent[]> {
    const grouped = await this.repo.listCategoriesWithContent(itemsPerCategory);
    return grouped
      .filter((g) => g.items.length > 0)
      .map((g) => ({
        slug: g.category.slug,
        name: g.category.name,
        items: g.items,
      }));
  }

  async getFeatured(): Promise<Content | null> {
    return this.repo.findFeatured();
  }
}
