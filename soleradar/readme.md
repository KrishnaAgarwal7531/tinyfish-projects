# SoleRadar

**Real-time sneaker prices and stock across every retailer in your region, instantly.**

SoleRadar lets you look up any sneaker and get live pricing, stock status, colorway availability, and purchase links — scraped in parallel from 7–9 region-specific retailers using AI web agents, all in real time.

---

Live Link - https://soleradar.vercel.app/ 

## What it does

Type in a sneaker name (e.g. `Jordan 1 Low`) and a region (e.g. `Singapore`) and SoleRadar will:

1. **Discover** the right retailers for your region — Novelship, StockX, GOAT, Nike, Adidas, and local market-specific stores
2. **Scrape** all sites concurrently using parallel TinyFish web agents, streaming live agent status back to you as it runs
3. **Score** every result by availability, price completeness, and link quality into a 1–10 quality score
4. **Display** a clean dashboard with prices, sizes, stock status, colorways, purchase links, and a side-by-side compare tool

---

## Architecture
```
User Input (sneaker name + size + colorway + region + currency)
        │
        ▼
┌─────────────────────────────────────┐
│         /api/find-sites             │
│  Looks up curated retailer list     │
│  for the selected region:           │
│  - Brand-aware sorting              │
│    (Nike stores first for Jordans,  │
│     Adidas first for Yeezys)        │
│  - Returns top 9 retailer URLs      │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│          /api/search                │
│  Spawns N TinyFish agents in        │
│  parallel, streams SSE progress:    │
│                                     │
│  ┌─────────────┐ ┌───────────────┐  │
│  │   StockX    │ │   Novelship   │  │
│  └─────────────┘ └───────────────┘  │
│  ┌─────────────┐ ┌───────────────┐  │
│  │   Nike SG   │ │  Foot Locker  │  │
│  └─────────────┘ └───────────────┘  │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│         Client-side scoring         │
│  Quality score computed per result  │
│  → structured SneakerDrop[] cards   │
└──────────────┬──────────────────────┘
               │
               ▼
        Next.js Frontend
   (price, stock, size, colorway,
    quality score, compare dashboard)
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 15 (App Router) |
| Language | TypeScript |
| Web scraping | TinyFish Web Agent API |
| Streaming | Server-Sent Events (SSE) |
| Styling | Inline CSS with CSS variables |
| Fonts | Bebas Neue, Barlow Condensed |
| Deployment | Vercel |

---

## How to run locally

**1. Clone the repo**
```bash
git clone https://github.com/KrishnaAgarwal7531/tinyfish-projects.git
cd tinyfish-projects/soleradar
```

**2. Install dependencies**
```bash
npm install
```

**3. Set up environment variables**

Create a `.env.local` file:
```
TINYFISH_API_KEY=your_tinyfish_key_here
```

- Get a TinyFish key (500 free steps, no credit card): https://agent.tinyfish.ai/api-keys

**4. Run the dev server**
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

---

## How to use

1. Enter a **sneaker name** — e.g. `Jordan 1 Low`, `Yeezy 350 V2`, `New Balance 550`
2. Enter a **size** (optional) — e.g. `US 10`, `UK 9`
3. Enter a **colorway** (optional) — e.g. `University Blue`, `Bred`
4. Select a **region** and **currency**
5. Click **Lock on Target**
6. Watch the agents run live across all retailers, then browse your results

Works for any sneaker, any region worldwide.

---

## Environment Variables

| Variable | Description |
|---|---|
| `TINYFISH_API_KEY` | TinyFish Web Agent API key for scraping |

---

## Supported Regions

| Region | Key Retailers |
|---|---|
| 🇸🇬 Singapore | Novelship, KicksCrew, SOLE WHAT, StockX, Nike SG, Adidas SG |
| 🇺🇸 United States | StockX, GOAT, Flight Club, Nike US, Foot Locker, Stadium Goods |
| 🇬🇧 United Kingdom | END. Clothing, JD Sports, KLEKT, Nike UK, Adidas UK, Size? |
| 🇯🇵 Japan | Atmos, Snkrdunk, Zozotown, Rakuten, Mita Sneakers, Nike JP |
| 🇦🇺 Australia | Culture Kings, Stylerunner, GOAT, StockX, Foot Locker AU |
| 🇩🇪 Germany | Solebox, Asphaltgold, Snipes, KLEKT, Nike DE, Adidas DE |
| 🇨🇦 Canada | GOAT, StockX, Haven, Bodega, Livestock, Nike CA |
| 🇫🇷 France | Courir, Footdistrict, KLEKT, Zalando FR, Nike FR |
| 🇮🇳 India | Superkicks, VegNonVeg, Mainstreet Marketplace, Nike IN |
