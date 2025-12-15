## Prisma Migrations

To create the migration for the new `TokenLaunch` model locally, run:

```bash
npx prisma migrate dev --name add_token_launch
```

For environments where migrations are managed externally, push the schema without generating a migration:

```bash
npx prisma db push
```

#supabase password
I1FzXCxBauHp8nNr

> Note: migrations are not run automatically; execute the appropriate command manually.
