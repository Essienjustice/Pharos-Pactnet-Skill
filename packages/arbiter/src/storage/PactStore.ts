import type { ArbiterVerdict } from "@pactnet/shared";
import Database from "better-sqlite3";

type VerdictRow = {
  pact_id: string;
  fulfilled: number;
  confidence: number;
  reasoning: string;
  evidence_summary: string;
  signature: string;
  timestamp: number;
  arbiter_mode?: string | null;
};

export class PactStore {
  private static readonly sharedMemoryVerdicts = new Map<string, ArbiterVerdict>();
  private static readonly sharedMemoryAuditLog: Array<{
    pactId: string;
    eventType: string;
    payload: unknown;
    createdAt: number;
  }> = [];

  private readonly db: Database.Database | null;

  constructor(dbPath: string) {
    let db: Database.Database | null = null;

    try {
      db = new Database(dbPath);
      db.exec(`
        CREATE TABLE IF NOT EXISTS verdicts (
          pact_id TEXT PRIMARY KEY,
          fulfilled INTEGER,
          confidence INTEGER,
          reasoning TEXT,
          evidence_summary TEXT,
          signature TEXT,
          timestamp INTEGER,
          arbiter_mode TEXT
        );

        CREATE TABLE IF NOT EXISTS audit_log (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          pact_id TEXT,
          event_type TEXT,
          payload TEXT,
          created_at INTEGER DEFAULT (unixepoch())
        );
      `);
      const columns = db.pragma("table_info(verdicts)") as Array<{ name: string }>;
      if (!columns.some((column) => column.name === "arbiter_mode")) {
        db.exec("ALTER TABLE verdicts ADD COLUMN arbiter_mode TEXT");
      }
    } catch (error) {
      console.warn(
        `PactStore falling back to in-memory storage because SQLite could not initialize at ${dbPath}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }

    this.db = db;
  }

  saveVerdict(verdict: ArbiterVerdict): void {
    try {
      if (!this.db) {
        PactStore.sharedMemoryVerdicts.set(verdict.pactId, verdict);
        return;
      }

      this.db
        .prepare(
          `INSERT INTO verdicts (
            pact_id,
            fulfilled,
            confidence,
            reasoning,
            evidence_summary,
            signature,
            timestamp,
            arbiter_mode
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(pact_id) DO UPDATE SET
            fulfilled = excluded.fulfilled,
            confidence = excluded.confidence,
            reasoning = excluded.reasoning,
            evidence_summary = excluded.evidence_summary,
            signature = excluded.signature,
            timestamp = excluded.timestamp,
            arbiter_mode = excluded.arbiter_mode`
        )
        .run(
          verdict.pactId,
          verdict.fulfilled ? 1 : 0,
          verdict.confidence,
          verdict.reasoning,
          verdict.evidenceSummary,
          verdict.signature,
          verdict.timestamp,
          verdict.arbiterMode ?? null
        );
    } catch (error) {
      throw new Error(`Failed to save verdict for pact ${verdict.pactId}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  getVerdict(pactId: string): ArbiterVerdict | null {
    try {
      if (!this.db) {
        return PactStore.sharedMemoryVerdicts.get(pactId) ?? null;
      }

      const row = this.db.prepare("SELECT * FROM verdicts WHERE pact_id = ?").get(pactId) as VerdictRow | undefined;

      if (!row) {
        return null;
      }

      return {
        pactId: row.pact_id,
        fulfilled: row.fulfilled === 1,
        confidence: row.confidence,
        reasoning: row.reasoning,
        evidenceSummary: row.evidence_summary,
        signature: row.signature,
        timestamp: row.timestamp,
        ...(row.arbiter_mode ? { arbiterMode: row.arbiter_mode } : {})
      };
    } catch (error) {
      throw new Error(`Failed to load verdict for pact ${pactId}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  log(pactId: string, eventType: string, payload: unknown): void {
    try {
      if (!this.db) {
        PactStore.sharedMemoryAuditLog.push({
          pactId,
          eventType,
          payload,
          createdAt: Math.floor(Date.now() / 1000)
        });
        return;
      }

      this.db
        .prepare("INSERT INTO audit_log (pact_id, event_type, payload) VALUES (?, ?, ?)")
        .run(pactId, eventType, JSON.stringify(payload));
    } catch (error) {
      throw new Error(`Failed to write audit log for pact ${pactId}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  getDbSizeBytes(): number {
    try {
      if (!this.db) {
        return 0;
      }

      const pageCount = this.db.pragma("page_count", { simple: true }) as number;
      const pageSize = this.db.pragma("page_size", { simple: true }) as number;
      return pageCount * pageSize;
    } catch (error) {
      throw new Error(`Failed to read database size: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
