#!/bin/bash

# --- Configuration ---
DEFAULT_APP_USER="timer"
DEFAULT_APP_PORT="80" # Default Nginx listening port
APP_BASE_DIR="/var/www"
APP_NAME="TCG_Timer" # Application name, used for directories and service names
APP_INSTALL_DIR="${APP_BASE_DIR}/${APP_NAME}"
APP_FILES_SOURCE_DIR="$(dirname "$0")/app_files" # Assumes app_files is in the same dir as setup.sh

PYTHON_EXEC="python3"
PIP_EXEC="pip3"
VENV_DIR_NAME="venv"

# --- Helper Functions ---
print_success() {
  echo -e "\033[0;32m[SUCCESS]\033[0m $1"
}

print_error() {
  echo -e "\033[0;31m[ERROR]\033[0m $1" >&2
}

print_warning() {
  echo -e "\033[0;33m[WARNING]\033[0m $1"
}

print_info() {
  echo -e "\033[0;34m[INFO]\033[0m $1"
}

# --- Initial Checks ---
print_info "Starting the TCG Timer Web App setup script..."

if [ "$EUID" -ne 0 ]; then
  print_error "This script must be run as root or with sudo :)"
  exit 1
fi

if [ ! -d "$APP_FILES_SOURCE_DIR" ]; then
    print_error "Application source files directory ('${APP_FILES_SOURCE_DIR}') not found. Did you create it in the right spot?"
    print_error "Please ensure 'app_files' directory is in the same location as this script!"
    exit 1
fi
for f in "${APP_FILES_SOURCE_DIR}/app.py" "${APP_FILES_SOURCE_DIR}/requirements.txt" "${APP_FILES_SOURCE_DIR}/config_template.json"; do
    if [ ! -f "$f" ]; then
        print_error "Required source file '$f' not found in '${APP_FILES_SOURCE_DIR}'."
        exit 1
    fi
done


# --- Interactive User Input ---
print_info "Gathering setup information..."

APP_USER="${DEFAULT_APP_USER}"
read -p "Enter a username for the application (default: ${DEFAULT_APP_USER}): " INPUT_APP_USER
APP_USER=${INPUT_APP_USER:-$DEFAULT_APP_USER}

ADMIN_PIN=""
while true; do
  read -s -p "Enter a 5-digit numerical PIN for the admin dashboard (NOTE: You won't see the *'s as you type!): " ADMIN_PIN
  echo
  if [[ "$ADMIN_PIN" =~ ^[0-9]{5}$ ]]; then
    read -s -p "Confirm PIN: " ADMIN_PIN_CONFIRM
    echo
    if [[ "$ADMIN_PIN" == "$ADMIN_PIN_CONFIRM" ]]; then
      print_info "PIN confirmed."
      break
    else
      print_error "PINs do not match. Please try again."
    fi
  else
    print_error "Invalid PIN. Must be exactly 5 numerical digits!"
  fi
done

APP_PORT=""
while true; do
  read -p "Enter the network port for the web app (e.g., 80 for HTTP, default: ${DEFAULT_APP_PORT}): " INPUT_APP_PORT
  APP_PORT=${INPUT_APP_PORT:-$DEFAULT_APP_PORT}
  if [[ "$APP_PORT" =~ ^[0-9]+$ ]] && [ "$APP_PORT" -gt 0 ] && [ "$APP_PORT" -le 65535 ]; then
    break
  else
    print_error "Invalid port number. Please enter a number between 1 and 65535."
  fi
done

print_info "Setup parameters:"
print_info "  Application Name: $APP_NAME"
print_info "  Application User: $APP_USER"
print_info "  Admin PIN: (hidden)"
print_info "  Web App Port: $APP_PORT"
print_info "  Installation Directory: $APP_INSTALL_DIR"
read -p "Proceed with installation? (y/N): " CONFIRM_INSTALL
if [[ ! "$CONFIRM_INSTALL" =~ ^[Yy]$ ]]; then
  print_info "Installation aborted by user."
  exit 0
fi

# --- System Update and Dependency Installation ---
print_info "Updating system packages and installing dependencies..."
apt-get update -q || { print_error "apt-get update failed."; exit 1; }
apt-get install -y -q nginx curl ufw $PYTHON_EXEC $PYTHON_EXEC-pip $PYTHON_EXEC-venv gunicorn || { print_error "Failed to install dependencies."; exit 1; }
print_success "System dependencies installed."

# --- Create or Validate Application User ---
if id "$APP_USER" &>/dev/null; then
  print_warning "User '$APP_USER' already exists."
  print_warning "Using an existing interactive user for a service application is not recommended for security reasons, but the setup will proceed."
  print_info "Normally you would create a service user to manage an app. Since this is an existing user, we will not modify the graphical shell permissions to prevent lockout."
