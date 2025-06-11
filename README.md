# TCG_Timer
## Contents
About -  [Link](#about-tcg-timer)

Features - [Link](#features)

Screenshots -  [Link](#screenshots)

Installation - [Link](#local-install-method)

Troubleshooting -  [Link](#troubleshooting)

Donate -  [Link](#donate)

## About TCG Timer
There is nothing more cringey than attending a local card shop for a tournament and watching them pull up a YouTube timer. First, they have to search for the right timer. Then, you have to sit through ads before the timer starts so you can begin your round. Suddenly, a time extension is made because more ads decided to play during the video. OOF

One day I decided to write a basic web app, with the help of AI, as a passion project to help local card shops run their weekly tournaments. That's when TCG Timer was born!

TCG Timer is made to run on a Ubuntu server with minimal services. You can either dedicate hardware to run it or run it in a virtual machine using the hypervisor of your choice. The viewer is made to run full-screen in a browser. The admin dashboard can be used in a separate tab or on a separate device on the network to control the viewer.

## Features
- Countdown timer that can be remotely controlled
  - Supports up two timers on one viewer
  - Scales automatically
  - 00h00m00s format
  - Text turns red under 5 minutes
  - Displays "TIMES UP" when expired
- Logo importing and updating in real-time (.PNGs preferred)
- Light/Dark themes (Admin dashboard only)
- Mobile compatibility

## Screenshots
Single Timer
![single_timer](https://github.com/user-attachments/assets/35fe5716-5a92-49e1-acda-2973c6a7ab8c)
Dual Timer
![dual_timer](https://github.com/user-attachments/assets/afc9ad3d-c0ce-41bd-b9c6-6fdabe6774a6)
Admin Login
![admin_login](https://github.com/user-attachments/assets/d6912ce2-0bb5-4ccf-b48d-0eedc8e1c2ab)
Admin Dashboard (Light Theme)
![timer_admin](https://github.com/user-attachments/assets/27a5875c-2c7b-4a4c-86fe-9910e694f1ec)
Admin Dashbaord (Dark Theme)
![timer_admin_dark](https://github.com/user-attachments/assets/eadc54f3-d4c5-46d7-abbf-5a8938c561a3)

## Local Install Method (Debian/Ubuntu)
<a name="local-install-method"></a>
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

Check to see if a conflicting web server is running on TCP/80.
```
sudo ss -tlpn | grep ':80'
```
