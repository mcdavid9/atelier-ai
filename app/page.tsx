"use client";

import { ChangeEvent, DragEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react";
import type { Outfit, OutfitItem, Product } from "@/lib/types";

type ApiStatus = { aiConfigured: boolean; shoppingConfigured: boolean };
type ResultPayload = { outfit: Outfit & { id: string }; region: { country: string; currency: string }; warnings: string[] };
type SavedLook = { id: string; payload: ResultPayload; selectedProducts: Record<string, number>; savedAt: number };

const COUNTRY_OPTIONS = ["United States", "Canada", "Netherlands", "United Kingdom", "France", "Germany", "Australia"];
const CURRENCY_BY_COUNTRY: Record<string, string> = {
  "United States": "USD", Canada: "CAD", Netherlands: "EUR", "United Kingdom": "GBP", France: "EUR", Germany: "EUR", Australia: "AUD",
};

function currencyAmount(value: number, currency: string) {
  try { return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(value); }
  catch { return `${currency} ${value}`; }
}

function budgetLabel(value: string, currency: string) {
  if (value === "under-100") return `Under ${currencyAmount(100, currency)}`;
  if (value === "100-250") return `${currencyAmount(100, currency)}–${currencyAmount(250, currency)}`;
  if (value === "250-500") return `${currencyAmount(250, currency)}–${currencyAmount(500, currency)}`;
  if (value === "500-1000") return `${currencyAmount(500, currency)}–${currencyAmount(1000, currency)}`;
  if (value === "1000-plus") return `${currencyAmount(1000, currency)}+`;
  return "No fixed budget";
}

function money(value: number, currency: string) {
  try { return new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits: 2 }).format(value); }
  catch { return `${currency} ${value.toFixed(2)}`; }
}

function ProductTile({ product, compact = false, onChoose, selected = false }: {
  product: Product; compact?: boolean; onChoose?: () => void; selected?: boolean;
}) {
  return (
    <article className={`product-tile ${compact ? "product-tile-compact" : ""} ${selected ? "product-selected" : ""}`}>
      <div className="product-image-wrap">
        {product.image ? (
          // Product images are supplied by the live shopping provider.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={product.image} alt={product.title} loading="lazy" />
        ) : <div className="product-image-empty"><span>ATELIER</span></div>}
        {selected && <span className="selected-label">SELECTED</span>}
      </div>
      <div className="product-copy">
        <div className="product-brand">{product.source}</div>
        <h4>{product.title}</h4>
        <div className="product-bottom">
          <strong>{product.price}</strong>
          {product.rating ? <span className="rating">★ {product.rating.toFixed(1)}{product.reviews ? ` (${product.reviews.toLocaleString()})` : ""}</span> : null}
        </div>
        {product.delivery && <p className="delivery-note">{product.delivery}</p>}
        <div className="product-actions">
          {product.link ? <a href={product.link} target="_blank" rel="noreferrer" className="text-link">View offer ↗</a> : <span className="muted">No product link</span>}
          {onChoose && <button type="button" onClick={onChoose} className="choose-link">Use this item</button>}
        </div>
        <div className="source-note">Link opens Google Shopping</div>
      </div>
    </article>
  );
}

