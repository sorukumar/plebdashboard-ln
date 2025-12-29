import { parquetRead } from 'https://cdn.jsdelivr.net/npm/hyparquet@1.17.1/+esm';

// Function to copy pub key to clipboard
function copyPubKey(pubKey, element) {
    navigator.clipboard.writeText(pubKey).then(() => {
        // Store original content
        const originalText = element.textContent;

        // Update to show success state
        element.textContent = 'Copied!';
        element.style.background = 'var(--primary)';
        element.style.color = 'white';

        // Revert back after 1.5 seconds
        setTimeout(() => {
            element.textContent = originalText;
            element.style.background = '';
            element.style.color = '';
        }, 1500);
    }).catch(err => {
        console.error('Failed to copy: ', err);
        // Fallback for older browsers
        const textArea = document.createElement('textarea');
        textArea.value = pubKey;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
        
        // Show success state even with fallback
        element.textContent = 'Copied!';
        element.style.background = 'var(--primary)';
        element.style.color = 'white';
        
        setTimeout(() => {
            element.textContent = pubKey.substring(0, 8) + '...';
            element.style.background = '';
            element.style.color = '';
        }, 1500);
    });
}

window.copyPubKey = copyPubKey;

class ChannelExplorerManager {
    columns = [
        'peer', 'capacity', 'birth_tx', 'node1_fees', 'node2_fees', 'status'
    ];

    visibleColumns = [
        'peer', 'capacity', 'birth_tx', 'node1_fees', 'node2_fees', 'status'
    ];

    constructor() {
        this.allChannels = [];
        this.filteredChannels = [];
        this.currentPage = 1;
        this.itemsPerPage = 50;
        this.sortColumn = null;
        this.sortDirection = 'asc';
        
        if (window.location.protocol === 'file:') {
            this.showError('Please use Live Server extension or local web server.');
            return;
        }
        
        this.initializeEventListeners();
        this.loadChannelData();
    }

    initializeEventListeners() {
        const node1SearchInput = document.getElementById('node1SearchInput');
        const node2SearchInput = document.getElementById('node2SearchInput');
        if (node1SearchInput) {
            node1SearchInput.addEventListener('input', () => this.filterData());
        }
        if (node2SearchInput) {
            node2SearchInput.addEventListener('input', () => this.filterData());
        }
        
        const resetBtn = document.getElementById('resetFilters');
        if (resetBtn) {
            resetBtn.addEventListener('click', () => {
                this.resetFilters();
            });
        }

        const prevBtn = document.getElementById('prevPage');
        const nextBtn = document.getElementById('nextPage');
        
        if (prevBtn) {
            prevBtn.addEventListener('click', () => {
                if (this.currentPage > 1) {
                    this.currentPage--;
                    this.renderTable();
                }
            });
        }
        
        if (nextBtn) {
            nextBtn.addEventListener('click', () => {
                const totalPages = Math.ceil(this.filteredChannels.length / this.itemsPerPage);
                if (this.currentPage < totalPages) {
                    this.currentPage++;
                    this.renderTable();
                }
            });
        }
    }
    
