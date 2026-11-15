# Phone acceptance script — NEU205 ONE 0.3.0-native (G9/G10)

Preconditions: separate package `ai.neu205.one` (does not replace v6, v8 or the v0.x candidate).
Termux, Qwen and the old backends are not needed and must be left as they are.

One-time (≈2 min): install APK → open NEU205 → wait for "Tap to start" (first launch copies the
offline model, ~250 MB) → if prompted, download an English offline voice in
Settings › Text-to-speech once.

Then, in **airplane mode with Wi-Fi and mobile data off**, phone on the table, speaker output:

| # | Action | Pass condition (record yes/no + stopwatch time) |
|---|---|---|
| 1 | Tap **Start** | Text changes immediately; "Listening" appears only after the mic indicator shows |
| 2 | "What is the carotid sheath?" | Spoken, correct, from the phone speaker |
| 3 | "What does it contain?" (no tap) | Contents of the carotid sheath |
| 4 | "Explain it simply" | Short plain explanation of the same thing |
| 5 | "Repeat that" | Same answer again |
| 6 | "What are its boundaries?" | Says the book doesn't list boundaries and offers attachments/contents/relations — **no invented boundaries** |
| 7 | "Relations" | Relations of the carotid sheath |
| 8 | "What are the boundaries of the posterior triangle?" | Correct boundaries |
| 9 | Speak while it is answering | It does not answer its own voice |
| 10 | Tap **Stop** mid-answer, then ask a question | Speech stops at once; mic indicator off; no reply |
| 11 | Start/Stop 10× quickly | No crash, no stuck mic, no late answer |
| 12 | Open ⚙ Diagnostics → Copy → paste to Claude | Metadata only (timings, voice, model) |

Latency to record with a stopwatch or a second phone recording: end of your question → first
audible word (5 cold + 10 warm turns). The app's own numbers are software timestamps, not
acoustic proof. No recording of your voice is needed for this report.
