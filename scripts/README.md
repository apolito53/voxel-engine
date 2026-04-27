# Scripts

Small repo-local helpers. They are intentionally dependency-free Python scripts so the TypeScript migration can be planned before the JavaScript tree is renamed.

## TypeScript Migration Prep

Preview the mechanical migration:

```powershell
.\scripts\run_python.ps1 .\scripts\ts_migration.py plan
```

Audit the current source tree and suggested typing order:

```powershell
.\scripts\run_python.ps1 .\scripts\ts_migration_audit.py
```

When ready to do the actual migration:

```powershell
.\scripts\run_python.ps1 .\scripts\ts_migration.py apply
npm.cmd install
npm.cmd run typecheck
npm.cmd run build
```

If the mechanical pass needs to be undone before manual edits continue:

```powershell
.\scripts\run_python.ps1 .\scripts\ts_migration.py rollback --force
```

The migrator writes `.ts-migration-manifest.json` during `apply`; keep it until the migration is committed or intentionally rolled back.

On Linux/Ubuntu, use `./scripts/run_python.sh` in place of `.\scripts\run_python.ps1`.
