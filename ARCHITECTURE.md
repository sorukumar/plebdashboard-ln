# Lightning Network Node Analytics – Architecture Overview

## Directory & File Structure

```
ln-nodeprofile-rank/
│
├── index.html
├── prank.html
├── profile.html
├── node-comparison.html
├── channel-explorer.html
├── node-explorer.html
├── README.md
│
├── data/
│   ├── node_feature.parquet
│   ├── node_profile.parquet
│   ├── node_rank.parquet
│   ├── channel_profile.parquet
│   └── featured_node.json
│
├── scripts/
│   ├── homepage.js
│   ├── profile.js
│   ├── profile-channels.js
│   ├── profile-channels-table.js
│   ├── node-rank.js
│   ├── node-comparison.js
│   ├── node-explorer.js
│   └── channel-explorer.js
│
└── styles/
    ├── main.css
    ├── profile.css
    ├── node-rank.css
    ├── node-comparison.css
    ├── node-explorer.css
    └── components.css
```

---

## Directory & File Purposes

### Root HTML Files

- **index.html**  
  Homepage: search bar (alias/pubkey), trending nodes, navigation cards (Rankings, Graph Viz, Explorer), featured nodes (from JSON), all dynamic via homepage.js.
- **prank.html**  
  Rankings table: search, sort, filter, paginate. Table updates live. All logic in node-rank.js.
- **profile.html**  
  Node profile: stats, rankings, metrics, tabs (Overview, Rankings, Channels, Channel Details), copy pubkey, all dynamic. Uses profile.js, profile-channels.js, profile-channels-table.js.
- **node-comparison.html**  
  Node Comparison: compare 2-3 nodes side-by-side, radar chart visualization of rankings, search with autocomplete. All logic in node-comparison.js.
- **channel-explorer.html**  
  Channel Explorer: table view with search by Node 1/Node 2, sort, pagination. All logic in channel-explorer.js.
- **node-explorer.html**  
  Node Explorer: advanced search, filter, sort, grid/list view, pagination. All logic in node-explorer.js.
- **README.md**  
  Project setup, usage, docs.

---

### data/

- **node_feature.parquet**  
  Parquet file containing node features.  
  _Columns:_  
  - pub_key, alias, source, features_dict

- **node_profile.parquet**  
  Parquet file with detailed node profiles.  
  _Columns:_  
  - pub_key, alias, address_1, address_2, last_seen, source, snapshot_date, update_dt, closed_channels_count, node_type, birth_tx, birth_chan, birth_tx_active, birth_chan_active, first_seen_week, in_latest_gossip, total_channels, channel_segment, category_counts, total_capacity, node_cap_tier, capacity_segment, avg_chnl_size, med_chnl_size, mode_chnl_size, min_chnl_size, max_chnl_size, betweenness_centrality_rank, eigenvector_centrality_rank, custom_pagerank_rank, capacity_weighted_degree_rank, total_channels_rank, total_capacity_rank, pleb_rank, ftotal_capacity, avg_base_fee, med_base_fee, max_base_fee, min_base_fee, avg_fee_rate, med_fee_rate, max_fee_rate, min_fee_rate

- **node_rank.parquet**  
  Parquet file with node rankings and summary stats.  
  _Columns:_  
  - pleb_rank, total_channels_rank, total_capacity_rank, capacity_weighted_degree_rank, betweenness_centrality_rank, eigenvector_centrality_rank, custom_pagerank_rank, alias, node_type, total_capacity, total_channels, last_seen, pub_key, ftotal_capacity

- **featured_node.json**  
  JSON file containing featured node(s) for homepage highlights or special display.

- **channel_profile.parquet**  
  Parquet file with channel profiles.  
  _Columns:_  
  - node1_pub, node2_pub, capacity, node1_policy, node2_policy, alias_1, alias_2, birth_tx, channel_id, in_latest_gossip

---

### scripts/

- **homepage.js**  
  Homepage: load node/featured data, build search index, search/suggestions, trending/featured nodes, nav to profile.
- **profile.js**  
  Profile: get pubkey from URL, load node data, fill tabs, handle tab switch, copy pubkey, error states, coordinate channel data.
- **profile-channels.js**  
  Load/process channel data for node, prep for tabs/visuals.
- **profile-channels-table.js**  
  Render channel table: sort, filter, paginate, format (fees, HTLC, status), table events.
- **node-rank.js**  
  Rankings table: load data, render, sort, filter, paginate, search, loading/error UI.
- **node-comparison.js**  
  Node Comparison: load node data for 2-3 nodes, search with autocomplete, render node cards, display radar chart comparing rankings across dimensions.
- **node-explorer.js**  
  Node Explorer: load/filter/sort nodes, advanced filters, search, grid/list, pagination, render node cards, all UI events.
- **channel-explorer.js**  
  Channel Explorer: load/filter/sort channels, table view with fee breakdowns, search by nodes, pagination, render table rows, all UI events.

