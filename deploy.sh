#!/bin/bash

# --- CONFIGURATION ---
TARGET_DIR="$HOME/bin"
SERVICE_NAME="com.user.githubtrigger.nodejs"
LAUNCH_AGENT_DIR="$HOME/Library/LaunchAgents"
PLIST_FILE="$LAUNCH_AGENT_DIR/$SERVICE_NAME.plist"
# --- END CONFIGURATION ---

SCRIPT_DIR=$( cd -- "$( dirname -- "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )

print_info() {
    echo -e "\033[0;34m$1\033[0m"
}
print_success() {
    echo -e "\033[0;32m$1\033[0m"
}
print_error() {
    echo -e "\033[0;31m$1\033[0m" >&2
    exit 1
}

# 1. GITHUB TOKEN CHECK
# -----------------------------------------------------------------------------
print_info "Checking GitHub token (GH_TOKEN)..."
if [ -z "$GH_TOKEN" ]; then
    print_error "Error: GH_TOKEN environment variable not set."
    echo "Please ensure it's exported in your .zshrc/.bash_profile,"
    echo "and you've restarted terminal, or run:"
    echo "export GH_TOKEN=ghp_... before running this script."
    exit 1
fi
print_success "GH_TOKEN found."

# 2. FILE COPYING AND SETUP
# -----------------------------------------------------------------------------
mkdir -p "$TARGET_DIR"
mkdir -p "$LAUNCH_AGENT_DIR"

print_info "Copying Node.js server to '$TARGET_DIR'..."
cp -f "$SCRIPT_DIR/local-server.js" "$TARGET_DIR/" || print_error "Failed to copy local-server.js"

# 3. CREATE .PLIST FILE WITH AUTOMATIC TOKEN SUBSTITUTION
# -----------------------------------------------------------------------------
print_info "Creating service file with your token..."
NODE_PATH=$(which node)
if [ -z "$NODE_PATH" ]; then
    print_error "Error: Node.js not found. Please install it (brew install node)."
fi

cat << EOF > "$PLIST_FILE"
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>$SERVICE_NAME</string>
    <key>ProgramArguments</key>
    <array>
        <string>$NODE_PATH</string>
        <string>$TARGET_DIR/local-server.js</string>
    </array>
    <key>EnvironmentVariables</key>
    <dict>
        <key>GH_TOKEN</key>
        <string>$GH_TOKEN</string>
    </dict>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>/tmp/${SERVICE_NAME}.log</string>
    <key>StandardErrorPath</key>
    <string>/tmp/${SERVICE_NAME}.error.log</string>
</dict>
</plist>
EOF

# 4. SERVICE RESTART
# -----------------------------------------------------------------------------
print_info "Restarting service '$SERVICE_NAME'..."
launchctl unload "$PLIST_FILE" 2>/dev/null
launchctl load "$PLIST_FILE" || print_error "Failed to start service '$SERVICE_NAME'."

print_success "✅ Deploy and service restart completed successfully!"
echo "Your token has been automatically added to the service configuration."

