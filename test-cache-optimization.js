// Test script to verify cache optimization
// This demonstrates the size reduction from sanitization

// Mock data similar to what GitHub API returns
const mockUserData = {
    profile: {
        // Only these 6 fields are used:
        login: "monilpokar",
        avatar_url: "https://avatars.githubusercontent.com/u/54702864?v=4",
        name: null,
        created_at: "2019-08-30T07:30:17Z",
        location: "India",
        company: null,

        // All these fields are NOT used (will be filtered out):
        id: 54702864,
        node_id: "MDQ6VXNlcjU0NzAyODY0",
        gravatar_id: "",
        url: "https://api.github.com/users/monilpokar",
        html_url: "https://github.com/monilpokar",
        followers_url: "https://api.github.com/users/monilpokar/followers",
        following_url: "https://api.github.com/users/monilpokar/following{/other_user}",
        gists_url: "https://api.github.com/users/monilpokar/gists{/gist_id}",
        starred_url: "https://api.github.com/users/monilpokar/starred{/owner}{/repo}",
        subscriptions_url: "https://api.github.com/users/monilpokar/subscriptions",
        organizations_url: "https://api.github.com/users/monilpokar/orgs",
        repos_url: "https://api.github.com/users/monilpokar/repos",
        events_url: "https://api.github.com/users/monilpokar/events{/privacy}",
        received_events_url: "https://api.github.com/users/monilpokar/received_events",
        type: "User",
        user_view_type: "public",
        site_admin: false,
        blog: "monilpokar.github.io",
        email: null,
        hireable: null,
        bio: "Software Engineer.\r\nCurrently working on developing systems that makes our money work for us",
        twitter_username: null,
        public_repos: 3,
        public_gists: 0,
        followers: 0,
        following: 0,
        updated_at: "2024-12-20T13:11:57Z"
    },
    repos: [
        // Each repo has 50+ fields, only length is used
        { id: 369974987, name: "monilpokar.github.io", full_name: "monilpokar/monilpokar.github.io", /* ...50+ more fields */ },
        { id: 367019283, name: "monilpokar", full_name: "monilpokar/monilpokar", /* ...50+ more fields */ },
        { id: 205329220, name: "hello-world", full_name: "monilpokar/hello-world", /* ...50+ more fields */ }
    ],
    openPRs: [],
    discardedPRs: [],
    mergedPRs: []
};

// Sanitization function (same as in script.js)
function sanitizeDataForCache(userData) {
    const sanitized = {
        profile: null,
        reposCount: 0,
        openPRs: [],
        discardedPRs: [],
        mergedPRs: []
    };

    // Keep only essential profile fields
    if (userData.profile) {
        sanitized.profile = {
            login: userData.profile.login,
            avatar_url: userData.profile.avatar_url,
            name: userData.profile.name,
            created_at: userData.profile.created_at,
            location: userData.profile.location,
            company: userData.profile.company
        };
    }

    // Keep only repos count, not the full array
    sanitized.reposCount = userData.repos?.length || 0;

    // Keep only essential PR fields
    const sanitizePR = (pr) => ({
        repository_url: pr.repository_url,
        created_at: pr.created_at,
        html_url: pr.html_url,
        number: pr.number,
        title: pr.title,
        comments: pr.comments
    });

    sanitized.openPRs = userData.openPRs?.map(sanitizePR) || [];
    sanitized.discardedPRs = userData.discardedPRs?.map(sanitizePR) || [];
    sanitized.mergedPRs = userData.mergedPRs?.map(sanitizePR) || [];

    return sanitized;
}

// Calculate sizes
const originalSize = JSON.stringify(mockUserData).length;
const sanitizedData = sanitizeDataForCache(mockUserData);
const sanitizedSize = JSON.stringify(sanitizedData).length;
const reduction = ((1 - sanitizedSize / originalSize) * 100).toFixed(2);

console.log('\n=== Cache Optimization Test ===\n');
console.log('Original data size:', originalSize, 'bytes');
console.log('Sanitized data size:', sanitizedSize, 'bytes');
console.log('Size reduction:', reduction + '%');
console.log('\nOriginal structure:');
console.log('- Profile fields:', Object.keys(mockUserData.profile).length);
console.log('- Repos array length:', mockUserData.repos.length);
console.log('\nSanitized structure:');
console.log('- Profile fields:', Object.keys(sanitizedData.profile).length);
console.log('- Repos stored as count:', sanitizedData.reposCount);
console.log('\n✓ Sanitization working correctly!\n');
