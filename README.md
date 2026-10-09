# 💰 Daily Expense Tracker

A lightweight, installable web app to track daily transport and other expenses, view them day by day, and export a monthly PDF report. It runs entirely in the browser with no backend, no database and no sign-up.

**Live app:** https://skl-sunilkumar.github.io/DAILY-EXPENSES-TRACKER

> DAILY-EXPENSES-TRACKER

## Features

- **Dashboard**
  - Total spent, transport total, other expenses total and daily average
  - Category and transport-type breakdown bars
  - Day-wise expenses in a grid. Tap a day to open it in History
  - Month selector to view any month
- **Add Transport**
  - Types: Auto, Bike, Mofussil Bus (AC / Deluxe / Normal / Private, with bus number) and Others
  - Preset route list, or type a custom route with OTHERS
  - Payment methods: Cash, G-Pay, WhatsApp Pay, Credit/Debit Card, Net Banking, CHENNAI ONE (GPay / WhatsApp), STUDENT BUS PASS, Rs. 1k PASS, BIKE MUTHU and OTHERS
  - ₹0 amount is allowed only for STUDENT BUS PASS, Rs. 1k PASS and BIKE MUTHU
- **Add Other Expense**
  - Food, Clothes, Stationary or a custom category, with remarks and payment method
- **History**
  - Entries shown as cards in a grid, grouped by day
  - Filter by day, and edit or delete any entry
- **Monthly PDF report**
  - Landscape A4 with a month-year watermark on every page (for example `SEPT-26`)
  - Columns: DATE | TYPE | MoT / MoD | DETAILS | PAID VIA | REMARKS | AMOUNT
  - Includes a summary and day totals
  - A Print / Save via Browser option is also available
- **Installable and offline**
  - Works as an app on your phone's home screen and offline after the first load

## Project structure

```
├── index.html          Page structure (tabs, forms, layout)
├── style.css           All styling
├── app.js              All logic (saving, dashboard, History, PDF)
├── manifest.json       App install details (name, colours, icons)
├── service-worker.js   Offline caching
├── icon-192.png        App icon
└── icon-512.png        App icon
```

## Run it

**Online:** Open the live link above.

**On your computer:** Download the repo and open `index.html` in a browser. The installable and offline features need the hosted version.

**Install on Android:** Open the live link in Chrome, then tap ⋮ → **Install app**.
**Install on iPhone:** Open it in Safari, then tap Share → **Add to Home Screen**.

## Host your own copy on GitHub Pages

1. Upload all the files above to a new repository. They all go in the same place, with no folders.
2. Go to **Settings → Pages**.
3. Under **Build and deployment**, choose **Deploy from a branch**, select `main` and `/ (root)`, then click **Save**.
4. After a minute or two, your app is live at `https://YOUR-USERNAME.github.io/REPO-NAME/`.

## Data and privacy

- Expense data is saved in your browser (`localStorage`) on your own device. Nothing is sent to a server.
- Clearing your browser's site data for this page deletes your expenses. Data does not sync between devices or browsers.
- The PDF download uses the jsPDF library loaded from a CDN, so it needs an internet connection. Everything else works offline.

## Built with

Plain HTML, CSS and JavaScript. No frameworks and no build step. PDF export uses [jsPDF](https://github.com/parallax/jsPDF).
