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

        // Pagination state for each PR type
        this.paginationState = {
            openPRs: { page: 1, hasMore: true, loading: false, totalCount: 0 },
            discardedPRs: { page: 1, hasMore: true, loading: false, totalCount: 0 },
            mergedPRs: { page: 1, hasMore: true, loading: false, totalCount: 0 }
        };

        // Constants for PR states
        this.PR_STATES = {
            open: { emoji: '🟡', label: 'open', query: 'state:open' },
            discarded: { emoji: '🔴', label: 'discarded', query: 'state:closed+-is:merged' },
            merged: { emoji: '🟢', label: 'merged', query: 'state:closed+is:merged' }
        };

        // Virtualization settings
        this.ITEMS_PER_PAGE = 100;
        this.RENDER_BUFFER = 20; // Number of items to render beyond viewport

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
        // 1. If local file, strictly use hash
        if (window.location.protocol === 'file:') {
            const hash = window.location.hash;
            if (hash && hash.startsWith('#')) {
                return hash.substring(1).split('/')[0] || null;
            }
            return null;
        }

        // 2. If on web server (GitHub Pages), strictly use path
        const path = window.location.pathname;
        const segments = path.split('/').filter(Boolean);

        // On GitHub Pages: /opensource/username (segments[0] is repo name)
        if (segments.length >= 2 && segments[0].toLowerCase() === 'opensource') {
            return segments[1];
        }

        return null;
    }

    updateURL(username) {
        if (!username) return;

        if (window.location.protocol === 'file:') {
            // Use hash for local file support
            window.location.hash = username;
        } else {
            // Use clean path for hosted version
            const newPath = `/opensource/${username}`;
            // Update if path is different OR if there's an unnecessary hash to clear
            if (window.location.pathname !== newPath || window.location.hash) {
                window.history.pushState({ username }, '', newPath);
            }
        }
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
        // Handle hash changes (back/forward or manual editing)
        window.addEventListener('hashchange', () => {
            const username = this.getUsernameFromURL();
            if (username && username !== this.currentUser) {
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
        // Reset pagination state and data for initial load
        this.resetPaginationState();
        this.userData.openPRs = [];
        this.userData.discardedPRs = [];
        this.userData.mergedPRs = [];

        const baseURL = 'https://api.github.com/search/issues';
        const prTypes = ['openPRs', 'discardedPRs', 'mergedPRs'];
        const states = Object.keys(this.PR_STATES);

        // Fetch first page for all PR types in parallel
        await Promise.all(states.map(async (state, index) => {
            await this.fetchPRPage(username, prTypes[index], state, baseURL);
        }));
    }

    async fetchPRPage(username, prType, state, baseURL = 'https://api.github.com/search/issues') {
        const paginationState = this.paginationState[prType];

        // Don't fetch if already loading or no more results
        if (paginationState.loading || !paginationState.hasMore) {
            return;
        }

        paginationState.loading = true;
        this.updateLoadMoreButton(prType);

        try {
            const query = `author:${username}+-owner:${username}+type:pr+${this.PR_STATES[state].query}`;
            const url = `${baseURL}?q=${query}&per_page=${this.ITEMS_PER_PAGE}&page=${paginationState.page}`;
            const response = await this.fetchWithAuth(url);

            if (response.ok) {
                const data = await response.json();
                const newItems = data.items || [];

                // Update total count
                paginationState.totalCount = data.total_count || 0;

                // Append new items to existing data
                this.userData[prType] = [...this.userData[prType], ...newItems];

                // Check if there are more pages
                // GitHub Search API caps at 1000 results (10 pages)
                const hasMorePages = newItems.length === this.ITEMS_PER_PAGE &&
                                    paginationState.page < 10 &&
                                    this.userData[prType].length < paginationState.totalCount;

                paginationState.hasMore = hasMorePages;
                paginationState.page++;

                // Progressively render the new items
                this.renderPRGridProgressive(prType, state);
                this.updateTabCounts();
                this.renderInsights();
            }
        } catch (e) {
            console.warn(`Failed to fetch ${state} PRs page ${paginationState.page}:`, e);
        } finally {
            paginationState.loading = false;
            this.updateLoadMoreButton(prType);
        }
    }

    resetPaginationState() {
        Object.keys(this.paginationState).forEach(key => {
            this.paginationState[key] = { page: 1, hasMore: true, loading: false, totalCount: 0 };
        });
    }

    async loadMorePRs(prType) {
        const stateMap = {
            'openPRs': 'open',
            'discardedPRs': 'discarded',
            'mergedPRs': 'merged'
        };

        await this.fetchPRPage(this.currentUser, prType, stateMap[prType]);
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
        this.renderPRs();
        this.updateMetaTags();
    }

    updateMetaTags() {
        const profile = this.userData.profile;
        if (!profile) return;

        const username = profile.login;
        const displayName = profile.name || username;
        const totalPRs = this.userData.openPRs.length + this.userData.discardedPRs.length + this.userData.mergedPRs.length;
        const mergedPRs = this.userData.mergedPRs.length;

        // Create dynamic title and description
        const pageTitle = `@${username} - ${totalPRs} Open Source Contributions | ForkLift`;
        const pageDescription = `${displayName} has contributed ${totalPRs} pull requests to open source projects on GitHub, with ${mergedPRs} successfully merged. Track your GitHub contributions with ForkLift.`;
        const pageUrl = `https://ankitpandey2708.github.io/opensource/${username}`;
        const profileImage = profile.avatar_url || 'https://ankitpandey2708.github.io/opensource/og-image.png';

        // Update document title
        document.title = pageTitle;

        // Update meta description
        this.updateMetaTag('meta-description', 'content', pageDescription);

        // Update canonical URL
        this.updateMetaTag('canonical-url', 'href', pageUrl);

        // Update Open Graph tags
        this.updateMetaTag('og-title', 'content', pageTitle);
        this.updateMetaTag('og-description', 'content', pageDescription);
        this.updateMetaTag('og-url', 'content', pageUrl);
        this.updateMetaTag('og-image', 'content', profileImage);

        // Update Twitter Card tags
        this.updateMetaTag('twitter-title', 'content', pageTitle);
        this.updateMetaTag('twitter-description', 'content', pageDescription);
        this.updateMetaTag('twitter-image', 'content', profileImage);
    }

    updateMetaTag(id, attribute, value) {
        const element = document.getElementById(id);
        if (element) {
            element.setAttribute(attribute, value);
        }
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


    renderInsights() {
        const totalPRs = this.userData.openPRs.length + this.userData.discardedPRs.length + this.userData.mergedPRs.length;
        const mergeRate = totalPRs > 0 ? ((this.userData.mergedPRs.length / totalPRs) * 100).toFixed(1) : 0;
        const repoCount = this.userData.repos.length;

        // Toggle section visibility
        const showEncouragement = totalPRs === 0 || repoCount === 0;
        this.toggleElement('encouragementSection', showEncouragement);
        this.toggleElement('prsSection', totalPRs > 0);

        if (showEncouragement) {
            this.personalizeEncouragement();
        }

        const insights = document.getElementById('insights');
        const shouldShowInsights = totalPRs > 0;

        if (!shouldShowInsights) {
            insights.style.display = 'none';
            return;
        }

        const insightItems = [
            { label: 'Merge Rate', value: `${mergeRate}%`, show: totalPRs > 0 },
            { label: 'Total Contributions', value: totalPRs, show: totalPRs > 0 }
        ];

        const insightsHTML = insightItems
            .filter(item => item.show)
            .map(item => `<span>${item.label}: ${item.value}</span>`)
            .join('');

        insights.style.display = 'block';
        insights.innerHTML = `
            <div class="insight-stats">${insightsHTML}</div>
        `;
    }


    personalizeEncouragement() {
        const profile = this.userData.profile;
        if (!profile) return;

        const fullName = profile.name || profile.login;
        const name = fullName.split(' ')[0];
        const createdAt = new Date(profile.created_at);
        const now = new Date();

        // Calculate diff in years and months
        let years = now.getFullYear() - createdAt.getFullYear();
        let months = now.getMonth() - createdAt.getMonth();

        if (months < 0 || (months === 0 && now.getDate() < createdAt.getDate())) {
            years--;
            months += 12;
        }

        const subtitle = document.getElementById('encouragementSubtitle');
        if (subtitle) {
            let message = '';
            if (years >= 1) {
                message = `Hey ${name}, it's been almost ${years} ${years === 1 ? 'year' : 'years'} since you joined the GitHub community! Why not make today the day for your 1st contribution?`;
            } else {
                const displayMonths = months || 1; // Default to 1 month if brand new
                message = `Hey ${name}, you've been on GitHub for ${displayMonths} ${displayMonths === 1 ? 'month' : 'months'} now. Taking the leap into open source is a massive milestone—why not start with a small contribution today?`;
            }

            subtitle.textContent = `${message}`;
        }
    }

    updateTabCounts() {
        const getCountText = (prType) => {
            const count = this.userData[prType].length;
            const state = this.paginationState[prType];
            if (state.totalCount > count) {
                return `${count}/${state.totalCount}`;
            }
            return count;
        };

        document.getElementById('openCount').textContent = getCountText('openPRs');
        document.getElementById('discardedCount').textContent = getCountText('discardedPRs');
        document.getElementById('mergedCount').textContent = getCountText('mergedPRs');
    }

    renderPRs() {
        const prGrids = [
            { gridId: 'openPRsGrid', prs: this.userData.openPRs, state: 'open', prType: 'openPRs' },
            { gridId: 'discardedPRsGrid', prs: this.userData.discardedPRs, state: 'discarded', prType: 'discardedPRs' },
            { gridId: 'mergedPRsGrid', prs: this.userData.mergedPRs, state: 'merged', prType: 'mergedPRs' }
        ];

        prGrids.forEach(({ gridId, prs, state, prType }) => {
            this.renderPRGrid(gridId, prs, state);
            this.addLoadMoreButton(gridId, prType);
        });

        this.updateTabCounts();
    }

    renderPRGridProgressive(prType, state) {
        const gridMap = {
            'openPRs': 'openPRsGrid',
            'discardedPRs': 'discardedPRsGrid',
            'mergedPRs': 'mergedPRsGrid'
        };

        const gridId = gridMap[prType];
        const prs = this.userData[prType];

        // Full re-render with updated data
        this.renderPRGrid(gridId, prs, state);
        this.addLoadMoreButton(gridId, prType);
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

        // Group PRs by organization
        const groupedPRs = prs.reduce((groups, pr) => {
            const orgName = pr.repository_url.split('/').slice(-2)[0];
            if (!groups[orgName]) groups[orgName] = [];
            groups[orgName].push(pr);
            return groups;
        }, {});

        // Sort organizations by PR count (descending) and separate
        const sortedOrgs = Object.entries(groupedPRs)
            .sort((a, b) => b[1].length - a[1].length);

        const multiPROrgs = sortedOrgs.filter(([_, orgPRs]) => orgPRs.length > 1);
        const singlePROrgs = sortedOrgs.filter(([_, orgPRs]) => orgPRs.length === 1);

        let htmlContent = '';

        // Render organizations with 2+ PRs (with org headers)
        htmlContent += multiPROrgs.map(([orgName, orgPRs]) => {
            const itemsHTML = orgPRs.map(pr => {
                const repoName = pr.repository_url.split('/').pop();
                const createdDate = new Date(pr.created_at).toLocaleDateString();
                return `
                    <a href="${pr.html_url}" target="_blank" class="item-card">
                        <div class="item-title">
                            ${repoName} #${pr.number}
                            <span class="pr-state ${state}">${state.charAt(0).toUpperCase() + state.slice(1)}</span>
                        </div>
                        <p class="item-description">${pr.title}</p>
                        <div class="item-meta">
                            <span class="meta-item">Created ${createdDate}</span>
                            <span class="meta-item">💬 ${pr.comments || 0} comments</span>
                        </div>
                    </a>
                `;
            }).join('');

            return `
                <div class="org-group">
                    <div class="org-header">
                        <span class="org-icon">🏢</span>
                        <span class="org-name">${orgName}</span>
                        <span class="pr-count">${orgPRs.length} PRs</span>
                    </div>
                    <div class="items-grid">
                        ${itemsHTML}
                    </div>
                </div>
            `;
        }).join('');

        // Render "Other Contributions" section for single-PR orgs
        if (singlePROrgs.length > 0) {
            const singlePRsHTML = singlePROrgs.map(([orgName, orgPRs]) => {
                const pr = orgPRs[0];
                const repoName = pr.repository_url.split('/').pop();
                const createdDate = new Date(pr.created_at).toLocaleDateString();
                return `
                    <a href="${pr.html_url}" target="_blank" class="item-card">
                        <div class="item-title">
                            ${repoName} #${pr.number}
                            <span class="pr-state ${state}">${state.charAt(0).toUpperCase() + state.slice(1)}</span>
                        </div>
                        <p class="item-description">${pr.title}</p>
                        <div class="item-meta">
                            <span class="meta-item">Created ${createdDate}</span>
                            <span class="meta-item">💬 ${pr.comments || 0} comments</span>
                        </div>
                    </a>
                `;
            }).join('');

            htmlContent += `
                <div class="other-contributions">
                    <div class="other-contributions-header">
                        <span class="section-line"></span>
                        <span class="section-text">Other Contributions</span>
                        <span class="section-line"></span>
                    </div>
                    <div class="items-grid">
                        ${singlePRsHTML}
                    </div>
                </div>
            `;
        }

        grid.innerHTML = htmlContent;
    }

    addLoadMoreButton(gridId, prType) {
        const grid = document.getElementById(gridId);
        const paginationState = this.paginationState[prType];

        // Remove existing button if present
        const existingButton = grid.querySelector('.load-more-container');
        if (existingButton) {
            existingButton.remove();
        }

        // Only add button if there are more items to load
        if (paginationState.hasMore || paginationState.loading) {
            const buttonContainer = document.createElement('div');
            buttonContainer.className = 'load-more-container';
            buttonContainer.innerHTML = `
                <button class="load-more-btn" data-pr-type="${prType}" ${paginationState.loading ? 'disabled' : ''}>
                    ${paginationState.loading ?
                        '<span class="loading-spinner"></span> Loading...' :
                        `Load More (${this.userData[prType].length}/${paginationState.totalCount})`
                    }
                </button>
            `;

            grid.appendChild(buttonContainer);

            // Add click handler
            const button = buttonContainer.querySelector('.load-more-btn');
            button.addEventListener('click', () => this.loadMorePRs(prType));
        }
    }

    updateLoadMoreButton(prType) {
        const gridMap = {
            'openPRs': 'openPRsGrid',
            'discardedPRs': 'discardedPRsGrid',
            'mergedPRs': 'mergedPRsGrid'
        };

        const gridId = gridMap[prType];
        this.addLoadMoreButton(gridId, prType);
    }

    switchTab(tabName) {
        this.toggleClass('.tab', 'active', `[data-tab="${tabName}"]`);
        this.toggleClass('.tab-content', 'active', `#${tabName}Content`);
    }

    toggleClass(selector, className, activeSelector) {
        document.querySelectorAll(selector).forEach(el => el.classList.remove(className));
        const activeEl = document.querySelector(activeSelector);
        if (activeEl) activeEl.classList.add(className);
    }

    toggleElement(id, show) {
        document.getElementById(id).style.display = show ? 'block' : 'none';
    }

    showTokenModal(errorMessage = '') {
        const modal = document.getElementById('tokenModal');
        const input = document.getElementById('tokenInput');
        const error = document.getElementById('tokenError');

        modal.classList.add('active');
        input.value = '';
        input.focus();

        if (errorMessage) {
            error.textContent = errorMessage;
            error.style.display = 'block';
        } else {
            error.style.display = 'none';
        }
    }

    hideTokenModal() {
        document.getElementById('tokenModal').classList.remove('active');
        document.getElementById('tokenError').style.display = 'none';
        this.pendingRequest = null;
    }

    handleTokenSubmit() {
        const input = document.getElementById('tokenInput');
        const errorContainer = document.getElementById('tokenError');
        const token = input.value.trim();

        // Basic validation
        if (!token) {
            errorContainer.textContent = 'Please enter a GitHub token';
            errorContainer.style.display = 'block';
            return;
        }

        if (token.length < 20) {
            errorContainer.textContent = 'Token seems too short. Please check it.';
            errorContainer.style.display = 'block';
            return;
        }

        this.githubToken = token;
        this.saveToken(token);
        this.updateTokenIndicator();
        errorContainer.style.display = 'none';

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

        if (this.githubToken) {
            // Using Bearer prefix as it is preferred for modern PATs
            headers['Authorization'] = `Bearer ${this.githubToken}`;
        }

        return headers;
    }

    async fetchWithAuth(url) {
        const response = await fetch(url, {
            headers: this.getFetchHeaders()
        });

        if ((response.status === 401 || response.status === 403)) {
            // If we have a token and it failed, it might be expired/invalid
            if (this.githubToken) {
                console.warn(`Request failed with ${response.status}. Clearing token and retrying.`);
                this.clearToken();
            }

            return new Promise((resolve, reject) => {
                this.pendingRequest = async () => {
                    try {
                        const retryResponse = await fetch(url, {
                            headers: this.getFetchHeaders()
                        });

                        if (retryResponse.ok) {
                            this.hideTokenModal();
                            resolve(retryResponse);
                        } else {
                            // If it still fails, show error in modal
                            this.showTokenModal(`Request failed (${retryResponse.status}). Please check your token.`);
                        }
                    } catch (error) {
                        this.showTokenModal('Network error. Please try again.');
                        reject(error);
                    }
                };

                const message = response.status === 403
                    ? 'API rate limit reached or access denied.'
                    : 'Your GitHub token is invalid or expired.';
                this.showTokenModal(`${message} Please provide a valid token.`);
            });
        }

        return response;
    }
}

// Initialize the dashboard when the page loads
document.addEventListener('DOMContentLoaded', () => {
    new GitHubDashboard();
});
