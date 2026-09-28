import axios from "axios";
import type { FeatureCollection } from "geojson";
import type { ImportDraft } from "@/components/Layers/UserLayers/ImportFileDialog";

/**
 * Everything that happens to an imported file after Upload: the request that
 * carries it to map-api, and what its row in My Layers says along the way.
 */

// The request

/** The form field map-api reads the features from. */
export const FEATURES_FIELD = "features";

/** Features written per step, between which the page gets to paint. */
const LINES_PER_CHUNK = 500;

/**
 * One feature per line. map-api reads the upload a line at a time, which is
 * what lets a layer larger than its memory be stored at all.
 *
 * A stream, so the uncompressed text is never held whole, and the page stays
 * responsive while a large layer is written out.
 */
export const toFeatureLines = (
  collection: FeatureCollection,
): ReadableStream<BufferSource> => {
  const { features } = collection;
  const encoder = new TextEncoder();
  let next = 0;

  return new ReadableStream<BufferSource>({
    async pull(controller) {
      if (next > 0) await new Promise((resolve) => setTimeout(resolve, 0));
      const end = Math.min(next + LINES_PER_CHUNK, features.length);
      let text = "";
      for (; next < end; next += 1)
        text += `${JSON.stringify(features[next])}\n`;
      if (text) controller.enqueue(encoder.encode(text));
      if (next >= features.length) controller.close();
    },
  });
};

/** GeoJSON is mostly repeated digits and keys, so this is usually a tenth the size. */
export const gzip = (lines: ReadableStream<BufferSource>): Promise<Blob> =>
  new Response(lines.pipeThrough(new CompressionStream("gzip"))).blob();

/** The multipart body of `PUT /users/me/imported-layers/<id>`. */
export const buildImportForm = (
  draft: ImportDraft,
  features: Blob,
): FormData => {
  const form = new FormData();
  form.append("name", draft.name);
  form.append("description", draft.description);
  form.append("is_sensitive", String(draft.sensitive));
  form.append("source_format", draft.parsed.format);
  form.append("source_filename", draft.file.name);
  if (draft.parsed.reprojectedFrom)
    form.append("source_crs", draft.parsed.reprojectedFrom);
  form.append(FEATURES_FIELD, features, "features.geojsonl.gz");
  return form;
};

// Progress and failure, as the row shows them

/**
 * Where an upload is, as its row in My Layers shows it.
 */
export type UploadStatus =
  | "preparing"
  | "uploading"
  | "stalled"
  | "processing"
  | "failed";

export interface UploadRow {
  /** The layer's id too, chosen here so a retry lands on the same layer. */
  id: string;
  fileName: string;
  layerName: string;
  status: UploadStatus;
  /** Bytes sent, and the size of the whole request. */
  loaded: number;
  total: number;
  error: string | null;
  /** Whether sending it again could go differently. */
  retryable: boolean;
}

export const CONNECTION_INTERRUPTED = "The connection was interrupted";

const MEGABYTE = 1024 * 1024;

export const formatUploadSize = (loaded: number, total: number): string =>
  `${(loaded / MEGABYTE).toFixed(1)} of ${(total / MEGABYTE).toFixed(1)} MB`;

/** Whole percent sent, held at 100 while map-api stores the layer. */
export const uploadPercent = ({ status, loaded, total }: UploadRow): number => {
  if (status === "processing") return 100;
  if (total <= 0) return 0;
  return Math.min(100, Math.floor((loaded / total) * 100));
};

const STATUS_LABELS: Record<UploadStatus, string> = {
  preparing: "Preparing…",
  uploading: "Uploading…",
  stalled: "Stalled - waiting for connection",
  processing: "Processing…",
  failed: "Failed",
};

export const uploadStatusLabel = (status: UploadStatus): string =>
  STATUS_LABELS[status];

type ErrorBody = { message?: unknown; errors?: Record<string, unknown> };

/** The first field message of a 400, which is the one the user can act on. */
const firstFieldError = (errors: ErrorBody["errors"]): string | null => {
  for (const messages of Object.values(errors ?? {})) {
    const first = Array.isArray(messages) ? messages[0] : messages;
    if (typeof first === "string") return first;
  }
  return null;
};

/**
 * What to tell the user about a failed upload, and whether Try Again is worth
 * offering. A refusal is map-api judging the file, which sending it again will
 * not change; a dropped connection or a fault on the server might.
 */
export const describeUploadFailure = (
  error: unknown,
): { message: string; retryable: boolean } => {
  if (!axios.isAxiosError(error))
    return {
      message: "This file could not be prepared for upload.",
      retryable: false,
    };

  const { response } = error;
  if (!response) return { message: CONNECTION_INTERRUPTED, retryable: true };

  if (response.status >= 500)
    return { message: "The layer could not be saved.", retryable: true };

  if (response.status === 401)
    return {
      message: "Your session has expired. Sign in again, then try again.",
      retryable: true,
    };
  if (response.status === 403)
    return {
      message: "You do not have permission to import layers.",
      retryable: false,
    };

  const body = (response.data ?? {}) as ErrorBody;
  const message =
    firstFieldError(body.errors) ??
    (typeof body.message === "string" && body.message !== "Invalid request"
      ? body.message
      : null);

  if (message) return { message, retryable: false };
  return {
    message:
      response.status === 413
        ? "This layer is too large to upload."
        : "The layer was refused.",
    retryable: false,
  };
};
