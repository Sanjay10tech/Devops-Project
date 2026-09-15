import { Request, Response } from "express";
import { ContentService } from "./content.service";
import { getValidated } from "../http/validate";
import {
  ListContentQuery,
  SearchQuery,
} from "./content.validation";

/**
 * Thin HTTP controllers. They read validated input, delegate to the service,
 * and shape the JSON response. No business logic lives here.
 */
export class ContentController {
  constructor(private readonly service: ContentService) {}

  listContent = async (req: Request, res: Response): Promise<void> => {
    const query = getValidated<ListContentQuery>(req, "query");
    const result = await this.service.listContent(query);
    res.json({ data: result.items, pagination: pagination(result) });
  };

  getHome = async (_req: Request, res: Response): Promise<void> => {
    const [featured, categories] = await Promise.all([
      this.service.getFeatured(),
      this.service.getHomeCategories(),
    ]);
    res.json({ data: { featured, categories } });
  };

  getById = async (req: Request, res: Response): Promise<void> => {
    const { id } = getValidated<{ id: string }>(req, "params");
    const content = await this.service.getContentById(id);
    res.json({ data: content });
  };

  search = async (req: Request, res: Response): Promise<void> => {
    const query = getValidated<SearchQuery>(req, "query");
    const result = await this.service.search(query);
    res.json({
      data: result.items,
      query: query.q,
      pagination: pagination(result),
    });
  };
}

function pagination(result: {
  total: number;
  limit: number;
  offset: number;
}): { total: number; limit: number; offset: number } {
  return { total: result.total, limit: result.limit, offset: result.offset };
}
