# Demo Electron (Reference Harness)

This app is a reference and regression harness for Dyno SDK and local runtime behavior.

- It is useful for sandbox testing and validation.
- It is not a production SKU and should not drive product architecture.
- Primary product integration remains SDK-first (`@dyno/sdk-ts`) with local-first execution plus cloud fallback.
- Runtime startup is Dyno-managed in this harness: launching the Electron app calls `Dyno.init(...)`, which resolves and starts the local runtime helper internally.
- Legacy/manual local runtime startup (`npm run dev:agent`) remains available as a compatibility/debug lane.
