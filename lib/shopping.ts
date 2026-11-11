import type { Product, ShoppingRegion } from "@/lib/types";

const REGIONS: Record<string, ShoppingRegion> = {
  "United States": { country: "United States", gl: "us", hl: "en", currency: "USD", googleDomain: "google.com" },
  Canada: { country: "Canada", gl: "ca", hl: "en", currency: "CAD", googleDomain: "google.ca" },
  Netherlands: { country: "Netherlands", gl: "nl", hl: "nl", currency: "EUR", googleDomain: "google.nl" },
  "United Kingdom": { country: "United Kingdom", gl: "uk", hl: "en", currency: "GBP", googleDomain: "google.co.uk" },
  France: { country: "France", gl: "fr", hl: "fr", currency: "EUR", googleDomain: "google.fr" },
  Germany: { country: "Germany", gl: "de", hl: "de", currency: "EUR", googleDomain: "google.de" },
  Australia: { country: "Australia", gl: "au", hl: "en", currency: "AUD", googleDomain: "google.com.au" },
};

export function getRegion(country: string): ShoppingRegion {
  return REGIONS[country] || REGIONS["United States"];
}

function safeString(value: unknown): string {
  return typeof value === "string" ? value : value == null ? "" : String(value);
}

export async function searchShopping(query: string, region: ShoppingRegion, limit = 5): Promise<Product[]> {
  const apiKey = process.env.SERPAPI_API_KEY;
  if (!apiKey) throw new Error("Missing SERPAPI_API_KEY. Add your SerpApi key to .env.local and restart the server.");

  const url = new URL("https://serpapi.com/search.json");
  url.searchParams.set("engine", "google_shopping");
  url.searchParams.set("q", query);
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("gl", region.gl);
  url.searchParams.set("hl", region.hl);
  url.searchParams.set("google_domain", region.googleDomain);
  url.searchParams.set("device", "desktop");

  const response = await fetch(url, { signal: AbortSignal.timeout(35_000), cache: "no-store" });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.error) {
    throw new Error(payload?.error || `Shopping search failed (${response.status}).`);
  }

  const results = Array.isArray(payload?.shopping_results) ? payload.shopping_results : [];
  return results.slice(0, 18).map((row: Record<string, unknown>, index: number) => {
    const title = safeString(row.title);
    const rawLink = safeString(row.product_link || row.link);
    const link = rawLink.startsWith("https://") || rawLink.startsWith("http://") ? rawLink : "";
    const image = safeString(row.thumbnail || (Array.isArray(row.thumbnails) ? row.thumbnails[0] : ""));
    const price = safeString(row.price);
    const extracted = typeof row.extracted_price === "number" ? row.extracted_price : null;
    return {
      id: `${safeString(row.product_id) || "product"}-${index}`,
      title,
      price: price || "Price not listed",
      extractedPrice: extracted,
      source: safeString(row.source) || "Retailer not identified",
      image: image.startsWith("https://") ? image : null,
      link,
      rating: typeof row.rating === "number" ? row.rating : null,
      reviews: typeof row.reviews === "number" ? row.reviews : null,
      delivery: safeString(row.delivery) || null,
    };
  }).filter((product: Product) => product.title && product.link).slice(0, limit);
}
