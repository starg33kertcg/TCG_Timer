# TCG_Timer

## Docker Install Method (Debian/Ubuntu)
Install Docker and Docker Compose (see installation.txt for more elaborate tutorial)
```
# Update package list and install prerequisites
sudo apt-get update
sudo apt-get install -y ca-certificates curl

# Add Docker's official GPG key
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc

# Add the Docker repository to Apt sources
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt-get update

# Install Docker Engine, CLI, and Compose
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
```
Install Git
```
sudo apt-get install git-all
```
Clone TCG_Timer repository
```
git clone https://github.com/starg33kertcg/TCG_Timer.git
```
Update .env file with your own secret key and 5-digit numerical PIN
```
# Your secret credentials
# Generate a new one for production, e.g., by running: python3 -c 'import secrets; print(secrets.token_hex(24))'
SECRET_KEY='YOUR_KEY_HERE' # Replace YOUR_KEY_HERE with your own secret key
ADMIN_PIN='12345' # Replace with your 5-digit PIN
```
Build the app image from /TCG_Timer/TCG_Timer_Docker
```
sudo docker-compose build
```
