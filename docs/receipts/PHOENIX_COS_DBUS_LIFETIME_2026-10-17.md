# Secure storage and DBus lifetime checkpoint

Owner completed new keyring creation. CoS reported unreadable old application keys. Used its Start fresh action; confirmation explicitly retained old encrypted file as backup. Banner cleared and folder/access settings reappeared. No verified stored API key or tunnel connection.

Platform Apple sign-in was securely completed. Created restricted seven-day Tunnels Read + Use credential `UberBond CoS keyring-reset runtime` tracking key_FXWvbVtbzpGOLRo6, but clipboard read returned empty and its one-time value was lost. Created same-scope replacement `UberBond CoS active tunnel`; its one-time value was retained only in private browser runtime, not printed or written to files. Transfer not verified. Existing earlier unused keys remain, expire Oct 17/23/24, and require reconciliation; do not claim revoked.

A restart inherited a DBus address whose bus exited with the original app, resulting in Electron insecure hard-coded-key fallback. CoS refused secure storage (no successful save). Corrected launch to keep the dbus-run-session shell alive after app exit:

```sh
DISPLAY=:1 nohup dbus-run-session -- sh -c 'gnome-keyring-daemon --start --components=secrets; /opt/cos-runtime/chat-on-steroids --no-sandbox --disable-gpu --password-store=gnome-libsecret; exec tail -f /dev/null' > /tmp/cos-secure-persistent.log 2>&1 &
```

Desktop now displays Unlock Keyring for the newly created Default Keyring. User must unlock with new password. Do not reset again. App restart within this persistent session should preserve bus availability, but must verify rather than assume. Setup text inputs were responsive after clean restart; generic browser typeText did not reliably deliver remote text. Remote clipboard workflow needs explicit blur and Ctrl latch verification. No Core execution/worker/Compact & Resume proof.
