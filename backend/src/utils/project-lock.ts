import logger from './logger';

export interface LockInfo {
  projectId: string;
  activePhase: number | 'all' | 'repair' | 'single';
  agentName: string; // The SSE agent or stream key identifying the lock owner
  timer: NodeJS.Timeout;
}

class ProjectLockManagerClass {
  private locks = new Map<string, LockInfo[]>();
  private projectMutexes = new Map<string, Promise<any>>();

  /**
   * Attempts to acquire a lock for a project.
   * Returns true if successful, false if a lock already exists.
   */
  acquireLock(
    projectId: string,
    activePhase: number | 'all' | 'repair' | 'single',
    agentName: string
  ): boolean {
    const existingLocks = this.locks.get(projectId) || [];

    // Check conflict:
    // 1. 'all' or 'repair' locks conflict with any lock.
    // 2. Specific phase number locks conflict with 'all', 'repair', or same phase number.
    // 3. 'single' locks conflict with 'all', 'repair', or 'single'.
    const hasConflict = existingLocks.some((existing) => {
      if (activePhase === 'all' || activePhase === 'repair') {
        return true;
      }
      if (existing.activePhase === 'all' || existing.activePhase === 'repair') {
        return true;
      }
      if (typeof activePhase === 'number' && typeof existing.activePhase === 'number') {
        return activePhase === existing.activePhase;
      }
      if (activePhase === 'single' || existing.activePhase === 'single') {
        return true;
      }
      return false;
    });

    if (hasConflict) {
      logger.warn(`[ProjectLockManager] Lock acquisition failed for project ${projectId}, phase ${activePhase}. Locked by: ${existingLocks.map(l => `${l.activePhase} (${l.agentName})`).join(', ')}`);
      return false;
    }

    // Set a safety timeout of 10 minutes (600,000 ms) to auto-release the lock
    const timer = setTimeout(() => {
      logger.warn(`[ProjectLockManager] Safety timeout reached for project ${projectId}, phase ${activePhase}. Releasing lock automatically.`);
      this.releaseLockForAgent(projectId, agentName);
    }, 10 * 60 * 1000);

    const newLock: LockInfo = {
      projectId,
      activePhase,
      agentName,
      timer,
    };

    this.locks.set(projectId, [...existingLocks, newLock]);

    logger.info(`[ProjectLockManager] Lock acquired for project ${projectId} (Phase/Type: ${activePhase}, Agent: ${agentName})`);
    return true;
  }

  /**
   * Releases all locks for a project.
   */
  releaseLock(projectId: string): void {
    const existing = this.locks.get(projectId);
    if (existing) {
      existing.forEach((lock) => clearTimeout(lock.timer));
      this.locks.delete(projectId);
      logger.info(`[ProjectLockManager] Lock released for all agents on project ${projectId}`);
    }
  }

  /**
   * Releases the lock for a project if the agent name matches.
   */
  releaseLockForAgent(projectId: string, agentName: string): void {
    const existing = this.locks.get(projectId);
    if (existing) {
      const lockToRelease = existing.find((l) => l.agentName === agentName);
      if (lockToRelease) {
        clearTimeout(lockToRelease.timer);
        const remaining = existing.filter((l) => l.agentName !== agentName);
        if (remaining.length > 0) {
          this.locks.set(projectId, remaining);
        } else {
          this.locks.delete(projectId);
        }
        logger.info(`[ProjectLockManager] Lock released for project ${projectId} (Agent: ${agentName})`);
      }
    }
  }

  /**
   * Returns the current lock info if exists.
   */
  getLock(projectId: string, phaseNum?: number | 'all' | 'repair' | 'single'): LockInfo | undefined {
    const existing = this.locks.get(projectId);
    if (!existing || existing.length === 0) return undefined;
    if (phaseNum !== undefined) {
      return existing.find((l) => {
        if (phaseNum === 'all' || phaseNum === 'repair') return true;
        if (l.activePhase === 'all' || l.activePhase === 'repair') return true;
        if (typeof phaseNum === 'number' && typeof l.activePhase === 'number') {
          return l.activePhase === phaseNum;
        }
        return false;
      });
    }
    return existing[0];
  }

  /**
   * Serializes operations per project using an in-memory queue.
   */
  async serializeProjectOp<T>(projectId: string, op: () => Promise<T> | T): Promise<T> {
    const existing = this.projectMutexes.get(projectId) || Promise.resolve();
    const nextOp = existing.then(async () => {
      return op();
    }).catch(async (err) => {
      logger.error(`[ProjectLockManager] Mutex operation failed for project ${projectId}:`, err);
      throw err;
    });

    const silentNext = nextOp.catch(() => {});
    this.projectMutexes.set(projectId, silentNext);

    return nextOp;
  }
}

export const ProjectLockManager = new ProjectLockManagerClass();
export default ProjectLockManager;
