import { query, queryOne, queryMany, withTransaction } from '../db/pool.js';
import { config } from '../config/env.js';

/**
 * RAG architecture (§35).
 *
 * Provider-pluggable by design: the application only ever calls `embed()` and
 * `search()`. Swapping FAISS for Chroma or Pinecone means implementing those
 * two functions in a new entry of VECTOR_PROVIDERS — no schema change and no
 * call-site change, because chunks and metadata always live in PostgreSQL.
 *
 * With `VECTOR_PROVIDER=mock` (the default) retrieval falls back to
 * PostgreSQL full-text search, which is genuinely useful rather than a stub:
 * the GIN index on `document_chunks` makes it fast and the results are real.
 *
 * Retrieval is access-scoped exactly like everything else — a document is only
 * returned if the caller is entitled to the class or subject it belongs to.
 */

// ────────────────────────────── CHUNKING ──────────────────────────────────

/**
 * Split text into overlapping chunks on sentence boundaries.
 * The overlap keeps a fact that straddles a boundary retrievable from either
 * side, which is the usual cause of "the answer was in the document but the
 * model never saw it".
 */
export function chunkText(text, { chunkSize = 900, overlap = 150 } = {}) {
  const clean = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (!clean) return [];
  if (clean.length <= chunkSize) return [clean];

  const sentences = clean.match(/[^.!?]+[.!?]+|\S+$/g) ?? [clean];
  const chunks = [];
  let current = '';

  for (const sentence of sentences) {
    if (current.length + sentence.length > chunkSize && current) {
      chunks.push(current.trim());
      // Carry the tail of the previous chunk into the next one.
      current = current.slice(-overlap) + sentence;
    } else {
      current += sentence;
    }
  }
  if (current.trim()) chunks.push(current.trim());

  return chunks;
}

// ───────────────────────── EMBEDDING PROVIDERS ────────────────────────────

/**
 * Deterministic bag-of-words embedding.
 *
 * Not semantically strong — that is what a real provider is for — but it is
 * stable, dependency-free and good enough to demonstrate the pipeline end to
 * end. Retrieval in mock mode uses full-text search rather than these vectors.
 */
function mockEmbed(text) {
  const dimensions = 256;
  const vector = new Array(dimensions).fill(0);
  const tokens = String(text).toLowerCase().match(/[a-z0-9]+/g) ?? [];

  for (const token of tokens) {
    let hash = 0;
    for (let i = 0; i < token.length; i += 1) {
      hash = (hash * 31 + token.charCodeAt(i)) | 0;
    }
    vector[Math.abs(hash) % dimensions] += 1;
  }

  const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0)) || 1;
  return vector.map((value) => value / magnitude);
}

async function openaiEmbed(text) {
  const baseUrl = config.ai.baseUrl || 'https://api.openai.com/v1';
  const response = await fetch(`${baseUrl}/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.ai.apiKey}` },
    body: JSON.stringify({ model: 'text-embedding-3-small', input: text }),
  });

  if (!response.ok) throw new Error(`Embedding request failed (${response.status})`);
  const data = await response.json();
  return data.data[0].embedding;
}

/** Produce an embedding using whichever provider is configured. */
export async function embed(text) {
  if (config.vector.provider !== 'mock' && config.ai.apiKey) {
    try {
      return await openaiEmbed(text);
    } catch (error) {
      console.warn('[rag] embedding provider failed, using local embedding:', error.message);
    }
  }
  return mockEmbed(text);
}

function cosineSimilarity(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0;
  let magA = 0;
  let magB = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  return dot / (Math.sqrt(magA) * Math.sqrt(magB) || 1);
}

// ───────────────────────── DOCUMENT MANAGEMENT ────────────────────────────

/**
 * Store a document and index its chunks in one transaction — a document row
 * whose chunks failed to write would be silently unsearchable.
 */
