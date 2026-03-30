/**
 * Mutable shared state accumulated across ordered e2e test files.
 * Requires `--runInBand` + the custom e2e-environment.js so all
 * files share the same state object via the environment bridge.
 */

export interface E2EState {
  accessToken: string;
  userId: string;
  apiKeyId: string;
  apiKeyRaw: string;
  agentId: string;
  uploadedFileIds: string[];
  /** ID of a message created via agent API (for GET/DELETE tests) */
  agentMessageId: string;
  /** ID of a review message (for wait/respond tests) */
  reviewMessageId: string;
  /** ID of a log entry (for GET /:id test) */
  logId: string;
}

const bridge = (globalThis as unknown as { __e2e__: { state: E2EState } })
  .__e2e__;
export const state: E2EState = bridge.state;

// Test credentials (must match .env INITIAL_USER_EMAIL / INITIAL_USER_PASSWORD)
export const TEST_EMAIL =
  process.env.INITIAL_USER_EMAIL ?? 'admin@placet.local';
export const TEST_PASSWORD = process.env.INITIAL_USER_PASSWORD ?? 'changeme';

// Test files for upload/download tests
export const TEST_FILES = [
  { name: 'jpeg_example.jpg', mime: 'image/jpeg' },
  { name: 'png_example.png', mime: 'image/png' },
  { name: 'pdf_example.pdf', mime: 'application/pdf' },
  { name: 'mov_example.mov', mime: 'video/quicktime' },
  {
    name: 'pptx_example.pptx',
    mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  },
  {
    name: 'docx_example.docx',
    mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  },
  { name: 'csv_example.csv', mime: 'text/csv' },
  { name: 'ts_example.ts', mime: 'video/mp2t' },
  { name: 'html_example.html', mime: 'text/html' },
];
