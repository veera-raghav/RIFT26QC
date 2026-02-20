const { parse } = require('csv-parse/sync');

exports.handler = async (event, context) => {
    // Set CORS headers
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Content-Type': 'application/json'
    };

    // Handle preflight OPTIONS request
    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 200,
            headers,
            body: ''
        };
    }

    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            headers,
            body: JSON.stringify({ error: 'Method not allowed' })
        };
    }

    try {
        // Parse multipart form data
        const body = event.body;
        const boundary = event.headers['content-type'].split('boundary=')[1];
        const parts = body.split(`--${boundary}`);
        
        let csvContent = '';
        for (const part of parts) {
            if (part.includes('filename=') && part.includes('money-muling.csv')) {
                const contentStart = part.indexOf('\r\n\r\n') + 4;
                csvContent = part.substring(contentStart).replace(/\r\n$/, '');
                break;
            }
        }

        if (!csvContent) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ error: 'No CSV file found' })
            };
        }

        // Parse CSV
        const records = parse(csvContent, {
            columns: true,
            skip_empty_lines: true
        });

        // Mock analysis
        const accounts = new Set();
        const transactions = [];
        const accountActivity = new Map();
        const graphData = { nodes: [], edges: [] };

        records.forEach(record => {
            const sender = record.sender_id;
            const receiver = record.receiver_id;
            const amount = parseFloat(record.amount);

            accounts.add(sender);
            accounts.add(receiver);

            transactions.push({
                transaction_id: record.transaction_id,
                sender,
                receiver,
                amount,
                timestamp: record.timestamp
            });

            // Track activity
            accountActivity.set(sender, (accountActivity.get(sender) || 0) + 1);
            accountActivity.set(receiver, (accountActivity.get(receiver) || 0) + 1);
        });

        // Build simple graph data
        const accountList = Array.from(accounts);
        accountList.forEach((account, index) => {
            graphData.nodes.push({
                id: account,
                suspicious: accountActivity.get(account) > 3,
                suspicion_score: Math.min(100, accountActivity.get(account) * 10),
                risk_tier: accountActivity.get(account) > 3 ? 'high_risk' : 'no_risk',
                patterns: accountActivity.get(account) > 3 ? ['high_volume'] : [],
                ring_id: null,
                in_degree: 0, // Mock
                out_degree: accountActivity.get(account),
                x: Math.random() * 800,
                y: Math.random() * 600
            });
        });

        transactions.forEach(tx => {
            graphData.edges.push({
                transaction_id: tx.transaction_id,
                source: tx.sender,
                target: tx.receiver,
                amount: tx.amount,
                timestamp: tx.timestamp
            });
        });

        // Simple heuristics for mule detection
        const flaggedMules = [];
        const muleClusters = [];
        let clusterId = 1;

        // Flag accounts with high activity (> 3 transactions)
        for (const [account, count] of accountActivity) {
            if (count > 3) {
                flaggedMules.push({
                    account,
                    reason: 'High transaction volume',
                    activity_count: count
                });
            }
        }

        // Simple cycle detection for clusters
        const graph = {};
        transactions.forEach(tx => {
            if (!graph[tx.sender]) graph[tx.sender] = [];
            graph[tx.sender].push(tx.receiver);
        });

        // Find simple cycles (basic heuristic)
        for (const account of accounts) {
            const visited = new Set();
            const path = [];
            
            const dfs = (current, start, depth) => {
                if (depth > 5) return; // Limit depth
                if (visited.has(current)) return;
                
                visited.add(current);
                path.push(current);
                
                if (current === start && depth > 2) {
                    muleClusters.push({
                        cluster_id: clusterId++,
                        accounts: [...path],
                        type: 'cycle'
                    });
                    return;
                }
                
                if (graph[current]) {
                    for (const neighbor of graph[current]) {
                        dfs(neighbor, start, depth + 1);
                    }
                }
                
                path.pop();
                visited.delete(current);
            };
            
            dfs(account, account, 0);
        }

        // Mock suspicious accounts from flagged mules
        const suspiciousAccounts = flaggedMules.map(mule => ({
            account_id: mule.account,
            suspicion_score: Math.min(100, mule.activity_count * 10),
            detected_patterns: ['high_volume']
        }));

        // Mock fraud rings from clusters
        const fraudRings = muleClusters.map(cluster => ({
            ring_id: `RING_${cluster.cluster_id.toString().padStart(3, '0')}`,
            pattern_type: 'cycle',
            risk_score: Math.min(100, cluster.accounts.length * 15),
            members: cluster.accounts
        }));

        // Calculate confidence score based on findings
        const confidenceScore = Math.min(100, 
            (flaggedMules.length * 10) + (muleClusters.length * 20) + 50
        );

        const result = {
            status: 'success',
            unique_accounts: accounts.size,
            flagged_mules: flaggedMules,
            mule_clusters: muleClusters,
            confidence_score: confidenceScore,
            total_transactions: transactions.length,
            graph_data: graphData,
            fraud_rings: fraudRings,
            suspicious_accounts: suspiciousAccounts,
            summary: {
                total_accounts_analyzed: accounts.size,
                suspicious_accounts_flagged: flaggedMules.length,
                fraud_rings_detected: muleClusters.length,
                processing_time_seconds: 1.5
            },
            processing_time_seconds: 1.5
        };

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify(result)
        };

    } catch (error) {
        console.error('Analysis error:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ 
                status: 'error',
                error: 'Analysis failed',
                message: error.message
            })
        };
    }
};