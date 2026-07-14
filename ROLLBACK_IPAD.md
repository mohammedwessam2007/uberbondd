# Rollback Plan on iPad

If a production migration fails:

1. Do not switch traffic to the new deployment.
2. Keep the previous approved ZIP and its data unchanged.
3. Use the hosting dashboard's Rollback or Redeploy Previous Version action.
4. Do not retry imports repeatedly until the failure report is reviewed.

The importer is transactional, so a failed run should leave PostgreSQL unchanged.
