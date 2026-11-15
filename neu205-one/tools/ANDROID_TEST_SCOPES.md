Android CI intentionally has no private book or speech-model assets. It must not download or publish those fixtures.

The code-only suite discovers 43 tests: 37 execute with public synthetic fixtures, and 6 are explicitly skipped using JUnit assumptions when their private fixtures are absent. The four public signed-pack negative tests still execute and assert the intended failure message: wrong signer, unlisted ZIP member, traversal, and truncated archive. Synthetic corpus bytes cannot satisfy the production corpus trust pin; these cases must reach their specific rejection before corpus acceptance.

The six private-fixture cases are four signed-pack acceptance/rollback/installed-corruption/cancellation integration cases using the exact approved corpus, plus two native-ASR extraction preservation tests using the real token asset. An unavailable private fixture is reported as skipped, never represented as a passing integration test. Both ASR cases require their asset; otherwise a missing-file exception could create a vacuous success in the checksum rejection case.

Private validation with the approved assets executes all 43 tests with zero skips. Use `NEU205_ASSETS` to select the private assets directory when authorized. For a code-only reproduction, point it to an empty/nonexistent directory. Gradle dependency verification remains enabled for both runs.

These framework simulations and parser tests provide no evidence of physical-phone routing, recognition accuracy, speech quality, battery life, thermal performance, or actual Qwen answering. Instrumentation compilation also does not prove execution.
