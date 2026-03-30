# ModuleMapper

**Real student reviews for any university course, instantly.**

ModuleMapper lets you look up any course at any university and get a structured, AI-synthesised verdict based on live student reviews scraped from Reddit, RateMyProfessors, university course platforms, and student blogs — all in real time.

---

## What it does

Type in a course code (e.g. `BT1101`) and a university (e.g. `NUS`) and ModuleMapper will:

1. **Discover** the right sources for that university in real-time — subreddits, course review platforms like NUSMods or Bruinwalk, the official course catalog page
2. **Scrape** all sources concurrently using parallel TinyFish web agents, streaming live progress back to you as it runs
3. **Synthesise** everything with an LLM into a structured verdict
4. **Display** a clean dashboard with score, difficulty, workload, student quotes, exam tips, grading patterns, and more

---

## Architecture
```
User Input (course code + university)
        │
        ▼
┌─────────────────────────────────────┐
│         /api/discover               │
│  Groq LLM figures out in real-time: │
│  - Which subreddits to search       │
│  - Course platform URL (NUSMods,    │
│    Bruinwalk, Carta, etc.)          │
│  - Official course catalog URL      │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│          /api/scrape                │
│  Spawns N TinyFish agents in        │
│  parallel, streams SSE progress:    │
│                                     │
│  ┌─────────────┐ ┌───────────────┐  │
│  │ RateMyProf  │ │  r/nus        │  │
│  └─────────────┘ └───────────────┘  │
│  ┌─────────────┐ ┌───────────────┐  │
│  │  NUSMods    │ │ Student blogs │  │
│  └─────────────┘ └───────────────┘  │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│         /api/synthesise             │
│  Groq LLM analyses all raw data     │
│  → structured JSON verdict          │
└──────────────┬──────────────────────┘
               │
               ▼
        Next.js Frontend
     (score, reviews, tags,
      difficulty, workload…)
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 15 (App Router) |
| Language | TypeScript |
| Web scraping | TinyFish Web Agent API |
| LLM (discover + synthesise) | Groq — `llama-3.3-70b-versatile` |
| Streaming | Server-Sent Events (SSE) |
| Styling | Inline CSS with CSS variables |
| Deployment | Vercel |

---

## How to run locally

**1. Clone the repo**
```bash
git clone https://github.com/YOUR_USERNAME/modulemapper.git
cd modulemapper
```

**2. Install dependencies**
```bash
npm install
```

**3. Set up environment variables**

Create a `.env.local` file:
```
TINYFISH_API_KEY=your_tinyfish_key_here
GROQ_API_KEY=your_groq_key_here
```

- Get a TinyFish key (500 free steps, no credit card): https://agent.tinyfish.ai/api-keys
- Get a Groq key (free): https://console.groq.com

**4. Run the dev server**
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

---

## How to use

1. Enter a **course code** — e.g. `BT1101`, `CS50`, `MATH101`
2. Enter a **university** — e.g. `NUS`, `Harvard`, `MIT`
3. Click **Analyse**
4. Watch the agents run live, then read your verdict

Works for any university worldwide.

---

## Environment Variables

| Variable | Description |
|---|---|
| `TINYFISH_API_KEY` | TinyFish Web Agent API key for scraping |
| `GROQ_API_KEY` | Groq API key for LLM inference |

---

## Claude Skill

A Claude skill version of ModuleMapper is available — it does the same thing directly inside Claude without needing the web app.

Install: download `modulemapper.skill` from [Releases](../../releases) and upload to **Claude.ai → Settings → Skills**

Or via CLI:
```bash
npx skills add KrishnaAgarwal7531/skills- --skill modulemapper
```
