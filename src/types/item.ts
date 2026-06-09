/**
 * Exam Item Types — domain model shared by handlers, storage, and validation.
 *
 * Server-owned fields (id, metadata.created, metadata.lastModified, metadata.version)
 * are set by storage on create/update — clients cannot supply them (enforced by Zod).
 */

export interface ExamItem {
  id: string;
  subject: string; // e.g., "AP Biology", "AP Calculus"
  itemType: string; // "multiple-choice", "free-response", "essay"
  difficulty: number; // 1-5
  content: {
    question: string;
    options?: string[]; // For multiple choice
    correctAnswer: string;
    explanation: string;
  };
  metadata: {
    author: string;
    created: number; // timestamp
    lastModified: number; // timestamp
    version: number;
    status: string; // "draft", "review", "approved", "archived"
    tags: string[];
  };
  securityLevel: string; // "standard", "secure", "highly-secure"
}

export interface CreateItemRequest {
  subject: string;
  itemType: string;
  difficulty: number;
  content: {
    question: string;
    options?: string[];
    correctAnswer: string;
    explanation: string;
  };
  metadata: {
    author: string;
    status: string;
    tags: string[];
  };
  securityLevel: string;
}

export interface UpdateItemRequest {
  subject?: string;
  itemType?: string;
  difficulty?: number;
  content?: Partial<ExamItem['content']>;
  metadata?: Partial<ExamItem['metadata']>;
  securityLevel?: string;
}

export interface ListItemsQuery {
  limit?: number;
  offset?: number;
  subject?: string;
  status?: string;
  /** Opaque pagination cursor (base64url-encoded). */
  cursor?: string;
}

/** List view — excludes content (answers never exposed in list responses). */
export type ExamItemSummary = Omit<ExamItem, 'content'>;

export interface ListItemsResult {
  items: ExamItemSummary[];
  count: number;
  nextCursor?: string;
}
