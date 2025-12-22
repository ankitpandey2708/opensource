const https = require('https');
const fs = require('fs');

const USERNAME = process.env.USERNAME || 'ankitpandey2708';
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
 * Generate beautiful SVG card with bold, modern design
 */
function generateSVG(data) {
  // Calculate circular progress for merge rate
  const radius = 35;
  const circumference = 2 * Math.PI * radius;
  const mergeProgress = (parseFloat(data.mergeRate) / 100) * circumference;
  const mergeOffset = circumference - mergeProgress;

  // Calculate bar widths for PR breakdown
  const maxBarWidth = 140;
  const total = data.merged + data.open + data.discarded;
  const mergedWidth = total > 0 ? (data.merged / total) * maxBarWidth : 0;
  const openWidth = total > 0 ? (data.open / total) * maxBarWidth : 0;
  const discardedWidth = total > 0 ? (data.discarded / total) * maxBarWidth : 0;

  const svg = `<svg width="450" height="195" xmlns="http://www.w3.org/2000/svg" role="img" aria-labelledby="descId">
  <title id="titleId">ForkLift Insights for ${data.username}</title>
  <desc id="descId">${data.totalContributions} contributions with ${data.mergeRate}% merge rate</desc>

  <defs>
    <!-- Animated Background Gradient -->
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#6366f1;stop-opacity:1">
        <animate attributeName="stop-color" values="#6366f1;#8b5cf6;#6366f1" dur="4s" repeatCount="indefinite"/>
      </stop>
      <stop offset="50%" style="stop-color:#ec4899;stop-opacity:1">
        <animate attributeName="stop-color" values="#ec4899;#f43f5e;#ec4899" dur="4s" repeatCount="indefinite"/>
      </stop>
      <stop offset="100%" style="stop-color:#14b8a6;stop-opacity:1">
        <animate attributeName="stop-color" values="#14b8a6;#06b6d4;#14b8a6" dur="4s" repeatCount="indefinite"/>
      </stop>
    </linearGradient>

    <!-- Neon Cyan Gradient -->
    <linearGradient id="cyanGlow" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" style="stop-color:#06b6d4;stop-opacity:1"/>
      <stop offset="100%" style="stop-color:#0891b2;stop-opacity:1"/>
    </linearGradient>

    <!-- Neon Pink Gradient -->
    <linearGradient id="pinkGlow" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" style="stop-color:#ec4899;stop-opacity:1"/>
      <stop offset="100%" style="stop-color:#f43f5e;stop-opacity:1"/>
    </linearGradient>

    <!-- Yellow Gradient -->
    <linearGradient id="yellowGlow" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" style="stop-color:#fbbf24;stop-opacity:1"/>
      <stop offset="100%" style="stop-color:#f59e0b;stop-opacity:1"/>
    </linearGradient>

    <!-- Emerald Gradient -->
    <linearGradient id="emeraldGlow" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" style="stop-color:#10b981;stop-opacity:1"/>
      <stop offset="100%" style="stop-color:#059669;stop-opacity:1"/>
    </linearGradient>

    <!-- Strong Neon Glow Effect -->
    <filter id="neonGlow" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="4" result="coloredBlur"/>
      <feMerge>
        <feMergeNode in="coloredBlur"/>
        <feMergeNode in="coloredBlur"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>

    <!-- Soft Glow -->
    <filter id="softGlow">
      <feGaussianBlur stdDeviation="2" result="coloredBlur"/>
      <feMerge>
        <feMergeNode in="coloredBlur"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>

    <!-- Glassmorphism Blur -->
    <filter id="glass" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur in="SourceGraphic" stdDeviation="8"/>
    </filter>
  </defs>

  <!-- Dark Background -->
  <rect width="450" height="195" rx="16" fill="#0a0a0f"/>

  <!-- Animated Gradient Overlay -->
  <rect width="450" height="195" rx="16" fill="url(#bgGrad)" opacity="0.15"/>

  <!-- Decorative Dots Pattern -->
  <g opacity="0.3">
    <circle cx="50" cy="20" r="2" fill="#06b6d4">
      <animate attributeName="opacity" values="0.3;1;0.3" dur="3s" repeatCount="indefinite"/>
    </circle>
    <circle cx="100" cy="35" r="1.5" fill="#ec4899">
      <animate attributeName="opacity" values="0.3;1;0.3" dur="2.5s" repeatCount="indefinite" begin="0.5s"/>
    </circle>
    <circle cx="400" cy="25" r="2" fill="#14b8a6">
      <animate attributeName="opacity" values="0.3;1;0.3" dur="3.5s" repeatCount="indefinite" begin="1s"/>
    </circle>
    <circle cx="420" cy="50" r="1.5" fill="#fbbf24">
      <animate attributeName="opacity" values="0.3;1;0.3" dur="2s" repeatCount="indefinite" begin="0.2s"/>
    </circle>
  </g>

  <!-- Header with Bold Title -->
  <g>
    <text x="25" y="35" font-family="'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
          font-size="24" font-weight="900" fill="url(#cyanGlow)" filter="url(#neonGlow)">
      FORKLIFT
    </text>
    <text x="25" y="53" font-family="'Inter', sans-serif"
          font-size="12" fill="#64748b" font-weight="600" letter-spacing="1">
      @${data.username.toUpperCase()}
    </text>
  </g>

  <!-- Left Section: Circular Progress for Merge Rate -->
  <g transform="translate(80, 105)">
    <!-- Background Circle -->
    <circle cx="0" cy="0" r="${radius}" fill="none" stroke="#1e293b" stroke-width="8"/>

    <!-- Progress Circle with Animation -->
    <circle cx="0" cy="0" r="${radius}" fill="none" stroke="url(#emeraldGlow)" stroke-width="8"
            stroke-dasharray="${circumference}" stroke-dashoffset="${mergeOffset}"
            stroke-linecap="round" transform="rotate(-90)" filter="url(#neonGlow)">
      <animate attributeName="stroke-dashoffset" from="${circumference}" to="${mergeOffset}" dur="1.5s" fill="freeze"/>
    </circle>

    <!-- Center Text -->
    <text x="0" y="-5" font-family="'Inter', sans-serif" font-size="28" font-weight="900"
          fill="#10b981" text-anchor="middle" filter="url(#softGlow)">
      ${data.mergeRate}%
    </text>
    <text x="0" y="12" font-family="'Inter', sans-serif" font-size="9" fill="#64748b"
          text-anchor="middle" font-weight="700" letter-spacing="0.5">
      MERGE RATE
    </text>
  </g>

  <!-- Right Section: Stats Display -->
  <g transform="translate(180, 80)">
    <!-- Total Contributions -->
    <g>
      <text x="0" y="0" font-family="'Inter', sans-serif" font-size="11" fill="#64748b"
            font-weight="700" letter-spacing="1">
        TOTAL CONTRIBUTIONS
      </text>
      <text x="0" y="28" font-family="'Inter', sans-serif" font-size="42" font-weight="900"
            fill="url(#cyanGlow)" filter="url(#neonGlow)">
        ${data.totalContributions}
      </text>
    </g>

    <!-- PR Breakdown Bars -->
    <g transform="translate(0, 50)">
      <text x="0" y="0" font-family="'Inter', sans-serif" font-size="9" fill="#64748b"
            font-weight="700" letter-spacing="0.5">
        PR BREAKDOWN
      </text>

      <!-- Merged Bar -->
      <g transform="translate(0, 12)">
        <rect x="0" y="0" width="${maxBarWidth}" height="12" rx="6" fill="#1e293b"/>
        <rect x="0" y="0" width="${mergedWidth}" height="12" rx="6" fill="url(#emeraldGlow)" filter="url(#softGlow)">
          <animate attributeName="width" from="0" to="${mergedWidth}" dur="1s" fill="freeze"/>
        </rect>
        <text x="${maxBarWidth + 8}" y="9" font-family="'Inter', sans-serif" font-size="10"
              fill="#10b981" font-weight="700">
          ${data.merged} Merged
        </text>
      </g>

      <!-- Open Bar -->
      <g transform="translate(0, 28)">
        <rect x="0" y="0" width="${maxBarWidth}" height="12" rx="6" fill="#1e293b"/>
        <rect x="0" y="0" width="${openWidth}" height="12" rx="6" fill="url(#yellowGlow)" filter="url(#softGlow)">
          <animate attributeName="width" from="0" to="${openWidth}" dur="1s" fill="freeze" begin="0.2s"/>
        </rect>
        <text x="${maxBarWidth + 8}" y="9" font-family="'Inter', sans-serif" font-size="10"
              fill="#fbbf24" font-weight="700">
          ${data.open} Open
        </text>
      </g>

      <!-- Discarded Bar -->
      <g transform="translate(0, 44)">
        <rect x="0" y="0" width="${maxBarWidth}" height="12" rx="6" fill="#1e293b"/>
        <rect x="0" y="0" width="${discardedWidth}" height="12" rx="6" fill="url(#pinkGlow)" filter="url(#softGlow)">
          <animate attributeName="width" from="0" to="${discardedWidth}" dur="1s" fill="freeze" begin="0.4s"/>
        </rect>
        <text x="${maxBarWidth + 8}" y="9" font-family="'Inter', sans-serif" font-size="10"
              fill="#ec4899" font-weight="700">
          ${data.discarded} Closed
        </text>
      </g>
    </g>
  </g>

  <!-- Glowing Border -->
  <rect x="2" y="2" width="446" height="191" rx="14" fill="none" stroke="url(#bgGrad)"
        stroke-width="2" opacity="0.6" filter="url(#softGlow)"/>
</svg>`;

  return svg;
}

/**
 * Main execution
 */
async function main() {
  try {
    const stats = await fetchGitHubStats(USERNAME);
    const svg = generateSVG(stats);

    fs.writeFileSync('insights-card.svg', svg, 'utf8');
    console.log('\n✅ SVG card generated successfully: insights-card.svg');
    console.log(`   Total Contributions: ${stats.totalContributions}`);
    console.log(`   Merge Rate: ${stats.mergeRate}%`);
  } catch (error) {
    console.error('❌ Error generating card:', error.message);
    process.exit(1);
  }
}

main();
