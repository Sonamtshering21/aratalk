// Client-safe comment types and page sizes (no server imports).

export const COMMENTS_PAGE_SIZE = 20;
export const REPLIES_PREVIEW = 3;
export const REPLIES_PAGE_SIZE = 20;

/** A comment or reply as sent to the browser. Dates are ISO strings (JSON-safe). */
export type CommentItem = {
  id: string;
  body: string;
  nickname: string;
  likeCount: number;
  createdAt: string;
  likedByMe: boolean;
};

/** A top-level comment with a preview of its replies. `comment` is null when hidden. */
export type ThreadItem = {
  id: string;
  /** When the top-level comment was posted (kept even when it is hidden). */
  createdAt: string;
  comment: CommentItem | null;
  /** The first few visible replies, oldest first. */
  replies: CommentItem[];
  /** Total visible replies. */
  replyCount: number;
  /** Cursor to load replies after the preview, or null if all are shown. */
  repliesCursor: string | null;
};

export type ThreadsPage = { threads: ThreadItem[]; nextCursor: string | null };
export type RepliesPage = { replies: CommentItem[]; nextCursor: string | null };
