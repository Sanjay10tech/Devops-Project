import { Content, HomePayload } from "../types";

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "/api/v1";

/** Error thrown for non-2xx API responses, carrying a user-friendly message. */
export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(path: string, signal?: AbortSignal): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${path}`, { signal });
  } catch (err) {
    if ((err as Error).name === "AbortError") throw err;
    throw new ApiError(0, "Unable to reach the server. Is the backend running?");
  }

  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      message = body?.error?.message ?? message;
    } catch {
      /* ignore parse errors */
    }
    throw new ApiError(res.status, message);
  }

  return res.json() as Promise<T>;
}

export const api = {
  getHome: (signal?: AbortSignal) =>
    request<{ data: HomePayload }>("/content/home", signal).then((r) => r.data),

  getById: (id: string, signal?: AbortSignal) =>
    request<{ data: Content }>(`/content/${id}`, signal).then((r) => r.data),

  search: (q: string, signal?: AbortSignal) =>
    request<{ data: Content[]; query: string }>(
      `/content/search?q=${encodeURIComponent(q)}`,
      signal
    ).then((r) => r.data),
};
