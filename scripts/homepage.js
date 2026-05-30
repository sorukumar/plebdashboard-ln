import { parquetRead } from 'https://cdn.jsdelivr.net/npm/hyparquet@1.17.1/+esm';

class HomepageManager {
    constructor() {
        this.nodeData = [];
        this.searchIndex = new Map(); // For faster searching
        this.debounceTimer = null;
        this.selectedSuggestionIndex = -1;
        this.featuredNodes = [];
        this.featuredPage = 0;
        this.FEATURED_PAGE_SIZE = 6;
        this.init();
    }

    async init() {
        await this.loadNodeData();
        this.buildSearchIndex();
        this.setupEventListeners();
        this.loadTrendingNodes();
        await this.loadFeaturedNodes();
        this.renderFeaturedNodes();
    }

    async loadNodeData() {
        try {
            const response = await fetch('data/node_rank.parquet');
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            
            const arrayBuffer = await response.arrayBuffer();
            
            await parquetRead({
                file: arrayBuffer,
                onComplete: (result) => {
                    const columns = [
                        'pleb_rank', 'channels_rank', 'capacity_rank', 'weighted_degree_rank',
                        'betweenness_rank', 'eigenvector_rank', 'pagerank', 'alias',
                        'node_type', 'total_capacity', 'num_channels', 'last_seen', 'pub_key'
                    ];
                    
                    if (Array.isArray(result) && result.length > 0) {
                        this.nodeData = result.map(row =>
                            Object.fromEntries(columns.map((col, i) => [col, row[i]]))
                        ).filter(node => node.pub_key); // Only include nodes with pubkey
                    }
                },
                onError: (error) => console.error('Error loading node data:', error)
            });
        } catch (error) {
            console.error('Failed to load node data:', error);
        }
    }

    // Build search index for faster lookups
    buildSearchIndex() {
        this.searchIndex.clear();
        this.nodeData.forEach(node => {
            // Index by alias (if exists)
            if (node.alias) {
                const aliasKey = node.alias.toLowerCase();
                if (!this.searchIndex.has(aliasKey)) {
                    this.searchIndex.set(aliasKey, []);
                }
                this.searchIndex.get(aliasKey).push(node);
                
                // Also index partial alias matches for better search
                for (let i = 1; i <= aliasKey.length; i++) {
                    const partial = aliasKey.substring(0, i);
                    if (!this.searchIndex.has(partial)) {
                        this.searchIndex.set(partial, []);
                    }
                    this.searchIndex.get(partial).push(node);
                }
            }
            
            // Index by pubkey
            if (node.pub_key) {
                const pubkeyKey = node.pub_key.toLowerCase();
                if (!this.searchIndex.has(pubkeyKey)) {
                    this.searchIndex.set(pubkeyKey, []);
                }
                this.searchIndex.get(pubkeyKey).push(node);
                
                // Index partial pubkey matches (first 8, 16, 32 characters)
                [8, 16, 32, 48].forEach(len => {
                    if (pubkeyKey.length >= len) {
                        const partial = pubkeyKey.substring(0, len);
                        if (!this.searchIndex.has(partial)) {
                            this.searchIndex.set(partial, []);
                        }
                        this.searchIndex.get(partial).push(node);
                    }
                });
            }
        });
    }

