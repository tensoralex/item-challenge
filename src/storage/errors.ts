/**
 * Storage-layer errors shared across backends (DynamoDB, in-memory reference).
 */

/** Thrown when an update's expected version does not match the stored version. */
export class OptimisticLockError extends Error {
  constructor(id: string) {
    super(`Optimistic lock conflict for item ${id}`);
    this.name = 'OptimisticLockError';
  }
}
