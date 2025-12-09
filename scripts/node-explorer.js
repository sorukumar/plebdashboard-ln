import { parquetRead } from 'https://cdn.jsdelivr.net/npm/hyparquet@1.17.1/+esm';

class NodeExplorerManager {
    constructor() {
        this.allNodes = [];
        this.filteredNodes = [];
        this.featuredNodes = [];
        this.featuredNodeData = [];
        this.currentPage = 1;
        this.itemsPerPage = 20;
        this.currentView = 'grid';
        this.currentSort = 'pleb_rank';
        this.currentFilter = 'all';
        this.searchTerm = '';
        this.isHomepage = window.location.pathname.includes('index.html') || window.location.pathname === '/';
        
        // Advanced filter ranges
        this.filterRanges = {
            pleb_rank: { min: null, max: null },
            betweenness_centrality_rank: { min: null, max: null },
            eigenvector_centrality_rank: { min: null, max: null },
            capacity_weighted_degree_rank: { min: null, max: null },
            total_channels_rank: { min: null, max: null },
            total_capacity_rank: { min: null, max: null },
            total_capacity: { min: null, max: null },
            total_channels: { min: null, max: null },
            avg_fee_rate: { min: null, max: null }
        };
        
        this.init();
    }

    async init() {
        await this.loadNodeData();
        if (!this.isHomepage) {
            await this.loadFeaturedNodes();
        }
        this.setupEventListeners();
        if (!this.isHomepage) {
            this.renderNodes();
            this.renderFeaturedNodes();
            this.updateFilterStats(); // Initialize filter stats
            this.showContent(); // Only show content after everything is loaded
        }
    }

    async loadNodeData() {
        try {
            const response = await fetch('data/node_profile.parquet');
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            
            const arrayBuffer = await response.arrayBuffer();
            
            await parquetRead({
                file: arrayBuffer,
                onComplete: (result) => {
                    const columns = [
                        'pub_key', 'alias', 'address_1', 'address_2', 'last_seen', 'source', 'update_dt', 'snapshot_date', 'first_seen_week', 
                        'closed_channels_count', 'node_type', 'birth_tx', 
                        'birth_chan', 'birth_tx_active', 'birth_chan_active', 'total_channels','channel_segment', 'category_counts', 'total_capacity', 
                        'node_cap_tier', 'capacity_segment', 'avg_chnl_size', 'med_chnl_size', 'mode_chnl_size', 'min_chnl_size', 'max_chnl_size', 
                        'betweenness_centrality_rank', 'eigenvector_centrality_rank', 'custom_pagerank_rank', 'capacity_weighted_degree_rank', 
                        'total_channels_rank', 'total_capacity_rank', 'pleb_rank', 'ftotal_capacity', 'avg_base_fee', 'med_base_fee', 'max_base_fee',
                        'min_base_fee', 'avg_fee_rate', 'med_fee_rate', 'max_fee_rate', 'min_fee_rate'
                    ];
                    
                    if (Array.isArray(result) && result.length > 0) {
                        this.allNodes = result.map(row =>
                            Object.fromEntries(columns.map((col, i) => [col, row[i]]))
                        ).filter(node => node.alias && node.pub_key);
                        
                        this.filteredNodes = [...this.allNodes];
                        this.sortNodes();
                    }
                },
                onError: (error) => {
                    console.error('Error parsing parquet:', error);
                    this.showError('Failed to load node data');
                }
            });
        } catch (error) {
            console.error('Error loading node data:', error);
            this.showError('Failed to load node data: ' + error.message);
        }
    }

    async loadFeaturedNodes() {
        try {
            const response = await fetch('data/featured_node.json');
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            
            this.featuredNodes = await response.json();
            
            // Match featured nodes with full node data
            this.featuredNodeData = this.featuredNodes.map(featured => {
                const nodeData = this.allNodes.find(node => node.pub_key === featured.pub_key);
                return {
                    ...nodeData,
                    comment: featured.comment,
                    isFeatured: true
                };
            }).filter(node => node.pub_key); // Only include nodes that were found in the data
            
        } catch (error) {
            console.error('Error loading featured nodes:', error);
            this.featuredNodeData = [];
        }
    }

