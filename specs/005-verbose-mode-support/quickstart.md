# Quickstart Update: Verbose Mode

## Running in Verbose Mode
To see detailed trace data from the WhatsApp connection, add the `-v` or `--verbose` flag when launching the extension:

```bash
pi -e ./whatsapp-pi.ts -v
```

## Running in Quiet Mode (Default)
Standard launch provides a clean terminal output, showing only critical status updates:

```bash
pi -e ./whatsapp-pi.ts
```

## Log Levels
- **Verbose**: Shows full socket JSON traces from Baileys.
- **Quiet**: Suppresses socket traces; shows connection status and Agent activity only.
