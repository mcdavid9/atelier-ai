# ATELIER AI — AI personal stylist

A Next.js 16 app for turning a text brief or outfit reference image into a coordinated outfit, then retrieving real Google Shopping listings for each clothing category.

## What is implemented

- Premium, editorial-style responsive interface matching the ATELIER AI direction.
- Upload JPEG, PNG, WebP or GIF reference images (8 MB limit) or describe a look in text.
- Anthropic Claude vision/text analysis through a server-side API route.
- Structured outfit generation with item categories, descriptions, search queries and styling rationale.
- Live Google Shopping searches through SerpApi, localized for the selected shopping country.
- Product cards with provider-returned title, retailer/source, image, listed price, rating/review data when present, delivery snippet when present, and Google Shopping product link.
- Alternative product selection and a server-side search for more alternatives.
- Outfit total based on selected products' extracted listed prices. Products with no numeric price are not included in the sum.
- API status check, missing-key errors, upload validation and loading/error states.

## Requirements

- Node.js 20.9 or later (Node 22 LTS recommended).
- An Anthropic API key from the [Anthropic Console](https://console.anthropic.com/settings/keys).
- A SerpApi key from [SerpApi](https://serpapi.com/manage-api-key).

The API keys are separate from a Claude.ai or ChatGPT subscription. API use may incur separate charges under the providers' terms and pricing.

## Local setup (Mac)

1. Extract the ZIP file.
2. Open the extracted `atelier-ai` folder in VS Code.
3. In the VS Code terminal, run:

   ```bash
   npm install
   ```

4. Copy `.env.example` to a new file named `.env.local` in the project root (the same folder as `package.json`).
5. Fill in your keys:

   ```env
   ANTHROPIC_API_KEY=your_real_anthropic_key
   ANTHROPIC_MODEL=claude-sonnet-4-6
   SERPAPI_API_KEY=your_real_serpapi_key
   ```

   You can change `ANTHROPIC_MODEL` in `.env.local` to another model ID available to your Anthropic API account.

6. Save `.env.local`, then start the app:

   ```bash
   npm run dev
   ```

7. Open the localhost URL printed by Next.js, usually `http://localhost:3000`.

If the server is already running when you add or change environment variables, stop it with `Ctrl + C` and run `npm run dev` again. Do not rename the keys or prefix them with `NEXT_PUBLIC_`.

## Production build

```bash
npm run build
npm run start
```

Deployable to Vercel or another Node-compatible Next.js host. Add the same environment variables to the hosting provider's server-side environment settings before deploying.

## API routes

- `POST /api/stylist` — accepts multipart form data (`prompt`, `occasion`, `season`, `budget`, `country`, optional `image`); calls Claude and then searches Google Shopping for each generated item.
- `POST /api/replace` — accepts JSON `{ "query": "...", "country": "United States" }`; searches additional products.
- `GET /api/status` — returns only booleans indicating whether the two server-side API keys are configured. It never returns the keys.

## Important product-search limitations

- Google Shopping results are sourced from SerpApi. No single shopping API covers every online shop or every product on the internet.
- The current result URL is the Google Shopping product result URL returned by SerpApi. The UI labels it as a Google Shopping link; it does not claim it is a direct merchant product page.
- Prices, stock and delivery can change. The displayed price is the result returned at search time, not a guaranteed checkout price.
- Affiliate tracking is not implemented yet. Add approved affiliate-network feeds and replace Google Shopping links with the corresponding tracked merchant URLs before relying on commission revenue.
- The outfit total is calculated from the selected products that have numeric prices. It is not a checkout quote and excludes tax/shipping where those are not included in the returned price.
- Search uses one SerpApi request per outfit piece, so a full outfit can consume several search requests. Check your account quota and usage.

## Security notes

- `.env.local` is ignored by Git and must never be committed or shared.
- API keys are used only in server routes; they are not sent to the browser.
- Uploaded images are processed in-memory for the Claude request and are not written to disk by this app.
- For a public launch, add authentication, abuse/rate limiting, monitoring, privacy terms and a retention policy. This starter is not a hardened multi-tenant production service.

## Provider documentation

- [Anthropic vision](https://platform.claude.com/docs/en/build-with-claude/vision)
- [Anthropic model IDs](https://platform.claude.com/docs/en/about-claude/models/model-ids-and-versions)
- [SerpApi Google Shopping API](https://serpapi.com/google-shopping-api)
