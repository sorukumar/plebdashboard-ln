import { parquetRead } from 'https://cdn.jsdelivr.net/npm/hyparquet@1.17.1/+esm';

class NodeComparisonManager {
    constructor() {
        this.nodesData = [];
        this.rankData = [];
        this.selectedNodes = [];
        this.allNodesData = [];
        this.searchIndex = new Map();
        this.debounceTimer = null;
        this.selectedSuggestionIndex = -1;
        this.currentInputId = null;
        this.radarChart = null; // Store chart instance
        this.init();
    }

    async init() {
        await this.loadAllNodeData();
        this.setupEventListeners();
        this.checkUrlParams();
    }

    async loadAllNodeData() {
        try {
            console.log('Loading all node data...');
            const response = await fetch('data/node_rank.parquet');
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            
            const arrayBuffer = await response.arrayBuffer();
            
            await parquetRead({
                file: arrayBuffer,
                onComplete: (result) => {
                    const columns = this.getRankColumns();
                    this.allNodesData = result.map(row => {
                        const obj = {};
                        columns.forEach((col, i) => obj[col] = row[i]);
                        return obj;
                    }).filter(node => node.pub_key);
                    console.log('Loaded', this.allNodesData.length, 'nodes');
                    this.buildSearchIndex();
                    console.log('Search index built');
                },
                onError: (error) => console.error('Error loading all node data:', error)
            });
        } catch (error) {
            console.error('Failed to load all node data:', error);
        }
    }

    buildSearchIndex() {
        this.searchIndex.clear();
        this.allNodesData.forEach(node => {
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
        const compareBtn = document.getElementById('compareBtn');
        if (compareBtn) {
            compareBtn.addEventListener('click', () => this.handleCompare());
        }

        // Add event listeners for search inputs
        ['node1Input', 'node2Input', 'node3Input'].forEach(inputId => {
            const input = document.getElementById(inputId);
            if (input) {
                input.addEventListener('input', (e) => {
                    this.selectedSuggestionIndex = -1;
                    this.currentInputId = inputId;
                    this.handleSearchInput(e.target.value, inputId);
                });

                input.addEventListener('keydown', (e) => {
                    this.handleKeyNavigation(e, inputId);
                });

                input.addEventListener('focus', (e) => {
                    if (e.target.value.trim()) {
                        this.currentInputId = inputId;
                        this.handleSearchInput(e.target.value, inputId);
                    }
                });

                input.addEventListener('blur', () => {
                    // Delay hiding to allow click on suggestions
                    setTimeout(() => this.hideSuggestions(inputId), 300);
                });
            }
        });

        // Hide suggestions when clicking outside
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.search-container')) {
                this.hideAllSuggestions();
            }
        });

