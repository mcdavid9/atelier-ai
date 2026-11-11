import type { Outfit } from "@/lib/types";

type ImageInput = { data: string; mediaType: string } | null;

type StylingInput = {
  prompt: string;
  occasion: string;
  season: string;
  budget: string;
  country: string;
  image: ImageInput;
};

const SYSTEM_PROMPT = `You are ATELIER AI, a highly skilled personal fashion stylist and wardrobe buyer. Your job is to turn a user's written brief or reference image into one coherent, wearable outfit that can be searched for as real products.

Styling principles:
- Think like an experienced fashion editor and professional personal shopper, not a generic chatbot.
- Match silhouette, proportions, fabric, texture, color temperature and formality. Every piece must work with the others.
- Avoid costume-like outfits, loud logo combinations and arbitrary trend stacking.
- Treat the user's budget, country, occasion and season as real constraints.
- If given an image, describe only visible clothing and styling cues. Do not identify the person or infer sensitive traits. Recreate the look with purchasable equivalents; do not claim an exact match unless a product is demonstrably exact.
- Product search queries should be concise, specific, commercial queries that can be pasted into Google Shopping. Include color, garment type, fit and fabric where useful. Do not include invented brands.
- Do not invent availability, prices, merchants or product URLs. You are only defining the outfit; the shopping search system retrieves actual products afterward.
- Return 4 to 6 outfit items. Include the essential pieces (top, bottom, footwear and, where appropriate, outerwear/accessory). Do not force an item that would make the outfit worse.

Return ONLY valid JSON. No markdown, no prose outside JSON. Use this schema exactly:
{
  "title": "short editorial outfit title",
  "aesthetic": "2-5 word style name",
  "summary": "one concise sentence describing the complete look",
  "rationale": "2-3 sentences explaining why the proportions, colors and materials work together",
  "tags": ["tag 1", "tag 2", "tag 3"],
  "items": [
    {
      "category": "Top | Bottom | Outerwear | Shoes | Accessory | One-piece",
      "name": "human-readable item name",
      "description": "specific visual description of the desired item",
      "searchQuery": "specific real-world product search query",
      "why": "short explanation of how this item supports the outfit"
    }
  ]
}`;

function resolveModelId(): string {
  return process.env.ANTHROPIC_MODEL?.trim() || "claude-sonnet-4-6";
}

function extractJson(text: string): unknown {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("The AI returned an unreadable outfit. Please try again.");
  return JSON.parse(cleaned.slice(start, end + 1));
}

function cleanOutfit(value: unknown): Outfit {
  if (!value || typeof value !== "object") throw new Error("The AI did not return an outfit.");
  const raw = value as Record<string, unknown>;
  const rawItems = Array.isArray(raw.items) ? raw.items : [];
  const items = rawItems.slice(0, 6).map((entry, index) => {
    const item = (entry && typeof entry === "object" ? entry : {}) as Record<string, unknown>;
    const text = (key: string, fallback: string) => {
      const candidate = item[key];
      return typeof candidate === "string" && candidate.trim() ? candidate.trim() : fallback;
    };
    return {
      id: `item-${index + 1}`,
      category: text("category", "Clothing"),
      name: text("name", "Styling piece"),
      description: text("description", "A piece selected to complete the look."),
      searchQuery: text("searchQuery", `${text("name", "fashion item")} ${text("description", "")}`.trim()),
      why: text("why", "Selected to complement the overall outfit."),
      products: [],
    };
  }).filter((item) => item.searchQuery.length > 2);

  if (items.length < 3) throw new Error("The AI returned too few outfit pieces. Please try a more specific brief.");

  return {
    title: typeof raw.title === "string" ? raw.title : "The Edit",
    aesthetic: typeof raw.aesthetic === "string" ? raw.aesthetic : "Modern minimal",
    summary: typeof raw.summary === "string" ? raw.summary : "A considered outfit built around balance and versatility.",
    rationale: typeof raw.rationale === "string" ? raw.rationale : "The pieces share a coherent palette and proportion.",
    tags: Array.isArray(raw.tags) ? raw.tags.filter((tag): tag is string => typeof tag === "string").slice(0, 5) : [],
    items,
  };
}

export async function createOutfit(input: StylingInput): Promise<Outfit> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("Missing ANTHROPIC_API_KEY. Add your Anthropic API key to .env.local and restart the server.");

  const model = resolveModelId();
  const userBrief = [
    `User brief: ${input.prompt || "Use the uploaded reference image as the primary inspiration."}`,
    `Occasion: ${input.occasion || "Everyday"}`,
    `Season: ${input.season || "Current season"}`,
    `Budget for the complete outfit: ${input.budget || "No fixed budget"}`,
    `Shopping country: ${input.country || "United States"}`,
    "Create search queries suitable for this country's shopping market. If the budget is fixed, distribute it sensibly across all pieces and prefer accessible alternatives.",
  ].join("\n");

  const content: Array<Record<string, unknown>> = [];
  if (input.image) {
    content.push({
      type: "image",
      source: { type: "base64", media_type: input.image.mediaType, data: input.image.data },
    });
  }
  content.push({ type: "text", text: userBrief });

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({ model, max_tokens: 2400, system: SYSTEM_PROMPT, messages: [{ role: "user", content }] }),
    signal: AbortSignal.timeout(60_000),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = payload?.error?.message || `Anthropic API request failed (${response.status}).`;
    throw new Error(message);
  }

  const text = Array.isArray(payload?.content)
    ? payload.content.filter((block: { type?: string }) => block.type === "text").map((block: { text?: string }) => block.text || "").join("\n")
    : "";
  if (!text) throw new Error("Anthropic returned an empty response. Please try again.");
  return cleanOutfit(extractJson(text));
}
