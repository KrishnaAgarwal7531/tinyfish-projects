require("dotenv").config();
const express = require("express");
const { Webhooks } = require("@octokit/webhooks");
const cron = require("node-cron");
const { handleInstallation } = require("./handlers/installation");
const { runWeeklyChecks } = require("./scheduler");

const app = express();
const port = process.env.PORT || 3000;

// Webhook handler
const webhooks = new Webhooks({
  secret: process.env.GITHUB_WEBHOOK_SECRET,
});

// When the app is installed on a repo → run health check immediately
webhooks.on("installation.created", async ({ payload }) => {
  console.log(`App installed by: ${payload.installation.account.login}`);
  for (const repo of payload.repositories || []) {
    await handleInstallation(payload.installation.id, repo.full_name);
  }
});

// When repos are added to an existing installation
webhooks.on("installation_repositories.added", async ({ payload }) => {
  for (const repo of payload.repositories_added || []) {
    await handleInstallation(payload.installation.id, repo.full_name);
  }
});

// Express routes
app.post("/api/webhook", express.raw({ type: "application/json" }), async (req, res) => {
  try {
    await webhooks.verifyAndReceive({
      id: req.headers["x-github-delivery"],
      name: req.headers["x-github-event"],
      signature: req.headers["x-hub-signature-256"],
      payload: req.body.toString(),
    });
    res.status(200).send("OK");
  } catch (err) {
    console.error("Webhook error:", err.message);
    res.status(400).send("Bad Request");
  }
});

app.get("/", (req, res) => {
  res.send("API Deathwatch is running.");
});

// Run every 7 days at 9am Monday
cron.schedule("0 9 * * 1", async () => {
  const now = new Date();
  const dayOfMonth = now.getDate();
  // Only run every other Monday (approx every 14 days) - or keep weekly
  // For every 7 days, this Monday cron is perfect
  console.log("Running weekly health checks...");
  await runWeeklyChecks();
});

app.listen(port, () => {
  console.log(`API Deathwatch listening on port ${port}`);
});
