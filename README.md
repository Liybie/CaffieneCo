# ☕ Caffeine Co. — Coffee Shop

A full-featured coffee shop website with a customer landing page and admin management portal.

## Features

### Customer Page
- **Landing page** with hero animation and high-quality imagery
- **One-time email discount** (20% off for new customers)
- **Coffee shop info** — hours, contact, address
- **Today's specialty** — dynamically updated from admin
- **Why Us / Pros** — studying, workspace, community, sustainability, etc.
- **Google Maps** location embed
- **Footer** with quick links and discount CTA

### Admin Panel (`/admin`)
- **Login** — Username: `AlgoCoffee` / Password: `Algo123`
- **Security lockout** — 3 failed attempts locks access for 10 minutes
- **Admin notification** — lockout alerts sent to `ParagatosLiybie@gmail.com`
- **Edit shop info** — name, tagline, description, hours, contact, images, map
- **Edit specialty** — update today's signature brew
- **Dynamic discount** — change percentage and email message template
- **Manage pros** — add/edit/remove "Why Us" cards
- **Subscribers list** — view all discount sign-ups
- **System log** — filterable activity log (auth, security, admin, customer, email)

## Quick Start

```bash
# Install dependencies
npm install

# Copy environment file and configure email (optional)
copy .env.example .env

# Start the server
npm start
```

- **Customer site:** http://localhost:3000
- **Admin panel:** http://localhost:3000/admin

## Email Configuration

To enable discount emails and lockout notifications, edit `.env`:

```
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-gmail-app-password
ADMIN_NOTIFY_EMAIL=ParagatosLiybie@gmail.com
```

> For Gmail, create an [App Password](https://myaccount.google.com/apppasswords).

Without SMTP configured, discount codes are still generated and shown on-screen; lockout events are logged but emails won't send.

## Admin Credentials

| Field    | Value        |
|----------|--------------|
| Username | `AlgoCoffee` |
| Password | `Algo123`    |

## Tech Stack

- **Backend:** Node.js, Express
- **Frontend:** HTML, CSS, JavaScript (vanilla)
- **Storage:** JSON files in `/data`
- **Email:** Nodemailer

## Project Structure

```
CoffeeShop/
├── server.js              # Express API & server
├── data/
│   ├── shop-data.json     # Shop content (editable via admin)
│   ├── subscribers.json   # Email discount subscribers
│   └── system-log.json    # Activity log
├── public/
│   ├── index.html         # Customer landing page
│   ├── admin/index.html   # Admin dashboard
│   ├── css/               # Stylesheets
│   └── js/                # Client scripts
└── package.json
```