else
  print_info "Creating new dedicated application user '$APP_USER'..."
  # Create a system user with no login shell and create a primary group with the same name.
  useradd -r -s /bin/false -U "$APP_USER" || { print_error "Failed to create user '$APP_USER'."; exit 1; }
  print_success "New user '$APP_USER' and group '$APP_USER' created."
fi

# --- Add www-data to APP_USER's group ---
# This allows Nginx (running as www-data) to access the Gunicorn socket
print_info "Adding 'www-data' user to the '$APP_USER' group for Nginx socket access..."
usermod -aG "$APP_USER" www-data || print_warning "Failed to add www-data to group '$APP_USER'. This might cause Nginx connection issues later."
print_success "'www-data' user added to '$APP_USER' group."

# --- Create Application Directories and Copy Files ---
print_info "Setting up application directory: $APP_INSTALL_DIR"
mkdir -p "$APP_INSTALL_DIR" || { print_error "Failed to create directory $APP_INSTALL_DIR."; exit 1; }
mkdir -p "${APP_INSTALL_DIR}/static/uploads" 

print_info "Copying application files from $APP_FILES_SOURCE_DIR to $APP_INSTALL_DIR..."
cp -r "${APP_FILES_SOURCE_DIR}/." "$APP_INSTALL_DIR/" || { print_error "Failed to copy application files."; exit 1; } 

print_info "Creating config.json..."
if [ -f "${APP_INSTALL_DIR}/config_template.json" ]; then
    sed "s/WILL_BE_SET_BY_SETUP_SCRIPT/$ADMIN_PIN/" "${APP_INSTALL_DIR}/config_template.json" > "${APP_INSTALL_DIR}/config.json"
    rm "${APP_INSTALL_DIR}/config_template.json" 
    print_success "config.json created with specified PIN."
else
    print_error "config_template.json not found in target directory after copy. Did you rename it or delete it?"
    exit 1
fi

# --- Setup Python Virtual Environment ---
print_info "Setting up Python virtual environment in ${APP_INSTALL_DIR}/${VENV_DIR_NAME}..."
$PYTHON_EXEC -m venv "${APP_INSTALL_DIR}/${VENV_DIR_NAME}" || { print_error "Failed to create Python virtual environment."; exit 1; }

print_info "Installing Python dependencies from requirements.txt..."
source "${APP_INSTALL_DIR}/${VENV_DIR_NAME}/bin/activate"
"${APP_INSTALL_DIR}/${VENV_DIR_NAME}/bin/pip" install --no-cache-dir -r "${APP_INSTALL_DIR}/requirements.txt" || { print_error "Failed to install Python dependencies."; deactivate; exit 1; }
deactivate
print_success "Python virtual environment and dependencies set up."

# --- Set Permissions ---
print_info "Setting file and directory permissions..."
# Owner: APP_USER, Group: APP_USER for all app files
chown -R "$APP_USER":"$APP_USER" "$APP_INSTALL_DIR" || print_warning "Failed to chown some app files to $APP_USER."
# User: rwx, Group: rx, Other: rx for directories
# User: rw, Group: r, Other: r for files
find "$APP_INSTALL_DIR" -type d -exec chmod 755 {} \; 
find "$APP_INSTALL_DIR" -type f -exec chmod 644 {} \; 
# Specific write permissions needed by the app
chmod u+w "${APP_INSTALL_DIR}/config.json" 
chmod -R u+w "${APP_INSTALL_DIR}/static/uploads" 
# Ensure execute on venv executables
chmod +x ${APP_INSTALL_DIR}/${VENV_DIR_NAME}/bin/python
chmod +x ${APP_INSTALL_DIR}/${VENV_DIR_NAME}/bin/gunicorn
# Set SGID on directories so new files inherit group (optional but good practice)
# find "$APP_INSTALL_DIR" -type d -exec chmod g+s {} \; # Reconsidering this, as simple ownership is key.

print_success "Permissions set."

# --- Setup Gunicorn Systemd Service ---
SERVICE_NAME="${APP_NAME}.service" # e.g., TCG_Timer_app.service
GUNICORN_SOCKET_FILE="${APP_INSTALL_DIR}/gunicorn.sock"

print_info "Creating Gunicorn systemd service: $SERVICE_NAME"
cat <<EOF > "/etc/systemd/system/${SERVICE_NAME}"
[Unit]
Description=Gunicorn instance for the ${APP_NAME} 
After=network.target

