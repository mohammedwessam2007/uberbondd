# Tool-output evaporation policy

Large Bash, Grep and Glob results may be moved to `.claude/apex/tool-results/`.

The live context receives:

- tool name and command;
- success or failure;
- byte and line counts;
- SHA-256;
- first and last relevant lines;
- detected error/failure lines;
- exact evidence-file path;
- instruction to read a slice when more detail is required.

The original result remains recoverable. Edit and Write outputs are never evaporated. Small results remain unchanged.
