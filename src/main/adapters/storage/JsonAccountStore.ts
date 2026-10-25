import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

export interface AccountRecord {
  id: string;
  uid: string;
  nickname: string;
  avatarUrl: string;
  partition: string;
  lastLoginAt: number;
  status: 'active' | 'expired';
}

interface AccountState {
  version: 1;
  activeId: string | null;
  accounts: AccountRecord[];
}

const EMPTY_STATE = (): AccountState => ({ version: 1, activeId: null, accounts: [] });

export class JsonAccountStore {
  private state: AccountState = EMPTY_STATE();
  private loading: Promise<void> | null = null;
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(private readonly filePath: string) {}

  async list(): Promise<AccountRecord[]> {
    await this.ensureLoaded();
    return [...this.state.accounts];
  }

  async get(accountId: string): Promise<AccountRecord | undefined> {
    await this.ensureLoaded();
    return this.state.accounts.find((account) => account.id === accountId);
  }

  async getActive(): Promise<AccountRecord | undefined> {
    await this.ensureLoaded();
    if (!this.state.activeId) return undefined;
    return this.state.accounts.find((account) => account.id === this.state.activeId);
  }

  async getActiveId(): Promise<string | null> {
    await this.ensureLoaded();
    return this.state.activeId;
  }

  async setActive(accountId: string | null): Promise<void> {
    await this.ensureLoaded();
    this.state.activeId = accountId;
    await this.persist();
  }

  async upsert(account: AccountRecord): Promise<void> {
    await this.ensureLoaded();
    const index = this.state.accounts.findIndex((item) => item.id === account.id);
    if (index >= 0) this.state.accounts[index] = account;
    else this.state.accounts.push(account);
    await this.persist();
  }

  async remove(accountId: string): Promise<void> {
    await this.ensureLoaded();
    this.state.accounts = this.state.accounts.filter((account) => account.id !== accountId);
    if (this.state.activeId === accountId) {
      this.state.activeId = this.state.accounts[0]?.id ?? null;
    }
    await this.persist();
  }

  async updateStatus(accountId: string, status: AccountRecord['status']): Promise<void> {
    await this.ensureLoaded();
    const account = this.state.accounts.find((item) => item.id === accountId);
    if (!account) return;
    account.status = status;
    await this.persist();
  }

  private ensureLoaded(): Promise<void> {
    this.loading ??= this.load();
    return this.loading;
  }

  private async load(): Promise<void> {
    try {
      const raw = await readFile(this.filePath, 'utf8');
      const parsed = JSON.parse(raw) as Partial<AccountState>;
      if (Array.isArray(parsed.accounts)) {
        this.state = {
          version: 1,
          activeId: typeof parsed.activeId === 'string' ? parsed.activeId : null,
          accounts: parsed.accounts.filter(isAccountRecord),
        };
      }
    } catch {
      this.state = EMPTY_STATE();
    }
  }

  private persist(): Promise<void> {
    const snapshot = JSON.stringify(this.state, null, 2);
    const write = this.writeQueue.then(async () => {
      await mkdir(dirname(this.filePath), { recursive: true });
      const tempPath = `${this.filePath}.tmp`;
      await writeFile(tempPath, snapshot, 'utf8');
      await rename(tempPath, this.filePath);
    });
    // Report this write's failure to its caller without blocking later saves.
    this.writeQueue = write.catch(() => undefined);
    return write;
  }
}

function isAccountRecord(value: unknown): value is AccountRecord {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.id === 'string' &&
    typeof record.uid === 'string' &&
    typeof record.nickname === 'string' &&
    typeof record.avatarUrl === 'string' &&
    typeof record.partition === 'string' &&
    typeof record.lastLoginAt === 'number' &&
    (record.status === 'active' || record.status === 'expired')
  );
}
