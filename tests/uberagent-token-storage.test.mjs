import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

for (const file of ["scripts/uberagent-legacy.ps1", "scripts/uberagent-autonomy-v2.ps1"]) {
  test(file + " migrates plaintext node token into DPAPI-protected storage", () => {
    const source = fs.readFileSync(new URL("../" + file, import.meta.url), "utf8");
    assert.match(source, /uberworm-token\.dpapi/);
    assert.match(source, /LegacyTokenFile = Join-Path \$InstallRoot "node\.token"/);
    assert.match(source, /ProtectedData\]::Protect/);
    assert.match(source, /ProtectedData\]::Unprotect/);
    assert.match(source, /DataProtectionScope\]::CurrentUser/);
    assert.match(source, /node-token-migration-verification-failed/);
    assert.match(source, /Remove-Item -Force -Path \$LegacyTokenFile/);
    assert.doesNotMatch(source, /return \(Get-Content -Raw -Path \$TokenFile\)\.Trim\(\)/);
  });
}
