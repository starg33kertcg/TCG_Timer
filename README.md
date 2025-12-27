# TCG Timer
## Contents
About -  [Link](#about-tcg-timer)

Features - [Link](#features)

Screenshots -  [Link](#screenshots)

Installation - [Link](#local-install-method)

Troubleshooting -  [Link](#troubleshooting)

Support - [Link](#support)

Donate -  [Link](#donate)

Frequently Asked Questions - [Link](#FAQs)

## About TCG Timer
There is nothing more cringey than attending a local card shop for a tournament and watching them pull up a YouTube timer. First, they have to search for the right timer. Then, you have to sit through ads before the timer starts so you can begin your round. Suddenly, a time extension is made because more ads decided to play during the video. OOF

One day I decided to write a basic web app, with the help of AI, as a passion project to help local card shops run their weekly tournaments. That's when TCG Timer was born!

TCG Timer is made to run on a Ubuntu server with minimal services. You can either run it with dedicated hardware or run it in a virtual machine using the hypervisor of your choice. The viewer is made to run full-screen in a browser or as a Roku app. The admin dashboard can be used in a separate tab or on a separate device on the network to control the viewer. Don't run a TCG tournament? No problem! The TCG Timer app is versatile and can be used in a variety of non-TCG related scenarios.

Best of all? It's yours to use for FREE! I understand that profit margins are narrow on TCG products. This is my contribution to YOU for having to put up with crazy people like us.

<a href="https://www.tcgtimer.com">tcgtimer.com</a>

## Features
- Countdown timer that can be remotely controlled
  - Supports up two timers on one viewer
  - Scales automatically
  - 00h00m00s format
  - Customizable "low time" threshold (change time threshold, sound effect, and color!)
  - Displays "TIME'S UP" when expired and plays a customizable sound effect
- Logo importing and updating in real-time (.PNGs preferred)
- Theme control
  - Light/Dark theme toggles (Admin dashboard only)
  - Change background color or upload a custom background image
  - Change font colors
- Mobile compatibility
- <a href="https://github.com/starg33kertcg/TCG_Timer_Roku">Roku app</a> (Viewer only, the Linux or Windows server is still required for functionality)

## Screenshots
Single Timer
![single-timer](https://github.com/user-attachments/assets/4380a2b1-779c-4767-8986-af614758ce2f)
Dual Timer
![dual-timer](https://github.com/user-attachments/assets/1bb50700-9ba4-4013-9a3a-2a6325aa5f46)
Admin Login
![admin_login](https://github.com/user-attachments/assets/d6912ce2-0bb5-4ccf-b48d-0eedc8e1c2ab)
Admin Dashboard (Light Theme)
![admin-dashboard](https://github.com/user-attachments/assets/63d93640-6845-49df-b89b-fd390b5bd017)
Roku App Configuration
![roku_timer3](https://github.com/user-attachments/assets/74c2016e-f2c1-40b0-bff9-2766aefc991d)

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
Change directory to the new TCG_Timer folder and update the setup.sh file with execute permissions
```
cd TCG_Timer
```
```
sudo chmod +x setup.sh
```
Run the setup script (Installs python, nginx, and waitress. Configures reverse proxy, firewall, permissions, services, and app parameters)
```
sudo ./setup.sh
```
When completed, access the viewer at http://SERVERIP and the admin panel at http://SERVERIP/admin

## Troubleshooting
***Receiving a "Failed to reload/restart nginx" error after running the setup.sh script***

Check to see if a conflicting web server is running on TCP/80.
```
sudo ss -tlpn | grep ':80'
```

***Receiving a "File upload failed." message when uploading a new file or Nginx 413 (Request Entity Too Large) error***

The file size of the file you tried to upload is too large. The file size maximum is 1MB by default with nginx. The setup.sh script should auto update this to 10MB. Try reducing the size of the file and try again or temporarily try a different file.

## Support
Have questions? Submit your inquiries to starg33kertcg@gmail.com

## Donate
Appreciating the app? Consider donating a booster pack or two via Venmo **@starg33ker** or <a href="https://www.paypal.com/donate/?hosted_button_id=THKLW8ZBNMMEC">PayPal</a> to feed my addiction...err..I mean hobby. (don't tell my wife I said that)

## FAQs
<a name="FAQs"></a>
***"Can I run this on Windows?"***
<br>Yes! You can download the .exe file on our website <a href="https://www.tcgtimer.com">tcgtimer.com</a>

***"Can I run the server in Docker?"***
<br>Yes! See the <a href="https://github.com/starg33kertcg/TCG_Timer_Docker/tree/main">Docker installation page</a>
