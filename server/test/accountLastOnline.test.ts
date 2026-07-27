import { describe, expect, it } from "vitest";
import {
  createSession,
  sessionAccount,
  SESSION_TOUCH_MS,
} from "../src/db";

class Statement {
  args: unknown[] = [];

  constructor(readonly sql: string, private readonly row: unknown = null) {}

  bind(...args: unknown[]) {
    this.args = args;
    return this;
  }

  async first<T>() {
    return this.row as T;
  }
}

function fakeDb(selectRow: unknown = null) {
  const batches: Statement[][] = [];
  const db = {
    prepare(sql: string) {
      return new Statement(sql, sql.startsWith("SELECT") ? selectRow : null);
    },
    async batch(statements: Statement[]) {
      batches.push(statements);
      return [];
    },
  };
  return { db: db as unknown as D1Database, batches };
}

describe("account last-online heartbeat", () => {
  it("records account activity when a session is created", async () => {
    const { db, batches } = fakeDb();

    await createSession(db, "account-1", 12_345, "Test Browser");

    expect(batches).toHaveLength(1);
    expect(batches[0]).toHaveLength(2);
    expect(batches[0][0].sql).toContain("INSERT INTO sessions");
    expect(batches[0][1].sql).toContain("UPDATE accounts SET last_online_at");
    expect(batches[0][1].args).toEqual([12_345, "account-1"]);
  });

  it("updates the account alongside a stale session heartbeat", async () => {
    const lastUsedAt = 10_000;
    const now = lastUsedAt + SESSION_TOUCH_MS + 1;
    const { db, batches } = fakeDb({
      account_id: "account-1",
      last_used_at: lastUsedAt,
    });

    await expect(sessionAccount(db, "session-1", now)).resolves.toBe("account-1");

    expect(batches).toHaveLength(1);
    expect(batches[0].map((statement) => statement.sql)).toEqual([
      expect.stringContaining("UPDATE sessions SET last_used_at"),
      expect.stringContaining("UPDATE accounts SET last_online_at"),
    ]);
    expect(batches[0][1].args).toEqual([now, "account-1"]);
  });

  it("keeps the existing write throttle for recent activity", async () => {
    const now = 20_000;
    const { db, batches } = fakeDb({
      account_id: "account-1",
      last_used_at: now,
    });

    await expect(sessionAccount(db, "session-1", now)).resolves.toBe("account-1");
    expect(batches).toHaveLength(0);
  });
});
