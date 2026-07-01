## 1. Leading-edge Detection
- [ ] 1.1 Detect the first write event before awaitWriteFinish settles
- [ ] 1.2 Debounce and resolve the owning change id
- [ ] 1.3 Keep echo suppression so server writes never signal

## 2. Broadcast
- [ ] 2.1 Add the `file-writing` WebSocket event with change id
- [ ] 2.2 Clear the signal on the settled change-updated broadcast
- [ ] 2.3 Add a safety timeout to clear an abandoned write

## 3. UI
- [ ] 3.1 Track writing state per change in the store
- [ ] 3.2 Show a "Writing…" badge on the change card and detail header
