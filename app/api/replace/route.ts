import { NextResponse } from "next/server";
import { getRegion, searchShopping } from "@/lib/shopping";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const query = typeof body?.query === "string" ? body.query.trim().slice(0, 300) : "";
    const country = typeof body?.country === "string" ? body.country.slice(0, 80) : "United States";
    if (!query) return NextResponse.json({ error: "A product search query is required." }, { status: 400 });
    if (!process.env.SERPAPI_API_KEY) return NextResponse.json({ error: "Add SERPAPI_API_KEY to .env.local and restart the server." }, { status: 503 });
    const region = getRegion(country);
    const products = await searchShopping(query, region, 8);
    return NextResponse.json({ products });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Shopping search failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