---

### styles/

- **main.css**  
  General styles for homepage and shared components.

- **profile.css**  
  Styles for the node profile page.

- **node-rank.css**  
  Styles for the rankings table and channel explorer table.

- **node-comparison.css**  
  Styles for the node comparison page.

- **node-explorer.css**  
  Styles for the node explorer page.

- **components.css**  
  Reusable UI components.

---

## Program Call Graph

- **index.html**  
  → `homepage.js`  
    - Loads node data  
    - Handles search, trending, navigation

- **profile.html**  
  → `profile.js`  
    - Loads node profile  
    - Handles tab navigation, copy, error states

- **prank.html**  
  → `node-rank.js`  
    - Loads and displays node rankings table

- **node-comparison.html**  
  → `node-comparison.js`  
    - Loads multiple node profiles  
    - Handles node search with autocomplete  
    - Renders radar chart comparison

- **node-explorer.html**  
  → `node-explorer.js`  
    - Loads node data  
    - Handles filtering, sorting, pagination

- **channel-explorer.html**  
  → `channel-explorer.js`  
    - Loads channel data  
    - Handles filtering, sorting, pagination

---

## Data File Columns

- **node_feature.parquet**  
  - pub_key, alias, source, features_dict

- **node_profile.parquet**  
  - pub_key, alias, address_1, address_2, last_seen, source, snapshot_date, update_dt, closed_channels_count, node_type, birth_tx, birth_chan, birth_tx_active, birth_chan_active, first_seen_week, in_latest_gossip, total_channels, channel_segment, category_counts, total_capacity, node_cap_tier, capacity_segment, avg_chnl_size, med_chnl_size, mode_chnl_size, min_chnl_size, max_chnl_size, betweenness_centrality_rank, eigenvector_centrality_rank, custom_pagerank_rank, capacity_weighted_degree_rank, total_channels_rank, total_capacity_rank, pleb_rank, ftotal_capacity, avg_base_fee, med_base_fee, max_base_fee, min_base_fee, avg_fee_rate, med_fee_rate, max_fee_rate, min_fee_rate

- **node_rank.parquet**  
  - pleb_rank, total_channels_rank, total_capacity_rank, capacity_weighted_degree_rank, betweenness_centrality_rank, eigenvector_centrality_rank, custom_pagerank_rank, alias, node_type, total_capacity, total_channels, last_seen, pub_key, ftotal_capacity

- **channel_profile.parquet**  
  - node1_pub, node2_pub, capacity, node1_policy, node2_policy, alias_1, alias_2, birth_tx, channel_id, in_latest_gossip

---

## Architecture Flow Diagram (Textual)

```
[User] 
  ↓
[index.html] --(search, trending)--> [homepage.js] --(fetch)--> [node_rank.parquet]
  ↓
[profile.html?node=...] --(profile view)--> [profile.js] --(fetch)--> [node_profile.parquet] (fallback: node_rank.parquet)
  ↓
[prank.html] --(table view)--> [node-rank.js] --(fetch)--> [node_rank.parquet]
  ↓
[node-comparison.html] --(comparison view)--> [node-comparison.js] --(fetch)--> [node_profile.parquet] (fallback: node_rank.parquet)
  ↓
[node-explorer.html] --(node explorer view)--> [node-explorer.js] --(fetch)--> [node_rank.parquet]
  ↓
[channel-explorer.html] --(channel explorer view)--> [channel-explorer.js] --(fetch)--> [channel_profile.parquet]
```

- All JS files fetch data from the `/data/` directory.
- Data is parsed and rendered into the DOM.
- Navigation between pages is via links or search.

---

## Summary

- **HTML files**: Entry points for each major UI section.
- **JS files**: Handle data loading, UI logic, and DOM updates for their respective pages.
- **Data files**: Parquet files with node features, profiles, and rankings.
- **CSS files**: Page-specific and shared styles.
- **Flow**: User interacts with HTML → JS loads data → UI updates → navigation as needed.

---

# Data Dictionary

## node_rank.parquet

| Column Name                   | Data Type | Description                                                        |
|------------------------------|-----------|--------------------------------------------------------------------|
| pleb_rank                    | int32     | Composite rank for node (lower is better)                          |
| total_channels_rank           | int32     | Rank of node by total channels (lower is better)                   |
| total_capacity_rank           | int32     | Rank of node by total capacity (lower is better)                   |
| capacity_weighted_degree_rank | int32     | Rank by capacity-weighted degree (lower is better)                 |
| betweenness_centrality_rank   | int32     | Rank by betweenness centrality (lower is better)                   |
| eigenvector_centrality_rank   | int32     | Rank by eigenvector centrality (lower is better)                   |
| custom_pagerank_rank          | int32     | Rank by custom PageRank (lower is better)                          |
| alias                        | object    | Node alias (display name)                                          |
| node_type                    | object    | Node type (e.g., routing, merchant, etc.)                          |
| total_capacity               | object    | Total channel capacity (satoshis, as string or int)                |
| total_channels               | int64     | Total number of channels                                           |
| last_seen                    | object    | Last seen date/time (string or timestamp)                          |
| pub_key                      | object    | Node public key (unique identifier)                                |
| ftotal_capacity              | object    | Formatted total capacity (e.g., '90m sats')                        |