[Service]
User=${APP_USER}
WorkingDirectory=${APP_INSTALL_DIR}
Environment="PATH=${APP_INSTALL_DIR}/${VENV_DIR_NAME}/bin"
ExecStart=${APP_INSTALL_DIR}/${VENV_DIR_NAME}/bin/gunicorn --workers 1 --bind unix:${GUNICORN_SOCKET_FILE} -m 007 app:app
Restart=always
RestartSec=5s
StandardOutput=append:/var/log/${APP_NAME}_gunicorn_out.log
StandardError=append:/var/log/${APP_NAME}_gunicorn_err.log

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
print_info "Enabling Gunicorn service '$SERVICE_NAME' to start on reboot..."
systemctl enable "$SERVICE_NAME" || { print_error "Failed to enable systemd service $SERVICE_NAME."; exit 1; }
print_info "Starting Gunicorn service '$SERVICE_NAME'..."
systemctl start "$SERVICE_NAME" || { print_error "Failed to start systemd service $SERVICE_NAME. Check logs with 'journalctl -u $SERVICE_NAME' and /var/log/${APP_NAME}_gunicorn_*.log"; exit 1; }
print_success "Gunicorn systemd service '$SERVICE_NAME' created, enabled, and started."

# --- Setup Nginx as a Reverse Proxy ---
NGINX_CONF_NAME="${APP_NAME}.conf" # e.g., TCG_Timer_app.conf
print_info "Configuring Nginx reverse proxy..."

if [ -L "/etc/nginx/sites-enabled/default" ]; then
    print_info "Disabling default Nginx site."
    rm -f "/etc/nginx/sites-enabled/default"
fi

cat <<EOF > "/etc/nginx/sites-available/${NGINX_CONF_NAME}"
server {
    listen ${APP_PORT};
    listen [::]:${APP_PORT}; 
    server_name _; 

    access_log /var/log/nginx/${APP_NAME}_access.log;
    error_log /var/log/nginx/${APP_NAME}_error.log;

    location /static {
        alias ${APP_INSTALL_DIR}/static;
        expires 30d; 
        add_header Cache-Control "public";
    }

    location / {
        proxy_pass http://unix:${GUNICORN_SOCKET_FILE};
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 90; 
    }
}
EOF

if [ -L "/etc/nginx/sites-enabled/${NGINX_CONF_NAME}" ]; then
    print_warning "Nginx site '${NGINX_CONF_NAME}' already enabled."
else
    ln -s "/etc/nginx/sites-available/${NGINX_CONF_NAME}" "/etc/nginx/sites-enabled/" || { print_error "Failed to enable Nginx site."; exit 1; }
fi

print_info "Enabling Nginx service to start on reboot..."
systemctl enable nginx || print_warning "Failed to enable nginx service. It might already be enabled."
print_info "Testing Nginx configuration and reloading..."
nginx -t || { print_error "Nginx configuration test failed. Please check Nginx logs."; exit 1; }
systemctl reload nginx || systemctl restart nginx || { print_error "Failed to reload/restart Nginx."; exit 1; } # Try reload, then restart
print_success "Nginx configured, enabled, and reloaded/restarted."

# --- Firewall Configuration (UFW) ---
print_info "Configuring firewall (UFW)..."
ufw allow ssh 
ufw allow "${APP_PORT}/tcp" comment "${APP_NAME} HTTP"
# Check if UFW is active before enabling to avoid error message if already active
if ! ufw status | grep -qw active; then
    ufw --force enable || { print_warning "Failed to enable UFW. It might be conflicting with another firewall."; }
else
    print_info "UFW is already active."
fi
print_success "Firewall configured to allow SSH and port ${APP_PORT}."

# --- Final Output ---
print_success "TCG Timer app installation complete!"
SERVER_IP=$(hostname -I | awk '{print $1}') 
if [ -z "$SERVER_IP" ]; then
    SERVER_IP="<your_server_ip>"
fi

echo ""
print_info "You should be able to access the application at:"
print_info "  Viewer: http://${SERVER_IP}:${APP_PORT}/"
print_info "  Admin Dashboard: http://${SERVER_IP}:${APP_PORT}/admin"
print_info "  Admin PIN: ${ADMIN_PIN} (Keep this secure!)"
echo ""
print_info "Important Notes:"
print_info " - Application runs as user '$APP_USER'."
print_info " - Gunicorn service: '$SERVICE_NAME'. Check status with 'systemctl status $SERVICE_NAME'."
print_info " - Nginx service: 'nginx'. Check status with 'systemctl status nginx'."
print_info " - Application files: '$APP_INSTALL_DIR'."
print_info " - Python environment: '${APP_INSTALL_DIR}/${VENV_DIR_NAME}'."
print_info " - Gunicorn logs: /var/log/${APP_NAME}_gunicorn_*.log"
print_info " - Nginx logs: /var/log/nginx/${APP_NAME}_*.log"

exit 0
