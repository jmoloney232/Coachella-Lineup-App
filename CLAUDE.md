# Coachella Lineup App

Festival artist lineup web app. JavaScript/Node.js frontend and backend,
Neon (PostgreSQL) for data persistence, deployed on Render.

## Tech Stack
- Frontend: HTML/CSS/JavaScript (Vite)
- Backend: Node.js (server.js)
- Database: Neon (serverless PostgreSQL)
- Build tool: Vite
- Deployment: Render (web service)

## File Structure
- /src — frontend source JS/CSS
- /public — static assets
- /dist — Vite build output (do not edit manually)
- server.js — Node.js backend/API server
- index.html — app entry point
- vite.config.js — Vite configuration
- .env.example — environment variable reference
- NEON_SETUP.md — Neon database setup notes

## Commands
- Start frontend dev server: `npm run dev`
- Start backend server: `npm run dev:server`
- Build for production: `npm run build`

## Environment Variables
- Copy .env.example to .env for local development
- NEVER commit .env to GitHub — it is gitignored
- Neon connection string lives in .env

## Deployment
- Hosted on Render as a web service
- Push to main branch → Render auto-deploys
- Ensure all env vars are set in Render dashboard

## Style Rules
- Festival color palette: warm yellows, deep purples, off-whites
- Duotone image effects on artist cards
- Strong typographic hierarchy: large artist names, smaller metadata

## Memory
- Session memory is stored in ~/.claude/projects/.../memory/
- MEMORY.md is the index file — read it at the start of every session
- project_set_times_feature.md — context for the set times feature
- project_roadmap.md — ordered list of all features planned

## Important
- NEVER commit .env or expose Neon credentials
- node_modules/ and dist/ are gitignored — do not modify directly
- Always read MEMORY.md at session start to resume where we left off
