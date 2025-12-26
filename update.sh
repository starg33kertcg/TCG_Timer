#!/bin/bash

# --- Configuration ---
SERVICE_NAME="TCG_Timer"
REPO_URL="https://github.com/starg33kertcg/TCG_Timer.git"
TEMP_DIR="/tmp/tcg_timer_update_$(date +%s)"

# --- 1. Check for root privileges ---
if [ "$EUID" -ne 0 ]; then
  echo "Please run as root (sudo ./update.sh)"
  exit 1
fi

echo "--- TCG Timer Smart Updater ---"

# --- 2. Check for Git ---
if ! command -v git &> /dev/null; then
    echo "Git not found. Installing git..."
    apt-get update && apt-get install -y git
fi

# --- 3. Locate Installation ---
SERVICE_FILE="/etc/systemd/system/$SERVICE_NAME.service"
if [ ! -f "$SERVICE_FILE" ]; then
    echo "Error: Service file ($SERVICE_FILE) not found."
    exit 1
fi

INSTALL_DIR=$(grep '^WorkingDirectory=' "$SERVICE_FILE" | cut -d= -f2)
if [ -z "$INSTALL_DIR" ] || [ ! -d "$INSTALL_DIR" ]; then
    echo "Error: Invalid install path found in service file."
    exit 1
fi
echo "Found installation at: $INSTALL_DIR"

# --- 4. Download Update ---
echo "Downloading latest version..."
rm -rf "$TEMP_DIR"
git clone "$REPO_URL" "$TEMP_DIR"

if [ ! -d "$TEMP_DIR/app_files" ]; then
    echo "Error: Repository missing 'app_files' directory."
    rm -rf "$TEMP_DIR"
    exit 1
fi

# --- 5. Stop Service ---
echo "Stopping $SERVICE_NAME..."
systemctl stop $SERVICE_NAME

# --- 6. Backup Config ---
if [ -f "$INSTALL_DIR/config.json" ]; then
    cp "$INSTALL_DIR/config.json" "$INSTALL_DIR/config.json.bak"
fi

# --- 7. Apply File Updates ---
echo "Copying new files..."
# Copy contents of app_files to install dir
cp -r "$TEMP_DIR/app_files/." "$INSTALL_DIR/"
rm -rf "$TEMP_DIR"

# --- 8. Create Directories ---
echo "Ensuring directory structure..."
mkdir -p "$INSTALL_DIR/static/audio"
mkdir -p "$INSTALL_DIR/static/backgrounds"
mkdir -p "$INSTALL_DIR/static/uploads"

# --- 9. Fix Permissions ---
SERVICE_USER=$(grep '^User=' "$SERVICE_FILE" | cut -d= -f2)
if [ ! -z "$SERVICE_USER" ]; then
    echo "Setting permissions for user: $SERVICE_USER"
    chown -R $SERVICE_USER:$SERVICE_USER "$INSTALL_DIR"
fi

# --- 10. Install Dependencies ---
echo "Installing/Updating Python dependencies..."
# We use the python executable inside the venv directly to install packages
VENV_PYTHON="$INSTALL_DIR/venv/bin/python3"

if [ -x "$VENV_PYTHON" ]; then
    # Install waitress, Flask, and anything else in requirements.txt
    # We run this as the service user to keep permissions correct
    sudo -u $SERVICE_USER $VENV_PYTHON -m pip install waitress Flask
    
    # Also try installing from requirements.txt if it exists
    if [ -f "$INSTALL_DIR/requirements.txt" ]; then
        sudo -u $SERVICE_USER $VENV_PYTHON -m pip install -r "$INSTALL_DIR/requirements.txt"
    fi
    echo "Dependencies installed successfully."
else
    echo "Warning: Virtual environment python not found at $VENV_PYTHON"
    echo "Attempting to create venv..."
    sudo -u $SERVICE_USER python3 -m venv "$INSTALL_DIR/venv"
    sudo -u $SERVICE_USER "$INSTALL_DIR/venv/bin/pip" install waitress Flask
fi

# --- 11. Update Nginx Config ---
NGINX_CONF="/etc/nginx/sites-available/$SERVICE_NAME.conf"
if [ -f "$NGINX_CONF" ]; then
    echo "Checking Nginx configuration for upload limits..."
    # Check if client_max_body_size is already set
    if ! grep -q "client_max_body_size" "$NGINX_CONF"; then
        echo "Updating Nginx to allow 20M uploads..."
        # Insert the directive inside the server block (after server_name)
        sed -i '/server_name _;/a \    client_max_body_size 20M;' "$NGINX_CONF"
        
        # Test and Reload Nginx
        if nginx -t; then
            systemctl reload nginx
            echo "Nginx updated successfully."
        else
            echo "Warning: Nginx config test failed. Reverting changes not possible automatically."
        fi
    else
        echo "Nginx upload limit already configured."
    fi
else
    echo "Warning: Nginx config file not found at $NGINX_CONF. Skipping Nginx update."
fi

# --- 12. Restart Service ---
echo "Restarting service..."
systemctl daemon-reload
systemctl start $SERVICE_NAME

echo "------------------------------------------------"
echo "Update Complete!"
systemctl status $SERVICE_NAME --no-pager | head -n 10