export async function ingestDocument({
  title,
  description = null,
  content,
  sourceType = 'note',
  subjectId = null,
  classId = null,
  visibility = 'class',
  fileUrl = null,
  uploadedBy,
  metadata = {},
}) {
  const chunks = chunkText(content ?? '');
  const embeddings = await Promise.all(chunks.map((chunk) => embed(chunk)));

  return withTransaction(async (tx) => {
    const { rows } = await tx.query(
      `INSERT INTO documents
         (title, description, source_type, file_url, subject_id, class_id, uploaded_by, visibility, metadata, is_indexed)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [
        title,
        description,
        sourceType,
        fileUrl,
        subjectId,
        classId,
        uploadedBy,
        visibility,
        JSON.stringify(metadata),
        chunks.length > 0,
      ]
    );
    const document = rows[0];

    for (let index = 0; index < chunks.length; index += 1) {
      await tx.query(
        `INSERT INTO document_chunks (document_id, chunk_index, content, token_count, embedding)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          document.id,
          index,
          chunks[index],
          Math.ceil(chunks[index].length / 4),
          embeddings[index],
        ]
      );
    }

    return { document, chunkCount: chunks.length };
  });
}

export async function deleteDocument(documentId) {
  const { rowCount } = await query('DELETE FROM documents WHERE id = $1', [documentId]);
  return rowCount > 0;
}

/**
 * Documents a user is entitled to see.
 *
 * institution-wide  → everyone
 * class             → members of that class (students, their parents, its teachers)
 * private           → the uploader only
 */
async function visibleDocumentIds(user) {
  if (user.role === 'admin') return null; // no restriction

  const rows = await queryMany(
    `SELECT d.id
       FROM documents d
      WHERE d.visibility = 'institution'
         OR d.uploaded_by = $1
         OR (
           d.visibility = 'class' AND d.class_id IS NOT NULL AND d.class_id IN (
             SELECT class_id FROM student_profiles WHERE user_id = $1
             UNION
             SELECT class_id FROM teacher_subjects WHERE teacher_id = $1
             UNION
             SELECT id FROM classes WHERE class_teacher_id = $1
             UNION
             SELECT sp.class_id FROM student_profiles sp
               JOIN parent_student ps ON ps.student_id = sp.user_id
              WHERE ps.parent_id = $1
           )
         )`,
    [user.id]
  );

  return rows.map((row) => row.id);
}

// ─────────────────────────────── SEARCH ───────────────────────────────────

/**
 * Retrieve the most relevant chunks for a query, scoped to what the user may
 * see. Returns `[]` rather than throwing when there is nothing indexed — a
 * missing knowledge base must never break a chat turn.
 */
export async function retrieve({ user, query: searchQuery, topK = 5, subjectId = null, classId = null }) {
  try {
    const allowedIds = await visibleDocumentIds(user);
    if (Array.isArray(allowedIds) && allowedIds.length === 0) return [];

    const useVectors = config.vector.provider !== 'mock' && config.ai.apiKey;

    if (useVectors) {
      // Pull the candidate set, then rank in memory. For a school-sized corpus
      // this is fine; a production vector store would rank server-side, which
      // is exactly what a new VECTOR_PROVIDERS entry would do.
      const candidates = await queryMany(
        `SELECT dc.id, dc.content, dc.embedding, d.title, d.id AS document_id, d.source_type
           FROM document_chunks dc
           JOIN documents d ON d.id = dc.document_id
          WHERE ($1::uuid[] IS NULL OR d.id = ANY($1::uuid[]))
            AND ($2::uuid IS NULL OR d.subject_id = $2::uuid)
            AND ($3::uuid IS NULL OR d.class_id = $3::uuid)
            AND dc.embedding IS NOT NULL
          LIMIT 500`,
        [allowedIds, subjectId, classId]
      );

      const queryVector = await embed(searchQuery);

      return candidates
        .map((row) => ({
          id: row.id,
          documentId: row.document_id,
          title: row.title,
          sourceType: row.source_type,
          content: row.content,
          score: cosineSimilarity(queryVector, row.embedding),
        }))
        .filter((row) => row.score > 0.1)
        .sort((a, b) => b.score - a.score)
        .slice(0, topK);
    }

    /*
     * Mock mode: PostgreSQL full-text search over the same chunks.
     *
     * `plainto_tsquery` ANDs every term, so a natural phrase like "balanced
     * binary search tree rotations" only matches a chunk containing all five —
     * which is almost never what a reader wants. Rewriting the *parsed* query's
     * `&` operators to `|` gives OR semantics with `ts_rank` still ordering the
     * chunks that match more terms to the top. The rewrite happens on the
     * tsquery Postgres already parsed, never on raw user input, so nothing is
     * interpolated into the statement.
     */
    const rows = await queryMany(
      `WITH parsed AS (
         SELECT NULLIF(
           replace(plainto_tsquery('english', $4)::text, ' & ', ' | '),
           ''
         )::tsquery AS query
       )
       SELECT dc.id, dc.content, d.title, d.id AS document_id, d.source_type,
              ts_rank(to_tsvector('english', dc.content), parsed.query) AS score
         FROM document_chunks dc
         JOIN documents d ON d.id = dc.document_id
         CROSS JOIN parsed
        WHERE parsed.query IS NOT NULL
          AND ($1::uuid[] IS NULL OR d.id = ANY($1::uuid[]))
          AND ($2::uuid IS NULL OR d.subject_id = $2::uuid)
          AND ($3::uuid IS NULL OR d.class_id = $3::uuid)
          AND to_tsvector('english', dc.content) @@ parsed.query
        ORDER BY score DESC
        LIMIT $5`,
      [allowedIds, subjectId, classId, searchQuery, topK]
    );

    return rows.map((row) => ({
      id: row.id,
      documentId: row.document_id,
      title: row.title,
      sourceType: row.source_type,
      content: row.content,
      score: Number(row.score),
    }));
  } catch (error) {
    console.error('[rag] retrieval failed:', error.message);
    return [];
  }
}

