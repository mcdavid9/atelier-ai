export type Product = {
  id: string;
  title: string;
  price: string;
  extractedPrice: number | null;
  source: string;
  image: string | null;
  link: string;
  rating: number | null;
  reviews: number | null;
  delivery: string | null;
};

export type OutfitItem = {
  id: string;
  category: string;
  name: string;
  description: string;
  searchQuery: string;
  why: string;
  products: Product[];
};

export type Outfit = {
  title: string;
  aesthetic: string;
  summary: string;
  rationale: string;
  tags: string[];
  items: OutfitItem[];
};

export type ShoppingRegion = {
  country: string;
  gl: string;
  hl: string;
  currency: string;
  googleDomain: string;
};
