# Janitor Jibesh Database Monk [GET STARTED](https://arjc.github.io/jdbm/)


Password protected public headless CMS which allows you to manage your database from any device.
Create custom tables in a web dashboard, define columns, add records, and every table gets a read-only REST API for your other sites.

Stack: Node.js, Express, EJS, MongoDB (Mongoose).

## Quick start (local)
```bash
git clone https://github.com/arjc/jdbm.git && cd jdbm
npm install
cp .env.example .env   # fill in MONGODB_URI and ADMIN_PASSWORD
npm start              # http://localhost:3000
```

## Environment variables
| Key | Purpose |
|---|---|
| `MONGODB_URI` | MongoDB connection string (required) |
| `ADMIN_USER` | Dashboard username (default `admin`) |
| `ADMIN_PASSWORD` | Dashboard password. If unset, the dashboard is open to everyone |
| `PORT` | Optional. Render sets it automatically |

## Deploy on Render
Build command `npm install`, start command `npm start`, add the env vars above. A full step-by-step guide lives in [`docs/`](docs/index.html) (serve it with GitHub Pages from the `/docs` folder).

## API
Column types: `text`, `longtext`, `number`, `boolean`, `date`.

```
GET /api/:table        -> [ { id, ...columns, createdAt }, ... ]
GET /api/:table/:id    -> { id, ...columns, createdAt }
```
The API is public and read-only (CORS enabled). Writes happen only through the password-protected dashboard.

```js
const songs = await (await fetch("https://your-app.onrender.com/api/songs")).json();
```

## License
MIT © Arjun M Liji · [github.com/arjc](https://github.com/arjc) · [arjc.github.io](https://arjc.github.io)
