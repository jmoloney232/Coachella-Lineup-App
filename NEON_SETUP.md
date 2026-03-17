## Neon Setup

1. Create a Neon project and copy the pooled connection string.
2. Create a `.env` file in the project root from `.env.example`.
3. Set:

```env
DATABASE_URL=postgresql://...
```

4. Install dependencies:

```bash
npm install
```

5. Start the backend:

```bash
npm run dev:server
```

6. Start the frontend in a second terminal:

```bash
npm run dev:client
```

Notes:
- The backend creates the `users`, `sessions`, and `saved_lists` tables automatically on startup.
- If `data/auth.json` or `data/saved-lists.json` exist, the server attempts a one-time migration into Postgres on boot.
- Set `AUTO_MIGRATE_LOCAL_JSON=false` if you want to disable that migration.
