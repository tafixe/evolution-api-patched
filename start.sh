#!/bin/sh
echo "=== PATCH REPORT ==="
cat /tmp/patch-report.txt 2>/dev/null || echo "No patch report found"
echo "=== END PATCH REPORT ==="
# Run the original Evolution API start command
cd /evolution
exec npm run start:prod
