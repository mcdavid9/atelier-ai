import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { createOutfit } from "@/lib/anthropic";
import { getRegion, searchShopping } from "@/lib/shopping";

export const runtime = "nodejs";
export const maxDuration = 120;

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const ACCEPTED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

export async function POST(request: Request) {
  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json({ error: "Anthropic is not configured. Add ANTHROPIC_API_KEY to .env.local and restart the server." }, { status: 503 });
    }
    if (!process.env.SERPAPI_API_KEY) {
      return NextResponse.json({ error: "Shopping search is not configured. Add SERPAPI_API_KEY to .env.local and restart the server." }, { status: 503 });
    }

    const form = await request.formData();
    const prompt = String(form.get("prompt") || "").trim().slice(0, 1800);
    const occasion = String(form.get("occasion") || "Everyday").slice(0, 80);
    const season = String(form.get("season") || "Current season").slice(0, 80);
    const budget = String(form.get("budget") || "No fixed budget").slice(0, 80);
    const country = String(form.get("country") || "United States").slice(0, 80);
    const imageValue = form.get("image");

    let image: { data: string; mediaType: string } | null = null;
    if (imageValue instanceof File && imageValue.size > 0) {
      if (!ACCEPTED_IMAGE_TYPES.has(imageValue.type)) {
        return NextResponse.json({ error: "Upload a JPEG, PNG, WebP or GIF image." }, { status: 400 });
      }
      if (imageValue.size > MAX_IMAGE_BYTES) {
        return NextResponse.json({ error: "The image is too large. Please use an image under 8 MB." }, { status: 413 });
      }
      const data = Buffer.from(await imageValue.arrayBuffer()).toString("base64");
      image = { data, mediaType: imageValue.type };
    }

    if (!prompt && !image) {
      return NextResponse.json({ error: "Upload an inspiration photo or describe the outfit you want." }, { status: 400 });
    }

    const outfit = await createOutfit({ prompt, occasion, season, budget, country, image });
    const region = getRegion(country);
    const searchOutcomes = await Promise.allSettled(
      outfit.items.map((item) => searchShopping(item.searchQuery, region, 5)),
    );

    const warnings: string[] = [];
    outfit.items = outfit.items.map((item, index) => {
      const outcome = searchOutcomes[index];
      if (outcome.status === "fulfilled") {
        item.products = outcome.value;
        if (outcome.value.length === 0) warnings.push(`No products were found for ${item.category.toLowerCase()}.`);
      } else {
        warnings.push(`Shopping search failed for ${item.category.toLowerCase()}: ${outcome.reason instanceof Error ? outcome.reason.message : "unknown error"}`);
      }
      return item;
    });

    return NextResponse.json({
      outfit: { ...outfit, id: randomUUID() },
      region: { country: region.country, currency: region.currency },
      warnings,
      searchSource: "Google Shopping via SerpApi",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected server error.";
    const status = message.includes("API key") || message.includes("Missing ") ? 503 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
