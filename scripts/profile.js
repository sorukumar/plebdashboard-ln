import { parquetRead } from 'https://cdn.jsdelivr.net/npm/hyparquet@1.17.1/+esm';

class NodeProfileManager {
    constructor() {
        this.nodeData = null;
        this.nodeId = this.getNodeIdFromUrl();
        this.activeTab = 'overview';
        this.chartManager = null;
        this.channelsTableManager = null;
        this.init();
    }

    getNodeIdFromUrl() {
        const urlParams = new URLSearchParams(window.location.search);
        return urlParams.get('node');
    }

    async init() {
        if (!this.nodeId) {
            this.showError('No node specified in URL');
            return;
        }

        await this.loadNodeData();
        this.setupEventListeners();
        this.setupTabNavigation();
    }

    async loadNodeData() {
        try {
            // Only use node_profile.parquet
            const profileResponse = await fetch('data/node_profile.parquet');
            if (!profileResponse.ok) throw new Error(`HTTP ${profileResponse.status}`);
            const profileBuffer = await profileResponse.arrayBuffer();
            await this.parseParquetData(profileBuffer);

            if (this.nodeData) {
                this.populateProfile();
                this.showProfile();
            } else {
                this.showError('Node not found in database');
            }
        } catch (error) {
            console.error('Error loading node data:', error);
            this.showError('Failed to load node data: ' + error.message);
        }
    }

    async parseParquetData(arrayBuffer) {
        return new Promise((resolve) => {
            parquetRead({
                file: arrayBuffer,
                onComplete: (result) => {
                    const columns = this.getProfileColumns();
                    if (Array.isArray(result) && result.length > 0) {
                        // Log the first raw row as read from Parquet
                        console.log('First raw row from Parquet:', result[0]);
                        // Map each row array to an object using columns
                        const parsedData = result.map(row => {
                            const obj = {};
                            columns.forEach((col, i) => {
                                obj[col] = row[i];
                            });
                            return obj;
                        });
                        // Log all columns and the first row for debugging
                        console.log('Profile columns:', columns);
                        console.log('First mapped row:', parsedData[0]);
                        // Debug: Try a few known pub_keys
                        const testPubKeys = [
                            '035e4ff418fc8b5554c5d9eea66396c227bd429a3251c8cbc711002ba215bfc226', // WalletOfSatoshi
                            '034ea80f8b148c750463546bd999bf7321a0e6dfc60aaf84bd0400a2e8d376c0d5',
                            '02f1a8c87607f415c8f22c00593002775941dea48869ce23096af27b0cfdcc0b69',
                            '03864ef025fde8fb587d989186ce6a4a186895ee44a926bfc370e2c366597a3f8f'
                        ];
                        testPubKeys.forEach(pk => {
                            const found = parsedData.find(n => n.pub_key === pk);
                            if (found) {
                                console.log(`Mapped row for pub_key ${pk}:`);
                                columns.forEach(col => {
                                    console.log(`  ${col}:`, found[col]);
                                });
                            } else {
                                console.log(`pub_key ${pk} not found in mapped data.`);
                            }
                        });
                        this.nodeData = parsedData.find(node =>
                            node.pub_key === this.nodeId ||
                            (node.alias && node.alias.toLowerCase() === this.nodeId.toLowerCase())
                        );
                        if (!this.nodeData) {
                            console.warn('No match found for nodeId in pub_key or alias');
                        }
                    } else {
                        console.warn('Result is not a non-empty array:', result);
                    }
                    resolve();
                },
                onError: (error) => {
                    console.error('Error parsing parquet:', error);
                    resolve();
                }
            });
        });
    }

    getProfileColumns() {
        return [
            'pub_key', 'alias', 'address_1', 'address_2', 'last_seen', 'source', 'update_dt', 'snapshot_date', 
            'closed_channels_count', 'node_type', 'birth_tx', 
            'birth_chan', 'birth_tx_active', 'birth_chan_active', 'first_seen_week', 'total_channels', 'channel_segment', 'category_counts', 'total_capacity', 
            'node_cap_tier', 'capacity_segment', 'avg_chnl_size', 'med_chnl_size', 'mode_chnl_size', 'min_chnl_size', 'max_chnl_size', 
            'betweenness_centrality_rank', 'eigenvector_centrality_rank', 'custom_pagerank_rank', 'capacity_weighted_degree_rank', 
            'total_channels_rank', 'total_capacity_rank', 'pleb_rank', 'ftotal_capacity', 'avg_base_fee', 'med_base_fee', 'max_base_fee',
            'min_base_fee', 'avg_fee_rate', 'med_fee_rate', 'max_fee_rate', 'min_fee_rate'
        ];
    }

