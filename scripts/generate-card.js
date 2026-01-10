const https = require('https');
const fs = require('fs');
const path = require('path');

const OUTPUT_PATH = process.env.OUTPUT_PATH || 'insights-card.svg';
const USERNAME_RAW = process.env.USERNAME || 'ankitpandey2708';
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

/**
 * Make HTTPS request to GitHub API
 */
function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    const options = {
      headers: {
        'User-Agent': 'ForkLift-Card-Generator',
        'Accept': 'application/vnd.github.v3+json'
      }
    };

    if (GITHUB_TOKEN) {
      options.headers['Authorization'] = `Bearer ${GITHUB_TOKEN}`;
    }

    https.get(url, options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        if (res.statusCode === 200) {
          resolve(JSON.parse(data));
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${data}`));
        }
      });
    }).on('error', reject);
  });
}

/**
 * Fetch GitHub statistics for the user
 */
async function fetchGitHubStats(username) {
  console.log(`Fetching stats for @${username}...`);

  const states = {
    open: 'state:open',
    discarded: 'state:closed+-is:merged',
    merged: 'state:closed+is:merged'
  };

  const results = {};

  for (const [key, query] of Object.entries(states)) {
    const url = `https://api.github.com/search/issues?q=author:${username}+-owner:${username}+type:pr+${query}&per_page=1`;
    const data = await fetchJSON(url);
    results[key] = data.total_count || 0;
    console.log(`  ${key}: ${results[key]}`);
  }

  const total = results.open + results.discarded + results.merged;
  const mergeRate = total > 0 ? ((results.merged / total) * 100).toFixed(1) : 0;

  return {
    username,
    totalContributions: total,
    mergeRate,
    merged: results.merged,
    open: results.open,
    discarded: results.discarded
  };
}

/**
 * Generate beautiful SVG card
 */
function generateSVG(data) {
  const svg = `<svg width="450" height="195" viewBox="0 0 450 195" xmlns="http://www.w3.org/2000/svg" role="img" aria-labelledby="descId">
  <title id="titleId">ForkLift Insights for ${data.username}</title>
  <desc id="descId">Open source contribution statistics showing ${data.totalContributions} total contributions with ${data.mergeRate}% merge rate</desc>

  <rect width="450" height="195" rx="12" fill="#ffffff" stroke="#e2e8f0" stroke-width="1"/>

  <text x="24" y="30" font-family="'SF Pro Display', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
        font-size="18" font-weight="700" fill="#0f172a">
    ForkLift Insights
  </text>
  <text x="24" y="48" font-family="'SF Pro Text', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
        font-size="12" fill="#64748b">
    @${data.username}
  </text>

  <line x1="20" y1="60" x2="430" y2="60" stroke="#e2e8f0" stroke-width="1"/>

  <g font-family="'SF Pro Text', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="12" fill="#0f172a">
    <text x="24" y="82" font-weight="600">Total contributions</text>
    <text x="426" y="82" text-anchor="end" font-weight="700">${data.totalContributions}</text>

    <text x="24" y="104" font-weight="600">Merged PRs</text>
    <text x="426" y="104" text-anchor="end" font-weight="700">${data.merged}</text>

    <text x="24" y="126" font-weight="600">Open PRs</text>
    <text x="426" y="126" text-anchor="end" font-weight="700">${data.open}</text>

    <text x="24" y="148" font-weight="600">Discarded PRs</text>
    <text x="426" y="148" text-anchor="end" font-weight="700">${data.discarded}</text>

    <text x="24" y="170" font-weight="600">Merge rate</text>
    <text x="426" y="170" text-anchor="end" font-weight="700">${data.mergeRate}%</text>
  </g>

  <text x="225" y="188" font-family="'SF Pro Text', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
        font-size="9" fill="#94a3b8" text-anchor="middle">
    Updated ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
  </text>
</svg>`;

  return svg;
}

/**
 * Main execution
 */
function readUsernames() {
  const normalized = USERNAME_RAW
    .split(',')
    .map((username) => username.trim())
    .filter(Boolean);

  return [...new Set(normalized)];
}

function getPrimaryUsername() {
  return readUsernames()[0] || 'ankitpandey2708';
}

function ensureDirectory(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

async function writeCard(username, outputPath) {
  const stats = await fetchGitHubStats(username);
  const svg = generateSVG(stats);

  ensureDirectory(outputPath);
  fs.writeFileSync(outputPath, svg, 'utf8');
  console.log(`✅ Wrote ${outputPath}`);
}

async function writeSingleCard() {
  const stats = await fetchGitHubStats(getPrimaryUsername());
  const svg = generateSVG(stats);

  ensureDirectory(OUTPUT_PATH);
  fs.writeFileSync(OUTPUT_PATH, svg, 'utf8');
  console.log(`\n✅ SVG card generated successfully: ${OUTPUT_PATH}`);
  console.log(`   Total Contributions: ${stats.totalContributions}`);
  console.log(`   Merge Rate: ${stats.mergeRate}%`);
}

async function writeBatchCards() {
  const usernames = readUsernames();
  const defaultUsername = usernames[0] || USERNAME_RAW;
  const rootUsername = 'ankitpandey2708';

  if (usernames.length <= 1) {
    throw new Error('Provide multiple comma-separated USERNAME values to generate batch cards.');
  }

  for (const username of usernames) {
    if (username === rootUsername) {
      continue;
    }
    const outputPath = path.join(__dirname, '..', username, 'insights-card.svg');
    await writeCard(username, outputPath);
  }

  await writeCard(defaultUsername, path.join(__dirname, '..', 'insights-card.svg'));
}

async function main() {
  try {
    if (readUsernames().length > 1) {
      await writeBatchCards();
      return;
    }

    await writeSingleCard();
  } catch (error) {
    console.error('❌ Error generating card:', error.message);
    process.exit(1);
  }
}

main();
