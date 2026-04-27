# Scripts

Small repo-local helpers. They are intentionally dependency-free Python scripts so the TypeScript migration can be planned before the JavaScript tree is renamed.

## TypeScript Migration Prep

Preview the mechanical migration:

```powershell
python .\scripts\ts_migration.py plan
```

Audit the current source tree and suggested typing order:

```powershell
python .\scripts\ts_migration_audit.py
```

When ready to do the actual migration:

```powershell
python .\scripts\ts_migration.py apply
npm.cmd install
npm.cmd run typecheck
npm.cmd run build
```

If the mechanical pass needs to be undone before manual edits continue:

```powershell
python .\scripts\ts_migration.py rollback --force
```

The migrator writes `.ts-migration-manifest.json` during `apply`; keep it until the migration is committed or intentionally rolled back.

After installing Python on Windows, reopen the terminal if `python` still resolves to the Microsoft Store alias. In the current Codex shell, the installed interpreter is `C:\Users\apoli\AppData\Local\Programs\Python\Python313\python.exe`.