    populateProfile() {
        const node = this.nodeData;

        function safeSet(id, value) {
            const el = document.getElementById(id);
            if (el) el.textContent = value;
        }

        // Log all column values for the selected node
        console.log('Profile for node:', node);
        // Basic info
        safeSet('nodeAlias', node.alias || 'Unknown Node');
        safeSet('nodePubkey', node.pub_key || 'Unknown');
        safeSet('nodeType', node.node_type || 'Unknown');
        // Quick stats
        safeSet('overallRank', this.formatRank(node.pleb_rank));
        safeSet('totalCapacity', node.ftotal_capacity || 'Unknown');
        safeSet('channelCount', this.formatNumber(node.total_channels));
        safeSet('lastSeen', node.last_seen || 'Unknown');
        // Overview tab
        const birthTxEl = document.getElementById('birthTx');
        if (birthTxEl) {
            if (node.birth_chan) {
                const chanId = node.birth_chan;
                birthTxEl.innerHTML = `<a href="https://mempool.space/lightning/channel/${chanId}" target="_blank" rel="noopener noreferrer">${node.birth_tx || chanId}</a>`;
            } else {
                birthTxEl.textContent = node.birth_tx || '-';
            }
        }
        safeSet('address1', node.address_1 || '-');
        safeSet('address2', node.address_2 || '-');
        // Rankings tab
        safeSet('plebRank', this.formatRank(node.pleb_rank));
        safeSet('capacityRank', this.formatRank(node.total_capacity_rank));
        safeSet('channelsRank', this.formatRank(node.total_channels_rank));
        safeSet('betweennessRank', this.formatRank(node.betweenness_centrality_rank));
        safeSet('weightedDegreeRank', this.formatRank(node.capacity_weighted_degree_rank));
        safeSet('eigenvectorRank', this.formatRank(node.eigenvector_centrality_rank));
        // Metrics tab
        safeSet('pagerankScore', this.formatPagerank(node.custom_pagerank));
        safeSet('metricsNodeType', node.node_type || 'Unknown');
        // Removed capacity segment assignment
        safeSet('nodeCapTier', node.node_cap_tier || '-');
        // Category Counts formatting (multi-line)
        const categoryCountsEl = document.getElementById('categoryCounts');
        if (categoryCountsEl) {
            let formatted = '-';
            if (node.category_counts && typeof node.category_counts === 'object') {
                let obj = node.category_counts;
                if (typeof obj === 'string') {
                    try {
                        obj = JSON.parse(obj);
                    } catch (e) {
                        obj = null;
                    }
                }
                if (obj && typeof obj === 'object') {
                    formatted = Object.entries(obj)
                        .map(([k, v]) => `${k}: ${v}`)
                        .join('<br>');
                }
            }
            categoryCountsEl.innerHTML = formatted;
        }
        // Channel Size metrics (min, median, avg, max)
        const min = this.formatCapacity(node.min_chnl_size);
        const median = this.formatCapacity(node.med_chnl_size);
        const avg = this.formatCapacity(node.avg_chnl_size);
        const max = this.formatCapacity(node.max_chnl_size);
        const formatted = [min, median, avg, max].join(', ');
        const channelSizeEl = document.getElementById('channelSizeMetrics');
        if (channelSizeEl) channelSizeEl.textContent = formatted;
    }

    formatRank(rank) {
        if (!rank || rank === null || rank === undefined) return 'N/A';
        return `#${Number(rank).toLocaleString()}`;
    }

    formatCapacity(capacity) {
        if (!capacity || capacity === null || capacity === undefined) return 'N/A';
        const num = Number(capacity);
        if (num >= 1000000) {
            return `${(num / 1000000).toFixed(0)}M sats`;
        } else if (num >= 1000) {
            return `${(num / 1000).toFixed(0)}K sats`;
        }
        return `${num.toLocaleString()} sats`;
    }

    formatNumber(num) {
        if (!num || num === null || num === undefined) return 'N/A';
        return Number(num).toLocaleString();
    }

    formatPagerank(pagerank) {
        if (!pagerank || pagerank === null || pagerank === undefined) return 'N/A';
        return Number(pagerank).toExponential(3);
    }

    setupEventListeners() {
        // Copy pubkey functionality
        const copyBtn = document.getElementById('copyPubkeyBtn');
        if (copyBtn && this.nodeData) {
            copyBtn.addEventListener('click', () => {
                navigator.clipboard.writeText(this.nodeData.pub_key).then(() => {
                    const icon = copyBtn.querySelector('i');
                    const originalClass = icon.className;
                    icon.className = 'fas fa-check';
                    copyBtn.title = 'Copied!';
                    
                    setTimeout(() => {
                        icon.className = originalClass;
                        copyBtn.title = 'Copy public key';
                    }, 2000);
                }).catch(err => {
                    console.error('Failed to copy: ', err);
                });
            });
        }
    }

