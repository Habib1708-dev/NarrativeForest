# 🚀 Narrative Forest - Local Server Deployment Guide

## 📋 Complete Setup for Fresh Server Machine

This guide assumes **nothing is installed** on your local server machine.

---

## 🎯 Project Summary

- **Built Size:** 17MB
- **Location on USB:** `F:\narrative-forest\`
- **Type:** Static web application (HTML + JavaScript)
- **Requirements:** Any web server that can serve static files

---

## ✅ Recommended Setup: Python HTTP Server

**Why Python?**

- ✅ Lightweight (no configuration needed)
- ✅ Cross-platform (Windows/Mac/Linux)
- ✅ Built into most systems
- ✅ Perfect for static sites like this project

---

## 📖 Step-by-Step Deployment Instructions

### **STEP 1: Check if Python is Already Installed**

Open Command Prompt/Terminal and run:

```bash
python --version
```

or

```bash
python3 --version
```

**If you see a version number (e.g., Python 3.x.x):** ✅ Skip to STEP 3

**If you get an error:** ❌ Continue to STEP 2

---

### **STEP 2: Install Python** (Only if needed)

#### **Windows:**

1. Download Python from: https://www.python.org/downloads/
2. Run the installer
3. ⚠️ **IMPORTANT:** Check "Add Python to PATH" during installation
4. Click "Install Now"
5. Verify installation:
   ```bash
   python --version
   ```

#### **Linux (Ubuntu/Debian):**

```bash
sudo apt update
sudo apt install python3 -y
```

#### **Mac:**

```bash
# Install Homebrew first (if not installed)
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Install Python
brew install python3
```

---

### **STEP 3: Copy Project from USB to Server**

#### **Option A: Run Directly from USB** (Slower but simpler)

```bash
# Just navigate to USB drive
cd F:\narrative-forest
```

#### **Option B: Copy to Local Drive** (Faster, recommended)

**Windows:**

```bash
# Copy to C drive
xcopy F:\narrative-forest C:\narrative-forest\ /E /I /H /Y

# Navigate to it
cd C:\narrative-forest
```

**Linux/Mac:**

```bash
# Copy to home directory
cp -r /path/to/usb/narrative-forest ~/narrative-forest

# Navigate to it
cd ~/narrative-forest
```

---

### **STEP 4: Start the Web Server**

Navigate to the project folder and run:

**Python 3.x (most common):**

```bash
python -m http.server 8080
```

**Python 2.x (older systems):**

```bash
python -m SimpleHTTPServer 8080
```

You should see:

```
Serving HTTP on 0.0.0.0 port 8080 (http://0.0.0.0:8080/) ...
```

---

### **STEP 5: Access the Application**

**On the server machine itself:**

- Open browser and go to: `http://localhost:8080`

**From other computers on the same network:**

1. Find server's IP address:
   - **Windows:** `ipconfig` (look for IPv4 Address)
   - **Linux/Mac:** `ifconfig` or `ip addr`
2. Example: If server IP is `192.168.1.100`:
   - Access from any device on network: `http://192.168.1.100:8080`

---

## 🔧 Alternative Setup Options

### **Option 2: Node.js Server** (If you prefer Node.js)

**Install Node.js:**

- Download from: https://nodejs.org/
- Run installer

**Start Server:**

```bash
cd /path/to/narrative-forest
npx serve . -p 8080
```

---

### **Option 3: XAMPP** (Full Apache Server)

**Best for:** Permanent server setup with multiple websites

**Windows Installation:**

1. Download XAMPP: https://www.apachefriends.org/
2. Install XAMPP
3. Copy project:
   ```bash
   xcopy F:\narrative-forest C:\xampp\htdocs\narrative-forest\ /E /I /H /Y
   ```
4. Start Apache from XAMPP Control Panel
5. Visit: `http://localhost/narrative-forest`

**Linux Installation:**

```bash
sudo apt install apache2 -y
sudo systemctl start apache2
sudo cp -r /path/to/narrative-forest /var/www/html/
# Visit: http://localhost/narrative-forest
```

---

### **Option 4: Nginx** (Lightweight, fast)

**Linux:**

```bash
sudo apt install nginx -y
sudo systemctl start nginx
sudo cp -r /path/to/narrative-forest /var/www/html/
# Visit: http://localhost/narrative-forest
```

---

## 🛠️ Troubleshooting

### **Port 8080 Already in Use**

Change to different port:

```bash
python -m http.server 8081
```

### **Firewall Blocking Access**

**Windows:**

1. Windows Defender Firewall → Advanced Settings
2. Inbound Rules → New Rule
3. Port → TCP → 8080 → Allow

**Linux:**

```bash
sudo ufw allow 8080
```

### **Can't Access from Other Computers**

1. Check server IP: `ipconfig` or `ip addr`
2. Ensure both computers on same network
3. Disable firewall temporarily to test
4. Use server's actual IP, not "localhost"

---

## 📊 Server Resource Requirements

- **RAM:** < 100MB
- **CPU:** Minimal (any modern CPU)
- **Storage:** 17MB for project
- **Network:** Standard ethernet/WiFi

---

## 🔐 Security Notes (For Production)

If deploying for public access:

- ❌ Python's HTTP server is **NOT** for production
- ✅ Use Apache/Nginx with proper security
- ✅ Set up HTTPS
- ✅ Configure firewall properly

For **local network only:** Python server is perfectly fine!

---

## 📝 Quick Reference Commands

```bash
# Navigate to project
cd C:\narrative-forest

# Start server
python -m http.server 8080

# Stop server
Ctrl + C

# Find your IP
ipconfig          # Windows
ip addr           # Linux
```

---

## 🎉 Success Checklist

- ✅ Python installed and working
- ✅ Project copied to server
- ✅ Server running (no errors)
- ✅ Can access at http://localhost:8080
- ✅ Other devices can connect (optional)

---

## 📞 Common Access URLs

| Location      | URL                       |
| ------------- | ------------------------- |
| Same computer | `http://localhost:8080`   |
| Same network  | `http://[SERVER-IP]:8080` |
| Same network  | `http://192.168.x.x:8080` |

---

**That's it!** Your Narrative Forest application should now be running on your local server! 🌲✨
