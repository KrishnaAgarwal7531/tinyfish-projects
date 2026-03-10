import { NextRequest } from 'next/server'

export const runtime = 'nodejs'

// Hardcoded high-quality repos for common topics
const KNOWN_REPOS: Record<string, string[]> = {
  'machine-learning': [
    'https://github.com/josephmisiti/awesome-machine-learning',
    'https://github.com/ChristosChristofidis/awesome-deep-learning',
    'https://github.com/eugeneyan/applied-ml',
    'https://github.com/academic/awesome-datascience',
    'https://github.com/visenger/awesome-mlops',
    'https://github.com/bharathgs/Awesome-pytorch-list',
    'https://github.com/krzjoa/awesome-python-data-science',
    'https://github.com/awesomedata/awesome-public-datasets',
  ],
  'react': [
    'https://github.com/enaqx/awesome-react',
    'https://github.com/brillout/awesome-react-components',
    'https://github.com/unicodeveloper/awesome-nextjs',
    'https://github.com/jaredpalmer/awesome-react-render-props',
    'https://github.com/rehooks/awesome-react-hooks',
  ],
  'rust': [
    'https://github.com/rust-unofficial/awesome-rust',
    'https://github.com/analysis-tools-dev/awesome-static-analysis',
    'https://github.com/ImplFerris/implferris.github.io',
  ],
  'devops': [
    'https://github.com/wmariuss/awesome-devops',
    'https://github.com/AcalephStorage/awesome-devops',
    'https://github.com/awesome-lists/awesome-bash',
    'https://github.com/avelino/awesome-go',
  ],
  'python': [
    'https://github.com/vinta/awesome-python',
    'https://github.com/krzjoa/awesome-python-data-science',
    'https://github.com/trananhkma/fucking-awesome-python',
    'https://github.com/pawl/awesome-etl',
  ],
  'kubernetes': [
    'https://github.com/ramitsurana/awesome-kubernetes',
    'https://github.com/tomhuang12/awesome-k8s-resources',
    'https://github.com/Weave-Works/awesome-kubernetes',
  ],
  'ai-tools': [
    'https://github.com/steven2358/awesome-generative-ai',
    'https://github.com/e2b-dev/awesome-ai-agents',
    'https://github.com/jxzhangjhu/Awesome-LLM-Uncertainty-Reliability-Robustness',
    'https://github.com/Hannibal046/Awesome-LLM',
    'https://github.com/tensorchord/Awesome-LLMOps',
  ],
  'go': [
    'https://github.com/avelino/awesome-go',
    'https://github.com/uhub/awesome-go',
  ],
  'typescript': [
    'https://github.com/dzharii/awesome-typescript',
    'https://github.com/typescript-cheatsheets/react',
    'https://github.com/ellerbrock/typescript-badges',
  ],
  'docker': [
    'https://github.com/veggiemonk/awesome-docker',
    'https://github.com/willfarrell/docker-autoheal',
  ],
  'security': [
    'https://github.com/sbilly/awesome-security',
    'https://github.com/vitalysim/Awesome-Hacking-Resources',
    'https://github.com/ashishb/android-security-awesome',
    'https://github.com/paragonie/awesome-appsec',
  ],
}

async function searchGitHub(topic: string): Promise<string[]> {
  const queries = [
    `awesome-${topic}`,
    `awesome ${topic}`,
  ]

  const results: string[] = []
  const seen = new Set<string>()

  for (const q of queries) {
    try {
      const res = await fetch(
        `https://api.github.com/search/repositories?q=${encodeURIComponent(q + ' in:name,description')}&sort=stars&order=desc&per_page=12`,
        {
          headers: {
            'Accept': 'application/vnd.github.v3+json',
            'User-Agent': 'awesome-aggregator',
          },
        }
      )
      if (!res.ok) continue
      const data = await res.json()
      for (const repo of (data.items || [])) {
        const url = repo.html_url as string
        const name = repo.full_name as string
        // Only include repos that look like awesome lists
        if (!seen.has(name) && (
          name.toLowerCase().includes('awesome') ||
          (repo.description || '').toLowerCase().includes('curated')
        )) {
          seen.add(name)
          results.push(url)
        }
      }
    } catch (e) {
      console.error('GitHub search error:', e)
    }
  }

  return results.slice(0, 10)
}

export async function GET(req: NextRequest) {
  const topic = req.nextUrl.searchParams.get('topic')?.toLowerCase().trim()
  if (!topic) {
    return Response.json({ error: 'Missing topic' }, { status: 400 })
  }

  // Check known repos first
  for (const [key, repos] of Object.entries(KNOWN_REPOS)) {
    if (topic === key || topic.includes(key) || key.includes(topic)) {
      // Always return at least 7 — pad with GitHub search if needed
      if (repos.length >= 7) return Response.json({ repos: repos.slice(0, 10), source: 'curated' })
      const extra = await searchGitHub(topic)
      const combined = [...new Set([...repos, ...extra])].slice(0, 10)
      return Response.json({ repos: combined, source: 'curated' })
    }
  }

  // Fall back to GitHub search — ensure at least 7
  const repos = await searchGitHub(topic)
  if (repos.length === 0) {
    return Response.json({ error: 'No awesome repos found for this topic' }, { status: 404 })
  }

  return Response.json({ repos: repos.slice(0, 10), source: 'github-search' })
}
