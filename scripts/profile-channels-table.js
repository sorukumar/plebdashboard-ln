import { parquetRead } from 'https://cdn.jsdelivr.net/npm/hyparquet@1.17.1/+esm';

class ChannelsTableManager {
    constructor() {
        this.tableContainer = null;
        this.channelsData = [];
        this.filteredData = [];
        this.paginatedData = [];
        this.sortColumn = null;
        this.sortDirection = 'asc';
        this.searchTerm = '';
        this.currentPage = 1;
        this.pageSize = 50;
        this.totalPages = 1;
    }

    async fetchParquet(url) {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return await response.arrayBuffer();
    }

    async loadAndRenderTable(nodePubKey) {
        console.log('ChannelsTableManager: Starting to load table for node:', nodePubKey);
        
        try {
            // Clear any existing table
            this.cleanup();
            
            // Show loading state
            this.showLoading();
            
            // Load channel data
            console.log('ChannelsTableManager: Fetching parquet data...');
            const arrayBuffer = await this.fetchParquet('data/channel_profile.parquet');
            console.log('ChannelsTableManager: Parquet data loaded, size:', arrayBuffer.byteLength);
            
            return new Promise((resolve, reject) => {
                parquetRead({
                    file: arrayBuffer,
                    onComplete: (result) => {
                        try {
                            console.log('ChannelsTableManager: Parquet parsing complete, rows:', result.length);
                            
                            // Map the parquet data to objects
                            const columns = this.getChannelColumns();
                            console.log('ChannelsTableManager: Expected columns:', columns);
                            
                            const allChannels = result.map(row => {
                                const obj = {};
                                columns.forEach((col, i) => {
                                    let val = row[i];
                                    // Trim pubkeys and aliases to handle whitespace in data
                                    if (col.includes('pub') || col.includes('alias')) {
                                        val = val ? String(val).trim() : '';
                                    }
                                    obj[col] = val;
                                });
                                return obj;
                            });
                            
                            console.log('ChannelsTableManager: All channels mapped:', allChannels.length);
                            console.log('ChannelsTableManager: Sample channel:', allChannels[0]);
                            
                            // Filter channels for this node
                            this.channelsData = allChannels.filter(
                                ch => ch.node1_pub === nodePubKey || ch.node2_pub === nodePubKey
                            );
                            
                            console.log('ChannelsTableManager: Filtered channels for node:', this.channelsData.length);
                            
                            if (this.channelsData.length === 0) {
                                console.warn('ChannelsTableManager: No channels found for node:', nodePubKey);
                                this.showError('No channels found for this node');
                                resolve();
                                return;
                            }
                            
                            this.filteredData = [...this.channelsData];
                            console.log('ChannelsTableManager: About to render table...');
                            this.renderTable(nodePubKey);
                            console.log('ChannelsTableManager: Table rendered successfully');
                            resolve();
                        } catch (error) {
                            console.error('ChannelsTableManager: Error processing data:', error);
                            this.showError('Error processing channel data: ' + error.message);
                            reject(error);
                        }
                    },
                    onError: (err) => {
                        console.error('ChannelsTableManager: Parquet parsing error:', err);
                        this.showError('Error loading channel data: ' + err.message);
                        reject(err);
                    }
                });
            });
        } catch (error) {
            console.error('ChannelsTableManager: Failed to load channels table:', error);
            this.showError('Failed to load channel data: ' + error.message);
            throw error;
        }
    }

    getChannelColumns() {
        return [
            'node1_pub', 'node2_pub', 'capacity', 'node1_policy', 'node2_policy', 'alias_1', 'alias_2', 'birth_tx', 'channel_id'
        ];
    }

