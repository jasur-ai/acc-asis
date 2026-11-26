import crypto from 'crypto';
import { AnyInsightItem, ModuleId, UserPreferences } from '../../types/acas';
import { DEFAULT_ENABLED_MODULES } from '../../modules/registry';

export type DbProviderName = 'r2' | 'firebase' | 'supabase' | 'neon' | 'memory';

export interface DatabaseAdapter {
  provider: DbProviderName;
  getInsights(enabledModules: Record<ModuleId, boolean>): Promise<AnyInsightItem[]>;
  saveInsights(items: AnyInsightItem[]): Promise<void>;
  getUserPreferences(userId: string): Promise<UserPreferences>;
  saveUserPreferences(userId: string, prefs: UserPreferences): Promise<UserPreferences>;
}

/**
 * Lightweight AWS Signature V4 helper for Cloudflare R2 S3 API using built-in Node 'crypto'
 * (Zero heavy external SDK dependencies — keeps D: disk usage minimal!)
 */
function hmac(key: crypto.BinaryLike, data: string): Buffer {
  return crypto.createHmac('sha256', key).update(data, 'utf8').digest();
}

function sha256Hex(data: string): string {
  return crypto.createHash('sha256').update(data, 'utf8').digest('hex');
}

async function r2SignedFetch(
  method: 'GET' | 'PUT',
  keyPath: string,
  body = ''
): Promise<Response | null> {
  const accountId = process.env.CF_ACCOUNT_ID;
  const accessKeyId = process.env.CF_R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.CF_R2_SECRET_ACCESS_KEY;
  const bucket = process.env.CF_R2_BUCKET || 'acc-asis-db';

  if (!accountId || !accessKeyId || !secretAccessKey) return null;

  const host = `${accountId}.r2.cloudflarestorage.com`;
  const canonicalUri = `/${bucket}/${keyPath}`;
  const endpoint = `https://${host}${canonicalUri}`;

  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);
  const region = 'auto';
  const service = 's3';

  const payloadHash = sha256Hex(body);
  const canonicalHeaders =
    `host:${host}\n` + `x-amz-content-sha256:${payloadHash}\n` + `x-amz-date:${amzDate}\n`;
  const signedHeaders = 'host;x-amz-content-sha256;x-amz-date';

  const canonicalRequest = [
    method,
    canonicalUri,
    '',
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n');

  const algorithm = 'AWS4-HMAC-SHA256';
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = [
    algorithm,
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join('\n');

  const kDate = hmac(`AWS4${secretAccessKey}`, dateStamp);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, service);
  const kSigning = hmac(kService, 'aws4_request');
  const signature = crypto
    .createHmac('sha256', kSigning)
    .update(stringToSign, 'utf8')
    .digest('hex');

  const authHeader = `${algorithm} Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  try {
    return await fetch(endpoint, {
      method,
      headers: {
        Authorization: authHeader,
        'x-amz-content-sha256': payloadHash,
        'x-amz-date': amzDate,
        ...(method === 'PUT' ? { 'Content-Type': 'application/json' } : {}),
      },
      body: method === 'PUT' ? body : undefined,
    });
  } catch {
    return null;
  }
}

/**
 * Cloudflare R2 + In-Memory Hybrid Database Adapter.
 * Keeps hot data in memory for <1ms reads and asynchronously persists state to Cloudflare R2.
 */
class CloudflareR2DatabaseAdapter implements DatabaseAdapter {
  public provider: DbProviderName;
  private insights: AnyInsightItem[] = [];
  private preferences = new Map<string, UserPreferences>();
  private hydrated = false;

  constructor(providerLabel: DbProviderName = 'r2') {
    this.provider = providerLabel;
  }

  private async ensureHydrated() {
    if (this.hydrated || this.provider !== 'r2') return;
    this.hydrated = true;
    const res = await r2SignedFetch('GET', 'state/insights.json');
    if (res && res.ok) {
      try {
        const loaded = (await res.json()) as AnyInsightItem[];
        if (Array.isArray(loaded)) {
          this.insights = loaded;
        }
      } catch {
        // ignore parse error on empty object
      }
    }
  }

  async getInsights(enabledModules: Record<ModuleId, boolean>): Promise<AnyInsightItem[]> {
    await this.ensureHydrated();
    return this.insights.filter((item) => enabledModules[item.moduleId]);
  }

  async saveInsights(items: AnyInsightItem[]): Promise<void> {
    await this.ensureHydrated();
    const existingIds = new Set(this.insights.map((i) => i.id));
    for (const item of items) {
      if (!existingIds.has(item.id)) {
        this.insights.unshift(item);
      }
    }
    if (this.provider === 'r2') {
      await r2SignedFetch('PUT', 'state/insights.json', JSON.stringify(this.insights));
    }
  }

  async getUserPreferences(userId: string): Promise<UserPreferences> {
    return (
      this.preferences.get(userId) || {
        enabledModules: { ...DEFAULT_ENABLED_MODULES },
        defaultHorizon: 'all',
        customDaysMax: 120,
      }
    );
  }

  async saveUserPreferences(userId: string, prefs: UserPreferences): Promise<UserPreferences> {
    this.preferences.set(userId, prefs);
    if (this.provider === 'r2') {
      await r2SignedFetch('PUT', `users/${userId}.json`, JSON.stringify(prefs));
    }
    return prefs;
  }
}

export function createDatabaseAdapter(): DatabaseAdapter {
  if (process.env.CF_R2_ACCESS_KEY_ID && process.env.CF_R2_SECRET_ACCESS_KEY) {
    return new CloudflareR2DatabaseAdapter('r2');
  }
  return new CloudflareR2DatabaseAdapter('memory');
}

export const dbAdapter = createDatabaseAdapter();
