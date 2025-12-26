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
for f in "${APP_FILES_SOURCE_DIR}/app.py" "${APP_FILES_SOURCE_DIR}/requirements.txt" "${APP_FILES_SOURCE_DIR}/config.json"; do
    if [ ! -f "$f" ] && [ "$f" != "${APP_FILES_SOURCE_DIR}/config.json" ]; then 
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
apt-get install -y -q nginx curl ufw $PYTHON_EXEC $PYTHON_EXEC-pip $PYTHON_EXEC-venv || { print_error "Failed to install dependencies."; exit 1; }
print_success "System dependencies installed."

# --- Check for and Disable Conflicting Web Servers ---
print_info "Checking for conflicting web servers like Apache..."

if systemctl list-unit-files | grep -q '^apache2.service'; then
  print_warning "Apache2 service detected. Stopping and disabling..."
  systemctl stop apache2
  systemctl disable apache2
  print_success "Apache2 stopped and disabled."
else
  print_info "No conflicting Apache2 service found."
fi

# --- Create or Validate Application User ---
if id "$APP_USER" &>/dev/null; then
  print_warning "User '$APP_USER' already exists. Proceeding."
else
  print_info "Creating new dedicated application user '$APP_USER'..."
  useradd -r -s /bin/false -U "$APP_USER" || { print_error "Failed to create user '$APP_USER'."; exit 1; }
  print_success "User '$APP_USER' created."
fi

# --- Add www-data to APP_USER's group ---
print_info "Adding 'www-data' user to the '$APP_USER' group..."
usermod -aG "$APP_USER" www-data || print_warning "Failed to add www-data to group."
print_success "'www-data' added to '$APP_USER' group."

# --- Create Directories and Copy Files ---
print_info "Setting up application directory: $APP_INSTALL_DIR"
mkdir -p "$APP_INSTALL_DIR" || { print_error "Failed to create directory."; exit 1; }
mkdir -p "${APP_INSTALL_DIR}/static/uploads" 
mkdir -p "${APP_INSTALL_DIR}/static/audio" 
mkdir -p "${APP_INSTALL_DIR}/static/backgrounds" 

print_info "Copying application files..."
cp -r "${APP_FILES_SOURCE_DIR}/." "$APP_INSTALL_DIR/" || { print_error "Failed to copy files."; exit 1; } 

print_info "Configuring config.json..."
cat <<EOF > "${APP_INSTALL_DIR}/init_config.py"
import json
config_file = "${APP_INSTALL_DIR}/config.json"
pin = "${ADMIN_PIN}"

data = {
    "logos": [],
    "theme": {
        "background": "#000000",
        "font_color": "#FFFFFF",
        "low_time_minutes": 5,
        "warning_enabled": True,
        "low_time_color": "#FF0000"
    },
    "custom_background_filename": None,
    "times_up_sound_filename": None,
    "low_time_sound_filename": None,
    "admin_pin_unhashed": pin  # App.py will detect this, hash it, and remove it.
}

with open(config_file, 'w') as f:
    json.dump(data, f, indent=4)
EOF

$PYTHON_EXEC "${APP_INSTALL_DIR}/init_config.py"
rm "${APP_INSTALL_DIR}/init_config.py"
print_success "config.json created. App will secure PIN on first start."

# --- Setup Python Virtual Environment ---
print_info "Setting up Python venv..."
$PYTHON_EXEC -m venv "${APP_INSTALL_DIR}/${VENV_DIR_NAME}" || { print_error "Failed to create venv."; exit 1; }

print_info "Installing Python dependencies..."
source "${APP_INSTALL_DIR}/${VENV_DIR_NAME}/bin/activate"
"${APP_INSTALL_DIR}/${VENV_DIR_NAME}/bin/pip" install --no-cache-dir -r "${APP_INSTALL_DIR}/requirements.txt" || { print_error "Failed to install dependencies."; deactivate; exit 1; }
# Ensure waitress/flask are installed if not in requirements.txt
"${APP_INSTALL_DIR}/${VENV_DIR_NAME}/bin/pip" install waitress Flask || print_warning "Manual install of Flask/Waitress failed."
deactivate
print_success "Python environment set up."

