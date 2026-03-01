# MySQL init scripts

## Grant privileges (`grant_privileges.sql`)

- **Purpose:** Create the `reelmaker` database and grant the app user full access to it.
- **Must be run as MySQL root** (or another admin). The app user cannot create databases or grant privileges.

**Options:**

1. **Docker (first start only)**  
   Mount this folder into the MySQL container’s init dir so the script runs on first start:
   ```yaml
   volumes:
     - ./mysql-initdb.d:/docker-entrypoint-initdb.d
   ```
   Then start the stack once; scripts in `/docker-entrypoint-initdb.d` run automatically as root.

2. **Manual on the server**  
   Log in as root and source the file:
   ```bash
   mysql -h 88.222.245.88 -u root -p < api/mysql-initdb.d/grant_privileges.sql
   ```
   Or inside the MySQL shell: `source /path/to/grant_privileges.sql;`

After this, the `user` in `.env` can use the `reelmaker` database; no `CREATE DATABASE` or `GRANT` rights are needed for the app.

---

## How migrations are run (aligned with bill-tracker)

- **Schema:** TypeORM entities + optional migrations in `src/db/migrations/`.
- **Config:** `src/db/orm.config.ts` (uses `TYPEORM_*` from `.env`).

**Scripts (from repo root `api/`):**

| Script        | Command           | Purpose                          |
|---------------|-------------------|----------------------------------|
| List pending  | `npm run db:show` | Show migration status            |
| Run pending   | `npm run db:migrate` | Apply pending migrations     |
| Undo last     | `npm run db:revert`  | Revert last migration        |

Migrations are TypeScript files in `src/db/migrations/`; TypeORM runs them in order. Generate new ones with the TypeORM CLI or by adding a script similar to bill-tracker’s `generate-migration.ts`.
