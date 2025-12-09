import { parquetRead } from 'https://cdn.jsdelivr.net/npm/hyparquet@1.17.1/+esm';

class ChannelExplorerManager {
    constructor() {
        this.allChannels = [];
        this.filteredChannels = [];
        this.currentPage = 1;
        this.itemsPerPage = 20;
        this.currentView = 'grid';
        this.currentSort = 'capacity:desc';
        this.node1SearchTerm = '';
        this.node2SearchTerm = '';
        
        this.init();
    }

    async init() {
        await this.loadChannelData();
        this.setupEventListeners();
        this.renderChannels();
        this.updateFilterStats();
        this.showContent();
    }

    async loadChannelData() {
        try {
            const response = await fetch('data/channel_profile.parquet');
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            
            const arrayBuffer = await response.arrayBuffer();
            
            await parquetRead({
                file: arrayBuffer,
                onComplete: (result) => {
                    const columns = [
                        'node1_pub', 'node2_pub', 'capacity', 'node1_policy', 'node2_policy', 'alias_1', 'alias_2', 'birth_tx'
                    ];
                    
                    if (Array.isArray(result) && result.length > 0) {
                        this.allChannels = result.map(row =>
                            Object.fromEntries(columns.map((col, i) => [col, row[i]]))
                        ).filter(channel => channel.capacity && (channel.alias_1 || channel.alias_2));
                        
                        this.filteredChannels = [...this.allChannels];
                        this.sortChannels();
                    }
                },
                onError: (error) => {
                    console.error('Error parsing parquet:', error);
                    this.showError('Failed to load channel data');
                }
            });
        } catch (error) {
            console.error('Error loading channel data:', error);
            this.showError('Failed to load channel data: ' + error.message);
        }
    }

