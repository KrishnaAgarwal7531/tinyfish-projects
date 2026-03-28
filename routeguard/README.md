# RouteGuard

**Know what's ahead, before you ship.**

RouteGuard is a supply chain intelligence tool that analyses shipping routes for disruptions, delays, and risks in real-time. It deploys AI-powered web agents to scrape live maritime data and synthesises it into actionable risk assessments.

## How it works

1. **LLM URL Discovery** — Groq identifies the most relevant maritime intelligence sources for your specific route
2. **Parallel Web Scraping** — TinyFish web agents scrape all sources simultaneously using real browsers with stealth profiles
3. **AI Risk Analysis** — Groq synthesises all scraped data into a comprehensive risk score, timeline, and recommended actions

## Tech Stack

- **Next.js 14** — React framework
- **Groq llama-3.3-70b** — URL discovery + risk analysis
- **TinyFish Web Agent** — Parallel browser-based web scraping
- **Vercel** — Deployment

## Setup

```bash
# Install dependencies
npm install

# Add your API keys
cp .env.example .env.local
# Edit .env.local with your keys

# Run development server
npm run dev
```

## Deploy to Vercel

1. Push to GitHub
2. Import in Vercel
3. Add environment variables: `GROQ_API_KEY` and `TINYFISH_API_KEY`
4. Deploy

## Environment Variables

| Variable | Description |
|----------|-------------|
| `GROQ_API_KEY` | Your Groq API key |
| `TINYFISH_API_KEY` | Your TinyFish/Mino API key |