    setupTabNavigation() {
        const tabButtons = document.querySelectorAll('.tab-btn');
        const tabPanes = document.querySelectorAll('.tab-pane');

        tabButtons.forEach(button => {
            button.addEventListener('click', async () => {
                const targetTab = button.getAttribute('data-tab');
                
                // Don't do anything if already on this tab
                if (this.activeTab === targetTab) return;
                
                // Cleanup current tab
                await this.cleanupTab(this.activeTab);
                
                // Remove active class from all buttons and panes
                tabButtons.forEach(btn => btn.classList.remove('active'));
                tabPanes.forEach(pane => pane.classList.remove('active'));
                
                // Add active class to clicked button and corresponding pane
                button.classList.add('active');
                const targetPane = document.getElementById(targetTab);
                if (targetPane) {
                    targetPane.classList.add('active');
                }
                
                // Update active tab
                this.activeTab = targetTab;
                
                // Initialize new tab
                await this.initializeTab(targetTab);
            });
        });
    }

    async cleanupTab(tabName) {
        if (tabName === 'channels' && this.chartManager) {
            // Dispose of ECharts instance
            const chartDom = document.getElementById('channelsTreemap');
            if (chartDom && window.echarts) {
                const chartInstance = window.echarts.getInstanceByDom(chartDom);
                if (chartInstance) {
                    chartInstance.dispose();
                }
            }
        }
        
        if (tabName === 'channels-table' && this.channelsTableManager) {
            // Cleanup table resources
            this.channelsTableManager.cleanup();
        }
    }

    async initializeTab(tabName) {
        console.log('NodeProfileManager: Initializing tab:', tabName);
        
        if (tabName === 'channels') {
            // Clear the chart container
            const chartContainer = document.getElementById('channelsTreemap');
            if (chartContainer) {
                chartContainer.innerHTML = '';
            }
            
            // Load the channels chart
            if (!this.chartManager) {
                this.chartManager = await this.loadChannelsManager();
            }
            
            if (this.chartManager && this.chartManager.loadAndRenderChannelsTreemap) {
                try {
                    await this.chartManager.loadAndRenderChannelsTreemap(this.nodeId);
                    
                    // Ensure proper resize after a brief delay
                    setTimeout(() => {
                        if (window.echarts) {
                            const chartDom = document.getElementById('channelsTreemap');
                            const chartInstance = window.echarts.getInstanceByDom(chartDom);
                            if (chartInstance) {
                                chartInstance.resize();
                            }
                        }
                    }, 100);
                } catch (error) {
                    console.error('Failed to load channels treemap:', error);
                }
            }
        }
        
        if (tabName === 'channels-table') {
            console.log('NodeProfileManager: Initializing channels-table tab for node:', this.nodeId);
            
            // Check if container exists
            const container = document.getElementById('channelsTableContainer');
            if (!container) {
                console.error('NodeProfileManager: channelsTableContainer not found in DOM');
                return;
            }
            
            // Load the channels table
            if (!this.channelsTableManager) {
                console.log('NodeProfileManager: Loading channels table manager...');
                this.channelsTableManager = await this.loadChannelsTableManager();
                console.log('NodeProfileManager: Channels table manager loaded:', !!this.channelsTableManager);
            }
            
            if (this.channelsTableManager && this.channelsTableManager.loadAndRenderTable) {
                try {
                    console.log('NodeProfileManager: Calling loadAndRenderTable...');
                    await this.channelsTableManager.loadAndRenderTable(this.nodeId);
                    console.log('NodeProfileManager: Table loaded successfully');
                } catch (error) {
                    console.error('NodeProfileManager: Failed to load channels table:', error);
                    // Show error in the container
                    container.innerHTML = `
                        <div class="error-message">
                            <i class="fas fa-exclamation-triangle"></i>
                            <p>Failed to load channel data: ${error.message}</p>
                            <small>Check browser console for details</small>
                        </div>
                    `;
                }
            } else {
                console.error('NodeProfileManager: channelsTableManager or loadAndRenderTable method not available');
                container.innerHTML = `
                    <div class="error-message">
                        <i class="fas fa-exclamation-triangle"></i>
                        <p>Channel table manager failed to load</p>
                        <small>Check browser console for details</small>
                    </div>
                `;
            }
        }
    }

    async loadChannelsManager() {
        try {
            const { default: ChannelsTreemapManager } = await import('./profile-channels.js');
            return new ChannelsTreemapManager();
        } catch (error) {
            console.error('Failed to load channels manager:', error);
            return null;
        }
    }

    async loadChannelsTableManager() {
        try {
            console.log('NodeProfileManager: Importing profile-channels-table.js...');
            const { default: ChannelsTableManager } = await import('./profile-channels-table.js');
            console.log('NodeProfileManager: ChannelsTableManager imported successfully');
            const manager = new ChannelsTableManager();
            console.log('NodeProfileManager: ChannelsTableManager instance created');
            return manager;
        } catch (error) {
            console.error('NodeProfileManager: Failed to load channels table manager:', error);
            return null;
        }
    }

    showProfile() {
        document.getElementById('loading').style.display = 'none';
        document.getElementById('error').style.display = 'none';
        document.getElementById('profileContent').style.display = 'block';
    }

    showError(message) {
        document.getElementById('loading').style.display = 'none';
        document.getElementById('profileContent').style.display = 'none';
        document.getElementById('error').style.display = 'flex';
        document.getElementById('errorMessage').textContent = message;
    }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new NodeProfileManager();
});