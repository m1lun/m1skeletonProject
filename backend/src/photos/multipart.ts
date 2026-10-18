export interface FilePart {
  field: string;
  mimeType: string;
  data: Buffer;
}

// Parses the file parts of a multipart/form-data body; parts without a filename are skipped.
export function parseMultipart(body: Buffer, contentType: string): FilePart[] | undefined {
  const boundary = /boundary=(?:"([^"]+)"|([^;\s]+))/i.exec(contentType);
  const marker = boundary?.[1] ?? boundary?.[2];
  if (marker === undefined) {
    return undefined;
  }

  const delimiter = Buffer.from(`--${marker}`);
  const parts: FilePart[] = [];
  let start = body.indexOf(delimiter);
  while (start !== -1) {
    const headerStart = start + delimiter.length;
    if (body.subarray(headerStart, headerStart + 2).toString() === '--') {
      break;
    }
    const next = body.indexOf(delimiter, headerStart);
    if (next === -1) {
      return undefined;
    }
    const part = body.subarray(headerStart + 2, next - 2);
    const split = part.indexOf('\r\n\r\n');
    if (split === -1) {
      return undefined;
    }
    const headers = String(part.subarray(0, split).toString('latin1'));
    const field = /name="([^"]*)"/i.exec(headers)?.[1];
    if (field !== undefined && /filename="/i.test(headers)) {
      const mimeType = /content-type:\s*([^\r\n;]+)/i.exec(headers)?.[1]?.trim().toLowerCase() ?? '';
      parts.push({ field, mimeType, data: part.subarray(split + 4) });
    }
    start = next;
  }
  return parts;
}