    parsePolicy(policyStr) {
        if (!policyStr || policyStr === 'null' || policyStr === null) {
            return {
                disabled: true,
                fee_base_msat: 0,
                fee_rate_milli_msat: 0,
                inbound_fee_base_msat: 0,
                inbound_fee_rate_milli_msat: 0,
                min_htlc: 0,
                max_htlc_msat: 0,
                time_lock_delta: 0
            };
        }
        
        try {
            // Handle both string and object cases
            const policy = typeof policyStr === 'string' ? JSON.parse(policyStr) : policyStr;
            return {
                disabled: policy.disabled || false,
                fee_base_msat: Number(policy.fee_base_msat) || 0,
                fee_rate_milli_msat: Number(policy.fee_rate_milli_msat) || 0,
                inbound_fee_base_msat: Number(policy.inbound_fee_base_msat) || 0,
                inbound_fee_rate_milli_msat: Number(policy.inbound_fee_rate_milli_msat) || 0,
                min_htlc: Number(policy.min_htlc) || 0,
                max_htlc_msat: Number(policy.max_htlc_msat) || 0,
                time_lock_delta: Number(policy.time_lock_delta) || 0
            };
        } catch (e) {
            console.warn('Error parsing policy:', e, policyStr);
            return {
                disabled: true,
                fee_base_msat: 0,
                fee_rate_milli_msat: 0,
                inbound_fee_base_msat: 0,
                inbound_fee_rate_milli_msat: 0,
                min_htlc: 0,
                max_htlc_msat: 0,
                time_lock_delta: 0
            };
        }
    }