    setupEventListeners() {
        // Search functionality
        const searchInput = document.getElementById('nodeExplorerSearchInput') || document.getElementById('trendingSearchInput');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                this.searchTerm = e.target.value;
                this.applyFilters();
            });
        }

        // Sort functionality
        const sortSelect = document.getElementById('sortBy');
        if (sortSelect) {
            sortSelect.addEventListener('change', (e) => {
                this.currentSort = e.target.value;
                this.sortNodes();
                this.renderNodes();
            });
        }

        // Basic filter functionality
        const filterSelect = document.getElementById('nodeTypeFilter');
        if (filterSelect) {
            filterSelect.addEventListener('change', (e) => {
                this.currentFilter = e.target.value;
                this.applyFilters();
            });
        }

        // Advanced range filters
        this.setupRangeFilters();

        // Filter presets
        this.setupFilterPresets();

        // Reset filters
        const resetBtn = document.getElementById('resetFilters');
        if (resetBtn) {
            resetBtn.addEventListener('click', () => {
                this.resetFilters();
            });
        }

        // View toggle
        const viewBtns = document.querySelectorAll('.view-btn');
        viewBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const view = e.target.closest('.view-btn').dataset.view;
                this.toggleView(view);
            });
        });

        // Pagination
        const prevBtn = document.getElementById('prevPage');
        const nextBtn = document.getElementById('nextPage');
        
        if (prevBtn) {
            prevBtn.addEventListener('click', () => {
                if (this.currentPage > 1) {
                    this.currentPage--;
                    this.renderNodes();
                    this.updatePagination();
                }
            });
        }

        if (nextBtn) {
            nextBtn.addEventListener('click', () => {
                const totalPages = Math.ceil(this.filteredNodes.length / this.itemsPerPage);
                if (this.currentPage < totalPages) {
                    this.currentPage++;
                    this.renderNodes();
                    this.updatePagination();
                }
            });
        }
    }

    setupRangeFilters() {
        // Setup range inputs for each filterable metric
        Object.keys(this.filterRanges).forEach(metric => {
            const minInput = document.getElementById(`${metric}_min`);
            const maxInput = document.getElementById(`${metric}_max`);
            
            if (minInput) {
                minInput.addEventListener('input', (e) => {
                    this.filterRanges[metric].min = e.target.value ? Number(e.target.value) : null;
                    this.applyFilters();
                });
            }
            
            if (maxInput) {
                maxInput.addEventListener('input', (e) => {
                    this.filterRanges[metric].max = e.target.value ? Number(e.target.value) : null;
                    this.applyFilters();
                });
            }
        });
    }

    setupFilterPresets() {
        // Quick filter buttons for common scenarios
        const presetBtns = document.querySelectorAll('.filter-preset');
        presetBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const preset = e.target.dataset.preset;
                this.applyPreset(preset);
            });
        });
    }

    applyPreset(preset) {
        this.resetFilters();
        
        switch (preset) {
            case 'top_routing_nodes':
                this.filterRanges.pleb_rank.max = 100;
                this.filterRanges.total_channels.min = 50;
                this.currentFilter = 'routing';
                break;
            case 'emerging_nodes':
                this.filterRanges.pleb_rank.min = 1000;
                this.filterRanges.pleb_rank.max = 10000;
                this.filterRanges.total_channels.min = 5;
                break;
            case 'high_capacity':
                this.filterRanges.total_capacity.min = 100000000; // 100M sats
                break;
            case 'well_connected':
                this.filterRanges.betweenness_centrality_rank.max = 500;
                this.filterRanges.total_channels.min = 20;
                break;
            case 'low_fees':
                this.filterRanges.avg_fee_rate.max = 100; // 100 ppm
                break;
        }
        
        this.updateFilterUI();
        this.applyFilters();
    }

    updateFilterUI() {
        // Update range inputs to reflect current filter state
        Object.keys(this.filterRanges).forEach(metric => {
            const minInput = document.getElementById(`${metric}_min`);
            const maxInput = document.getElementById(`${metric}_max`);
            
            if (minInput) {
                minInput.value = this.filterRanges[metric].min || '';
            }
            if (maxInput) {
                maxInput.value = this.filterRanges[metric].max || '';
            }
        });
        
        // Update node type filter
        const nodeTypeFilter = document.getElementById('nodeTypeFilter');
        if (nodeTypeFilter) {
            nodeTypeFilter.value = this.currentFilter;
        }
    }

    applyFilters() {
        this.filteredNodes = this.allNodes.filter(node => {
            // Search filter
            if (this.searchTerm) {
                const searchLower = this.searchTerm.toLowerCase();
                const matchesSearch = 
                    (node.alias || '').toLowerCase().includes(searchLower) ||
                    (node.pub_key || '').toLowerCase().includes(searchLower);
                if (!matchesSearch) return false;
            }

            // Node type filter
            if (this.currentFilter !== 'all') {
                const nodeType = (node.node_type || '').toLowerCase();
                if (nodeType !== this.currentFilter) return false;
            }

            // Range filters
            if (!this.passesRangeFilters(node)) return false;

            return true;
        });

        this.currentPage = 1;
        this.sortNodes();
        this.renderNodes();
        this.updatePagination();
        this.updateFilterStats();
    }

    passesRangeFilters(node) {
        for (const [metric, range] of Object.entries(this.filterRanges)) {
            const value = Number(node[metric]);
            
            if (isNaN(value)) continue;
            
            if (range.min !== null && value < range.min) return false;
            if (range.max !== null && value > range.max) return false;
        }
        return true;
    }

    updateFilterStats() {
        // Update filter statistics display
        const statsElement = document.getElementById('filterStats');
        if (statsElement) {
            const total = this.allNodes.length;
            const filtered = this.filteredNodes.length;
            const percentage = ((filtered / total) * 100).toFixed(1);
            
            statsElement.textContent = `Showing ${filtered.toLocaleString()} of ${total.toLocaleString()} nodes (${percentage}%)`;
        }
    }

    sortNodes() {
        this.filteredNodes.sort((a, b) => {
            // Parse sort field and direction
            let sortField = this.currentSort;
            let sortDirection = 'asc';
            
            if (this.currentSort.includes(':')) {
                [sortField, sortDirection] = this.currentSort.split(':');
            }
            
            let aVal = a[sortField];
            let bVal = b[sortField];

            // Handle null/undefined values
            if (aVal === null || aVal === undefined) return 1;
            if (bVal === null || bVal === undefined) return -1;

            let comparison = 0;

            // For birth_tx, compare as strings (transaction IDs)
            if (sortField === 'birth_tx') {
                comparison = String(aVal).localeCompare(String(bVal));
            }
            // For rank columns, lower numbers are better (natural ascending)
            else if (sortField.includes('rank')) {
                comparison = Number(aVal) - Number(bVal);
            }
            // For numeric columns like capacity/channels, higher is better (natural descending)
            else if (['total_channels', 'total_capacity'].includes(sortField)) {
                comparison = Number(bVal) - Number(aVal); // Natural descending
                sortDirection = sortDirection === 'asc' ? 'desc' : 'asc'; // Flip direction for these
            }

            // Apply direction
            return sortDirection === 'desc' ? -comparison : comparison;
        });
    }

    resetFilters() {
        this.searchTerm = '';
        this.currentFilter = 'all';
        this.currentSort = 'pleb_rank';
        this.currentPage = 1;

        // Reset range filters
        Object.keys(this.filterRanges).forEach(metric => {
            this.filterRanges[metric].min = null;
            this.filterRanges[metric].max = null;
        });

        // Reset UI elements
        const searchInput = document.getElementById('nodeExplorerSearchInput') || document.getElementById('trendingSearchInput');
        if (searchInput) searchInput.value = '';
        
        const sortBy = document.getElementById('sortBy');
        if (sortBy) sortBy.value = 'pleb_rank';
        
        const nodeTypeFilter = document.getElementById('nodeTypeFilter');
        if (nodeTypeFilter) nodeTypeFilter.value = 'all';
        
        // Clear all range inputs
        Object.keys(this.filterRanges).forEach(metric => {
            const minInput = document.getElementById(`${metric}_min`);
            const maxInput = document.getElementById(`${metric}_max`);
            if (minInput) minInput.value = '';
            if (maxInput) maxInput.value = '';
        });

        this.filteredNodes = [...this.allNodes];
        this.sortNodes();
        this.renderNodes();
        this.updatePagination();
        this.updateFilterStats();
    }

    toggleView(view) {
        this.currentView = view;
        
        // Update view buttons
        document.querySelectorAll('.view-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        const activeBtn = document.querySelector(`[data-view="${view}"]`);
        if (activeBtn) activeBtn.classList.add('active');

        // Update container class
        const container = document.getElementById('nodeExplorerContainer') || document.getElementById('trendingContainer');
        if (container) {
            container.className = `node-explorer-container ${view}-view`;
        }

        this.renderNodes();
    }

    renderFeaturedNodes() {
        const grid = document.getElementById('featuredNodesGrid');
        if (!grid) return;

        grid.innerHTML = this.featuredNodeData.map((node, index) => {
            return this.createFeaturedNodeCard(node, index + 1);
        }).join('');
    }

    renderNodes() {
        const grid = document.getElementById('nodeExplorerGrid') || document.getElementById('trendingGrid');
        if (!grid) return;

        const startIndex = (this.currentPage - 1) * this.itemsPerPage;
        const endIndex = startIndex + this.itemsPerPage;
        const pageNodes = this.filteredNodes.slice(startIndex, endIndex);

        grid.innerHTML = pageNodes.map((node, index) => {
            const globalRank = startIndex + index + 1;
            return this.createNodeCard(node, globalRank);
        }).join('');

        this.updatePagination();
    }

    createFeaturedNodeCard(node, rank) {
        const alias = node.alias || 'Unknown Node';
        const nodeType = node.node_type || 'Unknown';
        const plebRank = node.pleb_rank ? `#${Number(node.pleb_rank).toLocaleString()}` : 'N/A';
        const channels = node.total_channels ? Number(node.total_channels).toLocaleString() : 'N/A';
        const pubkey = node.pub_key || '';
        const comment = node.comment || '';
        const capacity = node.ftotal_capacity || 'N/A';

        return `
            <a href="profile.html?node=${encodeURIComponent(pubkey)}" class="node-card">
                <div class="featured-badge">
                    <i class="fas fa-star"></i>
                    Featured
                </div>
                <div class="node-header">
                    <div class="node-alias">${alias}</div>
                    <div class="node-type">
                        <i class="fas fa-server"></i>
                        ${nodeType}
                    </div>
                </div>
                <div class="node-comment">${comment}</div>
                <div class="node-stats">
                    <div class="node-stat">
                        <div class="stat-value">${plebRank}</div>
                        <div class="stat-name">Pleb Rank</div>
                    </div>
                    <div class="node-stat">
                        <div class="stat-value">${channels}</div>
                        <div class="stat-name">Channels</div>
                    </div>
                    <div class="node-stat">
                        <div class="stat-value">${capacity}</div>
                        <div class="stat-name">Capacity</div>
                    </div>
                </div>
            </a>
        `;
    }

    createNodeCard(node, rank) {
        const alias = node.alias || 'Unknown Node';
        const nodeType = node.node_type || 'Unknown';
        const channels = node.total_channels ? Number(node.total_channels).toLocaleString() : 'N/A';
        const capacity = node.ftotal_capacity || 'N/A';
        const pubkey = node.pub_key || '';
        const plebRank = node.pleb_rank ? `#${Number(node.pleb_rank).toLocaleString()}` : 'N/A';
        const capTier = node.node_cap_tier || 'Unknown';

        if (this.currentView === 'list') {
            return `
                <a href="profile.html?node=${encodeURIComponent(pubkey)}" class="node-card list-item">
                    <div class="node-rank">${plebRank}</div>
                    <div class="node-info">
                        <div class="node-alias">${alias}</div>
                        <div class="node-type">${nodeType} • ${capTier}</div>
                    </div>
                    <div class="node-metrics">
                        <div class="metric">
                            <span class="metric-label">Capacity</span>
                            <span class="metric-value">${capacity}</span>
                        </div>
                        <div class="metric">
                            <span class="metric-label">Channels</span>
                            <span class="metric-value">${channels}</span>
                        </div>
                        <div class="metric">
                            <span class="metric-label">Pleb Rank</span>
                            <span class="metric-value">${plebRank}</span>
                        </div>
                    </div>
                </a>
            `;
        }

        return `
            <a href="profile.html?node=${encodeURIComponent(pubkey)}" class="node-card grid-item">
                <div class="node-rank-badge">${plebRank}</div>
                <div class="node-header">
                    <div class="node-alias">${alias}</div>
                    <div class="node-type">
                        <i class="fas fa-server"></i>
                        ${nodeType}
                    </div>
                    <div class="node-cap-tier">
                        <i class="fas fa-layer-group"></i>
                        ${capTier}
                    </div>
                </div>
                <div class="node-stats">
                    <div class="node-stat">
                        <div class="stat-value">${capacity}</div>
                        <div class="stat-name">Capacity</div>
                    </div>
                    <div class="node-stat">
                        <div class="stat-value">${channels}</div>
                        <div class="stat-name">Channels</div>
                    </div>
                    <div class="node-stat">
                        <div class="stat-value">${plebRank}</div>
                        <div class="stat-name">Pleb Rank</div>
                    </div>
                </div>
            </a>
        `;
    }

    updatePagination() {
        const totalPages = Math.ceil(this.filteredNodes.length / this.itemsPerPage);
        const startItem = this.filteredNodes.length === 0 ? 0 : (this.currentPage - 1) * this.itemsPerPage + 1;
        const endItem = Math.min(this.currentPage * this.itemsPerPage, this.filteredNodes.length);

        // Update pagination info
        const paginationText = document.getElementById('paginationText');
        if (paginationText) {
            paginationText.textContent = `Showing ${startItem}-${endItem} of ${this.filteredNodes.length.toLocaleString()} nodes`;
        }

        // Update pagination buttons
        const prevBtn = document.getElementById('prevPage');
        const nextBtn = document.getElementById('nextPage');
        
        if (prevBtn) prevBtn.disabled = this.currentPage <= 1;
        if (nextBtn) nextBtn.disabled = this.currentPage >= totalPages;

        // Update page numbers
        this.updatePageNumbers(totalPages);
    }

    updatePageNumbers(totalPages) {
        const pageNumbers = document.getElementById('pageNumbers');
        if (!pageNumbers) return;

        pageNumbers.innerHTML = '';

        if (totalPages <= 1) return;

        const maxVisiblePages = 5;
        let startPage = Math.max(1, this.currentPage - Math.floor(maxVisiblePages / 2));
        let endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);

        if (endPage - startPage < maxVisiblePages - 1) {
            startPage = Math.max(1, endPage - maxVisiblePages + 1);
        }

        for (let i = startPage; i <= endPage; i++) {
            const pageLink = document.createElement('a');
            pageLink.href = '#';
            pageLink.className = `page-number ${i === this.currentPage ? 'active' : ''}`;
            pageLink.textContent = i;
            pageLink.addEventListener('click', (e) => {
                e.preventDefault();
                this.currentPage = i;
                this.renderNodes();
                this.updatePagination();
            });
            pageNumbers.appendChild(pageLink);
        }
    }

    formatCapacity(capacity) {
        if (!capacity) return '0';
        const num = Number(capacity);
        if (num >= 1000000000) {
            return `${(num / 1000000000).toFixed(1)}B`;
        } else if (num >= 1000000) {
            return `${(num / 1000000).toFixed(1)}M`;
        } else if (num >= 1000) {
            return `${(num / 1000).toFixed(1)}K`;
        }
        return num.toLocaleString();
    }

    showContent() {
        const loadingState = document.getElementById('loadingState');
        if (loadingState) loadingState.style.display = 'none';
        const explorerContainer = document.getElementById('nodeExplorerContainer') || document.getElementById('trendingContainer');
        if (explorerContainer) explorerContainer.style.display = 'block';
        const paginationContainer = document.getElementById('paginationContainer');
        if (paginationContainer) paginationContainer.style.display = 'flex';
    }

    showError(message) {
        const loadingState = document.getElementById('loadingState');
        if (loadingState) {
            loadingState.innerHTML = `
                <div class="loading-content">
                    <i class="fas fa-exclamation-triangle" style="color: #dc3545;"></i>
                    <p>${message}</p>
                </div>
            `;
        }
    }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new NodeExplorerManager();
});