#!/bin/sh
echo "=== PATCH REPORT ==="
cat /tmp/patch-report.txt 2>/dev/null || echo "No patch report found"
echo "=== END PATCH REPORT ==="

# Find and execute the original entrypoint or default command
cd /evolution
exec node --network-family-autoselection-attempt-timeout=1000 dist/main "$@"