    setupEventListeners() {
        // Search functionality
        const node1SearchInput = document.getElementById('node1SearchInput');
        const node2SearchInput = document.getElementById('node2SearchInput');
        
        if (node1SearchInput) {
            node1SearchInput.addEventListener('input', (e) => {
                this.node1SearchTerm = e.target.value;
                this.applyFilters();
            });
        }
        
        if (node2SearchInput) {
            node2SearchInput.addEventListener('input', (e) => {
                this.node2SearchTerm = e.target.value;
                this.applyFilters();
            });
        }

        // Sort functionality
        const sortSelect = document.getElementById('sortBy');
        if (sortSelect) {
            sortSelect.addEventListener('change', (e) => {
                this.currentSort = e.target.value;
                this.currentPage = 1;
                this.sortChannels();
                this.renderChannels();
            });
        }

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
                    this.renderChannels();
                    this.updatePagination();
                }
            });
        }

        if (nextBtn) {
            nextBtn.addEventListener('click', () => {
                const totalPages = Math.ceil(this.filteredChannels.length / this.itemsPerPage);
                if (this.currentPage < totalPages) {
                    this.currentPage++;
                    this.renderChannels();
                    this.updatePagination();
                }
            });
        }
    }

    applyFilters() {
        this.filteredChannels = this.allChannels.filter(channel => {
            // Search filter
            if (this.node1SearchTerm) {
                const searchLower = this.node1SearchTerm.toLowerCase();
                const matchesSearch = 
                    (channel.alias_1 || '').toLowerCase().includes(searchLower) ||
                    (channel.node1_pub || '').toLowerCase().includes(searchLower);
                if (!matchesSearch) return false;
            }

            if (this.node2SearchTerm) {
                const searchLower = this.node2SearchTerm.toLowerCase();
                const matchesSearch = 
                    (channel.alias_2 || '').toLowerCase().includes(searchLower) ||
                    (channel.node2_pub || '').toLowerCase().includes(searchLower);
                if (!matchesSearch) return false;
            }

            return true;
        });

        this.currentPage = 1;
        this.sortChannels();
        this.renderChannels();
        this.updatePagination();
        this.updateFilterStats();
    }

    updateFilterStats() {
        const statsElement = document.getElementById('filterStats');
        if (statsElement) {
            const total = this.allChannels.length;
            const filtered = this.filteredChannels.length;
            const percentage = ((filtered / total) * 100).toFixed(1);
            
            statsElement.textContent = `Showing ${filtered.toLocaleString()} of ${total.toLocaleString()} channels (${percentage}%)`;
        }
    }

    sortChannels() {
        this.filteredChannels.sort((a, b) => {
            let sortField = this.currentSort;
            let sortDirection = 'desc'; // Default for capacity
            
            if (this.currentSort.includes(':')) {
                [sortField, sortDirection] = this.currentSort.split(':');
            }
            
            let aVal = a[sortField];
            let bVal = b[sortField];

            // Handle null/undefined values
            if (aVal === null || aVal === undefined) return 1;
            if (bVal === null || bVal === undefined) return -1;

            let comparison = 0;

            if (sortField === 'birth_tx') {
                comparison = String(aVal).localeCompare(String(bVal));
            } else if (sortField === 'capacity') {
                comparison = Number(aVal) - Number(bVal);
            }

            return sortDirection === 'desc' ? -comparison : comparison;
        });
    }

    resetFilters() {
        this.node1SearchTerm = '';
        this.node2SearchTerm = '';
        this.currentSort = 'capacity:desc';
        this.currentPage = 1;

        const node1SearchInput = document.getElementById('node1SearchInput');
        if (node1SearchInput) node1SearchInput.value = '';
        
        const node2SearchInput = document.getElementById('node2SearchInput');
        if (node2SearchInput) node2SearchInput.value = '';
        
        const sortBy = document.getElementById('sortBy');
        if (sortBy) sortBy.value = 'capacity:desc';

        this.filteredChannels = [...this.allChannels];
        this.sortChannels();
        this.renderChannels();
        this.updatePagination();
        this.updateFilterStats();
    }

    toggleView(view) {
        this.currentView = view;
        
        document.querySelectorAll('.view-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        const activeBtn = document.querySelector(`[data-view="${view}"]`);
        if (activeBtn) activeBtn.classList.add('active');

        const container = document.getElementById('channelExplorerContainer');
        if (container) {
            container.className = `node-explorer-container ${view}-view`;
        }

        this.renderChannels();
    }

    renderChannels() {
        const grid = document.getElementById('channelExplorerGrid');
        if (!grid) return;

        const startIndex = (this.currentPage - 1) * this.itemsPerPage;
        const endIndex = startIndex + this.itemsPerPage;
        const pageChannels = this.filteredChannels.slice(startIndex, endIndex);

        grid.innerHTML = pageChannels.map((channel, index) => {
            const globalRank = startIndex + index + 1;
            return this.createChannelCard(channel, globalRank);
        }).join('');

        this.updatePagination();
    }

    createChannelCard(channel, rank) {
        const alias1 = channel.alias_1 || 'Unknown Node';
        const alias2 = channel.alias_2 || 'Unknown Node';
        const capacity = this.formatCapacity(channel.capacity);
        const shortId = channel.birth_tx || 'N/A';
        const avgFeeRate = this.getAverageFeeRate(channel);

        if (this.currentView === 'list') {
            return `
                <div class="node-card list-item">
                    <div class="node-info">
                        <div class="node-alias">${alias1} ↔ ${alias2}</div>
                        <div class="node-type">Birth TX: ${shortId}</div>
                    </div>
                    <div class="node-metrics">
                        <div class="metric">
                            <span class="metric-label">Capacity</span>
                            <span class="metric-value">${capacity}</span>
                        </div>
                        <div class="metric">
                            <span class="metric-label">Avg Fee Rate</span>
                            <span class="metric-value">${avgFeeRate} ppm</span>
                        </div>
                    </div>
                </div>
            `;
        }

        return `
            <div class="node-card grid-item">
                <div class="node-header">
                    <div class="node-alias">${alias1}</div>
                    <div class="node-type">
                        <i class="fas fa-arrows-alt-h"></i>
                        ↔
                    </div>
                    <div class="node-alias">${alias2}</div>
                </div>
                <div class="node-stats">
                    <div class="node-stat">
                        <div class="stat-value">${capacity}</div>
                        <div class="stat-name">Capacity</div>
                    </div>
                    <div class="node-stat">
                        <div class="stat-value">${shortId}</div>
                        <div class="stat-name">Birth TX</div>
                    </div>
                    <div class="node-stat">
                        <div class="stat-value">${avgFeeRate} ppm</div>
                        <div class="stat-name">Avg Fee Rate</div>
                    </div>
                </div>
            </div>
        `;
    }

    getAverageFeeRate(channel) {
        let rates = [];
        
        if (channel.node1_policy && typeof channel.node1_policy === 'object' && channel.node1_policy.fee_rate) {
            rates.push(Number(channel.node1_policy.fee_rate));
        }
        if (channel.node2_policy && typeof channel.node2_policy === 'object' && channel.node2_policy.fee_rate) {
            rates.push(Number(channel.node2_policy.fee_rate));
        }
        
        if (rates.length === 0) return 'N/A';
        
        const avg = rates.reduce((a, b) => a + b, 0) / rates.length;
        return Math.round(avg);
    }

    updatePagination() {
        const totalPages = Math.ceil(this.filteredChannels.length / this.itemsPerPage);
        const startItem = this.filteredChannels.length === 0 ? 0 : (this.currentPage - 1) * this.itemsPerPage + 1;
        const endItem = Math.min(this.currentPage * this.itemsPerPage, this.filteredChannels.length);

        const paginationText = document.getElementById('paginationText');
        if (paginationText) {
            paginationText.textContent = `Showing ${startItem}-${endItem} of ${this.filteredChannels.length.toLocaleString()} channels`;
        }

        const prevBtn = document.getElementById('prevPage');
        const nextBtn = document.getElementById('nextPage');
        
        if (prevBtn) prevBtn.disabled = this.currentPage <= 1;
        if (nextBtn) nextBtn.disabled = this.currentPage >= totalPages;

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
                this.renderChannels();
                this.updatePagination();
            });
            pageNumbers.appendChild(pageLink);
        }
    }

    formatCapacity(capacity) {
        if (!capacity) return '0';
        const num = Number(capacity);
        if (num >= 1000000000) {
            return `${(num / 1000000000).toFixed(1)}B sats`;
        } else if (num >= 1000000) {
            return `${(num / 1000000).toFixed(1)}M sats`;
        } else if (num >= 1000) {
            return `${(num / 1000).toFixed(1)}K sats`;
        }
        return `${num.toLocaleString()} sats`;
    }

    showContent() {
        const loadingState = document.getElementById('loadingState');
        if (loadingState) loadingState.style.display = 'none';
        const explorerContainer = document.getElementById('channelExplorerContainer');
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
    new ChannelExplorerManager();
});