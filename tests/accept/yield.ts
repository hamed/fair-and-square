/**
 * Between acceptance runs, a turn of the event loop: each run computes for seconds without yielding, and the
 * worker's messages to vitest are answered only when the loop turns. Without it, a slow machine passes vitest's
 * 60 s RPC timeout ("Timeout calling onTaskUpdate") though every assertion passes (recheck 2, 2026-10-19).
 */
import { afterEach, beforeEach } from 'vitest';

const turn = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
beforeEach(turn);
afterEach(turn);