    formatCapacity(capacity) {
        if (!capacity) return 'N/A';
        const num = Number(capacity);
        if (num >= 1_000_000_000) return `${(num / 1_000_000_000).toFixed(1)}B`;
        if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(0)}M`;
        if (num >= 1_000) return `${(num / 1_000).toFixed(0)}K`;
        return num.toLocaleString();
    }

    formatMsat(msat) {
        if (msat === null || msat === undefined) return '0';
        const num = Number(msat);
        if (num >= 1000000) return `${(num / 1000000).toFixed(0)}M`;
        if (num >= 1000) return `${(num / 1000).toFixed(0)}K`;
        return num.toLocaleString();
    }

    formatPPM(ppm) {
        if (ppm === null || ppm === undefined) return '0';
        return Number(ppm).toLocaleString();
    }

    formatPolicyCompact(policy) {
        if (policy.disabled) {
            return '<span class="disabled-text">Channel Disabled</span>';
        }
        
        return `
            <div class="fee-breakdown">
                <div class="fee-row">
                    <span class="fee-label">Base:</span>
                    <span class="fee-value">${this.formatMsat(policy.fee_base_msat)} msat</span>
                </div>
                <div class="fee-row">
                    <span class="fee-label">Rate:</span>
                    <span class="fee-value">${this.formatPPM(policy.fee_rate_milli_msat)} ppm</span>
                </div>
                <div class="fee-row">
                    <span class="fee-label">Inbound Base:</span>
                    <span class="fee-value">${this.formatMsat(policy.inbound_fee_base_msat)} msat</span>
                </div>
                <div class="fee-row">
                    <span class="fee-label">Inbound Rate:</span>
                    <span class="fee-value">${this.formatPPM(policy.inbound_fee_rate_milli_msat)} ppm</span>
                </div>
                <div class="fee-row">
                    <span class="fee-label">Min HTLC:</span>
                    <span class="fee-value">${this.formatMsat(policy.min_htlc)} msat</span>
                </div>
                <div class="fee-row">
                    <span class="fee-label">Max HTLC:</span>
                    <span class="fee-value">${this.formatMsat(policy.max_htlc_msat)} msat</span>
                </div>
                <div class="fee-row">
                    <span class="fee-label">Timelock Δ:</span>
                    <span class="fee-value">${policy.time_lock_delta || 0}</span>
                </div>
            </div>
        `;
    }

    renderTable(nodePubKey) {
        console.log('ChannelsTableManager: renderTable called with node:', nodePubKey);
        console.log('ChannelsTableManager: Filtered data length:', this.filteredData.length);
        
        const container = document.getElementById('channelsTableContainer');
        if (!container) {
            console.error('ChannelsTableManager: channelsTableContainer element not found in DOM');
            return;
        }

        // Calculate pagination
        this.updatePagination();

        console.log('ChannelsTableManager: Container found, rendering table...');

        // Create table controls HTML
        const controlsHTML = `
            <div class="table-controls">
                <div class="search-container">
                    <input type="text" id="channelsSearch" placeholder="Search by alias or pubkey..." class="search-input">
                    <i class="fas fa-search search-icon"></i>
                </div>
                <div class="pagination-controls">
                    <select id="pageSizeSelect" class="page-size-select">
                        <option value="25" ${this.pageSize === 25 ? 'selected' : ''}>25 per page</option>
                        <option value="50" ${this.pageSize === 50 ? 'selected' : ''}>50 per page</option>
                        <option value="100" ${this.pageSize === 100 ? 'selected' : ''}>100 per page</option>
                    </select>
                </div>
                <div class="table-info">
                    <span id="channelsCount">${this.filteredData.length}</span> channels
                </div>
            </div>
        `;

        // Create table wrapper
        const tableWrapper = document.createElement('div');
        tableWrapper.className = 'table-wrapper';

        // Create table element
        const table = document.createElement('table');
        table.className = 'data-table';
        table.id = 'channelsTable';

        // Create thead with innerHTML for simplicity
        const thead = document.createElement('thead');
        thead.innerHTML = `
            <tr>
                <th data-sort="peer_alias" class="sortable">Peer <i class="fas fa-sort"></i></th>
                <th data-sort="capacity" class="sortable">Capacity <i class="fas fa-sort"></i></th>
                <th data-sort="birth_tx" class="sortable">Birth TX <i class="fas fa-sort"></i></th>
                <th class="fees-column">My Policy</th>
                <th class="fees-column">Peer Policy</th>
                <th class="status-column">Status</th>
            </tr>
        `;
        table.appendChild(thead);

        // Attach sorting event listeners to sortable headers
        thead.querySelectorAll('th.sortable').forEach(th => {
            th.addEventListener('click', () => this.sortData(th.dataset.sort));
        });

        // Create tbody
        const tbody = document.createElement('tbody');
        tbody.id = 'channelsTableBody';
        tbody.innerHTML = this.generateTableRows(nodePubKey);
        table.appendChild(tbody);

        tableWrapper.appendChild(table);

        // Set container content
        container.innerHTML = controlsHTML;
        container.appendChild(tableWrapper);
        container.insertAdjacentHTML('beforeend', this.generatePaginationControls());

        console.log('ChannelsTableManager: Table created with event listeners attached...');
        this.setupEventListeners();
        console.log('ChannelsTableManager: Table rendering complete');
    }

    generateTableRows(nodePubKey) {
        return this.paginatedData.map(channel => {
            const isNode1 = channel.node1_pub === nodePubKey;
            
            // Add null checks and ensure we have string values
            const node1Pub = channel.node1_pub ? String(channel.node1_pub).trim() : '';
            const node2Pub = channel.node2_pub ? String(channel.node2_pub).trim() : '';
            const alias1 = channel.alias_1 ? String(channel.alias_1).trim() : '';
            const alias2 = channel.alias_2 ? String(channel.alias_2).trim() : '';
            
            const peerAlias = isNode1 
                ? (alias2 || (node2Pub ? node2Pub.substring(0, 8) + '...' : '-'))
                : (alias1 || (node1Pub ? node1Pub.substring(0, 8) + '...' : '-'));
            const peerPubkey = isNode1 ? node2Pub : node1Pub;
            
            const myPolicy = this.parsePolicy(isNode1 ? channel.node1_policy : channel.node2_policy);
            const peerPolicy = this.parsePolicy(isNode1 ? channel.node2_policy : channel.node1_policy);

            // Status indicators
            const myStatus = myPolicy.disabled ? 'Disabled' : 'Active';
            const peerStatus = peerPolicy.disabled ? 'Disabled' : 'Active';
            
            return `
                <tr data-channel-id="${channel.channel_id || 'unknown'}" class="channel-row">
                    <td>
                        <div class="peer-info-compact">
                            ${peerPubkey ? `<a href="profile.html?node=${encodeURIComponent(peerPubkey)}" class="peer-link" title="View profile">${peerAlias}</a>` : peerAlias}
                        </div>
                    </td>
                    <td class="capacity-cell">${this.formatCapacity(channel.capacity)} sats</td>
                    <td class="birth-tx-cell">
                        ${channel.channel_id ? `<a href="https://mempool.space/lightning/channel/${channel.channel_id}" target="_blank" rel="noopener noreferrer" style="color: inherit; text-decoration: underline;">${channel.birth_tx || 'N/A'}</a>` : channel.birth_tx || 'N/A'}
                    </td>
                    <td class="fees-cell">${this.formatPolicyCompact(myPolicy)}</td>
                    <td class="fees-cell">${this.formatPolicyCompact(peerPolicy)}</td>
                    <td class="status-cell">
                        <div class="status-breakdown">
                            <div class="status-row ${myPolicy.disabled ? 'disabled' : 'active'}">
                                <span class="status-label">Me:</span>
                                <span class="status-value">${myStatus}</span>
                            </div>
                            <div class="status-row ${peerPolicy.disabled ? 'disabled' : 'active'}">
                                <span class="status-label">Peer:</span>
                                <span class="status-value">${peerStatus}</span>
                            </div>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');
    }

    updatePagination() {
        this.totalPages = Math.ceil(this.filteredData.length / this.pageSize);
        if (this.currentPage > this.totalPages) {
            this.currentPage = Math.max(1, this.totalPages);
        }
        
        const startIndex = (this.currentPage - 1) * this.pageSize;
        const endIndex = startIndex + this.pageSize;
        this.paginatedData = this.filteredData.slice(startIndex, endIndex);
    }

    generatePaginationControls() {
        if (this.totalPages <= 1) {
            return '<div class="pagination-info">Showing all channels</div>';
        }

        const startItem = (this.currentPage - 1) * this.pageSize + 1;
        const endItem = Math.min(this.currentPage * this.pageSize, this.filteredData.length);
        
        let pageButtons = '';
        const maxVisiblePages = 5;
        let startPage = Math.max(1, this.currentPage - Math.floor(maxVisiblePages / 2));
        let endPage = Math.min(this.totalPages, startPage + maxVisiblePages - 1);
        
        // Adjust start if we're near the end
        if (endPage - startPage < maxVisiblePages - 1) {
            startPage = Math.max(1, endPage - maxVisiblePages + 1);
        }

        // First page and previous
        pageButtons += `
            <button class="pagination-btn" ${this.currentPage === 1 ? 'disabled' : ''} data-page="1">
                <i class="fas fa-angle-double-left"></i>
            </button>
            <button class="pagination-btn" ${this.currentPage === 1 ? 'disabled' : ''} data-page="${this.currentPage - 1}">
                <i class="fas fa-angle-left"></i>
            </button>
        `;

        // Page numbers
        for (let i = startPage; i <= endPage; i++) {
            pageButtons += `
                <button class="pagination-btn ${i === this.currentPage ? 'active' : ''}" data-page="${i}">
                    ${i}
                </button>
            `;
        }

        // Next and last page
        pageButtons += `
            <button class="pagination-btn" ${this.currentPage === this.totalPages ? 'disabled' : ''} data-page="${this.currentPage + 1}">
                <i class="fas fa-angle-right"></i>
            </button>
            <button class="pagination-btn" ${this.currentPage === this.totalPages ? 'disabled' : ''} data-page="${this.totalPages}">
                <i class="fas fa-angle-double-right"></i>
            </button>
        `;

        return `
            <div class="pagination-container">
                <div class="pagination-info">
                    Showing ${startItem}-${endItem} of ${this.filteredData.length} channels
                </div>
                <div class="pagination-controls">
                    ${pageButtons}
                </div>
            </div>
        `;
    }

    setupEventListeners() {
        // Search functionality
        const searchInput = document.getElementById('channelsSearch');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                this.searchTerm = e.target.value.toLowerCase();
                this.currentPage = 1; // Reset to first page on search
                this.filterData();
            });
        }

        // Page size selector
        const pageSizeSelect = document.getElementById('pageSizeSelect');
        if (pageSizeSelect) {
            pageSizeSelect.addEventListener('change', (e) => {
                this.pageSize = parseInt(e.target.value);
                this.currentPage = 1; // Reset to first page
                this.updatePagination();
                this.updateTable();
            });
        }

        // Pagination buttons
        document.addEventListener('click', (e) => {
            if (e.target.closest('.pagination-btn') && !e.target.closest('.pagination-btn').disabled) {
                const page = parseInt(e.target.closest('.pagination-btn').getAttribute('data-page'));
                if (page && page !== this.currentPage) {
                    this.currentPage = page;
                    this.updatePagination();
                    this.updateTable();
                }
            }
        });

        // Sorting functionality is now handled directly in renderTable
    }

    filterData() {
        if (!this.searchTerm) {
            this.filteredData = [...this.channelsData];
        } else {
            this.filteredData = this.channelsData.filter(channel => {
                const searchableText = [
                    channel.alias_1,
                    channel.alias_2,
                    channel.node1_pub,
                    channel.node2_pub,
                    channel.channel_id
                ].join(' ').toLowerCase();
                
                return searchableText.includes(this.searchTerm);
            });
        }
        
        this.updatePagination();
        this.updateTable();
    }

    sortData(column) {
        // Toggle sort direction if same column
        if (this.sortColumn === column) {
            this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
        } else {
            this.sortColumn = column;
            this.sortDirection = 'asc';
        }

        const multiplier = this.sortDirection === 'desc' ? -1 : 1;

        this.filteredData.sort((a, b) => {
            let aVal, bVal;

            switch (column) {
                case 'peer_alias':
                    aVal = (a.alias_1 || a.alias_2 || '').toLowerCase();
                    bVal = (b.alias_1 || b.alias_2 || '').toLowerCase();
                    break;
                case 'capacity':
                    aVal = Number(a.capacity) || 0;
                    bVal = Number(b.capacity) || 0;
                    break;
                case 'birth_tx':
                    aVal = String(a.birth_tx || '');
                    bVal = String(b.birth_tx || '');
                    return aVal.localeCompare(bVal) * multiplier;
                default:
                    aVal = a[column] || '';
                    bVal = b[column] || '';
            }

            let result = 0;
            if (aVal < bVal) result = -1;
            else if (aVal > bVal) result = 1;

            return result * multiplier;
        });

        this.updateSortIcons();
        this.updatePagination();
        this.updateTable();
    }

    updateSortIcons() {
        // Reset all sort icons
        document.querySelectorAll('.data-table th.sortable i').forEach(icon => {
            icon.className = 'fas fa-sort';
        });

        // Update active sort icon
        if (this.sortColumn) {
            const activeHeader = document.querySelector(`.data-table [data-sort="${this.sortColumn}"] i`);
            if (activeHeader) {
                activeHeader.className = this.sortDirection === 'asc' ? 'fas fa-sort-up' : 'fas fa-sort-down';
            }
        }
    }

    updateTable() {
        const tbody = document.getElementById('channelsTableBody');
        const countEl = document.getElementById('channelsCount');
        const paginationContainer = document.querySelector('.pagination-container');
        
        if (tbody) {
            const nodePubKey = this.getStoredNodeId();
            tbody.innerHTML = this.generateTableRows(nodePubKey);
        }
        
        if (countEl) {
            countEl.textContent = this.filteredData.length;
        }

        // Update pagination controls
        if (paginationContainer) {
            paginationContainer.outerHTML = this.generatePaginationControls();
        }
    }

    getStoredNodeId() {
        const urlParams = new URLSearchParams(window.location.search);
        return urlParams.get('node');
    }

    showError(message) {
        console.log('ChannelsTableManager: Showing error:', message);
        const container = document.getElementById('channelsTableContainer');
        if (container) {
            container.innerHTML = `
                <div class="error-message">
                    <i class="fas fa-exclamation-triangle"></i>
                    <p>${message}</p>
                    <small>Check browser console for details</small>
                </div>
            `;
        } else {
            console.error('ChannelsTableManager: Container not found for error state');
        }
    }

    showLoading() {
        const container = document.getElementById('channelsTableContainer');
        if (container) {
            container.innerHTML = `
                <div class="loading-spinner">
                    <i class="fas fa-spinner fa-spin"></i>
                    <p>Loading channel details...</p>
                </div>
            `;
        } else {
            console.error('ChannelsTableManager: Container not found for loading state');
        }
    }

    cleanup() {
        // Clear data
        this.channelsData = [];
        this.filteredData = [];
        this.paginatedData = [];
        this.sortColumn = null;
        this.sortDirection = 'asc';
        this.searchTerm = '';
        this.currentPage = 1;
        this.pageSize = 50;
        this.totalPages = 1;
        
        // Clear container
        const container = document.getElementById('channelsTableContainer');
        if (container) {
            container.innerHTML = '';
        }
    }
}

export default ChannelsTableManager;