    setupEventListeners() {
        const searchInput = document.getElementById('nodeSearchInput');
        const searchButton = document.getElementById('searchButton');
        const suggestionsContainer = document.getElementById('searchSuggestions');

        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                this.selectedSuggestionIndex = -1;
                this.handleSearchInput(e.target.value);
            });

            searchInput.addEventListener('keydown', (e) => {
                this.handleKeyNavigation(e);
            });

            searchInput.addEventListener('focus', (e) => {
                if (e.target.value.trim()) {
                    this.handleSearchInput(e.target.value);
                }
            });

            // Hide suggestions when clicking outside
            document.addEventListener('click', (e) => {
                if (!searchInput.contains(e.target) && !suggestionsContainer?.contains(e.target)) {
                    this.hideSuggestions();
                }
            });
        }

        if (searchButton) {
            searchButton.addEventListener('click', () => {
                this.performSearch(searchInput.value);
            });
        }
    }

    handleKeyNavigation(e) {
        const suggestionsContainer = document.getElementById('searchSuggestions');
        const suggestions = suggestionsContainer?.querySelectorAll('.suggestion-item');
        
        if (!suggestions || suggestions.length === 0) {
            if (e.key === 'Enter') {
                e.preventDefault();
                this.performSearch(e.target.value);
            }
            return;
        }

        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                this.selectedSuggestionIndex = Math.min(this.selectedSuggestionIndex + 1, suggestions.length - 1);
                this.updateSuggestionHighlight(suggestions);
                break;
            case 'ArrowUp':
                e.preventDefault();
                this.selectedSuggestionIndex = Math.max(this.selectedSuggestionIndex - 1, -1);
                this.updateSuggestionHighlight(suggestions);
                break;
            case 'Enter':
                e.preventDefault();
                if (this.selectedSuggestionIndex >= 0 && suggestions[this.selectedSuggestionIndex]) {
                    const pubkey = suggestions[this.selectedSuggestionIndex].dataset.pubkey;
                    this.selectSuggestion(pubkey);
                } else {
                    this.performSearch(e.target.value);
                }
                break;
            case 'Escape':
                this.hideSuggestions();
                e.target.blur();
                break;
        }
    }

    updateSuggestionHighlight(suggestions) {
        suggestions.forEach((suggestion, index) => {
            suggestion.classList.toggle('highlighted', index === this.selectedSuggestionIndex);
        });
    }

    handleSearchInput(searchTerm) {
        clearTimeout(this.debounceTimer);
        
        if (!searchTerm.trim()) {
            this.hideSuggestions();
            return;
        }

        // Reduce debounce time for better responsiveness
        this.debounceTimer = setTimeout(() => {
            this.showSuggestions(searchTerm);
        }, 150);
    }

    showSuggestions(searchTerm) {
        const suggestionsContainer = document.getElementById('searchSuggestions');
        if (!suggestionsContainer || !this.nodeData.length) return;

        const searchLower = searchTerm.toLowerCase().trim();
        
        // Use search index for faster lookups
        let matches = new Set();
        
        // Direct index matches
        if (this.searchIndex.has(searchLower)) {
            this.searchIndex.get(searchLower).forEach(node => matches.add(node));
        }
        
        // Fallback to partial matching if no direct matches
        if (matches.size === 0) {
            this.searchIndex.forEach((nodes, key) => {
                if (key.includes(searchLower) && matches.size < 8) {
                    nodes.forEach(node => matches.add(node));
                }
            });
        }

        // Convert Set to Array and limit results
        const matchesArray = Array.from(matches).slice(0, 6);

        if (matchesArray.length === 0) {
            this.hideSuggestions();
            return;
        }

        // Sort matches by relevance (exact alias matches first, then by rank)
        matchesArray.sort((a, b) => {
            const aAliasExact = (a.alias || '').toLowerCase() === searchLower;
            const bAliasExact = (b.alias || '').toLowerCase() === searchLower;
            
            if (aAliasExact && !bAliasExact) return -1;
            if (!aAliasExact && bAliasExact) return 1;
            
            // Sort by pleb_rank if available
            const aRank = Number(a.pleb_rank) || 999999;
            const bRank = Number(b.pleb_rank) || 999999;
            return aRank - bRank;
        });

        suggestionsContainer.innerHTML = matchesArray.map((node, index) => {
            const alias = node.alias || 'Unknown';
            const pubkey = node.pub_key || '';
            const rank = node.pleb_rank ? `#${node.pleb_rank}` : '';
            
            // Highlight matching text
            const aliasHighlighted = this.highlightMatch(alias, searchTerm);
            const pubkeyDisplay = pubkey.substring(0, 16) + '...';
            
            return `
                <div class="suggestion-item" data-pubkey="${pubkey}" onclick="homepageManager.selectSuggestion('${pubkey}')">
                    <div class="suggestion-main">
                        <span class="suggestion-alias">${aliasHighlighted}</span>
                        ${rank ? `<span class="suggestion-rank">${rank}</span>` : ''}
                    </div>
                    <span class="suggestion-pubkey">${pubkeyDisplay}</span>
                </div>
            `;
        }).join('');

        // Position the dropdown correctly using JavaScript
        this.positionDropdown();
        suggestionsContainer.style.display = 'block';
        this.selectedSuggestionIndex = -1;
    }

    positionDropdown() {
        // CSS now handles positioning correctly with relative/absolute positioning
        // No need for JavaScript positioning calculations
        return;
    }

    highlightMatch(text, searchTerm) {
        if (!searchTerm || !text) return text;
        
        const regex = new RegExp(`(${searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
        return text.replace(regex, '<mark>$1</mark>');
    }

    hideSuggestions() {
        const suggestionsContainer = document.getElementById('searchSuggestions');
        if (suggestionsContainer) {
            suggestionsContainer.style.display = 'none';
        }
    }

    selectSuggestion(pubkey) {
        this.hideSuggestions();
        this.navigateToProfile(pubkey);
    }

    performSearch(searchTerm) {
        if (!searchTerm.trim()) return;

        const searchLower = searchTerm.toLowerCase().trim();
        
        // Try exact matches first
        let match = this.nodeData.find(node => {
            const alias = (node.alias || '').toLowerCase();
            const pubkey = (node.pub_key || '').toLowerCase();
            return alias === searchLower || pubkey === searchLower;
        });

        // If no exact match, try partial matches
        if (!match) {
            match = this.nodeData.find(node => {
                const alias = (node.alias || '').toLowerCase();
                const pubkey = (node.pub_key || '').toLowerCase();
                return alias.includes(searchLower) || pubkey.startsWith(searchLower);
            });
        }

        if (match) {
            this.navigateToProfile(match.pub_key);
        } else {
            this.showSearchError(searchTerm);
        }
    }

    showSearchError(searchTerm) {
        const errorMsg = document.createElement('div');
        errorMsg.className = 'search-error-toast';
        errorMsg.innerHTML = `
            <i class="fas fa-exclamation-circle"></i>
            No node found for "${searchTerm}". Try a different alias or public key.
        `;
        
        document.body.appendChild(errorMsg);
        
        setTimeout(() => {
            errorMsg.classList.add('show');
        }, 100);
        
        setTimeout(() => {
            errorMsg.classList.remove('show');
            setTimeout(() => {
                document.body.removeChild(errorMsg);
            }, 300);
        }, 3000);
    }

    navigateToProfile(pubkey) {
        if (pubkey) {
            window.location.href = `profile.html?node=${encodeURIComponent(pubkey)}`;
        }
    }

    loadTrendingNodes() {
        const trendingContainer = document.getElementById('trendingNodes');
        if (!trendingContainer || !this.nodeData.length) return;

        // Get top 6 nodes by pleb_rank (assuming lower rank number is better)
        const trendingNodes = [...this.nodeData]
            .filter(node => node.pleb_rank && node.alias)
            .sort((a, b) => Number(a.pleb_rank) - Number(b.pleb_rank))
            .slice(0, 6);

        trendingContainer.innerHTML = trendingNodes.map((node, index) => `
            <a href="profile.html?node=${encodeURIComponent(node.pub_key)}" class="node-card">
                <div class="trending-node-header">
                    <div class="trending-rank">${index + 1}</div>
                    <div class="trending-alias">${node.alias || 'Unknown'}</div>
                </div>
                <div class="trending-stats">
                    <div class="trending-stat">
                        <div class="trending-stat-label">Capacity Rank</div>
                        <div class="trending-stat-value">#${node.capacity_rank || 'N/A'}</div>
                    </div>
                    <div class="trending-stat">
                        <div class="trending-stat-label">Channels</div>
                        <div class="trending-stat-value">${Number(node.num_channels || 0).toLocaleString()}</div>
                    </div>
                    <div class="trending-stat">
                        <div class="trending-stat-label">Node Type</div>
                        <div class="trending-stat-value">${node.node_type || 'Unknown'}</div>
                    </div>
                    <div class="trending-stat">
                        <div class="trending-stat-label">Last Seen</div>
                        <div class="trending-stat-value">${node.last_seen || 'N/A'}</div>
                    </div>
                </div>
            </a>
        `).join('');
    }

    async loadFeaturedNodes() {
        try {
            const response = await fetch('data/featured_node.json');
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const featuredList = await response.json();
            // Merge with nodeData for display fields, fallback to pubkey if alias missing
            this.featuredNodes = featuredList.map(featured => {
                const node = this.nodeData.find(n => n.pub_key === featured.pub_key);
                if (node) {
                    return { ...node, comment: featured.comment };
                } else {
                    // fallback: show pubkey and comment if not found in nodeData
                    return { pub_key: featured.pub_key, alias: featured.pub_key, comment: featured.comment };
                }
            });
        } catch (error) {
            this.featuredNodes = [];
        }
    }

    renderFeaturedNodes() {
        const grid = document.getElementById('featuredNodesGrid');
        if (!grid) return;
        
        const start = this.featuredPage * this.FEATURED_PAGE_SIZE;
        const end = start + this.FEATURED_PAGE_SIZE;
        const nodes = this.featuredNodes.slice(start, end);
        
        grid.innerHTML = nodes.map((node, idx) => {
            const alias = node.alias || node.pub_key?.slice(0, 8) || 'Unknown';
            const comment = node.comment || '';
            const nodeType = node.node_type || 'Lightning Node';
            
            return `
                <a href="profile.html?node=${encodeURIComponent(node.pub_key)}" class="node-card" style="text-decoration: none; color: inherit; display: block;">
                    <div class="featured-badge"><i class="fas fa-star"></i> Featured</div>
                    <div class="node-header">
                        <div class="node-alias">${alias}</div>
                        <div class="node-type">
                            <i class="fas fa-server"></i>
                            ${nodeType}
                        </div>
                    </div>
                    <div class="node-comment">${comment}</div>
                </a>
            `;
        }).join('');
        
        this.updateFeaturedPagination();
        
        const loadingState = document.getElementById('loadingState');
        const featuredContainer = document.getElementById('featuredNodesContainer');
        if (loadingState) loadingState.style.display = 'none';
        if (featuredContainer) featuredContainer.style.display = 'block';
    }

    updateFeaturedPagination() {
        const totalPages = Math.ceil(this.featuredNodes.length / this.FEATURED_PAGE_SIZE);
        const paginationContainer = document.getElementById('featuredNodesPagination');
        const paginationInfo = document.getElementById('featuredPaginationInfo');
        const prevBtn = document.getElementById('featuredPrevBtn');
        const nextBtn = document.getElementById('featuredNextBtn');
        const pageNumbers = document.getElementById('featuredPageNumbers');
        
        if (!paginationContainer || totalPages <= 1) {
            if (paginationContainer) paginationContainer.style.display = 'none';
            return;
        }
        
        // Show pagination container
        paginationContainer.style.display = 'flex';
        
        // Update pagination info
        const start = this.featuredPage * this.FEATURED_PAGE_SIZE + 1;
        const end = Math.min((this.featuredPage + 1) * this.FEATURED_PAGE_SIZE, this.featuredNodes.length);
        if (paginationInfo) {
            paginationInfo.textContent = `Showing ${start}-${end} of ${this.featuredNodes.length} featured nodes`;
        }
        
        // Update navigation buttons
        if (prevBtn) {
            prevBtn.disabled = this.featuredPage === 0;
            prevBtn.onclick = () => this.goToFeaturedPage(this.featuredPage - 1);
        }
        
        if (nextBtn) {
            nextBtn.disabled = this.featuredPage >= totalPages - 1;
            nextBtn.onclick = () => this.goToFeaturedPage(this.featuredPage + 1);
        }
        
        // Generate page numbers
        if (pageNumbers) {
            const maxVisiblePages = 5;
            let startPage = Math.max(0, this.featuredPage - Math.floor(maxVisiblePages / 2));
            let endPage = Math.min(totalPages - 1, startPage + maxVisiblePages - 1);
            
            // Adjust start if we're near the end
            if (endPage - startPage < maxVisiblePages - 1) {
                startPage = Math.max(0, endPage - maxVisiblePages + 1);
            }
            
            pageNumbers.innerHTML = '';
            for (let i = startPage; i <= endPage; i++) {
                const pageLink = document.createElement('button');
                pageLink.className = `page-number ${i === this.featuredPage ? 'active' : ''}`;
                pageLink.textContent = i + 1;
                pageLink.onclick = () => this.goToFeaturedPage(i);
                pageNumbers.appendChild(pageLink);
            }
        }
    }

    goToFeaturedPage(page) {
        const totalPages = Math.ceil(this.featuredNodes.length / this.FEATURED_PAGE_SIZE);
        if (page >= 0 && page < totalPages) {
            this.featuredPage = page;
            this.renderFeaturedNodes();
        }
    }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.homepageManager = new HomepageManager();
});