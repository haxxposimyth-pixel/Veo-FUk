import db from '../db/connection';

export type ModelCooldown = { until: number; reason: 'rpm' | 'rpd' };

export type KeyState = {
  key: string;
  keyId: string;
  modelCooldowns: Record<string, ModelCooldown>;
  failures: number;
  lastUsed: number;
  status: 'active' | 'cooldown' | 'disabled';
  errorReason?: string;
};

export class GeminiKeyPool {
  private static instance: GeminiKeyPool;
  private keysState: KeyState[] = [];
  private lastSelectedIndex = -1;

  private constructor() {
    this.syncWithDatabase();
  }

  public static getInstance(): GeminiKeyPool {
    if (!GeminiKeyPool.instance) {
      GeminiKeyPool.instance = new GeminiKeyPool();
    }
    return GeminiKeyPool.instance;
  }

  public syncWithDatabase(): void {
    try {
      // 1. Fetch active keys from DB (safe column read fallback)
      const dbKeys = db.prepare(`
        SELECT id, key_value, COALESCE(status, 'active') as status, error_reason 
        FROM gemini_keys 
        WHERE is_active = 1
      `).all() as { id: string, key_value: string, status: string, error_reason: string | null }[];
      
      // 2. Fetch active quotas
      const dbQuotas = db.prepare('SELECT key_id, model_name, cooldown_until, reason FROM key_model_quota').all() as { key_id: string, model_name: string, cooldown_until: number, reason: 'rpm' | 'rpd' }[];
      
      const now = Date.now();
      const quotaMap = new Map<string, Record<string, ModelCooldown>>();
      
      for (const q of dbQuotas) {
        if (q.cooldown_until > now) {
          if (!quotaMap.has(q.key_id)) quotaMap.set(q.key_id, {});
          quotaMap.get(q.key_id)![q.model_name] = { until: q.cooldown_until, reason: q.reason };
        } else {
          // Cleanup expired quotas
          db.prepare('DELETE FROM key_model_quota WHERE key_id = ? AND model_name = ?').run(q.key_id, q.model_name);
        }
      }

      // Map current memory state for failures/lastUsed
      const stateMap = new Map<string, KeyState>();
      for (const state of this.keysState) {
        stateMap.set(state.key, state);
      }

      this.keysState = dbKeys.map(k => {
        const existing = stateMap.get(k.key_value);
        return {
          key: k.key_value,
          keyId: k.id,
          modelCooldowns: quotaMap.get(k.id) || {},
          failures: existing ? existing.failures : 0,
          lastUsed: existing ? existing.lastUsed : 0,
          status: (k.status || 'active') as 'active' | 'cooldown' | 'disabled',
          errorReason: k.error_reason || undefined
        };
      });
    } catch (e) {
      console.error('[GeminiKeyPool] Failed to sync with database:', e);
    }
  }

  /**
   * For backwards compatibility if router passes transient keys
   */
  public loadTransientKeys(keys: string[]): void {
    const cleanKeys = keys.map(k => k.trim()).filter(k => k.length > 0);
    const stateMap = new Map<string, KeyState>();
    for (const state of this.keysState) {
      stateMap.set(state.key, state);
    }
    this.keysState = cleanKeys.map(key => {
      const existing = stateMap.get(key);
      if (existing) return existing;
      return {
        key,
        keyId: 'transient_' + Math.random().toString(36).substr(2, 9),
        modelCooldowns: {},
        failures: 0,
        lastUsed: 0,
        status: 'active'
      };
    });
  }

  public getKeyIndex(key: string): number {
    return this.keysState.findIndex(state => state.key === key);
  }

  public getActiveKeyForModel(modelName: string): { key: string; index: number } | null {
    const now = Date.now();
    const len = this.keysState.length;
    if (len === 0) return null;

    // We scan all keys, starting from lastSelectedIndex + 1
    for (let i = 0; i < len; i++) {
      const idx = (this.lastSelectedIndex + 1 + i) % len;
      const state = this.keysState[idx];
      
      if (state.status === 'disabled') {
        continue;
      }
      
      const cooldown = state.modelCooldowns[modelName];
      const isCooling = cooldown && cooldown.until > now;

      if (!isCooling) {
        this.lastSelectedIndex = idx;
        state.lastUsed = now;
        return { key: state.key, index: idx };
      }
    }
    return null;
  }

  public reportSuccess(key: string, modelName: string): void {
    const state = this.keysState.find(s => s.key === key);
    if (state) {
      state.failures = 0;
      if (state.modelCooldowns[modelName]) {
        delete state.modelCooldowns[modelName];
        try {
          db.prepare('DELETE FROM key_model_quota WHERE key_id = ? AND model_name = ?').run(state.keyId, modelName);
        } catch (e) {}
      }
    }
  }

  public reportQuotaError(key: string, modelName: string, error: any): void {
    const state = this.keysState.find(s => s.key === key);
    if (!state) return;

    state.failures += 1;
    const now = Date.now();

    let retryAfterSeconds: number | null = null;
    try {
      if (error && typeof error === 'object') {
        const errStr = JSON.stringify(error);
        const delayMatch = errStr.match(/"retryDelay"\s*:\s*"([0-9.]+)s"/);
        if (delayMatch && delayMatch[1]) {
          retryAfterSeconds = parseFloat(delayMatch[1]);
        }
        if (error.headers && typeof error.headers.get === 'function') {
          const retryHeader = error.headers.get('retry-after');
          if (retryHeader) {
            const sec = parseInt(retryHeader, 10);
            if (!isNaN(sec)) {
              retryAfterSeconds = sec;
            }
          }
        }
      }
    } catch (e) {}

    if (retryAfterSeconds !== null && retryAfterSeconds > 0) {
      this.setCooldown(state, modelName, now + (retryAfterSeconds * 1000), 'rpm');
      console.warn(`[GeminiKeyPool] Key index ${this.getKeyIndex(key)} on ${modelName} rate-limited. Retry-after header found: cooling down for ${retryAfterSeconds}s.`);
      return;
    }

    const errMessage = String(error?.message || error || '').toLowerCase();
    const isRpd = errMessage.includes('resource_exhausted') || errMessage.includes('daily limit') || errMessage.includes('daily quota');

    if (isRpd) {
      // Midnight Pacific Time
      const midnightStr = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/Los_Angeles',
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
      }).format(new Date());
      