        // Add window resize handler for chart
        window.addEventListener('resize', () => {
            if (this.radarChart) {
                this.radarChart.resize();
            }
        });
    }

    checkUrlParams() {
        const urlParams = new URLSearchParams(window.location.search);
        const nodesParam = urlParams.get('nodes');
        if (nodesParam) {
            const nodeIds = nodesParam.split(',').map(id => id.trim()).filter(id => id);
            if (nodeIds.length >= 2 && nodeIds.length <= 3) {
                this.selectedNodes = nodeIds;
                this.loadDataAndRender();
            }
        }
    }

    async handleCompare() {
        const node1 = document.getElementById('node1Input').value.trim();
        const node2 = document.getElementById('node2Input').value.trim();
        const node3 = document.getElementById('node3Input').value.trim();

        const nodeIds = [node1, node2];
        if (node3) nodeIds.push(node3);

        if (nodeIds.length < 2) {
            this.showError('Please enter at least 2 nodes to compare.');
            return;
        }

        this.selectedNodes = nodeIds;
        this.loadDataAndRender();
    }

    async loadDataAndRender() {
        try {
            this.showLoading();
            await this.loadNodeData();
            await this.loadRankData();
            this.renderComparison();
        } catch (error) {
            console.error('Error loading data:', error);
            this.showError('Failed to load node data: ' + error.message);
        }
    }

    async loadNodeData() {
        const response = await fetch('data/node_profile.parquet');
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const buffer = await response.arrayBuffer();

        return new Promise((resolve) => {
            parquetRead({
                file: buffer,
                onComplete: (result) => {
                    const columns = this.getProfileColumns();
                    const parsedData = result.map(row => {
                        const obj = {};
                        columns.forEach((col, i) => obj[col] = row[i]);
                        return obj;
                    });

                    this.nodesData = this.selectedNodes.map(nodeId =>
                        parsedData.find(node =>
                            node.pub_key === nodeId ||
                            (node.alias && node.alias.toLowerCase() === nodeId.toLowerCase())
                        )
                    ).filter(node => node);

                    if (this.nodesData.length < this.selectedNodes.length) {
                        throw new Error('Some nodes not found in database');
                    }
                    resolve();
                },
                onError: (error) => {
                    console.error('Error parsing profile data:', error);
                    resolve();
                }
            });
        });
    }

    async loadRankData() {
        const response = await fetch('data/node_rank.parquet');
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const buffer = await response.arrayBuffer();

        return new Promise((resolve) => {
            parquetRead({
                file: buffer,
                onComplete: (result) => {
                    const columns = this.getRankColumns();
                    const parsedData = result.map(row => {
                        const obj = {};
                        columns.forEach((col, i) => obj[col] = row[i]);
                        return obj;
                    });

                    this.rankData = this.selectedNodes.map(nodeId =>
                        parsedData.find(node =>
                            node.pub_key === nodeId ||
                            (node.alias && node.alias.toLowerCase() === nodeId.toLowerCase())
                        )
                    ).filter(node => node);

                    resolve();
                },
                onError: (error) => {
                    console.error('Error parsing rank data:', error);
                    resolve();
                }
            });
        });
    }

    getProfileColumns() {
        return [
            'pub_key', 'alias', 'address_1', 'address_2', 'last_seen', 'source', 'snapshot_date', 'update_dt', 
            'closed_channels_count', 'node_type', 'birth_tx', 
            'birth_chan', 'birth_tx_active', 'birth_chan_active', 'first_seen_week', 'in_latest_gossip', 'total_channels', 'channel_segment', 'category_counts', 'total_capacity', 
            'node_cap_tier', 'capacity_segment', 'avg_chnl_size', 'med_chnl_size', 'mode_chnl_size', 'min_chnl_size', 'max_chnl_size', 
            'betweenness_centrality_rank', 'eigenvector_centrality_rank', 'custom_pagerank_rank', 'capacity_weighted_degree_rank', 
            'total_channels_rank', 'total_capacity_rank', 'pleb_rank', 'ftotal_capacity', 'avg_base_fee', 'med_base_fee', 'max_base_fee',
            'min_base_fee', 'avg_fee_rate', 'med_fee_rate', 'max_fee_rate', 'min_fee_rate'
        ];
    }

    getRankColumns() {
        return [
            'pleb_rank', 'channels_rank', 'capacity_rank', 'weighted_degree_rank',
            'betweenness_rank', 'eigenvector_rank', 'pagerank', 'alias',
            'node_type', 'total_capacity', 'num_channels', 'last_seen', 'pub_key'
        ];
    }

    renderComparison() {
        this.renderNodeCards();
        this.renderRadarChart();
        this.showContent();
    }

    renderNodeCards() {
        const grid = document.getElementById('nodesGrid');
        grid.innerHTML = '';

        this.nodesData.forEach((node, index) => {
            const connectAddress = this.getConnectAddress(node);
            const card = document.createElement('div');
            card.className = 'node-card';
            card.innerHTML = `
                <div class="node-header">
                    <h3>${node.alias || 'Unknown Node'}</h3>
                    <div class="node-pubkey">
                        <span>${connectAddress.substring(0, 8)}...</span>
                        <button class="copy-btn" data-text="${connectAddress}" title="Copy connect address">
                            <i class="fas fa-copy"></i>
                        </button>
                    </div>
                </div>
                <div class="node-details">
                    <div class="detail-row">
                        <span class="label">First seen:</span>
                        <span class="value">${this.formatDate(node.first_seen_week)}</span>
                    </div>
                    <div class="detail-row">
                        <span class="label">Channels:</span>
                        <span class="value">${this.formatNumber(node.total_channels)}</span>
                    </div>
                    <div class="detail-row">
                        <span class="label">Capacity:</span>
                        <span class="value">${node.ftotal_capacity || this.formatCapacity(node.total_capacity)}</span>
                    </div>
                    <div class="detail-row">
                        <span class="label">Capacity Tier:</span>
                        <span class="value">${node.node_cap_tier || '-'}</span>
                    </div>
                    <div class="detail-row">
                        <span class="label">Overall Rank:</span>
                        <span class="value">${this.formatRank(node.pleb_rank)}</span>
                    </div>
                </div>
            `;
            grid.appendChild(card);
        });

        // Add copy event listeners
        grid.querySelectorAll('.copy-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const text = e.currentTarget.dataset.text;
                this.copyToClipboard(text, e.currentTarget);
            });
        });
    }

    renderRadarChart() {
        console.log('renderRadarChart called, rankData length:', this.rankData.length);
        console.log('rankData:', this.rankData);
        const chartDom = document.getElementById('radarChart');
        if (!chartDom) {
            console.error('radarChart element not found');
            return;
        }
        
        // Dispose of existing chart instance if any
        if (this.radarChart) {
            this.radarChart.dispose();
        }
        
        this.radarChart = echarts.init(chartDom);

        // Build indicators with just dimension names
        const metricNames = ['Pleb Rank', 'Channels', 'Capacity', 'Weighted Degree', 'Betweenness', 'Eigenvector'];
        const metricKeys = ['pleb_rank', 'channels_rank', 'capacity_rank', 'weighted_degree_rank', 'betweenness_rank', 'eigenvector_rank'];
        
        const indicators = metricNames.map((name, idx) => {
            const key = metricKeys[idx];
            const maxVal = Math.max(...this.rankData.map(n => n[key] || 0));
            
            return {
                name: name,
                max: maxVal
            };
        });

        console.log('indicators:', indicators);

        // Create series data with actual rank values
        const colors = ['#8BC34A', '#03A9F4', '#FFC107'];
        const seriesData = this.rankData.map((node, index) => {
            const values = [
                node.pleb_rank || 0,
                node.channels_rank || 0,
                node.capacity_rank || 0,
                node.weighted_degree_rank || 0,
                node.betweenness_rank || 0,
                node.eigenvector_rank || 0
            ];
            
            return {
                name: node.alias || `Node ${index + 1}`,
                value: values,
                lineStyle: {
                    width: 3,
                    color: colors[index]
                },
                areaStyle: {
                    opacity: 0.25,
                    color: colors[index]
                },
                symbol: 'circle',
                symbolSize: 8,
                itemStyle: {
                    color: colors[index]
                },
                label: {
                    show: true,
                    position: 'top',
                    distance: 8,
                    formatter: function(params) {
                        // params.value is the array of all values
                        // We need to get which dimension this label is for
                        // This is a workaround - we'll show all values
                        return '';
                    },
                    fontSize: 11,
                    fontWeight: 600,
                    color: colors[index],
                    backgroundColor: 'rgba(255, 255, 255, 0.9)',
                    padding: [2, 5],
                    borderRadius: 3,
                    borderColor: colors[index],
                    borderWidth: 1
                }
            };
        });

        console.log('seriesData:', seriesData);

        const option = {
            title: {
                text: 'Node Rankings Comparison',
                subtext: 'Lower values indicate better ranking',
                left: 'center',
                textStyle: {
                    fontSize: 20,
                    fontWeight: 600,
                    color: 'var(--text-primary, #2c3e50)'
                },
                subtextStyle: {
                    fontSize: 14,
                    color: 'var(--text-secondary, #7f8c8d)'
                }
            },
            tooltip: {
                trigger: 'item',
                backgroundColor: 'rgba(50, 50, 50, 0.95)',
                borderColor: '#555',
                borderWidth: 1,
                textStyle: {
                    color: '#fff',
                    fontSize: 13
                },
                formatter: (params) => {
                    if (!params.value) return '';
                    const indicatorNames = [
                        'Pleb Rank',
                        'Channels Rank',
                        'Capacity Rank',
                        'Weighted Degree',
                        'Betweenness',
                        'Eigenvector'
                    ];
                    let tooltip = `<strong style="font-size: 14px; color: ${params.color}">${params.name}</strong><br/>`;
                    params.value.forEach((val, idx) => {
                        tooltip += `${indicatorNames[idx]}: <strong>#${val.toLocaleString()}</strong><br/>`;
                    });
                    return tooltip;
                }
            },
            legend: {
                data: seriesData.map(s => s.name),
                bottom: 10,
                left: 'center',
                itemGap: 20,
                textStyle: {
                    fontSize: 13,
                    color: 'var(--text-primary, #2c3e50)'
                },
                icon: 'roundRect',
                itemWidth: 25,
                itemHeight: 14
            },
            color: colors,
            radar: {
                indicator: indicators,
                shape: 'polygon',
                radius: '65%',
                center: ['50%', '52%'],
                splitNumber: 4,
                splitArea: {
                    show: true,
                    areaStyle: {
                        color: [
                            'rgba(255, 255, 255, 0.02)',
                            'rgba(200, 200, 200, 0.05)'
                        ]
                    }
                },
                splitLine: {
                    lineStyle: {
                        color: 'rgba(200, 200, 200, 0.3)',
                        width: 1
                    }
                },
                axisLine: {
                    lineStyle: {
                        color: 'rgba(200, 200, 200, 0.5)',
                        width: 2
                    }
                },
                name: {
                    formatter: (name, indicator) => {
                        // Add the rank values for all nodes under each dimension name
                        const dimIndex = metricNames.indexOf(name);
                        if (dimIndex === -1) return name;
                        
                        let label = `{title|${name}}\n`;
                        seriesData.forEach((node, idx) => {
                            const value = node.value[dimIndex];
                            const formattedValue = Math.round(value).toLocaleString();
                            label += `{node${idx}|${node.name}: #${formattedValue}}\n`;
                        });
                        return label;
                    },
                    textStyle: {
                        color: 'var(--text-primary, #2c3e50)',
                        fontSize: 12,
                        fontWeight: 500,
                        backgroundColor: 'transparent', // Remove white background
                        padding: [8, 12],
                        borderRadius: 6,
                        lineHeight: 18,
                        rich: {
                            title: {
                                fontSize: 13,
                                fontWeight: 700,
                                color: '#2c3e50',
                                lineHeight: 20,
                                backgroundColor: 'rgba(255, 255, 255, 0.8)', // Slight background only for title
                                padding: [2, 6],
                                borderRadius: 4
                            },
                            node0: {
                                fontSize: 11,
                                fontWeight: 600,
                                color: colors[0],
                                lineHeight: 16,
                                backgroundColor: 'rgba(255, 255, 255, 0.75)',
                                padding: [1, 4],
                                borderRadius: 3
                            },
                            node1: {
                                fontSize: 11,
                                fontWeight: 600,
                                color: colors[1],
                                lineHeight: 16,
                                backgroundColor: 'rgba(255, 255, 255, 0.75)',
                                padding: [1, 4],
                                borderRadius: 3
                            },
                            node2: {
                                fontSize: 11,
                                fontWeight: 600,
                                color: colors[2],
                                lineHeight: 16,
                                backgroundColor: 'rgba(255, 255, 255, 0.75)',
                                padding: [1, 4],
                                borderRadius: 3
                            }
                        }
                    }
                },
                axisLabel: {
                    show: false // Hide axis scale labels
                }
            },
            series: [{
                type: 'radar',
                data: seriesData
            }]
        };

        console.log('setting option');
        this.radarChart.setOption(option);
        console.log('chart rendered');
        
        // Resize after a short delay to ensure container is visible
        setTimeout(() => {
            if (this.radarChart) {
                this.radarChart.resize();
                console.log('chart resized');
            }
        }, 100);
    }

    addRadarLabels(seriesData, indicators) {
        // This method is no longer needed
    }

    handleKeyNavigation(e, inputId) {
        const suggestionId = inputId.replace('Input', 'Suggestions');
        const suggestionsContainer = document.getElementById(suggestionId);
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
                    this.selectSuggestion(pubkey, inputId);
                } else {
                    this.performSearch(e.target.value);
                }
                break;
            case 'Escape':
                this.hideSuggestions(inputId);
                e.target.blur();
                break;
        }
    }

    updateSuggestionHighlight(suggestions) {
        suggestions.forEach((suggestion, index) => {
            suggestion.classList.toggle('highlighted', index === this.selectedSuggestionIndex);
        });
    }

    handleSearchInput(searchTerm, inputId) {
        console.log('handleSearchInput called with:', searchTerm, inputId);
        clearTimeout(this.debounceTimer);
        
        if (!searchTerm.trim()) {
            this.hideSuggestions(inputId);
            return;
        }

        // Reduce debounce time for better responsiveness
        this.debounceTimer = setTimeout(() => {
            this.showSuggestions(searchTerm, inputId);
        }, 150);
    }

    showSuggestions(searchTerm, inputId) {
        const suggestionId = inputId.replace('Input', 'Suggestions');
        const suggestionsContainer = document.getElementById(suggestionId);
        if (!suggestionsContainer || !this.allNodesData.length) return;

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

        console.log('showSuggestions called with:', searchTerm, inputId, 'matches:', matchesArray.length);

        if (matchesArray.length === 0) {
            this.hideSuggestions(inputId);
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
                <div class="suggestion-item" data-pubkey="${pubkey}" onclick="window.nodeComparisonManager.selectSuggestion('${pubkey}', '${inputId}')">
                    <div class="suggestion-main">
                        <span class="suggestion-alias">${aliasHighlighted}</span>
                        ${rank ? `<span class="suggestion-rank">${rank}</span>` : ''}
                    </div>
                    <span class="suggestion-pubkey">${pubkeyDisplay}</span>
                </div>
            `;
        }).join('');

        suggestionsContainer.style.display = 'block';
        this.selectedSuggestionIndex = -1;
    }

    highlightMatch(text, searchTerm) {
        if (!searchTerm || !text) return text;
        
        const regex = new RegExp(`(${searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
        return text.replace(regex, '<mark>$1</mark>');
    }

    hideSuggestions(inputId) {
        const suggestionId = inputId.replace('Input', 'Suggestions');
        const suggestionsContainer = document.getElementById(suggestionId);
        if (suggestionsContainer) {
            suggestionsContainer.style.display = 'none';
        }
    }

    hideAllSuggestions() {
        ['node1Input', 'node2Input', 'node3Input'].forEach(inputId => {
            this.hideSuggestions(inputId);
        });
    }

    selectSuggestion(pubkey, inputId) {
        console.log('selectSuggestion called with:', pubkey, inputId);
        this.hideSuggestions(inputId);
        const input = document.getElementById(inputId);
        if (input) {
            input.value = pubkey;
        }
    }

    performSearch(searchTerm) {
        // For now, just hide suggestions - the compare button will handle the search
        this.hideAllSuggestions();
    }

    // Helper methods (reuse from profile.js)
    formatBirthTx(node) {
        if (node.birth_chan) {
            const chanId = node.birth_chan;
            return `<a href="https://mempool.space/lightning/channel/${chanId}" target="_blank" rel="noopener noreferrer">${node.birth_tx || chanId}</a>`;
        }
        return node.birth_tx || '-';
    }

    formatNumber(num) {
        if (!num || num === null || num === undefined) return 'N/A';
        return Number(num).toLocaleString();
    }

    formatCapacity(capacity) {
        if (!capacity || capacity === null || capacity === undefined) return 'N/A';
        const num = Number(capacity);
        if (num >= 100000000) {
            return `${(num / 100000000).toFixed(1)} BTC`;
        } else if (num >= 1000000) {
            return `${(num / 1000000).toFixed(0)}M sats`;
        } else if (num >= 1000) {
            return `${(num / 1000).toFixed(0)}K sats`;
        }
        return `${num.toLocaleString()} sats`;
    }

    formatRank(rank) {
        if (!rank || rank === null || rank === undefined) return 'N/A';
        return `#${Number(rank).toLocaleString()}`;
    }

    formatCategoryCounts(counts) {
        if (!counts) return '-';
        let obj = counts;
        if (typeof obj === 'string') {
            try {
                obj = JSON.parse(obj);
            } catch (e) {
                return '-';
            }
        }
        if (obj && typeof obj === 'object') {
            return Object.entries(obj).map(([k, v]) => `${k}: ${v}`).join(', ');
        }
        return '-';
    }

    formatChannelSizes(node) {
        const min = this.formatCapacity(node.min_chnl_size);
        const median = this.formatCapacity(node.med_chnl_size);
        const avg = this.formatCapacity(node.avg_chnl_size);
        const max = this.formatCapacity(node.max_chnl_size);
        return `${min}, ${median}, ${avg}, ${max}`;
    }

    getConnectAddress(node) {
        let connectAddress = null;
        const addr1 = node.address_1;
        const addr2 = node.address_2;
        let rawAddr = addr1 || addr2 || null;
        if (rawAddr && typeof rawAddr === 'string') {
            if (rawAddr.includes('@')) {
                connectAddress = rawAddr;
            } else {
                connectAddress = `${node.pub_key}@${rawAddr}`;
            }
        }
        return connectAddress || 'N/A';
    }

    copyToClipboard(text, buttonEl) {
        if (!text || text === 'N/A') return;
        navigator.clipboard.writeText(text).then(() => {
            const icon = buttonEl.querySelector('i');
            const originalClass = icon ? icon.className : null;
            if (icon) icon.className = 'fas fa-check';
            buttonEl.title = 'Copied!';
            setTimeout(() => {
                if (icon && originalClass) icon.className = originalClass;
                buttonEl.title = 'Copy';
            }, 1600);
        }).catch(err => {
            console.error('Failed to copy: ', err);
        });
    }

    showLoading() {
        document.getElementById('loadingState').style.display = 'flex';
        document.getElementById('errorState').style.display = 'none';
        document.getElementById('comparisonContent').style.display = 'none';
    }

    showError(message) {
        document.getElementById('loadingState').style.display = 'none';
        document.getElementById('errorState').style.display = 'flex';
        document.getElementById('comparisonContent').style.display = 'none';
        document.getElementById('errorMessage').textContent = message;
    }

    showContent() {
        document.getElementById('loadingState').style.display = 'none';
        document.getElementById('errorState').style.display = 'none';
        document.getElementById('comparisonContent').style.display = 'block';
        
        // Ensure chart resizes after content is shown
        setTimeout(() => {
            if (this.radarChart) {
                this.radarChart.resize();
            }
        }, 50);
    }

    formatDate(dateStr) {
        if (!dateStr || dateStr === null || dateStr === undefined) return 'N/A';
        try {
            // Assume format is YYYYMMDD (e.g., 20220316)
            if (typeof dateStr === 'string' && /^\d{8}$/.test(dateStr)) {
                const year = parseInt(dateStr.substring(0, 4));
                const month = parseInt(dateStr.substring(4, 6)) - 1; // JS months are 0-based
                const day = parseInt(dateStr.substring(6, 8));
                const date = new Date(year, month, day);
                if (!isNaN(date.getTime())) {
                    return date.toLocaleDateString();
                }
            }
            // Fallback for other formats
            const date = new Date(dateStr);
            if (!isNaN(date.getTime())) {
                return date.toLocaleDateString();
            }
            return dateStr; // fallback to original if not parseable
        } catch (e) {
            return dateStr; // fallback to original if parsing fails
        }
    }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.nodeComparisonManager = new NodeComparisonManager();
});