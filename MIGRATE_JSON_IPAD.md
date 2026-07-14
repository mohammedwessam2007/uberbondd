# Move Existing Data to PostgreSQL on iPad

This is prepared but should be performed only during final deployment.

The migration process has two stages:

1. Preview: validates the old JSON data and reports what would be written.
2. Import: writes everything in one database transaction.

It is safe to repeat. Duplicate records are updated or skipped rather than multiplied.

You will not type commands yourself. The deployment workflow will run the preview and import automatically, then show a pass or stop result.
