# TCG_Timer

## Docker Install Method (Debian/Ubuntu)
Install Git
```
sudo apt-get update
sudo apt-get install git-all
```
Clone app repo
```
git clone https://github.com/starg33kertcg/TCG_Timer.git
```
Change directory to TCG_Timer/app_files/ and update app.py with your own secret key
```
cd TCG_Timer/app_files
sudo nano app.py
```
```
app.secret_key = 'YOUR_KEY_HERE'  # Replace with a stronger secret key for session management
```
Go back to /TCG_Timer and update setup.sh with execute permissions
```
cd ..
sudo chmod +x setup.sh
```
Run the setup script (Installs python, nginx, and gunicorn. Configures reverse proxy, firewall, permissions, services, and app parameters)
```
sudo ./setup.sh
```
