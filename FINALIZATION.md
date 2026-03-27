# Finalization Checklist

Use this to prepare WhaBiz for production and a stable day-to-day run.

## 1) Environment
1. Set `NODE_ENV=production` in `backend/.env`.
2. Set a strong `JWT_SECRET` (not the default).
3. Set admin credentials:
   - Use `ADMIN_PASSWORD_HASH` (recommended), or update `ADMIN_PASSWORD`.
4. Set MySQL vars if using MySQL (`MYSQL_ENABLED=1`, host, user, password, database).
5. Review security toggles:
   - `RECOVERY_DEBUG_CODE=0` in production.
   - `RECOVERY_WHATSAPP_LINK_ENABLED=0` if you do not want recovery links.

## 2) Preflight checks
1. Run: `npm --prefix backend run preflight`
2. Fix any blocking issues reported by the script.

## 3) Database
1. Run migrations if needed: `npm --prefix backend run mysql:migrations`
2. Verify storage status:
   - `GET http://localhost:3000/api/storage/status`

## 4) Backups + Restore
1. Run a backup: `npm --prefix backend run db:backup`
2. Test restore: `npm --prefix backend run db:restore:test`
3. Optional: enable auto restore tests:
   - `MYSQL_RESTORE_TEST_AUTO=1`

## 5) Tests
1. Smoke: `npm --prefix backend run smoke`
2. Critical: `npm --prefix backend run test:critical`
3. Full CI locally: `npm run test:ci`

## 6) Health + Ops
1. `GET http://localhost:3000/api/health/details`
2. Admin page -> Ops: `http://localhost:3000/admin`

## 7) Start
1. Start server: `npm --prefix backend start`
2. Visit:
   - Admin: `http://localhost:3000/admin`
   - Vendeur: `http://localhost:3000/vendeur`
   - Boutique: `http://localhost:3000/<slug>`

