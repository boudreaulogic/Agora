<p align="center">
  <img src="docs/agora-logo.png" alt="Agora" width="80" />
</p>

<h1 align="center">Agora</h1>

<p align="center">
  <strong>Self-hosted low-code database and workflow platform</strong><br/>
  Tables, forms, approvals, automations — all in one place.
</p>

<p align="center">
  <a href="#features">Features</a> •
  <a href="#quick-start">Quick Start</a> •
  <a href="#deployment">Deployment</a> •
  <a href="#screenshots">Screenshots</a> •
  <a href="#license">License</a>
</p>

---

## What is Agora?

Agora is a self-hosted platform that gives organizations the tools to manage data, automate workflows, and build internal applications — without writing code. Think Airtable + Power Automate, but you own your data and host it yourself.

Built for tribal governments, community colleges, nonprofits, and small organizations that need enterprise-grade tools without enterprise-grade budgets.

## Features

**Data Management**
- 18+ column types (text, number, currency, date, select, multi-select, checkbox, rating, formula, linked records, lookups, rollups, and more)
- Multiple views: Grid, Kanban, Calendar, Gallery, Gantt
- Inline editing with real-time collaboration via WebSockets
- Row-level security, column-level permissions, and RBAC
- CSV import/export, Google Sheets sync

**Forms**
- Drag-and-drop form builder with multi-page support
- Conditional logic, validation rules, calculated fields
- Repeating groups with type-aware inputs and live formulas
- Public form URLs — no login required for submitters

**Approval Workflows**
- Multi-stage approval chains with configurable approvers
- Immutable SHA-256 hash-chained audit ledger
- Email notifications with one-click approve/deny
- Auto-lock rows during approval, auto-update on completion

**Automations**
- 10 trigger types: row CRUD, column match, form submit, scheduled, webhook, manual, approval events
- 10 action types: update field, create row, send email, webhook, lock/unlock, notify, trigger approval, delay, IF/condition
- Dynamic content with `{{row.FieldName}}` templates
- Workspace and table-level sharing with permission scoping

**Platform**
- Workspaces with member management (viewer/editor/admin/owner)
- Email-based MFA with admin controls
- API keys with scoped permissions
- Data connectors (REST API sync with field mapping)
- Marketplace for per-table feature toggles
- Dark mode

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14, React, Tailwind CSS |
| Backend | Next.js API Routes, Prisma ORM |
| Database | PostgreSQL 16 |
| Auth | NextAuth.js with Argon2id |
| Real-time | WebSocket server (ws) |
| Deployment | Docker, Docker Compose |

## Quick Start

### Prerequisites

- [Docker](https://docs.docker.com/get-docker/) and Docker Compose
- Git

### 1. Clone the repository

```bash
git clone https://github.com/boudreaulogic/Agora.git
cd Agora
```

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env` and set your secrets:

```bash
# Generate secrets (Linux/Mac):
openssl rand -base64 32  # for NEXTAUTH_SECRET
openssl rand -hex 32     # for ENCRYPTION_KEY
openssl rand -hex 32     # for BROADCAST_SECRET
```

At minimum, change:
- `POSTGRES_PASSWORD` — your database password
- `NEXTAUTH_SECRET` — session encryption key
- `ENCRYPTION_KEY` — data-at-rest encryption key
- `BROADCAST_SECRET` — WebSocket auth secret

### 3. Build and start

```bash
docker compose build
docker compose up -d
```

### 4. Access Agora

Open `http://localhost:3000` in your browser. The first user to register becomes the system administrator.

## Deployment

### Docker Compose (Recommended)

The default `docker-compose.yml` includes:
- **web** — Next.js application
- **postgres** — PostgreSQL 16 database
- **ws-server** — WebSocket server for real-time collaboration

### Production Deployment

For production, we recommend:

1. **Reverse proxy** — Nginx or Cloudflare Tunnel in front of the app
2. **Managed database** — DigitalOcean Managed PostgreSQL or similar
3. **SSL** — Let's Encrypt or Cloudflare for HTTPS
4. **Backups** — Automated PostgreSQL backups

Each client/organization gets its own Docker instance and database — this is not multi-tenant SaaS. Typical cost: ~$100/month per deployment on DigitalOcean.

### Environment Variables

See [`.env.example`](.env.example) for all configuration options.

## Screenshots

*Coming soon — see the [docs](docs/) folder for screenshots.*

## Project Structure

```
├── app/                    # Next.js app router
│   ├── api/                # API routes
│   ├── automations/        # Automation builder UI
│   ├── forms/              # Public form renderer
│   ├── tables/             # Table UI and views
│   └── admin/              # Admin panel
├── components/             # Shared React components
├── lib/                    # Server utilities
│   ├── auth.ts             # NextAuth configuration
│   ├── db.ts               # Prisma client
│   └── automations/        # Automation engine
├── prisma/                 # Database schema and migrations
├── ws-server/              # WebSocket server
├── docker-compose.yml      # Docker deployment
└── Dockerfile              # Container build
```

## Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/my-feature`)
3. Commit your changes
4. Push to your fork
5. Open a Pull Request

All contributions are licensed under the [Agora Community License](LICENSE).

## Support

- **Issues** — [GitHub Issues](https://github.com/boudreaulogic/Agora/issues)
- **Commercial licensing** — hunter@boudreaulogic.com
- **Built by** — [Boudreau Logic DBA](https://boudreaulogic.com)

## License

Agora is source-available under the [Agora Community License v1.0](LICENSE).

**You can:**
- Use it for personal and internal organizational purposes
- Self-host and modify it for your own use

**You cannot:**
- Sell it or offer it as a hosted service (SaaS)
- Redistribute it as your own product

For commercial licensing, contact hello@boudreaulogic.com.

---

<p align="center">
  Built with ❤️ for community organizations<br/>
  <sub>Boudreau Logic — White Earth, Minnesota</sub>
</p>