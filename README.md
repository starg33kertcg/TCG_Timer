# TCG_Timer

## Local Install Method (Debian/Ubuntu)
Install Git
```
sudo apt-get update
sudo apt-get install git-all
```
Clone GitHub repo
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
Go back to TCG_Timer/ and update setup.sh with execute permissions
```
cd ..
sudo chmod +x setup.sh
```
Run the setup script (Installs python, nginx, and gunicorn. Configures reverse proxy, firewall, permissions, services, and app parameters)
```
sudo ./setup.sh
```
When completed, access the viewer at http://SERVERIP and the admin panel at http://SERVERIP/admin
## Troubleshooting
***Receiving a "Failed to reload/restart nginx" error after running the setup.sh script"***
<br>Check to see if Apache is running (or similar service operating on TCP/80). As long as nothing critical is running on Apache, you can safely disable it and then reload Nginx.
```
sudo ss -tlpn | grep ':80'
sudo systemctl stop apache2
sudo systemctl disable apache2
sudo systemctl start nginx
sudo systemctl status nginx
```
