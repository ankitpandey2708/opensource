class GitHubDashboard {
    constructor() {
        this.currentUser = null;
        this.githubToken = this.loadToken();
        this.pendingRequest = null;
        this.isLoadingFromURL = false;
        this.userData = {
            profile: null,
            repos: [],
            openPRs: [],
            discardedPRs: [],
            mergedPRs: []
        };

        // Constants for PR states
        this.PR_STATES = {
            open: { emoji: '🟡', label: 'open', query: 'state:open' },
            discarded: { emoji: '🔴', label: 'discarded', query: 'state:closed+-is:merged' },
            merged: { emoji: '🟢', label: 'merged', query: 'state:closed+is:merged' }
        };

        this.initializeEventListeners();
        this.updateTokenIndicator();
        this.setupBrowserNavigation();
        this.loadUsernameFromURL();
    }

    loadToken() {
        try {
            return localStorage.getItem('github_token') || null;
        } catch (e) {
            console.warn('Failed to load token from localStorage:', e);
            return null;
        }
    }

    saveToken(token) {
        try {
            if (token) {
                localStorage.setItem('github_token', token);
            } else {
                localStorage.removeItem('github_token');
            }
        } catch (e) {
            console.warn('Failed to save token to localStorage:', e);
        }
    }

    updateTokenIndicator() {
        const indicator = document.getElementById('tokenIndicator');
        if (indicator) {
            if (this.githubToken) {
                indicator.style.display = 'flex';
            } else {
                indicator.style.display = 'none';
            }
        }
    }

    getUsernameFromURL() {
        const path = window.location.pathname;
        // Remove leading/trailing slashes and get the last segment
        const segments = path.split('/').filter(segment => segment.length > 0);

        // For path like /opensource/<username>, we want the last segment
        // Skip if the last segment is 'opensource' or 'index.html'
        if (segments.length > 0) {
            const lastSegment = segments[segments.length - 1];
            if (lastSegment !== 'opensource' && lastSegment !== 'index.html' && !lastSegment.endsWith('.html')) {
                return lastSegment;
            }
        }
        return null;
    }

    updateURL(username) {
        if (!username) return;

        const path = window.location.pathname;
        const basePath = path.substring(0, path.lastIndexOf('/') + 1);
        const newPath = basePath + username;

        // Update URL without reloading the page
        window.history.pushState({ username }, '', newPath);
    }

    loadUsernameFromURL() {
        const username = this.getUsernameFromURL();
        if (username) {
            // Prefill the search box
            document.getElementById('usernameInput').value = username;
            // Set flag to prevent URL update during initial load
            this.isLoadingFromURL = true;
            // Automatically trigger analysis
            this.analyzeUser();
        }
    }

    setupBrowserNavigation() {
        // Handle browser back/forward buttons
        window.addEventListener('popstate', (event) => {
            const username = this.getUsernameFromURL();
            if (username) {
                document.getElementById('usernameInput').value = username;
                this.isLoadingFromURL = true;
                this.analyzeUser();
            }
        });
    }

    initializeEventListeners() {
        const handlers = [
            { id: 'analyzeBtn', event: 'click', handler: () => this.analyzeUser() },
            { id: 'usernameInput', event: 'keypress', handler: (e) => e.key === 'Enter' && this.analyzeUser() },
            { id: 'retryBtn', event: 'click', handler: () => this.analyzeUser() },
            { id: 'submitTokenBtn', event: 'click', handler: () => this.handleTokenSubmit() },
            { id: 'cancelTokenBtn', event: 'click', handler: () => this.hideTokenModal() },
            { id: 'clearTokenBtn', event: 'click', handler: () => this.clearToken() }
        ];

        handlers.forEach(({ id, event, handler }) => {
            document.getElementById(id).addEventListener(event, handler);
        });

        // Token input enter key
        document.getElementById('tokenInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.handleTokenSubmit();
        });

        // Tab switching
        document.querySelectorAll('.tab').forEach(tab => {
            tab.addEventListener('click', () => this.switchTab(tab.dataset.tab));
        });

        // Stats card interaction
        document.addEventListener('click', (e) => {
            const card = e.target.closest('.stat-card');
            if (card?.dataset.type && card.dataset.type !== 'repos') {
                this.switchTab(card.dataset.type);
            }
        });
    }

    async analyzeUser() {
        const username = document.getElementById('usernameInput').value.trim();
        if (!username) {
            this.showError('Please enter a GitHub username', '');
            return;
        }

        this.currentUser = username;
        this.setState('loading');

        // Update URL with the username (skip if loading from URL initially)
        if (!this.isLoadingFromURL) {
            this.updateURL(username);
        }
        this.isLoadingFromURL = false;

        try {
            await this.fetchAllData(username);
            this.setState('dashboard');
            this.renderDashboard();
        } catch (error) {
            console.error('Error fetching data:', error);
            this.showError('Failed to fetch GitHub data', error.message);
        }
    }

    async fetchAllData(username) {
        const baseURL = 'https://api.github.com';

        // Fetch user profile
        const profileResponse = await this.fetchWithAuth(`${baseURL}/users/${username}`);
        if (!profileResponse.ok) {
            throw new Error(profileResponse.status === 404 ? 'User not found' : 'Failed to fetch user profile');
        }
        this.userData.profile = await profileResponse.json();

        // Fetch repositories
        const reposResponse = await this.fetchWithAuth(`${baseURL}/users/${username}/repos?type=source&sort=updated&per_page=100`);
        if (!reposResponse.ok) {
            throw new Error('Failed to fetch repositories');
        }
        this.userData.repos = await reposResponse.json();

        // Fetch PRs (using search API)
        await this.fetchPRs(username);
    }

    async fetchPRs(username) {
        const baseURL = 'https://api.github.com/search/issues';
        const prTypes = ['openPRs', 'discardedPRs', 'mergedPRs'];
        const states = Object.keys(this.PR_STATES);

        await Promise.all(states.map(async (state, index) => {
            try {
                const query = `author:${username}+-owner:${username}+type:pr+${this.PR_STATES[state].query}`;
                const response = await this.fetchWithAuth(`${baseURL}?q=${query}&per_page=100`);
                if (response.ok) {
                    const data = await response.json();
                    this.userData[prTypes[index]] = data.items || [];
                }
            } catch (e) {
                console.warn(`Failed to fetch ${state} PRs:`, e);
                this.userData[prTypes[index]] = [];
            }
        }));
    }

    setState(state) {
        const states = {
            loading: { loading: 'block', error: 'none', dashboard: 'none', button: true },
            error: { loading: 'none', error: 'block', dashboard: 'none', button: false },
            dashboard: { loading: 'none', error: 'none', dashboard: 'block', button: false }
        };

        const config = states[state];
        document.getElementById('loadingState').style.display = config.loading;
        document.getElementById('errorState').style.display = config.error;
        document.getElementById('dashboardContent').style.display = config.dashboard;
        document.getElementById('analyzeBtn').disabled = config.button;
    }

    showError(title, message) {
        document.getElementById('errorTitle').textContent = title;
        document.getElementById('errorMessage').textContent = message;
        this.setState('error');
    }

    renderDashboard() {
        this.renderUserProfile();
        this.renderInsights();
        this.renderStatsCards();
        this.renderRepositoryStars();
        this.renderPRs();
    }

    renderUserProfile() {
        const profile = this.userData.profile;
        const joinDate = new Date(profile.created_at).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long'
        });

        const metaItems = [
            { icon: '📅', value: `Joined ${joinDate}`, show: true },
            { icon: '📍', value: profile.location, show: !!profile.location },
            { icon: '🏢', value: profile.company, show: !!profile.company }
        ];

        const metaHTML = metaItems
            .filter(item => item.show)
            .map(item => `<span>${item.icon} ${item.value}</span>`)
            .join('');

        document.getElementById('userProfile').innerHTML = `
            <img src="${profile.avatar_url}" alt="${profile.name || profile.login}" class="user-avatar">
            <div class="user-info">
                <h2>@${profile.login}</h2>
                <div class="user-meta">${metaHTML}</div>
            </div>
        `;
    }

    calculateMedian(repos) {
        const starredRepos = repos.filter(repo => repo.stargazers_count > 0);
        if (starredRepos.length === 0) return { median: 0, totalStars: 0, showStars: false };

        const starCounts = starredRepos.map(repo => repo.stargazers_count).sort((a, b) => a - b);
        const medianIndex = Math.floor(starCounts.length / 2);
        const median = starCounts.length % 2 === 0
            ? (starCounts[medianIndex - 1] + starCounts[medianIndex]) / 2
            : starCounts[medianIndex];

        const totalStars = repos.reduce((sum, repo) => sum + repo.stargazers_count, 0);
        return { median, totalStars, showStars: totalStars > median };
    }

    renderInsights() {
        const totalPRs = this.userData.openPRs.length + this.userData.discardedPRs.length + this.userData.mergedPRs.length;
        const mergeRate = totalPRs > 0 ? ((this.userData.mergedPRs.length / totalPRs) * 100).toFixed(1) : 0;
        const { showStars, totalStars } = this.calculateMedian(this.userData.repos);
        const repoCount = this.userData.repos.length;

        // Toggle section visibility
        this.toggleElement('encouragementSection', totalPRs === 0 || repoCount === 0);
        this.toggleElement('prsSection', totalPRs > 0);

        const insights = document.getElementById('insights');
        const shouldShowInsights = totalPRs > 0 || showStars;

        if (!shouldShowInsights) {
            insights.style.display = 'none';
            return;
        }

        const insightItems = [
            { label: 'Merge Rate', value: `${mergeRate}%`, show: totalPRs > 0 },
            { label: 'Total Stars', value: totalStars, show: showStars },
            { label: 'Total Contributions', value: totalPRs, show: totalPRs > 0 }
        ];

        const insightsHTML = insightItems
            .filter(item => item.show)
            .map(item => `<span>${item.label}: ${item.value}</span>`)
            .join('');

        insights.style.display = 'block';
        insights.innerHTML = `
            <h3>📊 Key Insights</h3>
            <div class="insight-stats">${insightsHTML}</div>
        `;
    }

    renderStatsCards() {
        const stats = [
            { type: 'repos', icon: '📦', count: this.userData.repos.length, label: 'Repositories' },
            { type: 'open', icon: '🟡', count: this.userData.openPRs.length, label: 'Open PRs' },
            { type: 'discarded', icon: '🔴', count: this.userData.discardedPRs.length, label: 'Discarded PRs' },
            { type: 'merged', icon: '🟢', count: this.userData.mergedPRs.length, label: 'Merged PRs' }
        ];

        const totalContributions = stats.slice(1).reduce((sum, s) => sum + s.count, 0);
        const statsGrid = document.getElementById('statsGrid');

        if (totalContributions === 0 && stats[0].count === 0) {
            statsGrid.style.display = 'none';
            return;
        }

        statsGrid.style.display = 'grid';
        statsGrid.innerHTML = stats.map(({ type, icon, count, label }) => `
            <div class="stat-card" data-type="${type}">
                <div class="stat-icon">${icon}</div>
                <div class="stat-number">${count}</div>
                <div class="stat-label">${label}</div>
            </div>
        `).join('');

        // Update tab counts
        ['open', 'discarded', 'merged'].forEach((type, i) => {
            document.getElementById(`${type}Count`).textContent = stats[i + 1].count;
        });
    }

    renderRepositoryStars() {
        const starredRepos = this.userData.repos
            .filter(repo => repo.stargazers_count > 0)
            .sort((a, b) => b.stargazers_count - a.stargazers_count);

        const reposSection = document.getElementById('reposSection');
        if (starredRepos.length === 0) {
            reposSection.style.display = 'none';
            return;
        }

        const { median } = this.calculateMedian(this.userData.repos);
        const aboveMedianRepos = starredRepos.filter(repo => repo.stargazers_count > median);

        if (aboveMedianRepos.length === 0) {
            reposSection.style.display = 'none';
            return;
        }

        reposSection.style.display = 'block';
        document.getElementById('reposGrid').innerHTML = aboveMedianRepos.map((repo, index) => `
            <div class="repo-card">
                <div class="repo-card-header">
                    <span class="repo-rank">#${index + 1}</span>
                </div>
                <a href="${repo.html_url}" target="_blank" class="repo-name">${repo.name}</a>
                <div class="repo-description">${repo.description || '<em>No description</em>'}</div>
                <div class="star-count">⭐ ${repo.stargazers_count.toLocaleString()}</div>
            </div>
        `).join('');
    }

    renderPRs() {
        const prGrids = [
            { gridId: 'openPRsGrid', prs: this.userData.openPRs, state: 'open' },
            { gridId: 'discardedPRsGrid', prs: this.userData.discardedPRs, state: 'discarded' },
            { gridId: 'mergedPRsGrid', prs: this.userData.mergedPRs, state: 'merged' }
        ];

        prGrids.forEach(({ gridId, prs, state }) => this.renderPRGrid(gridId, prs, state));
    }

    renderPRGrid(gridId, prs, state) {
        const grid = document.getElementById(gridId);
        const stateConfig = this.PR_STATES[state];

        if (prs.length === 0) {
            grid.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">${stateConfig.emoji}</div>
                    <h4>No ${stateConfig.label} pull requests</h4>
                    <p>No ${stateConfig.label} pull requests found for this user.</p>
                </div>
            `;
            return;
        }

        grid.innerHTML = prs.map(pr => {
            const repoName = pr.repository_url.split('/').slice(-2).join('/');
            const createdDate = new Date(pr.created_at).toLocaleDateString();
            return `
                <div class="item-card">
                    <a href="${pr.html_url}" target="_blank" class="item-title">
                        ${repoName} #${pr.number}
                        <span class="pr-state ${state}">${state.charAt(0).toUpperCase() + state.slice(1)}</span>
                    </a>
                    <p class="item-description">${pr.title}</p>
                    <div class="item-meta">
                        <span class="meta-item">Created ${createdDate}</span>
                        <span class="meta-item">💬 ${pr.comments || 0} comments</span>
                    </div>
                </div>
            `;
        }).join('');
    }

    switchTab(tabName) {
        this.toggleClass('.tab', 'active', `[data-tab="${tabName}"]`);
        this.toggleClass('.tab-content', 'active', `#${tabName}Content`);
        this.toggleClass('.stat-card', 'active', `[data-type="${tabName}"]`);
    }

    toggleClass(selector, className, activeSelector) {
        document.querySelectorAll(selector).forEach(el => el.classList.remove(className));
        const activeEl = document.querySelector(activeSelector);
        if (activeEl) activeEl.classList.add(className);
    }

    toggleElement(id, show) {
        document.getElementById(id).style.display = show ? 'block' : 'none';
    }

    showTokenModal() {
        document.getElementById('tokenModal').classList.add('active');
        document.getElementById('tokenInput').value = '';
        document.getElementById('tokenInput').focus();
    }

    hideTokenModal() {
        document.getElementById('tokenModal').classList.remove('active');
        this.pendingRequest = null;
    }

    handleTokenSubmit() {
        const token = document.getElementById('tokenInput').value.trim();
        if (!token) {
            alert('Please enter a valid GitHub token');
            return;
        }

        this.githubToken = token;
        this.saveToken(token);
        this.updateTokenIndicator();
        this.hideTokenModal();

        // Retry the pending request
        if (this.pendingRequest) {
            this.pendingRequest();
        }
    }

    clearToken() {
        this.githubToken = null;
        this.saveToken(null);
        this.updateTokenIndicator();
    }

    getFetchHeaders() {
        const headers = {
            'Accept': 'application/vnd.github.v3+json'
        };

        // Include token in all requests if available
        // Token persists across page reloads via localStorage
        if (this.githubToken) {
            headers['Authorization'] = `token ${this.githubToken}`;
        }

        return headers;
    }

    async fetchWithAuth(url) {
        // All API requests use this method, ensuring consistent token usage
        const response = await fetch(url, {
            headers: this.getFetchHeaders()
        });

        // Handle 403 rate limit error - prompt for token only if not already set
        if (response.status === 403 && !this.githubToken) {
            return new Promise((resolve, reject) => {
                this.pendingRequest = async () => {
                    try {
                        // Retry with token after user provides it
                        const retryResponse = await fetch(url, {
                            headers: this.getFetchHeaders()
                        });
                        resolve(retryResponse);
                    } catch (error) {
                        reject(error);
                    }
                };
                this.showTokenModal();
            });
        }

        return response;
    }
}

// Initialize the dashboard when the page loads
document.addEventListener('DOMContentLoaded', () => {
    new GitHubDashboard();
});