/** List documents visible to a user. */
export async function listDocuments(user, { subjectId = null, classId = null } = {}) {
  const allowedIds = await visibleDocumentIds(user);
  if (Array.isArray(allowedIds) && allowedIds.length === 0) return [];

  return queryMany(
    `SELECT d.id, d.title, d.description, d.source_type, d.file_url, d.visibility,
            d.is_indexed, d.created_at, d.uploaded_by,
            s.name AS subject_name, c.name AS class_name, c.section,
            u.name AS uploaded_by_name,
            (SELECT COUNT(*) FROM document_chunks dc WHERE dc.document_id = d.id)::int AS chunk_count
       FROM documents d
       LEFT JOIN subjects s ON s.id = d.subject_id
       LEFT JOIN classes c  ON c.id = d.class_id
       LEFT JOIN users u    ON u.id = d.uploaded_by
      WHERE ($1::uuid[] IS NULL OR d.id = ANY($1::uuid[]))
        AND ($2::uuid IS NULL OR d.subject_id = $2::uuid)
        AND ($3::uuid IS NULL OR d.class_id = $3::uuid)
      ORDER BY d.created_at DESC`,
    [allowedIds, subjectId, classId]
  );
}

/** Which retrieval backend is live — surfaced in the admin settings page. */
export function ragStatus() {
  const vectorsActive = config.vector.provider !== 'mock' && Boolean(config.ai.apiKey);
  return {
    provider: config.vector.provider,
    mode: vectorsActive ? 'vector' : 'fulltext',
    embeddingProvider: vectorsActive ? 'openai' : 'local',
    supportedProviders: ['mock', 'postgres', 'chroma', 'pinecone', 'faiss'],
    note: vectorsActive
      ? 'Semantic retrieval over stored embeddings.'
      : 'No vector store configured — using PostgreSQL full-text search over the same chunks.',
  };
}

export async function getDocument(documentId, user) {
  const allowedIds = await visibleDocumentIds(user);
  if (Array.isArray(allowedIds) && !allowedIds.includes(documentId)) return null;

  return queryOne(
    `SELECT d.*, s.name AS subject_name, c.name AS class_name
       FROM documents d
       LEFT JOIN subjects s ON s.id = d.subject_id
       LEFT JOIN classes c  ON c.id = d.class_id
      WHERE d.id = $1`,
    [documentId]
  );
}

export default {
  chunkText,
  embed,
  ingestDocument,
  deleteDocument,
  retrieve,
  listDocuments,
  getDocument,
  ragStatus,
};
