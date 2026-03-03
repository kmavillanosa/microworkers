# Deploy

## Serving reelagad.com (domain → your app on port 8443)

Your app runs at `http://88.222.245.88:8443/`. To serve it at **http://reelagad.com** (port 80), configure the **host** nginx on the server that receives traffic for reelagad.com.

### 1. DNS

- Point **reelagad.com** and **www.reelagad.com** A records to your server IP: **88.222.245.88**.

### 2. Host nginx (on 88.222.245.88)

The “Welcome to nginx!” page means nginx on port 80 is serving the default site instead of your app. Add a site that proxies to your app:

```bash
# On the server (SSH into 88.222.245.88)
cd /path/to/microworkers
sudo cp deploy/nginx-reelagad.conf.example /etc/nginx/sites-available/reelagad.com
sudo ln -s /etc/nginx/sites-available/reelagad.com /etc/nginx/sites-enabled/

# Disable the default site so reelagad.com is used for port 80
sudo rm /etc/nginx/sites-enabled/default
# or: sudo mv /etc/nginx/sites-enabled/default /etc/nginx/sites-enabled/default.bak

# Test and reload
sudo nginx -t && sudo systemctl reload nginx
```

After this, **http://reelagad.com** should show your ReelAgad site (proxied to localhost:8443).

### 3. HTTPS (optional)

For **https://reelagad.com**, use Certbot on the same server:

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d reelagad.com -d www.reelagad.com
```

Certbot will adjust the nginx config and set up automatic renewal.
