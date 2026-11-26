'use client';

/**
 * Browser-side image pipeline for the admin "Upload New T-Shirt" flow.
 *
 * Uploading straight from the browser to Cloudinary with the server-signed
 * parameters removes the extra hop through the Go API, and shrinking the file
 * first keeps uploads to a couple of hundred kilobytes instead of multi-megabyte
 * phone photos. `XMLHttpRequest` is used because it is the only browser API that
 * reports real upload progress.
 */

export interface CloudinarySignature {
  configured: boolean;
  cloudName?: string;
  apiKey?: string;
  timestamp?: number;
  folder?: string;
  signature?: string;
}

export interface PreparedImage {
  blob: Blob;
  filename: string;
}

// Cloudinary already delivers optimised renditions, so 1600px is plenty for a
// product gallery and keeps the original detail without the huge payload.
const MAX_DIMENSION = 1600;
const WEBP_QUALITY = 0.86;
const SKIP_COMPRESSION_BYTES = 320 * 1024;

function withExtension(name: string, extension: string): string {
  const base = name.replace(/\.[^.]+$/, '').trim() || 'product-image';
  return `${base}.${extension}`;
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/webp', WEBP_QUALITY));
}

/** Resizes and re-encodes an image so the upload is small and quick. */
export async function prepareImageForUpload(file: File): Promise<PreparedImage> {
  const original = { blob: file, filename: file.name };
  if (typeof document === 'undefined' || typeof createImageBitmap !== 'function') {
    return original;
  }

  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && file.size <= SKIP_COMPRESSION_BYTES) {
      bitmap.close?.();
      return original;
    }

    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      bitmap.close?.();
      return original;
    }
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close?.();

    const blob = await canvasToBlob(canvas);
    // Never send a "compressed" file that ended up larger than the original.
    if (!blob || blob.size >= file.size) return original;
    return { blob, filename: withExtension(file.name, 'webp') };
  } catch {
    return original;
  }
}

/** POSTs the prepared image straight to Cloudinary and reports 1–100% progress. */
export function uploadToCloudinary(
  prepared: PreparedImage,
  signature: CloudinarySignature,
  onProgress?: (percent: number) => void,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const { cloudName, apiKey, signature: signed, timestamp, folder } = signature;
    if (!cloudName || !apiKey || !signed || !timestamp) {
      reject(new Error('Cloudinary upload signature is incomplete.'));
      return;
    }

    const form = new FormData();
    form.append('file', prepared.blob, prepared.filename);
    form.append('api_key', apiKey);
    form.append('timestamp', String(timestamp));
    if (folder) form.append('folder', folder);
    form.append('signature', signed);

    const xhr = new XMLHttpRequest();
    xhr.open('POST', `https://api.cloudinary.com/v1_1/${encodeURIComponent(cloudName)}/image/upload`);
    xhr.timeout = 60_000;

    xhr.upload.onprogress = (event) => {
      if (!onProgress || !event.lengthComputable || event.total === 0) return;
      const percent = Math.round((event.loaded / event.total) * 100);
      // 100 is reserved for the moment Cloudinary answers with the asset URL.
      onProgress(Math.min(99, Math.max(1, percent)));
    };

    xhr.onload = () => {
      let payload: { secure_url?: string; error?: { message?: string } } = {};
      try {
        payload = JSON.parse(xhr.responseText || '{}');
      } catch {
        payload = {};
      }
      if (xhr.status >= 200 && xhr.status < 300 && payload.secure_url) {
        onProgress?.(100);
        resolve(payload.secure_url);
        return;
      }
      reject(new Error(payload.error?.message || `Cloudinary upload failed (${xhr.status}).`));
    };
    xhr.onerror = () => reject(new Error('NETWORK'));
    xhr.ontimeout = () => reject(new Error('Cloudinary upload timed out.'));
    xhr.send(form);
  });
}
