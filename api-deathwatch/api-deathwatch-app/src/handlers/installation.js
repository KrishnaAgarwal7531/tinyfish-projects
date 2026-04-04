const { githubRequest } = require("../github-auth");
const { checkServices } = require("../health-check");
const { createIssue } = require("../issue-creator");

async function handleInstallation(installationId, repoFullName) {
  console.log(`Running health check for: ${repoFullName}`);

  try {
    // 1. Read package.json from the repo
    const [owner, repo] = repoFullName.split("/");
    let services = [];

    try {
      const fileData = await githubRequest(
        `/repos/${owner}/${repo}/contents/package.json`,
        installationId
      );
      const content = Buffer.from(fileData.content, "base64").toString("utf8");
      const pkg = JSON.parse(content);
      services = extractServices(pkg);
    } catch (err) {
      console.log(`No package.json found in ${repoFullName}, skipping.`);
      return;
    }

    if (services.length === 0) {
      console.log(`No services to monitor in ${repoFullName}`);
      return;
    }

    console.log(`Found ${services.length} services to check: ${services.join(", ")}`);

    // 2. Run health checks for all services
    const results = await checkServices(services);

    // 3. Filter to only services with concerning scores
    const warnings = results.filter((r) => r.score < 7);
    const allHealthy = warnings.length === 0;

    // 4. Create a GitHub Issue with the results
    await createIssue(installationId, owner, repo, results, allHealthy);

    console.log(`Done with ${repoFullName}. ${warnings.length} warnings.`);
  } catch (err) {
    console.error(`Error processing ${repoFullName}:`, err.message);
  }
}

// Extract hosted service names from package.json
// Skips pure utility packages, focuses on APIs / hosted services
function extractServices(pkg) {
  const allDeps = {
    ...pkg.dependencies,
    ...pkg.devDependencies,
  };

  // Known hosted services / APIs worth monitoring
  const servicePatterns = [
    // Cloud platforms
    "heroku", "railway", "render", "fly",
    // Auth
    "auth0", "clerk", "supabase", "firebase", "nextauth",
    // Databases / BaaS
    "mongodb", "mongoose", "prisma", "planetscale", "neon", "turso",
    // Email
    "sendgrid", "mailchimp", "resend", "postmark", "nodemailer",
    // Payments
    "stripe", "paypal", "square",
    // Communication
    "twilio", "vonage", "pusher", "ably",
    // AI / ML
    "openai", "anthropic", "replicate", "huggingface", "groq",
    // CDN / Storage
    "cloudinary", "aws-sdk", "s3", "@aws-sdk", "azure",
    // Monitoring / Analytics
    "sentry", "datadog", "newrelic", "posthog", "mixpanel", "segment",
    // Search
    "algolia", "elasticsearch", "typesense", "meilisearch",
    // CMS
    "contentful", "sanity", "strapi",
    // Misc APIs
    "axios", // flag if combined with specific API usage
    "mapbox", "googlemaps", "@googlemaps",
  ];

  const found = [];

  for (const dep of Object.keys(allDeps)) {
    const depLower = dep.toLowerCase();
    for (const pattern of servicePatterns) {
      if (depLower.includes(pattern) && !found.includes(pattern)) {
        // Use a clean display name
        found.push(cleanServiceName(dep));
        break;
      }
    }
  }

  // Also check if package.json has a "services" or "engines" field with hints
  // Cap at 8 services to keep TinyFish costs reasonable
  return found.slice(0, 8);
}

function cleanServiceName(dep) {
  // Strip scopes and common suffixes for cleaner search queries
  return dep
    .replace(/^@[^/]+\//, "") // remove @scope/
    .replace(/-sdk$/, "")
    .replace(/-js$/, "")
    .replace(/-node$/, "")
    .replace(/-client$/, "");
}

module.exports = { handleInstallation };
