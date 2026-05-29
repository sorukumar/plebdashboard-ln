import { parquetRead } from 'https://cdn.jsdelivr.net/npm/hyparquet@1.17.1/+esm';

class ChannelsTableManager {
    constructor() {
        this.tableContainer = null;
        this.channelsData = [];
        this.peerGroupsData = [];
        this.filteredData = [];
        this.paginatedData = [];
        this.sortColumn = null;
        this.sortDirection = 'asc';
        this.searchTerm = '';
        this.currentPage = 1;
        this.pageSize = 50;
        this.totalPages = 1;
        this.eventListenersSetup = false;
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
                            
                            const allChannels = result.map(row => {
                                const obj = {};
                                columns.forEach((col, i) => {
                                    let val = row[i];
                                    if (col.includes('pub') || col.includes('alias')) {
                                        val = val ? String(val).trim() : '';
                                    }
                                    obj[col] = val;
                                });
                                return obj;
                            });
                            
                            // Filter channels for this node
                            this.channelsData = allChannels.filter(
                                ch => ch.node1_pub === nodePubKey || ch.node2_pub === nodePubKey
                            );
                            
                            if (this.channelsData.length === 0) {
                                console.warn('ChannelsTableManager: No channels found for node:', nodePubKey);
                                this.showError('No channels found for this node');
                                resolve();
                                return;
                            }
                            
                            // Group channels by peer
                            const peerGroups = {};
                            this.channelsData.forEach(channel => {
                                const isNode1 = channel.node1_pub === nodePubKey;
                                const peerPubkey = isNode1 ? channel.node2_pub : channel.node1_pub;
                                const pPub = peerPubkey ? String(peerPubkey).trim() : '';
                                const alias1 = channel.alias_1 ? String(channel.alias_1).trim() : '';
                                const alias2 = channel.alias_2 ? String(channel.alias_2).trim() : '';
                                const peerAlias = isNode1 ? alias2 : alias1;
                                
                                if (!peerGroups[pPub]) {
                                    peerGroups[pPub] = {
                                        peerPubkey: pPub,
                                        peerAlias: peerAlias || (pPub ? pPub.substring(0, 8) + '...' : '-'),
                                        channels: [],
                                        totalCapacity: 0,
                                        channelCount: 0
                                    };
                                }
                                peerGroups[pPub].channels.push(channel);
                                peerGroups[pPub].totalCapacity += Number(channel.capacity) || 0;
                                peerGroups[pPub].channelCount += 1;
                            });
                            this.peerGroupsData = Object.values(peerGroups);

                            this.filteredData = [...this.peerGroupsData];
                            this.renderTable(nodePubKey);
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
            return { disabled: true, fee_base_msat: 0, fee_rate_milli_msat: 0, inbound_fee_base_msat: 0, inbound_fee_rate_milli_msat: 0, min_htlc: 0, max_htlc_msat: 0, time_lock_delta: 0 };
        }
        try {
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
            return { disabled: true, fee_base_msat: 0, fee_rate_milli_msat: 0, inbound_fee_base_msat: 0, inbound_fee_rate_milli_msat: 0, min_htlc: 0, max_htlc_msat: 0, time_lock_delta: 0 };
        }
    }

    formatCapacity(value) {
        if (value === null || value === undefined) return '-';
        const capacity = Number(value);
        if (Number.isNaN(capacity)) return '-';

        if (capacity < 1_000_000) {
            // < 1M sats -> k sats
            return `${(capacity / 1_000).toLocaleString(undefined, { maximumFractionDigits: 0 })}k sats`;
        } else if (capacity < 100_000_000) {
            // < 100M sats -> m sats
            return `${(capacity / 1_000_000).toLocaleString(undefined, { maximumFractionDigits: 0 })}m sats`;
        } else {
            // >= 100M sats -> bitcoin
            const btc = capacity / 100_000_000;
            if (btc >= 10) {
                return `${btc.toLocaleString(undefined, { maximumFractionDigits: 0 })} bitcoin`;
            } else {
                return `${btc.toLocaleString(undefined, { maximumFractionDigits: 1 })} bitcoin`;
            }
        }
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
                <div class="fee-row"><span class="fee-label">Base:</span><span class="fee-value">${this.formatMsat(policy.fee_base_msat)} msat</span></div>
                <div class="fee-row"><span class="fee-label">Rate:</span><span class="fee-value">${this.formatPPM(policy.fee_rate_milli_msat)} ppm</span></div>
                <div class="fee-row"><span class="fee-label">Inbound Base:</span><span class="fee-value">${this.formatMsat(policy.inbound_fee_base_msat)} msat</span></div>
                <div class="fee-row"><span class="fee-label">Inbound Rate:</span><span class="fee-value">${this.formatPPM(policy.inbound_fee_rate_milli_msat)} ppm</span></div>
                <div class="fee-row"><span class="fee-label">Min HTLC:</span><span class="fee-value">${this.formatMsat(policy.min_htlc)} msat</span></div>
                <div class="fee-row"><span class="fee-label">Max HTLC:</span><span class="fee-value">${this.formatMsat(policy.max_htlc_msat)} msat</span></div>
                <div class="fee-row"><span class="fee-label">Timelock Δ:</span><span class="fee-value">${policy.time_lock_delta || 0}</span></div>
            </div>
        `;
    }

    renderTable(nodePubKey) {
        const container = document.getElementById('channelsTableContainer');
        if (!container) return;

        this.updatePagination();

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
                    <span id="channelsCount">${this.filteredData.length}</span> peers
                </div>
            </div>
        `;

        const tableWrapper = document.createElement('div');
        tableWrapper.className = 'table-wrapper';

        const table = document.createElement('table');
        table.className = 'data-table';
        table.id = 'channelsTable';

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

        thead.querySelectorAll('th.sortable').forEach(th => {
            th.addEventListener('click', () => this.sortData(th.dataset.sort));
        });

        const tbody = document.createElement('tbody');
        tbody.id = 'channelsTableBody';
        tbody.innerHTML = this.generateTableRows(nodePubKey);
        table.appendChild(tbody);

        tableWrapper.appendChild(table);

        container.innerHTML = controlsHTML;
        container.appendChild(tableWrapper);
        container.insertAdjacentHTML('beforeend', this.generatePaginationControls());

        this.setupEventListeners();
    }

    generateTableRows(nodePubKey) {
        return this.paginatedData.map((group, index) => {
            const peerPubkey = group.peerPubkey;
            const peerAlias = group.peerAlias;
            
            if (group.channelCount === 1) {
                const channel = group.channels[0];
                const isNode1 = channel.node1_pub === nodePubKey;
                const myPolicy = this.parsePolicy(isNode1 ? channel.node1_policy : channel.node2_policy);
                const peerPolicy = this.parsePolicy(isNode1 ? channel.node2_policy : channel.node1_policy);

                const myStatus = myPolicy.disabled ? 'Disabled' : 'Active';
                const peerStatus = peerPolicy.disabled ? 'Disabled' : 'Active';
                
                return `
                    <tr class="channel-row">
                        <td>
                            <div class="peer-info-compact" style="display:inline-block; vertical-align: middle;">
                                ${peerPubkey ? `<a href="profile.html?node=${encodeURIComponent(peerPubkey)}" class="peer-link" title="View profile">${peerAlias}</a>` : peerAlias}
                            </div>
                        </td>
                        <td class="capacity-cell">${this.formatCapacity(channel.capacity)}</td>
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
            }

            const masterRow = `
                <tr class="peer-group-row" data-group-index="${index}">
                    <td>
                        <i class="fas fa-chevron-right expand-icon"></i>
                        <div class="peer-info-compact" style="display:inline-block; vertical-align: middle;">
                            ${peerPubkey ? `<a href="profile.html?node=${encodeURIComponent(peerPubkey)}" class="peer-link" title="View profile">${peerAlias}</a>` : peerAlias}
                            <span class="badge" style="font-size: 0.75rem; background: var(--bg-secondary); padding: 2px 6px; border-radius: 10px; margin-left: 5px; color: var(--text-secondary);">${group.channelCount}</span>
                        </div>
                    </td>
                    <td class="capacity-cell">${this.formatCapacity(group.totalCapacity)}</td>
                    <td class="birth-tx-cell" colspan="4" style="color: var(--text-secondary); font-style: italic;">
                        Click to view ${group.channelCount} channels
                    </td>
                </tr>
            `;

            const channelsHtml = group.channels.map(channel => {
                const isNode1 = channel.node1_pub === nodePubKey;
                const myPolicy = this.parsePolicy(isNode1 ? channel.node1_policy : channel.node2_policy);
                const peerPolicy = this.parsePolicy(isNode1 ? channel.node2_policy : channel.node1_policy);

                const myStatus = myPolicy.disabled ? 'Disabled' : 'Active';
                const peerStatus = peerPolicy.disabled ? 'Disabled' : 'Active';
                
                return `
                    <tr>
                        <td class="capacity-cell">${this.formatCapacity(channel.capacity)}</td>
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

            const detailRow = `
                <tr class="channel-details-row" id="group-details-${index}" style="display: none;">
                    <td colspan="6">
                        <div class="nested-table-container">
                            <table class="nested-table">
                                <thead>
                                    <tr>
                                        <th>Capacity</th>
                                        <th>Birth TX</th>
                                        <th>My Policy</th>
                                        <th>Peer Policy</th>
                                        <th>Status</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${channelsHtml}
                                </tbody>
                            </table>
                        </div>
                    </td>
                </tr>
            `;

            return masterRow + detailRow;
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
            return '<div class="pagination-info">Showing all peers</div>';
        }

        const startItem = (this.currentPage - 1) * this.pageSize + 1;
        const endItem = Math.min(this.currentPage * this.pageSize, this.filteredData.length);
        
        let pageButtons = '';
        const maxVisiblePages = 5;
        let startPage = Math.max(1, this.currentPage - Math.floor(maxVisiblePages / 2));
        let endPage = Math.min(this.totalPages, startPage + maxVisiblePages - 1);
        
        if (endPage - startPage < maxVisiblePages - 1) {
            startPage = Math.max(1, endPage - maxVisiblePages + 1);
        }

        pageButtons += `
            <button class="pagination-btn" ${this.currentPage === 1 ? 'disabled' : ''} data-page="1">
                <i class="fas fa-angle-double-left"></i>
            </button>
            <button class="pagination-btn" ${this.currentPage === 1 ? 'disabled' : ''} data-page="${this.currentPage - 1}">
                <i class="fas fa-angle-left"></i>
            </button>
        `;

        for (let i = startPage; i <= endPage; i++) {
            pageButtons += `
                <button class="pagination-btn ${i === this.currentPage ? 'active' : ''}" data-page="${i}">
                    ${i}
                </button>
            `;
        }

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
                    Showing ${startItem}-${endItem} of ${this.filteredData.length} peers
                </div>
                <div class="pagination-controls">
                    ${pageButtons}
                </div>
            </div>
        `;
    }

    setupEventListeners() {
        if (this.eventListenersSetup) return; // Prevent multiple bindings
        this.eventListenersSetup = true;

        // Search functionality attached to document using event delegation
        document.addEventListener('input', (e) => {
            if (e.target && e.target.id === 'channelsSearch') {
                this.searchTerm = e.target.value.toLowerCase();
                this.currentPage = 1;
                this.filterData();
            }
        });

        document.addEventListener('change', (e) => {
            if (e.target && e.target.id === 'pageSizeSelect') {
                this.pageSize = parseInt(e.target.value);
                this.currentPage = 1;
                this.updatePagination();
                this.updateTable();
            }
        });

        document.addEventListener('click', (e) => {
            // Pagination buttons
            if (e.target.closest('.pagination-btn') && !e.target.closest('.pagination-btn').disabled) {
                const page = parseInt(e.target.closest('.pagination-btn').getAttribute('data-page'));
                if (page && page !== this.currentPage) {
                    this.currentPage = page;
                    this.updatePagination();
                    this.updateTable();
                }
            }

            // Expand/collapse rows
            const row = e.target.closest('.peer-group-row');
            if (row) {
                // If clicked on a link, don't expand
                if (e.target.closest('.peer-link')) return;

                const index = row.getAttribute('data-group-index');
                const detailsRow = document.getElementById(`group-details-${index}`);
                if (detailsRow) {
                    const isExpanded = row.classList.contains('expanded');
                    if (isExpanded) {
                        row.classList.remove('expanded');
                        detailsRow.style.display = 'none';
                    } else {
                        row.classList.add('expanded');
                        detailsRow.style.display = 'table-row';
                    }
                }
            }
        });
    }

    filterData() {
        if (!this.searchTerm) {
            this.filteredData = [...this.peerGroupsData];
        } else {
            this.filteredData = this.peerGroupsData.filter(group => {
                const searchableText = [
                    group.peerAlias,
                    group.peerPubkey
                ].join(' ').toLowerCase();
                
                return searchableText.includes(this.searchTerm);
            });
        }
        
        this.updatePagination();
        this.updateTable();
    }

    sortData(column) {
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
                    aVal = (a.peerAlias || '').toLowerCase();
                    bVal = (b.peerAlias || '').toLowerCase();
                    break;
                case 'capacity':
                    aVal = Number(a.totalCapacity) || 0;
                    bVal = Number(b.totalCapacity) || 0;
                    break;
                case 'birth_tx':
                    aVal = Number(a.channels[0]?.channel_id) || 0;
                    bVal = Number(b.channels[0]?.channel_id) || 0;
                    break;
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
        document.querySelectorAll('.data-table th.sortable i').forEach(icon => {
            icon.className = 'fas fa-sort';
        });

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

        if (paginationContainer) {
            paginationContainer.outerHTML = this.generatePaginationControls();
        }
    }

    getStoredNodeId() {
        const urlParams = new URLSearchParams(window.location.search);
        return urlParams.get('node');
    }

    showError(message) {
        const container = document.getElementById('channelsTableContainer');
        if (container) {
            container.innerHTML = `
                <div class="error-message">
                    <i class="fas fa-exclamation-triangle"></i>
                    <p>${message}</p>
                    <small>Check browser console for details</small>
                </div>
            `;
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
        }
    }

    cleanup() {
        this.channelsData = [];
        this.peerGroupsData = [];
        this.filteredData = [];
        this.paginatedData = [];
        this.sortColumn = null;
        this.sortDirection = 'asc';
        this.searchTerm = '';
        this.currentPage = 1;
        this.pageSize = 50;
        this.totalPages = 1;
        
        const container = document.getElementById('channelsTableContainer');
        if (container) {
            container.innerHTML = '';
        }
    }
}

export default ChannelsTableManager;