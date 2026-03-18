# Inbox

- none
- 2026-03-18: Refined expansion ready signal. I've implemented an `expansionReady` flag in `RoomMemory.growth`. It currently triggers expansion when we have a surplus base (RCL 5+), >50k storage energy, and low spawn pressure. You can now use this flag to explicitly block or favor expansion from the economy's perspective.
