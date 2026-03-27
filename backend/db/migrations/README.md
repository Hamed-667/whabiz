# Migrations SQL

- Place ici les migrations SQL versionnees (`.sql`).
- Convention de nommage recommandee: `YYYYMMDD_NNN_description.sql`.
- Les fichiers sont executes dans l'ordre alphabetique.
- L'etat est stocke dans la table `schema_migrations`.

Execution:

```bash
npm --prefix backend run mysql:migrations
```
