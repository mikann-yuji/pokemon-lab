import type { NextRequest } from "next/server";
import { searchPokemon } from "@/infrastructure/database/pokemon-search-repository";

const PAGE_SIZE = 25;

export function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("q") ?? "";
  const championsOnly =
    request.nextUrl.searchParams.get("champions") === "1";
  const requestedOffset = Number.parseInt(
    request.nextUrl.searchParams.get("offset") ?? "0",
    10,
  );
  const offset = Number.isFinite(requestedOffset)
    ? Math.max(0, requestedOffset)
    : 0;
  const results = searchPokemon(query, {
    limit: PAGE_SIZE + 1,
    offset,
    championsOnly,
  });

  return Response.json({
    items: results.slice(0, PAGE_SIZE),
    hasMore: results.length > PAGE_SIZE,
  });
}
