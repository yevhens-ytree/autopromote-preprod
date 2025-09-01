# Autopromote Preprod Setup

## Prerequisites

- Node.js installed
- GitHub Personal Access Token with repository permissions
- Tampermonkey browser extension

## Setup

1. **Set GH_TOKEN environment variable**
   ```bash
   echo 'export GH_TOKEN=ghp_your_token_here' >> ~/.zshrc
   source ~/.zshrc
   ```

2. **Run deployment script**
   ```bash
   ./deploy.sh
   ```

3. **Install userscript**
   - Copy contents of `userscript.js`
   - Open Tampermonkey dashboard
   - Create new script and paste the code
   - Save and enable the script

The userscript will add a "Check Preprod Version" button to GitHub repository pages that communicates with your local server.
