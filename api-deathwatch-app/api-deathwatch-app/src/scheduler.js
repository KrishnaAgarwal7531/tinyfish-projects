const { getAllInstallations, githubRequest } = require("./github-auth");
const { handleInstallation } = require("./handlers/installation");

async function runWeeklyChecks() {
  console.log("Starting weekly health checks for all installations...");

  let installations;
  try {
    installations = await getAllInstallations();
  } catch (err) {
    console.error("Failed to fetch installations:", err.message);
    return;
  }

  console.log(`Found ${installations.length} installations`);

  for (const installation of installations) {
    try {
      // Get all repos for this installation
      const { repositories } = await githubRequest(
        `/installation/repositories?per_page=100`,
        installation.id
      );

      for (const repo of repositories || []) {
        console.log(`Weekly check: ${repo.full_name}`);
        await handleInstallation(installation.id, repo.full_name);

        // Small delay between repos to be a good citizen
        await new Promise((r) => setTimeout(r, 2000));
      }
    } catch (err) {
      console.error(`Error processing installation ${installation.id}:`, err.message);
    }
  }

  console.log("Weekly checks complete.");
}

module.exports = { runWeeklyChecks };
