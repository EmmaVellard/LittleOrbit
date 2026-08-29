# Little Orbit

![Little Orbit preview](public/og.png)

Little Orbit is a calm, offline-friendly daily journal that turns a year into a field of softly colored dots. Each day can hold one small memory, with search, favorites, month and year views, and an “On this day” collection.

## Privacy and local data

Journal entries are stored locally in the browser with IndexedDB. Drafts and the visual dot seed use localStorage.

- Entries are not uploaded to the hosting service.
- There is no account-based journal sync, analytics, or journal API.
- Publishing the website makes the app available, but does **not** publish personal notes. Every browser or device starts with its own separate journal.
- Clearing browser data, removing the installed web app, or changing browsers can erase local entries.
- Use **My journal → Download Markdown backup** regularly. Backups can be opened in Notion or Obsidian and restored inside Little Orbit.

Markdown backups contain the journal text in plain text, so they should be stored somewhere private.

## Features

- One memory for every day of the year
- Randomized dot colors and sizes with fluid pointer interactions
- Year and month calendar views
- Searchable memory collection
- Favorite memories with a moon toggle or a double-click in the list
- Automatic local draft saving
- Markdown backup and restore
- Installable home-screen experience with offline support

## Run locally

Requirements: Node.js 22.13 or newer.

```bash
npm install
npm run dev
```

Open the local address shown in the terminal, normally `http://localhost:3000`.

Create a production build with:

```bash
npm run build
```

## Install on a phone

After the site is published over HTTPS:

- **iPhone:** open it in Safari, tap **Share**, choose **Add to Home Screen**, enable **Open as Web App**, then tap **Add**.
- **Android:** open it in Chrome, open the menu, then choose **Install app** or **Add to Home screen**.

The phone and computer keep separate local journals. Export a Markdown backup on one device and restore it on the other when you want to transfer memories.

## Technology

Little Orbit is built with React, Next.js-compatible Vinext, Vite, and IndexedDB. It is configured as a Progressive Web App with a web manifest, home-screen icons, and a service worker.
