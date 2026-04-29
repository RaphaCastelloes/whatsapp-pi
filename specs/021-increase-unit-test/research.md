# Research: Audio Service Test Coverage

## 1) Mocking external transcription and file I/O

- **Decision**: Mock `downloadContentFromMessage`, `exec`, `writeFile`, `mkdir`, `existsSync`, `readFile`, and filesystem paths in unit tests.
- **Rationale**: Audio transcription depends on network-like message content, disk writes, and a local transcription tool. Mocking keeps tests fast, repeatable, and independent from machine setup.
- **Alternatives considered**:
  - Run real transcription end-to-end. Rejected because it is slow, flaky, and environment-dependent.
  - Add integration tests only. Rejected because unit coverage is the main need and integration tests would not isolate the service logic well.

## 2) Coverage focus areas

- **Decision**: Cover successful transcription, missing transcription output, and error paths for download or processing failures.
- **Rationale**: These are the highest-risk branches in the service and give the biggest coverage gain with minimal test count.
- **Alternatives considered**:
  - Add only happy-path tests. Rejected because branch coverage would still miss fallback and error logic.
  - Add many narrow tests for every internal line. Rejected because it overfits implementation details.

## 3) Service behavior expectations

- **Decision**: Treat returned text as trimmed output; treat failures as formatted error strings; preserve current fallback behavior when no output file exists.
- **Rationale**: Matches the current service contract and lets tests lock in expected user-visible results.
- **Alternatives considered**:
  - Change production behavior to throw on failure. Rejected because the service currently handles errors internally.
  - Change the fallback text. Rejected because that would alter existing behavior without user request.

## 4) Test style

- **Decision**: Use focused unit tests with isolated setup per scenario and explicit assertions on return values and side effects.
- **Rationale**: This keeps tests readable and makes coverage growth easy to maintain.
- **Alternatives considered**:
  - Shared heavy fixtures for all cases. Rejected because they hide branch-specific behavior.