# --- Set Permissions ---
print_info "Setting permissions..."
chown -R "$APP_USER":"$APP_USER" "$APP_INSTALL_DIR"
find "$APP_INSTALL_DIR" -type d -exec chmod 755 {} \; 
find "$APP_INSTALL_DIR" -type f -exec chmod 644 {} \; 
chmod -R u+w "${APP_INSTALL_DIR}/static"
chmod -R u+w "${APP_INSTALL_DIR}/config.json"
chmod +x ${APP_INSTALL_DIR}/${VENV_DIR_NAME}/bin/python
print_success "Permissions set."

# --- Setup Systemd Service (Using Waitress) ---
SERVICE_NAME="${APP_NAME}.service"

print_info "Creating Systemd service: $SERVICE_NAME"
cat <<EOF > "/etc/systemd/system/${SERVICE_NAME}"
[Unit]
Description=Waitress instance for the ${APP_NAME} 
After=network.target

[Service]
User=${APP_USER}
WorkingDirectory=${APP_INSTALL_DIR}
Environment="PATH=${APP_INSTALL_DIR}/${VENV_DIR_NAME}/bin"
ExecStart=${APP_INSTALL_DIR}/${VENV_DIR_NAME}/bin/python app.py
Restart=always
RestartSec=5s
StandardOutput=append:/var/log/${APP_NAME}_out.log
StandardError=append:/var/log/${APP_NAME}_err.log

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable "$SERVICE_NAME"
systemctl restart "$SERVICE_NAME"
print_success "Service '$SERVICE_NAME' started."

# --- Setup Nginx ---
NGINX_CONF_NAME="${APP_NAME}.conf"
print_info "Configuring Nginx..."

if [ -L "/etc/nginx/sites-enabled/default" ]; then
    rm -f "/etc/nginx/sites-enabled/default"
fi

cat <<EOF > "/etc/nginx/sites-available/${NGINX_CONF_NAME}"
server {
    listen ${APP_PORT};
    listen [::]:${APP_PORT}; 
    server_name _; 

    # INCREASED UPLOAD SIZE LIMIT
    client_max_body_size 20M;

    access_log /var/log/nginx/${APP_NAME}_access.log;
    error_log /var/log/nginx/${APP_NAME}_error.log;

    location /static {
        alias ${APP_INSTALL_DIR}/static;
        expires 30d; 
        add_header Cache-Control "public";
    }

    location / {
        # Proxy to Waitress on port 5000 (default in app.py)
        proxy_pass http://127.0.0.1:5000;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 90; 
    }
}
EOF

if [ ! -L "/etc/nginx/sites-enabled/${NGINX_CONF_NAME}" ]; then
    ln -s "/etc/nginx/sites-available/${NGINX_CONF_NAME}" "/etc/nginx/sites-enabled/"
fi

# Reload Nginx securely
if systemctl is-active --quiet nginx; then
    systemctl reload nginx
else
    systemctl start nginx
fi
print_success "Nginx configured."

# --- Firewall ---
print_info "Configuring firewall..."
ufw allow ssh 
ufw allow "${APP_PORT}/tcp" comment "${APP_NAME} HTTP"
if ! ufw status | grep -qw active; then
    ufw --force enable
fi
print_success "Firewall updated."

# --- Final Output ---
SERVER_IP=$(hostname -I | awk '{print $1}') 
echo ""
print_success "Installation Complete!"
print_info "Access Viewer: http://${SERVER_IP}:${APP_PORT}/"
print_info "Access Admin: http://${SERVER_IP}:${APP_PORT}/admin"
exit 0
