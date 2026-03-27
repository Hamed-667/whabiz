# WhaBiz - Activation MySQL

## 1) Configurer l environnement

Copiez `backend/.env.example` vers `backend/.env` puis adaptez:

```env
MYSQL_ENABLED=1
MYSQL_HOST=127.0.0.1
MYSQL_PORT=3306
MYSQL_USER=root
MYSQL_PASSWORD=VOTRE_MOT_DE_PASSE
MYSQL_DATABASE=whabiz
MYSQL_TABLE=whabiz_store
MYSQL_SOURCE_OF_TRUTH=1
MYSQL_JSON_MIRROR_WRITES=0
```

Option URL unique:

```env
MYSQL_URL=mysql://root:password@127.0.0.1:3306/whabiz
```

## 2) Migrer vos JSON vers MySQL

Depuis la racine du projet:

```bash
npm run db:migrate
```

ou:

```bash
npm --prefix backend run mysql:migrate
```

## 3) Appliquer les migrations SQL versionnees

```bash
npm --prefix backend run mysql:migrations
```

## 4) Lancer le serveur

```bash
npm --prefix backend start
```

## 5) Verifier que MySQL est actif

Ouvrez:

- `http://localhost:3000/api/storage/status`
- `http://localhost:3000/api/health`
- `http://localhost:3000/api/health/ready`
- `http://localhost:3000/api/health/details`

Vous devez voir:

- `mode: "mysql"`
- `mysqlReady: true`
- `schema: "multi_table"`
- `mysqlSourceOfTruth: true`
- `mysqlJsonMirrorWrites: false`

## 6) Verifier les tables creees

Dans MySQL Workbench:

```sql
USE whabiz;
SHOW TABLES LIKE 'rel_%';
```

Tables attendues:

- `rel_products`
- `rel_vendeurs`
- `rel_orders`
- `rel_payments`
- `rel_reviews`
- `rel_analytics_events`
- `rel_experiment_events`
- `rel_audit_logs`
- `rel_automations`
- `rel_recovery`
- `rel_product_images`
- `rel_product_variants`
- `rel_order_items`
- `schema_migrations`
- `app_runtime_settings`

## 7) Verifier contraintes et index metier

```sql
USE whabiz;

SELECT table_name, constraint_name
FROM information_schema.referential_constraints
WHERE constraint_schema = 'whabiz'
  AND table_name LIKE 'rel_%'
ORDER BY table_name, constraint_name;

SELECT table_name, index_name, non_unique
FROM information_schema.statistics
WHERE table_schema = 'whabiz'
  AND table_name LIKE 'rel_%'
  AND index_name NOT IN ('PRIMARY')
ORDER BY table_name, index_name;
```

Attendu:

- FK presentes entre `rel_vendeurs` <-> `rel_products`/`rel_orders`/`rel_payments`/`rel_reviews`/`rel_recovery`/`rel_analytics_events`/`rel_automations`.
- FK presentes entre `rel_orders` <-> `rel_payments`/`rel_order_items` et `rel_products` <-> `rel_product_images`/`rel_product_variants`/`rel_order_items`.
- Index `UNIQUE` metier actifs (vendeur/slug/tel/email, IDs metier, references paiement, etc.).
- Index composites actifs pour dashboard/reporting (commandes, paiements, analytics, recovery, automations).

## 8) Backups automatiques + restauration testee

```bash
npm run db:backup
npm run db:restore:last
npm run db:restore:test
```

Commandes backend directes:

```bash
npm --prefix backend run db:backup
npm --prefix backend run db:restore:last
npm --prefix backend run db:restore:test
```

- `db:backup`: cree un bundle compresse (`backend/backups/mysql/*.json.gz`).
- `db:restore:last`: restaure le dernier backup dans la base courante.
- `db:restore:test`: restaure le dernier backup dans une base temporaire et verifie les comptages.
- Le serveur lance aussi un backup MySQL auto si `MYSQL_BACKUP_AUTO=1`.

## 9) Export snapshot JSON depuis MySQL (backup complementaire)

```bash
npm --prefix backend run mysql:snapshot
```

## Notes

- Au demarrage, si une table est vide, le serveur la seed depuis `backend/data/*.json`.
- Si la table legacy `whabiz_store` existe, elle peut etre utilisee comme source de migration initiale.
- En mode `MYSQL_SOURCE_OF_TRUTH=1`, les ecritures passent par MySQL et les JSON ne sont plus la source de verite.
- `MYSQL_JSON_MIRROR_WRITES=1` permet de regenerer aussi les JSON si tu veux garder un miroir local.
- Les modules critiques `orders` et `payments` sont executes en SQL direct (lecture/ecriture transactionnelle), sans dependre du cache memoire comme source primaire.