      const [datePart, timePart] = midnightStr.split(', ');
      const [month, day, year] = datePart.split('/');
      
      // Let's just compute via UTC offsets
      const nowObj = new Date();
      const formatter = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', hour: 'numeric', hour12: false, minute: 'numeric', second: 'numeric' });
      const parts = formatter.formatToParts(nowObj);
      const h = parseInt(parts.find(p => p.type === 'hour')?.value || '0', 10);
      const m = parseInt(parts.find(p => p.type === 'minute')?.value || '0', 10);
      const s = parseInt(parts.find(p => p.type === 'second')?.value || '0', 10);
      
      const msUntilMidnight = (24 * 3600 * 1000) - ((h * 3600 + m * 60 + s) * 1000);
      const cooldownUntil = now + msUntilMidnight;
      
      this.setCooldown(state, modelName, cooldownUntil, 'rpd');
      const hoursLeft = Math.ceil(msUntilMidnight / 3600000);
      console.warn(`[GeminiKeyPool] Key index ${this.getKeyIndex(key)} on ${modelName} daily quota exhausted. Cooling down until LA midnight (~${hoursLeft} hours).`);
    } else {
      this.setCooldown(state, modelName, now + 60000, 'rpm');
      console.warn(`[GeminiKeyPool] Key index ${this.getKeyIndex(key)} on ${modelName} per-minute rate limit hit. Cooling down for 60s.`);
    }
  }

  private setCooldown(state: KeyState, modelName: string, until: number, reason: 'rpm' | 'rpd') {
    state.modelCooldowns[modelName] = { until, reason };
    if (!state.keyId.startsWith('transient_')) {
      try {
        db.prepare(`
          INSERT INTO key_model_quota (key_id, model_name, cooldown_until, reason, updated_at)
          VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(key_id, model_name) DO UPDATE SET
            cooldown_until = excluded.cooldown_until,
            reason = excluded.reason,
            updated_at = excluded.updated_at
        `).run(state.keyId, modelName, until, reason, Date.now());
      } catch (e) {
        console.error('[GeminiKeyPool] Failed to save quota state:', e);
      }
    }
  }

  public isQuotaError(err: any): boolean {
    if (!err) return false;
    const msg = String(err.message || err.status || err || '').toLowerCase();
    const status = err.status || err.statusCode;
    
    return (
      status === 429 ||
      status === 'RESOURCE_EXHAUSTED' ||
      msg.includes('429') ||
      msg.includes('resource_exhausted') ||
      msg.includes('quota') ||
      msg.includes('rate limit') ||
      msg.includes('exhausted')
    );
  }

  public isDeadKeyError(err: any): boolean {
    if (!err) return false;
    const msg = String(err.message || err.status || err || '').toLowerCase();
    const status = err.status || err.statusCode;
    
    return (
      status === 401 ||
      status === 403 ||
      msg.includes('401') ||
      msg.includes('403') ||
      msg.includes('api_key_invalid') ||
      msg.includes('account_state_invalid') ||
      msg.includes('permission_denied') ||
      msg.includes('service account is deleted or disabled') ||
      msg.includes('denied access') ||
      msg.includes('api key not valid') ||
      msg.includes('invalid api key') ||
      msg.includes('please pass a valid api key')
    );
  }

  public markKeyDead(key: string, reason: string): void {
    const state = this.keysState.find(s => s.key === key);
    if (!state) return;

    state.status = 'disabled';
    state.errorReason = reason;

    if (!state.keyId.startsWith('transient_')) {
      try {
        db.prepare('UPDATE gemini_keys SET status = ?, error_reason = ?, last_checked_at = ? WHERE id = ?')
          .run('disabled', reason, Date.now(), state.keyId);
      } catch (e) {
        console.error('[GeminiKeyPool] Failed to mark key dead in DB:', e);
      }
    }
    console.warn(`[GeminiKeyPool] Key index ${this.getKeyIndex(key)} permanently quarantined. Reason: ${reason}`);
  }

  public getStatuses(): any[] {
    const now = Date.now();
    return this.keysState.map((state, index) => {
      let masked = '...';
      if (state.key.length > 4) {
        masked = '...' + state.key.slice(-4);
      } else {
        masked = state.key;
      }
      
      let computedStatus: 'active' | 'cooldown' | 'disabled' = state.status;
      if (computedStatus !== 'disabled') {
        const hasActiveCooldown = Object.values(state.modelCooldowns).some(cd => cd.until > now);
        if (hasActiveCooldown) {
          computedStatus = 'cooldown';
        }
      }

      return {
        index,
        masked,
        keyId: state.keyId,
        modelCooldowns: state.modelCooldowns,
        status: computedStatus,
        errorReason: state.errorReason
      };
    });
  }
}

export const geminiKeyPool = GeminiKeyPool.getInstance();