---

## node_profile.parquet

| Column Name                      | Data Type | Description                                      |
|----------------------------------|-----------|--------------------------------------------------|
| pub_key                         | object    | Node public key (unique identifier)              |
| alias                           | object    | Node alias (display name)                        |
| address_1                       | object    | Node address (part 1)                            |
| address_2                       | object    | Node address (part 2)                            |
| last_seen                       | object    | Last seen date (YYYY-MM or string)               |
| source                          | uint64    | Data source identifier                           |
| snapshot_date                   | object    | Date of data snapshot                            |
| update_dt                       | object    | Last update datetime (string)                    |
| closed_channels_count           | int64     | Number of closed channels                        |
| node_type                       | object    | Node type (e.g., routing, merchant, etc.)        |
| birth_tx                        | object    | Birth tx (first time node was seen)                   |
| birth_chan                      | object    | Chan id of node's birth (txid)                      |
| birth_tx_active                 | object    | Birthtx (1sttime node was seen-active chnl)          |
| birth_chan_active               | object    | Channel ID of node's active birth                |
| first_seen_week                 | object    | First seen week (string)                         |
| in_latest_gossip                | object    | Whether the node is in the latest gossip         |
| total_channels                  | int64     | Total number of channels                         |
| channel_segment                 | object    | Channel segment (categorical bin)                |
| category_counts                 | object    | Category counts (JSON or stringified dict)       |
| total_capacity                  | int64     | Total channel capacity (satoshis)                |
| node_cap_tier                   | object    | Node capacity tier (categorical bin)             |
| capacity_segment                | object    | Capacity segment (categorical bin)               |
| avg_chnl_size                   | float64   | Average channel size (satoshis)                  |
| med_chnl_size                   | float64   | Median channel size (satoshis)                   |
| mode_chnl_size                  | int64     | Mode channel size (satoshis)                     |
| min_chnl_size                   | float64   | Minimum channel size (satoshis)                  |
| max_chnl_size                   | float64   | Maximum channel size (satoshis)                  |
| betweenness_centrality_rank     | int32     | Rank by betweenness centrality                   |
| eigenvector_centrality_rank     | int32     | Rank by eigenvector centrality                   |
| custom_pagerank_rank            | int32     | Rank by custom PageRank                          |
| capacity_weighted_degree_rank   | int32     | Rank by capacity-weighted degree                 |
| total_channels_rank             | int32     | Rank by total channels                           |
| total_capacity_rank             | int32     | Rank by total capacity                           |
| pleb_rank                       | int32     | Composite rank for node                          |
| ftotal_capacity                 | object    | Formatted total capacity (e.g., '90m sats')      |
| avg_base_fee                    | float64   | Average base fee (msat)                          |
| med_base_fee                    | float64   | Median base fee (msat)                           |
| max_base_fee                    | float64   | Maximum base fee (msat)                          |
| min_base_fee                    | float64   | Minimum base fee (msat)                          |
| avg_fee_rate                    | float64   | Average fee rate (ppm)                           |
| med_fee_rate                    | float64   | Median fee rate (ppm)                            |
| max_fee_rate                    | float64   | Maximum fee rate (ppm)                           |
| min_fee_rate                    | float64   | Minimum fee rate (ppm)                           |

---

## node_feature.parquet

- **Total rows:** 12,135

| Column Name    | Data Type | Description                                      |
|---------------|-----------|--------------------------------------------------|
| pub_key       | object    | Node public key (unique identifier)              |
| alias         | object    | Node alias (display name)                        |
| source        | uint64    | Data source identifier                           |
| features_dict | object    | Dictionary of node features (JSON or stringified) |

---

## channel_profile.parquet

| Column Name    | Data Type | Description                                      |
|---------------|-----------|--------------------------------------------------|
| node1_pub     | object    | Public key of node 1                             |
| node2_pub     | object    | Public key of node 2                             |
| capacity      | int64     | Channel capacity (satoshis)                      |
| node1_policy  | object    | Policy for node 1 (JSON or string)               |
| node2_policy  | object    | Policy for node 2 (JSON or string)               |
| alias_1       | object    | Alias of node 1                                  |
| alias_2       | object    | Alias of node 2                                  |
| birth_tx      | object    | Birth transaction                                |
| channel_id    | object    | Channel ID                                       |
| in_latest_gossip | object  | Whether the channel is in the latest gossip      |
