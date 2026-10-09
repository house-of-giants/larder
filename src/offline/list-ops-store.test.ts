import { describe, expect, it } from "vitest";
import type { Id } from "../../convex/_generated/dataModel";
import { createListOps, type StoredQueue } from "./list-ops-store";
import type { QueuedOp } from "./queue";

const eggs = "1listItems" as Id<"listItems">;
const rolls = "2listItems" as Id<"listItems">;
const ALICE = "user_alice";
const BOB = "user_bob";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

const settled = () => new Promise((resolve) => setTimeout(resolve, 0));

/**
 * A store for `owner` over a fake shared slot. The first read waits for `finishRead`;
 * later reads (persistence checks) answer at once. `slot` is what the phone holds.
 */
function harness(initial: StoredQueue | undefined, owner: string | null = ALICE) {
  const firstRead = deferred<void>();
  let reads = 0;
  const box = { slot: initial };
  const writes: (StoredQueue | "deleted")[] = [];
  const sent: string[] = [];
  let sendGate: Promise<void> | null = null;
  const ops = createListOps({
    owner,
    storage: {
      get: async () => {
        if (reads++ === 0) await firstRead.promise;
        return box.slot;
      },
      set: async (value) => {
        box.slot = value;
        writes.push(value);
      },
      del: async () => {
        box.slot = undefined;
        writes.push("deleted");
      },
    },
    send: async (op) => {
      sent.push(`${op.listItemId}:${op.status}`);
      if (sendGate) await sendGate;
    },
  });
  return {
    ops,
    box,
    writes,
    sent,
    finishRead: () => firstRead.resolve(),
    holdSends: (gate: Promise<void>) => (sendGate = gate),
  };
}

const aliceQueue = (ops: QueuedOp[]): StoredQueue => ({ owner: ALICE, ops });

describe("createListOps startup", () => {
  it("sends nothing until the stored queue is read, then lets the newer tap win", async () => {
    const h = harness(aliceQueue([{ listItemId: eggs, status: "checked", at: 1 }]));
    h.ops.setCanSend(true);
    const load = h.ops.load();
    await h.ops.tap(eggs, "needed", 2);
    await settled();
    expect(h.sent).toEqual([]);
    expect(h.ops.getQueue()).toEqual([{ listItemId: eggs, status: "needed", at: 2 }]);

    h.finishRead();
    await load;
    await settled();
    expect(h.sent).toEqual(["1listItems:needed"]);
    expect(h.ops.getQueue()).toEqual([]);
  });

  it("replays stored taps for other items alongside startup taps", async () => {
    const h = harness(aliceQueue([{ listItemId: rolls, status: "checked", at: 1 }]));
    h.ops.setCanSend(true);
    const load = h.ops.load();
    await h.ops.tap(eggs, "checked", 2);
    h.finishRead();
    await load;
    await settled();
    expect(h.sent).toEqual(["2listItems:checked", "1listItems:checked"]);
  });

  it("does not overwrite the stored queue before reading it", async () => {
    const h = harness(aliceQueue([{ listItemId: rolls, status: "checked", at: 1 }]));
    const load = h.ops.load();
    await h.ops.tap(eggs, "checked", 2);
    expect(h.writes).toEqual([]);
    h.finishRead();
    await load;
    await settled();
    expect(h.box.slot).toEqual(
      aliceQueue([
        { listItemId: rolls, status: "checked", at: 1 },
        { listItemId: eggs, status: "checked", at: 2 },
      ]),
    );
  });
});

describe("createListOps after startup", () => {
  it("sends a tap straight away with a signal", async () => {
    const h = harness(undefined);
    h.ops.setCanSend(true);
    h.finishRead();
    await h.ops.load();
    await h.ops.tap(eggs, "checked", 3);
    expect(h.sent).toEqual(["1listItems:checked"]);
    expect(h.ops.getQueue()).toEqual([]);
  });

  it("queues taps with no signal and sends them when the signal returns", async () => {
    const h = harness(undefined);
    h.finishRead();
    await h.ops.load();
    await h.ops.tap(eggs, "checked", 3);
    await h.ops.tap(rolls, "checked", 4);
    expect(h.sent).toEqual([]);
    expect(h.ops.getQueue()).toHaveLength(2);
    h.ops.setCanSend(true);
    await settled();
    expect(h.sent).toEqual(["1listItems:checked", "2listItems:checked"]);
    expect(h.ops.getQueue()).toEqual([]);
  });
});

describe("createListOps dispose", () => {
  it("neither writes nor sends when disposed before the stored queue is read", async () => {
    const h = harness(aliceQueue([{ listItemId: rolls, status: "checked", at: 1 }]));
    h.ops.setCanSend(true);
    const load = h.ops.load();
    await h.ops.tap(eggs, "checked", 2);
    h.ops.dispose();
    h.finishRead();
    await load;
    await settled();
    expect(h.writes).toEqual([]);
    expect(h.sent).toEqual([]);
    expect(h.box.slot).toEqual(aliceQueue([{ listItemId: rolls, status: "checked", at: 1 }]));
  });

  it("does not persist a drain that finishes after dispose", async () => {
    const h = harness(undefined);
    h.finishRead();
    await h.ops.load();
    await h.ops.tap(eggs, "checked", 1);
    const writesBefore = h.writes.length;
    const gate = deferred<void>();
    h.holdSends(gate.promise);
    h.ops.setCanSend(true);
    await settled();
    expect(h.sent).toEqual(["1listItems:checked"]);
    h.ops.dispose();
    gate.resolve();
    await settled();
    expect(h.writes.length).toBe(writesBefore);
    expect(h.box.slot).toEqual(aliceQueue([{ listItemId: eggs, status: "checked", at: 1 }]));
  });
});

describe("createListOps ownership", () => {
  const bobQueue: StoredQueue = {
    owner: BOB,
    ops: [{ listItemId: eggs, status: "needed", at: 9 }],
  };

  it("never overwrites or deletes a queue another user owns", async () => {
    const h = harness(bobQueue, ALICE);
    h.finishRead();
    await h.ops.load();
    await h.ops.tap(rolls, "checked", 10);
    await settled();
    expect(h.box.slot).toEqual(bobQueue);
    expect(h.sent).toEqual([]);
  });

  it("does not replay another user's queued taps", async () => {
    const h = harness(bobQueue, ALICE);
    h.ops.setCanSend(true);
    h.finishRead();
    await h.ops.load();
    await settled();
    expect(h.sent).toEqual([]);
    expect(h.box.slot).toEqual(bobQueue);
  });

  it("does not take over a slot another user claimed after this store loaded", async () => {
    const h = harness(undefined, ALICE);
    h.finishRead();
    await h.ops.load();
    h.box.slot = bobQueue;
    await h.ops.tap(rolls, "checked", 10);
    await settled();
    expect(h.box.slot).toEqual(bobQueue);
  });
});
