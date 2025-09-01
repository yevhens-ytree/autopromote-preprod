const http = require('http');
const https = require('https');

// GitHub REST API helper function
async function githubRequest(method, path, body = null) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'api.github.com',
            path: path,
            method: method,
            headers: {
                'Authorization': `token ${process.env.GH_TOKEN}`,
                'User-Agent': 'autopromote-preprod',
                'Accept': 'application/vnd.github.v3+json'
            }
        };

        if (body) {
            options.headers['Content-Type'] = 'application/json';
            body = JSON.stringify(body);
            options.headers['Content-Length'] = Buffer.byteLength(body);
        }

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const response = data ? JSON.parse(data) : {};
                    if (res.statusCode >= 200 && res.statusCode < 300) {
                        resolve(response);
                    } else {
                        reject(new Error(`GitHub API error: ${res.statusCode} ${response.message || data}`));
                    }
                } catch (error) {
                    reject(new Error(`Failed to parse GitHub API response: ${error.message}`));
                }
            });
        });

        req.on('error', reject);
        if (body) req.write(body);
        req.end();
    });
}

// GitHub GraphQL API helper function
async function githubGraphQLRequest(query, variables = {}) {
    return new Promise((resolve, reject) => {
        const body = JSON.stringify({
            query: query,
            variables: variables
        });

        const options = {
            hostname: 'api.github.com',
            path: '/graphql',
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${process.env.GH_TOKEN}`,
                'User-Agent': 'autopromote-preprod',
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(body)
            }
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const response = JSON.parse(data);
                    if (res.statusCode >= 200 && res.statusCode < 300) {
                        if (response.errors) {
                            reject(new Error(`GitHub GraphQL error: ${JSON.stringify(response.errors)}`));
                        } else {
                            resolve(response.data);
                        }
                    } else {
                        reject(new Error(`GitHub GraphQL API error: ${res.statusCode} ${data}`));
                    }
                } catch (error) {
                    reject(new Error(`Failed to parse GitHub GraphQL response: ${error.message}`));
                }
            });
        });

        req.on('error', reject);
        req.write(body);
        req.end();
    });
}


const PORT = 9001;

const server = http.createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    // --- VERSION INFO HANDLER ---
    if (req.url.startsWith('/get-version-info') && req.method === 'GET') {
        const url = new URL(req.url, `http://${req.headers.host}`);
        const repoName = url.searchParams.get('repo');

        if (!repoName) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: "Missing 'repo' parameter" }));
            return;
        }

        try {
            const TARGET_REPO = "y-tree-limited/argocd-monorepo";
            const ENVIRONMENT = "preprod";
            const serviceName = repoName.split('/').pop(); // Get basename
            const filePath = `environments/${ENVIRONMENT}/cm-frontend-server-versions/app-values.yaml`;

            // Get current version from YAML file
            let currentVersion = "N/A";
            try {
                const owner = TARGET_REPO.split('/')[0];
                const repo = TARGET_REPO.split('/')[1];
                const fileData = await githubRequest('GET', `/repos/${owner}/${repo}/contents/${filePath}`);

                const content = Buffer.from(fileData.content, 'base64').toString('utf-8');
                const regex = new RegExp(`^\\s*${serviceName}:\\s*(.+)$`, 'm');
                const match = content.match(regex);
                if (match) {
                    currentVersion = match[1].replace(/^v/, '').trim();
                }
            } catch (error) {
                console.log(`[SERVER] Failed to get current version for ${serviceName}: ${error.message}`);
            }

            // Get latest release tag
            let latestTag = "N/A";
            try {
                const [owner, repo] = repoName.split('/');
                const releases = await githubRequest('GET', `/repos/${owner}/${repo}/releases?per_page=1`);

                if (releases.length > 0) {
                    latestTag = releases[0].tag_name.replace(/^v/, '');
                }
            } catch (error) {
                console.log(`[SERVER] Failed to get latest release for ${repoName}: ${error.message}`);
            }

            const versionInfo = { current: currentVersion, latest: latestTag };
            console.log(`[SERVER] Version info for ${repoName}: ${JSON.stringify(versionInfo)}`);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(versionInfo));
        } catch (error) {
            console.error(`[SERVER] Error getting version info for ${repoName}: ${error.message}`);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: "Failed to get version info" }));
        }
        return;
    }

    // --- PROMOTION WORKFLOW HANDLER ---
    if (req.url === '/trigger-workflow' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => { body += chunk.toString(); });
        req.on('end', async () => {
            try {
                const data = JSON.parse(body);
                const repoName = data.repository;
                if (!repoName) throw new Error("Repository name not provided.");

                console.log(`[SERVER] Promotion request for ${repoName}. Starting process...`);

                const TARGET_REPO = "y-tree-limited/argocd-monorepo";
                const WORKFLOW_NAME = "promote-service.yaml";
                const ENVIRONMENT = "preprod";
                let fullLog = '';

                // 1. Get latest release tag
                console.log(`1. Getting latest release from ${repoName}`);
                fullLog += `1. Getting latest release from ${repoName}\n`;

                const [owner, repo] = repoName.split('/');
                const releases = await githubRequest('GET', `/repos/${owner}/${repo}/releases?per_page=1`);

                if (releases.length === 0) {
                    throw new Error(`No releases found in ${repoName}.`);
                }

                const latestTag = releases[0].tag_name.replace(/^v/, '');
                console.log(`Found version: ${latestTag}`);
                fullLog += `Found version: ${latestTag}\n`;

                const serviceName = repoName.split('/').pop();
                const servicesString = `${serviceName}@${latestTag}`;
                console.log(`Services parameter: ${servicesString}`);

                // 2. Trigger workflow
                console.log(`2. Triggering workflow '${WORKFLOW_NAME}'`);
                fullLog += `2. Triggering workflow for ${serviceName}@${latestTag}\n`;

                const targetOwner = TARGET_REPO.split('/')[0];
                const targetRepo = TARGET_REPO.split('/')[1];

                await githubRequest('POST', `/repos/${targetOwner}/${targetRepo}/actions/workflows/${WORKFLOW_NAME}/dispatches`, {
                    ref: 'main',
                    inputs: {
                        environment: ENVIRONMENT,
                        services: servicesString
                    }
                });

                // 3. Wait for PR to appear
                console.log("3. Waiting for Pull Request (max 5 minutes)");
                fullLog += "3. Waiting for Pull Request (max 5 minutes)\n";

                const prTitle = `GHA: Promote ${serviceName}@${latestTag} ${ENVIRONMENT}`;
                let prNumber = null;

                // Try to find PR for 5 minutes (10 attempts with 30 second intervals)
                for (let i = 1; i <= 10; i++) {
                    console.log(`Waiting 30s before search (attempt ${i}/10)`);

                    await new Promise(resolve => setTimeout(resolve, 30000));

                    console.log("Searching for PR...");

                    const prs = await githubRequest('GET', `/repos/${targetOwner}/${targetRepo}/pulls?state=open&per_page=100`);

                    const foundPr = prs.find(pr => pr.title === prTitle);
                    if (foundPr) {
                        prNumber = foundPr.number;
                        console.log(`Found PR: #${prNumber}`);
                        fullLog += `Found PR: #${prNumber}\n`;
                        break;
                    }
                }

                if (!prNumber) {
                    throw new Error(`Could not find open PR with title '${prTitle}' within 5 minutes.`);
                }

                // 4. Approve PR and enable auto-merge
                console.log("4. Approving PR and enabling auto-merge");
                fullLog += "4. Approving PR and enabling auto-merge\n";

                // Approve PR using REST API
                await githubRequest('POST', `/repos/${targetOwner}/${targetRepo}/pulls/${prNumber}/reviews`, {
                    event: 'APPROVE'
                });

                // Get pull request node ID for auto-merge (GraphQL only)
                const getPrNodeIdQuery = `
                    query GetPullRequestNodeId($owner: String!, $name: String!, $number: Int!) {
                        repository(owner: $owner, name: $name) {
                            pullRequest(number: $number) {
                                id
                            }
                        }
                    }
                `;

                const prData = await githubGraphQLRequest(getPrNodeIdQuery, {
                    owner: targetOwner,
                    name: targetRepo,
                    number: prNumber
                });

                const pullRequestId = prData.repository.pullRequest.id;

                // NOTE: Auto-merge is NOT available in GitHub's REST API.
                // This is the ONLY operation that requires GraphQL API.
                // Enable auto-merge using GraphQL mutation
                const enableAutoMergeMutation = `
                    mutation EnablePullRequestAutoMerge($pullRequestId: ID!, $mergeMethod: PullRequestMergeMethod!) {
                        enablePullRequestAutoMerge(input: {
                            pullRequestId: $pullRequestId,
                            mergeMethod: $mergeMethod
                        }) {
                            pullRequest {
                                autoMergeRequest {
                                    enabledAt
                                    mergeMethod
                                }
                            }
                        }
                    }
                `;

                await githubGraphQLRequest(enableAutoMergeMutation, {
                    pullRequestId: pullRequestId,
                    mergeMethod: 'SQUASH'
                });

                const successMessage = `✅ PR #${prNumber} approved and set to auto-merge. GitHub will merge it once all checks pass.`;
                console.log(successMessage);
                fullLog += successMessage + '\n';

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ status: 'success', message: fullLog }));
            } catch (e) {
                console.error(`[SERVER] Error: ${e.message}`);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ status: 'error', message: e.message }));
            }
        });
        return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'error', message: 'Endpoint not found.' }));
});

server.listen(PORT, () => {
    console.log(`Node.js server running on port ${PORT}. Waiting for requests...`);
});

