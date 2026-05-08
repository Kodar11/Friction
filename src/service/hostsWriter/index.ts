// Platform dispatcher for the hosts writer. v1 is Windows-only; on other
// platforms we still call the same atomic file logic (it works on POSIX too)
// but we don't ship Mac/Linux service wrappers yet (decision #24).

export { applyHosts, removeManagedRegion, HostsPermissionError } from './windows.js';
export type { ApplyArgs } from './windows.js';