    async loadChannelData() {
        try {
            const response = await fetch('data/channel_profile.parquet');
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            
            const arrayBuffer = await response.arrayBuffer();
            
            await parquetRead({
                file: arrayBuffer,
                onComplete: (result) => {
                    const parquetColumns = [
                        'node1_pub', 'node2_pub', 'capacity', 'node1_policy', 'node2_policy', 'alias_1', 'alias_2', 'birth_tx', 'channel_id', 'in_latest_gossip'
                    ];
                    
                    if (Array.isArray(result) && result.length > 0) {
                        this.allChannels = result.map(row =>
                            Object.fromEntries(parquetColumns.map((col, i) => [col, row[i]]))
                        ).filter(channel => channel.capacity && (channel.alias_1 || channel.alias_2)).map(channel => {
                            const alias1 = channel.alias_1 || (channel.node1_pub ? channel.node1_pub.substring(0, 10) + '...' : 'Unknown');
                            const alias2 = channel.alias_2 || (channel.node2_pub ? channel.node2_pub.substring(0, 10) + '...' : 'Unknown');
                            return {
                                ...channel,
                                alias_1: alias1,
                                alias_2: alias2,
                                peer: `${alias1} ↔ ${alias2}`,
                                node1_policy_parsed: this.parsePolicy(channel.node1_policy),
                                node2_policy_parsed: this.parsePolicy(channel.node2_policy),
                                status: this.getStatus(this.parsePolicy(channel.node1_policy), this.parsePolicy(channel.node2_policy))
                            };
                        });
                        
                        this.filteredChannels = [...this.allChannels];
                        this.renderTable();
                        this.hideLoading();
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

    parsePolicy(policyStr) {
        if (!policyStr || policyStr === 'null' || policyStr === null) {
            return {
                announced: false,
                disabled: false,
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
                announced: true,
                disabled: policy.disabled || false,
                fee_base_msat: Number(policy.fee_base_msat) || Number(policy.base_fee) || 0,
                fee_rate_milli_msat: Number(policy.fee_rate_milli_msat) || Number(policy.fee_rate) || 0,
                inbound_fee_base_msat: Number(policy.inbound_fee_base_msat) || 0,
                inbound_fee_rate_milli_msat: Number(policy.inbound_fee_rate_milli_msat) || 0,
                min_htlc: Number(policy.min_htlc) || 0,
                max_htlc_msat: Number(policy.max_htlc_msat) || 0,
                time_lock_delta: Number(policy.time_lock_delta) || 0
            };
        } catch (e) {
            console.warn('Error parsing policy:', e, policyStr);
            return {
                announced: false,
                disabled: false,
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

    formatMsat(msat) {
        if (msat === null || msat === undefined) return '0';
        const num = Number(msat);
        if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
        if (num >= 1000) return `${(num / 1000).toFixed(0)}K`;
        return num.toLocaleString();
    }

    formatPPM(ppm) {
        if (ppm === null || ppm === undefined) return '0';
        return Number(ppm).toLocaleString();
    }

    formatFeesCompact(policy) {
        if (!policy.announced) {
            return '<span class="disabled-text">Unannounced</span>';
        }
        if (policy.disabled) {
            return '<span class="disabled-text">Disabled</span>';
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

    getStatus(node1Policy, node2Policy) {
        const node1Status = !node1Policy.announced ? 'Not Announced' : (node1Policy.disabled ? 'Disabled' : 'Active');
        const node2Status = !node2Policy.announced ? 'Not Announced' : (node2Policy.disabled ? 'Disabled' : 'Active');
        return `Node 1: ${node1Status} | Node 2: ${node2Status}`;
    }

    filterData() {
        const node1SearchInput = document.getElementById('node1SearchInput');
        const node2SearchInput = document.getElementById('node2SearchInput');
        const node1SearchTerm = node1SearchInput ? node1SearchInput.value.toLowerCase() : '';
        const node2SearchTerm = node2SearchInput ? node2SearchInput.value.toLowerCase() : '';

        let filtered = this.allChannels;
        if (node1SearchTerm) {
            filtered = filtered.filter(channel =>
                (channel.alias_1 || '').toLowerCase().includes(node1SearchTerm) ||
                (channel.node1_pub || '').toLowerCase().includes(node1SearchTerm)
            );
        }
        if (node2SearchTerm) {
            filtered = filtered.filter(channel =>
                (channel.alias_2 || '').toLowerCase().includes(node2SearchTerm) ||
                (channel.node2_pub || '').toLowerCase().includes(node2SearchTerm)
            );
        }
        this.filteredChannels = filtered;

        this.currentPage = 1;
        this.renderTable();
    }

    resetFilters() {
        const node1SearchInput = document.getElementById('node1SearchInput');
        const node2SearchInput = document.getElementById('node2SearchInput');
        if (node1SearchInput) node1SearchInput.value = '';
        if (node2SearchInput) node2SearchInput.value = '';
        this.filteredChannels = [...this.allChannels];
        this.currentPage = 1;
        this.sortColumn = null;
        this.sortDirection = 'asc';
        this.renderTable();
    }

    sortData(column) {
        // Skip sorting for non-sortable columns
        const nonSortableColumns = ['peer', 'node1_fees', 'node2_fees'];
        if (nonSortableColumns.includes(column)) return;

        if (this.sortColumn === column) {
            this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
        } else {
            this.sortColumn = column;
            this.sortDirection = 'asc';
        }

        const multiplier = this.sortDirection === 'asc' ? 1 : -1;

        // Numeric columns
        const numericColumns = ['capacity'];

        this.filteredChannels.sort((a, b) => {
            let aVal = a[column];
            let bVal = b[column];

            // Handle null/undefined values
            if (aVal === null || aVal === undefined) return 1 * multiplier;
            if (bVal === null || bVal === undefined) return -1 * multiplier;

            if (numericColumns.includes(column)) {
                return (Number(aVal) - Number(bVal)) * multiplier;
            }

            // For birth_tx, sort as string
            if (column === 'birth_tx') {
                aVal = String(aVal);
                bVal = String(bVal);
                return aVal.localeCompare(bVal) * multiplier;
            }

            // For status, sort by my status then peer
            if (column === 'status') {
                const getStatusPriority = (statusStr) => {
                    if (statusStr.includes('Active')) return 2;
                    if (statusStr.includes('Not Announced')) return 1;
                    return 0; // Disabled
                };
                const aMy = getStatusPriority(aVal.split(' | ')[0]);
                const bMy = getStatusPriority(bVal.split(' | ')[0]);
                if (aMy !== bMy) return (aMy - bMy) * multiplier;
                const aPeer = getStatusPriority(aVal.split(' | ')[1]);
                const bPeer = getStatusPriority(bVal.split(' | ')[1]);
                return (aPeer - bPeer) * multiplier;
            }

            return 0;
        });

        this.currentPage = 1;
        this.renderTable();
        this.updateSortIndicators(column);
    }
    
    updateSortIndicators(column) {
        document.querySelectorAll('th').forEach(th => {
            th.classList.remove('sort-asc', 'sort-desc');
        });
        
        const th = document.querySelector(`th[data-column="${column}"]`);
        if (th) {
            th.classList.add(`sort-${this.sortDirection}`);
        }
    }

    renderTable() {
        if (this.allChannels.length === 0) return;
        
        const table = document.getElementById('channelTable');
        const thead = document.getElementById('tableHead');
        const tbody = document.getElementById('tableBody');
        
        if (!table || !thead || !tbody) return;
        
        // Define tooltips for technical columns
        const columnTooltips = {
            'node1_fees': 'Fees charged by this node for routing',
            'node2_fees': 'Fees charged by the peer node for routing',
            'status': 'Channel status from each node\'s perspective'
        };
        
        thead.innerHTML = '';
        const headerRow = document.createElement('tr');
        
        this.visibleColumns.forEach(column => {
            const th = document.createElement('th');
            const shortLabel = this.getShortHeaderLabel(column);
            
            if (columnTooltips[column]) {
                th.innerHTML = `
                    <span class="column-header-wrapper" title="${columnTooltips[column]}">
                        ${shortLabel}
                        <i class="fas fa-info-circle column-info-icon"></i>
                    </span>
                `;
                th.title = columnTooltips[column];
            } else {
                th.innerHTML = shortLabel;
            }
            
            th.dataset.column = column;
            
            // Only add sorting for sortable columns
            const nonSortableColumns = ['peer', 'node1_fees', 'node2_fees'];
            if (!nonSortableColumns.includes(column)) {
                th.classList.add('sortable');
                th.addEventListener('click', () => this.sortData(column));
            }
            
            headerRow.appendChild(th);
        });
        
        thead.appendChild(headerRow);
        
        tbody.innerHTML = '';
        const startIndex = (this.currentPage - 1) * this.itemsPerPage;
        const endIndex = startIndex + this.itemsPerPage;
        const pageChannels = this.filteredChannels.slice(startIndex, endIndex);
        
        pageChannels.forEach(channel => {
            const tr = document.createElement('tr');
            
            this.visibleColumns.forEach(key => {
                const value = channel[key];
                const td = document.createElement('td');

                if (key === 'peer') {
                    const alias1 = channel.alias_1 || 'Unknown';
                    const alias2 = channel.alias_2 || 'Unknown';
                    const pubkey1 = channel.node1_pub;
                    const pubkey2 = channel.node2_pub;
                    td.innerHTML = `
                        <span class="peer-aliases">
                            ${pubkey1 ? `<a href="profile.html?node=${encodeURIComponent(pubkey1)}" class="alias-link" title="View ${alias1}'s profile">${alias1}</a>` : alias1}
                            ↔
                            ${pubkey2 ? `<a href="profile.html?node=${encodeURIComponent(pubkey2)}" class="alias-link" title="View ${alias2}'s profile">${alias2}</a>` : alias2}
                        </span>
                    `;
                } else if (key === 'capacity') {
                    td.textContent = this.formatCapacity(value);
                } else if (key === 'birth_tx') {
                    const channelId = channel.channel_id;
                    if (channelId) {
                        td.innerHTML = `<a href="https://mempool.space/lightning/channel/${channelId}" target="_blank" rel="noopener noreferrer" style="color: inherit; text-decoration: underline;">${value || 'N/A'}</a>`;
                    } else {
                        td.textContent = value || 'N/A';
                    }
                } else if (key === 'node1_fees') {
                    td.innerHTML = this.formatFeesCompact(channel.node1_policy_parsed);
                } else if (key === 'node2_fees') {
                    td.innerHTML = this.formatFeesCompact(channel.node2_policy_parsed);
                } else {
                    td.textContent = value || '-';
                }
                tr.appendChild(td);
            });
            tbody.appendChild(tr);
        });
        
        table.style.display = 'table';
        this.updatePaginationControls();
        this.updateFilterStats();
    }

    getShortHeaderLabel(column) {
        switch (column) {
            case 'peer':
                return 'PEER';
            case 'capacity':
                return 'CAPACITY';
            case 'birth_tx':
                return 'BIRTH TX';
            case 'node1_fees':
                return 'NODE 1<br>FEES';
            case 'node2_fees':
                return 'NODE 2<br>FEES';
            case 'status':
                return 'STATUS';
            default:
                return column.toUpperCase().replace(/_/g, ' ');
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
    
    updatePaginationControls() {
        const totalPages = Math.ceil(this.filteredChannels.length / this.itemsPerPage);
        const prevBtn = document.getElementById('prevPage');
        const nextBtn = document.getElementById('nextPage');
        const pageNumbers = document.getElementById('pageNumbers');
        const paginationInfo = document.getElementById('paginationText');
        
        if (!prevBtn || !nextBtn || !pageNumbers || !paginationInfo) return;
        
        prevBtn.disabled = this.currentPage <= 1;
        nextBtn.disabled = this.currentPage >= totalPages;
        
        const startItem = this.filteredChannels.length === 0 ? 0 : (this.currentPage - 1) * this.itemsPerPage + 1;
        const endItem = Math.min(this.currentPage * this.itemsPerPage, this.filteredChannels.length);
        paginationInfo.textContent = `Showing ${startItem}-${endItem} of ${this.filteredChannels.length.toLocaleString()} channels`;
        
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
            pageLink.textContent = i;
            pageLink.classList.add('page-number');
            if (i === this.currentPage) {
                pageLink.classList.add('active');
            }
            pageLink.addEventListener('click', (e) => {
                e.preventDefault();
                this.currentPage = i;
                this.renderTable();
            });
            pageNumbers.appendChild(pageLink);
        }
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
    
    hideLoading() {
        const loading = document.getElementById('loadingState');
        if (loading) loading.style.display = 'none';
        const container = document.getElementById('channelExplorerContainer');
        if (container) container.style.display = 'block';
        const pagination = document.getElementById('paginationContainer');
        if (pagination) pagination.style.display = 'flex';
    }
    
    showError(message) {
        const loading = document.getElementById('loadingState');
        if (loading) {
            loading.innerHTML = `
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