export default function HomePage() {
  const [prompt, setPrompt] = useState("");
  const [occasion, setOccasion] = useState("Everyday");
  const [season, setSeason] = useState("Current season");
  const [budget, setBudget] = useState("250-500");
  const [country, setCountry] = useState("United States");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [warnings, setWarnings] = useState<string[]>([]);
  const [result, setResult] = useState<ResultPayload | null>(null);
  const [status, setStatus] = useState<ApiStatus | null>(null);
  const [savedLooks, setSavedLooks] = useState<SavedLook[]>([]);
  const [collectionsOpen, setCollectionsOpen] = useState(false);
  const [openAlternatives, setOpenAlternatives] = useState<Record<string, boolean>>({});
  const [selectedProducts, setSelectedProducts] = useState<Record<string, number>>({});
  const [searchingItem, setSearchingItem] = useState<string | null>(null);
  const [refineQueries, setRefineQueries] = useState<Record<string, string>>({});
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/status").then((res) => res.json()).then(setStatus).catch(() => setStatus(null));
    try {
      const stored = localStorage.getItem("atelier-ai-saved-looks");
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) setSavedLooks(parsed);
      }
    } catch { /* Ignore unreadable local collection data. */ }
  }, []);

  useEffect(() => {
    if (!imageFile) { setImagePreview(null); return; }
    const url = URL.createObjectURL(imageFile);
    setImagePreview(url);
    return () => URL.revokeObjectURL(url);
  }, [imageFile]);

  const total = useMemo(() => {
    if (!result) return 0;
    return result.outfit.items.reduce((sum, item) => {
      const index = selectedProducts[item.id] ?? 0;
      const product = item.products[index];
      return sum + (product?.extractedPrice ?? 0);
    }, 0);
  }, [result, selectedProducts]);
  const pricedCount = useMemo(() => result?.outfit.items.filter((item) => {
    const product = item.products[selectedProducts[item.id] ?? 0];
    return typeof product?.extractedPrice === "number";
  }).length ?? 0, [result, selectedProducts]);
  const currentCurrency = CURRENCY_BY_COUNTRY[country] || "USD";
  const currency = result?.region.currency || currentCurrency;

  function setImage(file?: File) {
    if (!file) return;
    if (!file.type.startsWith("image/")) { setError("Choose an image file (JPEG, PNG, WebP or GIF)."); return; }
    if (file.size > 8 * 1024 * 1024) { setError("Please choose an image under 8 MB."); return; }
    setError("");
    setImageFile(file);
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    setImage(event.target.files?.[0]);
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragActive(false);
    setImage(event.dataTransfer.files?.[0]);
  }

  async function generate(event?: FormEvent) {
    event?.preventDefault();
    if (!prompt.trim() && !imageFile) { setError("Upload an inspiration photo or describe the outfit you want."); return; }
    setLoading(true);
    setError("");
    setWarnings([]);
    setResult(null);
    setOpenAlternatives({});
    setSelectedProducts({});

    try {
      const form = new FormData();
      form.append("prompt", prompt);
      form.append("occasion", occasion);
      form.append("season", season);
      form.append("budget", budgetLabel(budget, currentCurrency));
      form.append("country", country);
      if (imageFile) form.append("image", imageFile);
      const response = await fetch("/api/stylist", { method: "POST", body: form });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Outfit generation failed.");
      setResult(payload as ResultPayload);
      setWarnings(Array.isArray(payload.warnings) ? payload.warnings : []);
      window.setTimeout(() => document.getElementById("outfit-results")?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function findMore(item: OutfitItem) {
    const query = (refineQueries[item.id] || item.searchQuery).trim();
    if (!query) return;
    setSearchingItem(item.id);
    setError("");
    try {
      const response = await fetch("/api/replace", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ query, country }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Could not find alternatives.");
      if (!payload.products?.length) throw new Error("No alternatives were found for that search. Try a different description.");
      setResult((current) => current ? {
        ...current,
        outfit: { ...current.outfit, items: current.outfit.items.map((currentItem) => currentItem.id === item.id ? { ...currentItem, products: payload.products } : currentItem) },
      } : current);
      setSelectedProducts((current) => ({ ...current, [item.id]: 0 }));
      setOpenAlternatives((current) => ({ ...current, [item.id]: true }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not find alternatives.");
    } finally {
      setSearchingItem(null);
    }
  }

  function useProduct(itemId: string, index: number) {
    setSelectedProducts((current) => ({ ...current, [itemId]: index }));
    setOpenAlternatives((current) => ({ ...current, [itemId]: false }));
  }

  function saveCurrentLook() {
    if (!result) return;
    const saved: SavedLook = { id: result.outfit.id, payload: result, selectedProducts: { ...selectedProducts }, savedAt: Date.now() };
    const next = [saved, ...savedLooks.filter((look) => look.id !== saved.id)].slice(0, 30);
    setSavedLooks(next);
    try { localStorage.setItem("atelier-ai-saved-looks", JSON.stringify(next)); } catch { setError("This browser could not save the look. Check available local storage."); }
  }

  function removeSavedLook(id: string) {
    const next = savedLooks.filter((look) => look.id !== id);
    setSavedLooks(next);
    try { localStorage.setItem("atelier-ai-saved-looks", JSON.stringify(next)); } catch { /* Keep the current in-memory list. */ }
  }

  function openSavedLook(look: SavedLook) {
    setResult(look.payload);
    setWarnings(look.payload.warnings || []);
    setSelectedProducts(look.selectedProducts || {});
    setCollectionsOpen(false);
    window.setTimeout(() => document.getElementById("outfit-results")?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
  }

  const isCurrentLookSaved = Boolean(result && savedLooks.some((look) => look.id === result.outfit.id));
  const configured = Boolean(status?.aiConfigured && status?.shoppingConfigured);

  return (
    <main>
      <header className="site-header">
        <a href="#top" className="wordmark" aria-label="Atelier AI home">ATELIER <span>AI</span></a>
        <nav className="main-nav">
          <a href="#create">Create</a>
          <button type="button" onClick={() => setCollectionsOpen((open) => !open)}>Collections ({savedLooks.length})</button>
          <a href="#how-it-works">About</a>
        </nav>
        <div className={`connection-pill ${configured ? "connected" : "not-connected"}`}>
          <i />{configured ? "LIVE SEARCH READY" : "SETUP REQUIRED"}
        </div>
      </header>

      {collectionsOpen && (
        <section className="saved-section" id="saved-collections">
          <div className="saved-heading"><div><div className="eyebrow">YOUR PRIVATE EDITS</div><h2>Saved looks</h2></div><button type="button" onClick={() => setCollectionsOpen(false)}>Close ×</button></div>
          {savedLooks.length === 0 ? <p className="saved-empty">Your collection is empty. Generate a look and save it here.</p> : (
            <div className="saved-grid">{savedLooks.map((look) => {
              const savedTotal = look.payload.outfit.items.reduce((sum, item) => sum + (item.products[look.selectedProducts[item.id] ?? 0]?.extractedPrice ?? 0), 0);
              return <article className="saved-card" key={look.id}><div className="eyebrow">{look.payload.outfit.aesthetic}</div><h3>{look.payload.outfit.title}</h3><p>{look.payload.outfit.summary}</p><div className="saved-meta">{new Date(look.savedAt).toLocaleDateString()} · {money(savedTotal, look.payload.region.currency)}</div><div className="saved-actions"><button type="button" onClick={() => openSavedLook(look)}>Open look ↗</button><button type="button" onClick={() => removeSavedLook(look.id)}>Remove</button></div></article>;
            })}</div>
          )}
          <div className="saved-footnote">Saved in this browser only. These looks are not synced across devices.</div>
        </section>
      )}

      <section className="hero" id="top">
        <div className="hero-eyebrow"><span /> YOUR PERSONAL SHOPPING STYLIST</div>
        <h1>Your style.<br /><em>Reimagined.</em></h1>
        <p className="hero-description">Start with a reference, a feeling or a sentence. ATELIER finds the pieces and brings the whole look together.</p>
        <a href="#create" className="hero-cta">Create your outfit <span>↓</span></a>
        <div className="hero-index">01 / THE STYLE EDIT</div>
      </section>

      <section className="create-section" id="create">
        <div className="section-heading">
          <div><div className="eyebrow">THE CREATION STUDIO</div><h2>Build your look</h2></div>
          <p>Upload what inspires you.<br />Or tell us what you have in mind.</p>
        </div>

        {!configured && (
          <div className="setup-notice">
            <div className="notice-icon">!</div>
            <div><strong>Connect your APIs to start styling.</strong><p>Add <code>ANTHROPIC_API_KEY</code> and <code>SERPAPI_API_KEY</code> to <code>.env.local</code>, then restart the development server. See the included README.</p></div>
          </div>
        )}

        <form onSubmit={generate} className="stylist-form">
          <div className="input-layout">
            <div className={`upload-panel ${dragActive ? "drag-active" : ""}`} onDragOver={(event) => { event.preventDefault(); setDragActive(true); }} onDragLeave={() => setDragActive(false)} onDrop={handleDrop}>
              {imagePreview ? (
                <div className="preview-state">
                  {/* Local preview of the user's selected reference image. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={imagePreview} alt="Your outfit inspiration" />
                  <div className="preview-actions"><span>REFERENCE IMAGE ADDED</span><button type="button" onClick={() => { setImageFile(null); if (fileInput.current) fileInput.current.value = ""; }}>Remove image ×</button></div>
                </div>
              ) : (
                <button type="button" className="upload-content" onClick={() => fileInput.current?.click()}>
                  <span className="upload-plus">+</span>
                  <strong>Drop your inspiration here</strong>
                  <span>Upload an outfit photo, Pinterest save or screenshot</span>
                  <small>JPG, PNG, WEBP · UP TO 8 MB</small>
                </button>
              )}
              <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={handleFileChange} hidden />
            </div>

            <div className="brief-panel">
              <label htmlFor="style-brief" className="field-label">DESCRIBE THE LOOK</label>
              <textarea id="style-brief" value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="A relaxed quiet-luxury look for a summer evening. Think understated tailoring, natural fabrics and a refined neutral palette…" rows={7} />
              <div className="prompt-examples"><span>TRY:</span><button type="button" onClick={() => setPrompt("A quiet luxury outfit for a summer dinner in the city. Refined neutrals, relaxed tailoring and understated accessories.")}>Quiet luxury</button><button type="button" onClick={() => setPrompt("Minimal contemporary streetwear with relaxed proportions, premium basics and clean sneakers.")}>Modern streetwear</button><button type="button" onClick={() => setPrompt("An elevated old-money inspired weekend outfit with classic knitwear, tailored trousers and leather loafers.")}>Old money</button></div>
            </div>
          </div>

          <div className="preferences-row">
            <div className="preference-field"><label htmlFor="occasion">OCCASION</label><select id="occasion" value={occasion} onChange={(event) => setOccasion(event.target.value)}><option>Everyday</option><option>Date night</option><option>Work</option><option>Weekend</option><option>Vacation</option><option>Formal event</option><option>Night out</option></select></div>
            <div className="preference-field"><label htmlFor="season">SEASON</label><select id="season" value={season} onChange={(event) => setSeason(event.target.value)}><option>Current season</option><option>Spring</option><option>Summer</option><option>Autumn</option><option>Winter</option></select></div>
            <div className="preference-field"><label htmlFor="budget">TOTAL BUDGET</label><select id="budget" value={budget} onChange={(event) => setBudget(event.target.value)}><option value="under-100">{budgetLabel("under-100", currentCurrency)}</option><option value="100-250">{budgetLabel("100-250", currentCurrency)}</option><option value="250-500">{budgetLabel("250-500", currentCurrency)}</option><option value="500-1000">{budgetLabel("500-1000", currentCurrency)}</option><option value="1000-plus">{budgetLabel("1000-plus", currentCurrency)}</option><option value="none">No fixed budget</option></select></div>
            <div className="preference-field"><label htmlFor="country">SHOPPING REGION</label><select id="country" value={country} onChange={(event) => setCountry(event.target.value)}>{COUNTRY_OPTIONS.map((option) => <option key={option}>{option}</option>)}</select></div>
            <button type="submit" className="generate-button" disabled={loading || !configured}>{loading ? <><span className="spinner" /> Building your look</> : <>Generate outfit <span>↗</span></>}</button>
          </div>
          {error && <div className="error-message" role="alert">{error}</div>}
          {loading && <div className="loading-line"><span className="loading-dot" /> Reading your brief, composing the look and searching real product listings. This can take up to a minute.</div>}
        </form>
      </section>

      {result && (
        <section className="results-section" id="outfit-results">
          <div className="results-topline"><span>02 / YOUR PERSONAL EDIT</span><div className="results-actions"><button type="button" onClick={saveCurrentLook}>{isCurrentLookSaved ? "Saved to collections ✓" : "Save this look +"}</button><button type="button" onClick={() => { setResult(null); document.getElementById("create")?.scrollIntoView({ behavior: "smooth" }); }}>Create a new look ↗</button></div></div>
          <div className="outfit-heading">
            <div><div className="eyebrow">{result.outfit.aesthetic.toUpperCase()}</div><h2>{result.outfit.title}</h2><p>{result.outfit.summary}</p><div className="tag-row">{result.outfit.tags.map((tag) => <span key={tag}>{tag}</span>)}</div></div>
            <div className="total-price"><span>OUTFIT TOTAL*</span><strong>{money(total, currency)}</strong><small>{pricedCount} of {result.outfit.items.length} items with verifiable prices</small></div>
          </div>

          {warnings.length > 0 && <div className="warning-message"><strong>Some searches need attention</strong><ul>{warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul></div>}

          <div className="products-grid">
            {result.outfit.items.map((item, index) => {
              const chosenIndex = selectedProducts[item.id] ?? 0;
              const chosen = item.products[chosenIndex];
              const isOpen = Boolean(openAlternatives[item.id]);
              return (
                <article className="outfit-item" key={item.id}>
                  <div className="item-topline"><span>0{index + 1} / {item.category.toUpperCase()}</span><span className="item-count">{item.products.length ? `${item.products.length} MATCHES` : "NO MATCHES"}</span></div>
                  <div className="item-description"><h3>{item.name}</h3><p>{item.description}</p><small>{item.why}</small></div>
                  {chosen ? <ProductTile product={chosen} selected /> : <div className="no-products"><span>—</span><strong>No live products found</strong><p>Try a more specific search query or a different region.</p></div>}
                  <div className="item-controls">
                    {item.products.length > 1 && <button type="button" className="outline-button" onClick={() => setOpenAlternatives((current) => ({ ...current, [item.id]: !current[item.id] }))}>{isOpen ? "Hide alternatives −" : `Compare ${item.products.length} matches +`}</button>}
                    <div className="more-search">
                      <input aria-label={`Search for another ${item.category}`} placeholder={`Search another ${item.category.toLowerCase()}…`} value={refineQueries[item.id] ?? ""} onChange={(event) => setRefineQueries((current) => ({ ...current, [item.id]: event.target.value }))} />
                      <button type="button" onClick={() => findMore(item)} disabled={searchingItem === item.id}>{searchingItem === item.id ? "Searching…" : "Find more ↗"}</button>
                    </div>
                  </div>
                  {isOpen && <div className="alternatives-grid">{item.products.map((product, productIndex) => <ProductTile key={product.id} product={product} compact selected={productIndex === chosenIndex} onChoose={() => useProduct(item.id, productIndex)} />)}</div>}
                </article>
              );
            })}
          </div>

          <div className="stylist-note"><div className="eyebrow">THE STYLIST'S NOTE</div><p>{result.outfit.rationale}</p></div>
          <div className="disclaimer">*Total adds the selected listed prices returned by Google Shopping. Prices, stock and delivery can change at the retailer. Search-result links open Google Shopping; they are not guaranteed to be direct retailer product pages.</div>
        </section>
      )}

      <section className="how-section" id="how-it-works">
        <div className="eyebrow">A BETTER WAY TO GET DRESSED</div>
        <h2>From inspiration<br /><em>to intention.</em></h2>
        <div className="how-grid">
          <div><span>01</span><h3>Bring the reference</h3><p>Upload a look you saved or put the idea into words. Start with as much or as little detail as you like.</p></div>
          <div><span>02</span><h3>Let the stylist edit</h3><p>AI interprets the silhouette, palette and occasion, then builds a considered head-to-toe outfit.</p></div>
          <div><span>03</span><h3>Shop real matches</h3><p>See live product listings, prices and merchants. Compare alternatives and choose the pieces that fit.</p></div>
        </div>
      </section>

      <footer className="site-footer"><a href="#top" className="wordmark">ATELIER <span>AI</span></a><span>PERSONAL STYLE, CONSIDERED.</span><span>© {new Date().getFullYear()} ATELIER AI</span></footer>
    </main>
  );
}
