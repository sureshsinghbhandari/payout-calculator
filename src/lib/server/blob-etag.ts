import "server-only";

/**
 * The ETag to pass as `ifMatch` when rewriting a blob. Reads of compressed
 * (larger) files return a weak ETag (W/"…"), which never matches on write,
 * so the write would always fail with a precondition error.
 */
export function writableEtag(etag: string): string {
  return etag.replace(/^W\//, "");
}
