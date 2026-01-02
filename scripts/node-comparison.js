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
        this.channelChart = null; // Store channel chart instance
        this.init();
    }

    // Helper method to safely convert BigInt values
    safeConvertValue(value) {
        if (typeof value === 'bigint') {
            return value.toString();
        }
        if (Array.isArray(value)) {
            return value.map(item => this.safeConvertValue(item));
        }
        if (value && typeof value === 'object') {
            const result = {};
            for (const key in value) {
                if (value.hasOwnProperty(key)) {
                    result[key] = this.safeConvertValue(value[key]);
                }
            }
            return result;
        }
        return value;
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
                        columns.forEach((col, i) => obj[col] = this.safeConvertValue(row[i]));
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

        // Add event listeners for "Try an Example" links - simple approach
        ['tryExampleLink', 'tryExampleLinkBottom'].forEach(linkId => {
            const link = document.getElementById(linkId);
            if (link) {
                link.addEventListener('click', (e) => {
                    e.preventDefault();
                    
                    // Find example nodes and populate inputs
                    const examples = [
                        { alias: 'ACINQ', inputId: 'node1Input' },
                        { alias: 'Boltz', inputId: 'node2Input' },
                        { alias: 'LNBiG [Hub-1]', inputId: 'node3Input' }
                    ];
                    
                    examples.forEach(({ alias, inputId }) => {
                        const node = this.allNodesData.find(n => 
                            n.alias && n.alias.toLowerCase() === alias.toLowerCase()
                        );
                        if (node) {
                            const input = document.getElementById(inputId);
                            if (input) {
                                input.value = node.alias;
                            }
                        }
                    });
                    
                    // Trigger compare button click
                    setTimeout(() => compareBtn.click(), 100);
                });
            }
        });

        // Add event listeners for example chip buttons - generic handler
        document.querySelectorAll('.example-chip').forEach(chip => {
            chip.addEventListener('click', (e) => {
                e.preventDefault();
                
                // Get examples from data attribute
                const exampleAliases = JSON.parse(chip.dataset.examples);
                const inputIds = ['node1Input', 'node2Input', 'node3Input'];
                
                // Populate inputs with the example nodes
                exampleAliases.forEach((alias, index) => {
                    const node = this.allNodesData.find(n => 
                        n.alias && n.alias.toLowerCase() === alias.toLowerCase()
                    );
                    if (node && inputIds[index]) {
                        const input = document.getElementById(inputIds[index]);
                        if (input) {
                            input.value = node.alias;
                        }
                    }
                });
                
                // Trigger compare button click
                setTimeout(() => compareBtn.click(), 100);
            });
        });

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
            if (this.channelChart) {
                this.channelChart.resize();
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
        const input1 = document.getElementById('node1Input');
        const input2 = document.getElementById('node2Input');
        const input3 = document.getElementById('node3Input');

        // Use input value directly (can be alias or pubkey)
        const node1 = input1.value.trim();
        const node2 = input2.value.trim();
        const node3 = input3.value.trim();

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
                        columns.forEach((col, i) => obj[col] = this.safeConvertValue(row[i]));
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
                        columns.forEach((col, i) => obj[col] = this.safeConvertValue(row[i]));
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
        this.renderChannelDistributionChart();
        this.showContent();
    }

    renderNodeCards() {
        const grid = document.getElementById('nodesGrid');
        grid.innerHTML = '';

        this.nodesData.forEach((node, index) => {
            const connectAddress = this.getConnectAddress(node);
            const firstSeenYear = this.getFirstSeenYear(node.first_seen_week);
            const card = document.createElement('div');
            card.className = 'node-card';
            card.innerHTML = `
                <div class="node-header">
                    <h3>${node.alias || 'Unknown Node'}</h3>
                    <div class="node-meta">
                        <span class="first-seen">Since ${firstSeenYear}</span>
                        <div class="node-pubkey">
                            <span>${connectAddress.substring(0, 8)}...</span>
                            <button class="copy-btn" data-text="${connectAddress}" title="Copy connect address">
                                <i class="fas fa-copy"></i>
                            </button>
                        </div>
                    </div>
                </div>
                <div class="node-details">
                    <div class="detail-row">
                        <span class="label">Channels:</span>
                        <span class="value">${this.formatNumber(node.total_channels)}</span>
                    </div>
                    <div class="detail-row">
                        <span class="label">Capacity:</span>
                        <span class="value">${node.ftotal_capacity || this.formatCapacity(node.total_capacity)}</span>
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

        // Dynamic scaling: scale based on actual ranks being compared
        const metricNames = ['Overall Rank (PRank)', 'Channel Count', 'Total Capacity', 'Social Butterfly (Degree)', 'Crossroads (Betweenness)', 'Star Power (Eigenvector)'];
        const metricKeys = ['pleb_rank', 'channels_rank', 'capacity_rank', 'weighted_degree_rank', 'betweenness_rank', 'eigenvector_rank'];
        
        // Collect all actual ranks for each dimension
        const allRanksByDimension = metricKeys.map(key => 
            this.rankData.map(node => node[key] || 10000)
        );
        
        // Compute max rank per dimension for dynamic scaling
        const maxRanksPerDimension = allRanksByDimension.map(ranks => Math.max(...ranks));
        
        // Compute min rank per dimension for linear scaling
        const minRanksPerDimension = allRanksByDimension.map(ranks => Math.min(...ranks));
        
        // Build indicators with max = 100 (percentage scale)
        const indicators = metricNames.map((name) => {
            return {
                name: name,
                max: 100  // Percentage scale for all dimensions
            };
        });

        // Create series data with scaling that preserves shape differences
        const colors = ['#4E79A7', '#F28E2C', '#E15759'];
        const seriesData = this.rankData.map((node, index) => {
            // Store actual ranks for display
            const actualRanks = [
                node.pleb_rank || 10000,
                node.channels_rank || 10000,
                node.capacity_rank || 10000,
                node.weighted_degree_rank || 10000,
                node.betweenness_rank || 10000,
                node.eigenvector_rank || 10000
            ];
            
            // Adaptive linear scaling per dimension: lower rank = better = larger value
            // Uses mid-range (40-80) for close ranks to show subtle differences, raised minimum (30-100) for spread ranks to ensure visible shapes for all nodes
            const values = actualRanks.map((rank, index) => {
                const minRank = minRanksPerDimension[index];
                const maxRank = maxRanksPerDimension[index];
                const range = maxRank - minRank;
                
                let minValue, maxValue;
                if (range < 100) {
                    minValue = 40;
                    maxValue = 80;
                } else {
                    minValue = 30;
                    maxValue = 100;
                }
                
                let normalized;
                if (range === 0) {
                    normalized = 0.5;
                } else {
                    normalized = (maxRank - rank) / range;
                }
                
                const value = minValue + normalized * (maxValue - minValue);
                return Math.max(minValue, Math.min(maxValue, value));
            });
            
            return {
                name: node.alias || `Node ${index + 1}`,
                value: values,
                actualRanks: actualRanks,  // Store for label display
                lineStyle: {
                    width: 2.5,
                    color: colors[index]
                },
                areaStyle: {
                    opacity: 0.2,
                    color: colors[index]
                },
                symbol: 'circle',
                symbolSize: 6,
                itemStyle: {
                    color: colors[index],
                    borderColor: '#fff',
                    borderWidth: 1
                },
                // Enable clean data labels at each vertex showing actual rank
                label: {
                    show: true,
                    position: 'top',
                    distance: 5,
                    formatter: (params) => {
                        // Show actual rank number from stored data
                        const dimIndex = params.dimensionIndex;
                        return Math.round(actualRanks[dimIndex]);
                    },
                    fontSize: 11,
                    fontWeight: 600,
                    color: '#000000'
                },
                labelLayout: {
                    hideOverlap: true
                }
            };
        });

        const option = {
            backgroundColor: 'rgba(255, 250, 205, 0.2)', // Light yellowish Ghibli-inspired overlay
            title: {
                text: 'Ranking Comparison',
                subtext: 'Scaled to show relative differences between selected nodes',
                left: 'center',
                top: 10,
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
                    if (!params.value || !params.data.actualRanks) return '';
                    const indicatorNames = metricNames;
                    let tooltip = `<strong style="font-size: 14px; color: ${params.color}">${params.name}</strong><br/>`;
                    params.data.actualRanks.forEach((rank, idx) => {
                        tooltip += `${indicatorNames[idx]}: <strong>#${rank.toLocaleString()}</strong><br/>`;
                    });
                    return tooltip;
                }
            },
            legend: {
                data: seriesData.map(s => s.name),
                top: 'center',
                left: 'left',
                itemGap: 20,
                textStyle: {
                    fontSize: 13,
                    color: 'var(--text-primary, #2c3e50)'
                },
                icon: 'roundRect',
                itemWidth: 25,
                itemHeight: 14,
                backgroundColor: 'transparent',
                orient: 'vertical'
            },
            color: colors,
            radar: {
                indicator: indicators,
                shape: 'polygon',
                radius: '80%',
                center: ['50%', '50%'],
                splitNumber: 4,
                splitArea: {
                    show: true,
                    areaStyle: {
                        color: [
                            'rgba(255, 255, 255, 0.01)',
                            'rgba(240, 240, 240, 0.03)'
                        ]
                    }
                },
                splitLine: {
                    lineStyle: {
                        color: 'rgba(220, 220, 220, 0.2)',
                        width: 1
                    }
                },
                axisLine: {
                    lineStyle: {
                        color: 'rgba(220, 220, 220, 0.3)',
                        width: 2
                    }
                },
                // Make axis labels visible with proper spacing
                name: {
                    formatter: (name) => name,
                    textStyle: {
                        color: '#2c3e50',
                        fontSize: 14,
                        fontWeight: 600,
                        backgroundColor: 'transparent',
                        padding: [6, 10],
                        borderRadius: 4,
                        borderWidth: 0
                    },
                    // Important: increase gap between label and chart
                    distance: 20
                },
                axisLabel: {
                    show: false
                }
            },
            series: [{
                type: 'radar',
                data: seriesData
            }]
        };

        this.radarChart.setOption(option);
        
        // Resize after a short delay to ensure container is visible
        setTimeout(() => {
            if (this.radarChart) {
                this.radarChart.resize();
            }
        }, 100);
    }

    renderChannelDistributionChart() {
        const chartDom = document.getElementById('channelDistributionChart');
        if (!chartDom) {
            console.error('channelDistributionChart element not found');
            return;
        }

        // Dispose of existing chart instance if any
        if (this.channelChart) {
            this.channelChart.dispose();
        }

        this.channelChart = echarts.init(chartDom);

        // Collect all unique categories from all nodes
        const allCategories = new Set();
        this.nodesData.forEach(node => {
            if (node.category_counts) {
                let counts = node.category_counts;
                if (typeof counts === 'string') {
                    try {
                        counts = JSON.parse(counts);
                    } catch (e) {
                        counts = {};
                    }
                }
                if (counts && typeof counts === 'object') {
                    Object.keys(counts).forEach(cat => allCategories.add(cat));
                }
            }
        });

        const categories = Array.from(allCategories).sort();

        // Create stacked series - one series per category
        const seriesData = categories.map((category, categoryIndex) => {
            const data = this.nodesData.map((node, nodeIndex) => {
                let counts = node.category_counts || {};
                if (typeof counts === 'string') {
                    try {
                        counts = JSON.parse(counts);
                    } catch (e) {
                        counts = {};
                    }
                }
                return counts[category] || 0;
            });

            return {
                name: category,
                type: 'bar',
                stack: 'channels',
                data: data,
                itemStyle: {
                    color: this.getCategoryColor(category)
                },
                label: {
                    show: true,
                    position: 'inside',
                    formatter: (params) => params.value > 0 ? params.value : ''
                }
            };
        });

        const option = {
            backgroundColor: 'rgba(255, 250, 205, 0.2)',
            title: {
                text: 'Channel Size Distribution',
                subtext: 'Stacked view of channel categories by node',
                left: 'center',
                top: 10,
                textStyle: {
                    fontSize: 18,
                    fontWeight: 600,
                    color: 'var(--text-primary, #2c3e50)'
                },
                subtextStyle: {
                    fontSize: 12,
                    color: 'var(--text-secondary, #7f8c8d)'
                }
            },
            tooltip: {
                trigger: 'axis',
                axisPointer: {
                    type: 'shadow'
                },
                formatter: (params) => {
                    const nodeIndex = params[0].dataIndex;
                    const node = this.nodesData[nodeIndex];
                    let tooltip = `<strong>${node.alias || `Node ${nodeIndex + 1}`}</strong><br/>`;
                    params.forEach(param => {
                        if (param.value > 0) {
                            tooltip += `${param.seriesName}: <strong>${param.value}</strong><br/>`;
                        }
                    });
                    return tooltip;
                }
            },
            legend: {
                data: categories,
                top: 'center',
                left: 'left',
                orient: 'vertical',
                textStyle: {
                    fontSize: 12,
                    color: 'var(--text-primary, #2c3e50)'
                }
            },
            grid: {
                left: '15%',
                right: '5%',
                bottom: '3%',
                containLabel: true
            },
            xAxis: {
                type: 'category',
                data: this.nodesData.map((node, index) => node.alias || `Node ${index + 1}`),
                axisLabel: {
                    rotate: 45,
                    fontSize: 11
                }
            },
            yAxis: {
                type: 'value',
                name: 'Number of Channels',
                nameTextStyle: {
                    fontSize: 12
                }
            },
            series: seriesData
        };

        this.channelChart.setOption(option);

        // Resize after a short delay to ensure container is visible
        setTimeout(() => {
            if (this.channelChart) {
                this.channelChart.resize();
            }
        }, 100);
    }

    // Helper method to get colors for channel categories
    getCategoryColor(category) {
        const colorMap = {
            'freeway': '#4E79A7',  // Blue
            'highway': '#F28E2C',  // Orange
            'myway': '#E15759',    // Red
            'default': '#76B7B2'   // Teal for unknown categories
        };
        return colorMap[category.toLowerCase()] || colorMap.default;
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
        this.hideSuggestions(inputId);
        const input = document.getElementById(inputId);
        if (input) {
            // Find the node data to get the alias
            const node = this.allNodesData.find(n => n.pub_key === pubkey);
            
            // Display alias if available, otherwise first 8 characters of pubkey
            const displayValue = node?.alias || pubkey.substring(0, 8);
            
            input.value = displayValue;
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
        document.getElementById('welcomeState').style.display = 'none';
        document.getElementById('loadingState').style.display = 'flex';
        document.getElementById('errorState').style.display = 'none';
        document.getElementById('comparisonContent').style.display = 'none';
    }

    showError(message) {
        document.getElementById('welcomeState').style.display = 'none';
        document.getElementById('loadingState').style.display = 'none';
        document.getElementById('errorState').style.display = 'flex';
        document.getElementById('comparisonContent').style.display = 'none';
        document.getElementById('errorMessage').textContent = message;
    }

    showContent() {
        document.getElementById('welcomeState').style.display = 'none';
        document.getElementById('loadingState').style.display = 'none';
        document.getElementById('errorState').style.display = 'none';
        document.getElementById('comparisonContent').style.display = 'block';
        
        // Ensure chart resizes after content is shown
        setTimeout(() => {
            if (this.radarChart) {
                this.radarChart.resize();
            }
            if (this.channelChart) {
                this.channelChart.resize();
            }
        }, 50);
    }

    showWelcome() {
        document.getElementById('welcomeState').style.display = 'flex';
        document.getElementById('loadingState').style.display = 'none';
        document.getElementById('errorState').style.display = 'none';
        document.getElementById('comparisonContent').style.display = 'none';
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

    getFirstSeenYear(firstSeenWeek) {
        if (!firstSeenWeek || firstSeenWeek === null || firstSeenWeek === undefined) return 'N/A';
        try {
            // Assume format is YYYYMMDD (e.g., 20220316)
            if (typeof firstSeenWeek === 'string' && /^\d{8}$/.test(firstSeenWeek)) {
                const year = parseInt(firstSeenWeek.substring(0, 4));
                const month = parseInt(firstSeenWeek.substring(4, 6)) - 1; // JS months are 0-based
                const date = new Date(year, month, 1);
                if (!isNaN(date.getTime())) {
                    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short' });
                }
            }
            return 'N/A';
        } catch (e) {
            return 'N/A';
        }
    }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.nodeComparisonManager = new NodeComparisonManager();
});