import { readBinaryFile } from "@tauri-apps/api/fs";
import type { PresentationFontFamily } from "./projectorSync";

export const PRESENTATION_FONT_OPTIONS: Array<{ value: PresentationFontFamily; label: string; cssFamily: string }> = [
  { value: "Inter", label: "Inter", cssFamily: '"Inter", "Segoe UI", Arial, sans-serif' },
  { value: "Georgia", label: "Georgia", cssFamily: 'Georgia, "Times New Roman", serif' },
  { value: "Merriweather", label: "Merriweather", cssFamily: '"Merriweather", Georgia, serif' },
  { value: "Montserrat", label: "Montserrat", cssFamily: '"Montserrat", "Segoe UI", Arial, sans-serif' },
  { value: "Open Sans", label: "Open Sans", cssFamily: '"Open Sans", "Segoe UI", Arial, sans-serif' },
  { value: "Lora", label: "Lora", cssFamily: '"Lora", Georgia, serif' },
  { value: "Playfair Display", label: "Playfair Display", cssFamily: '"Playfair Display", Georgia, serif' },
  { value: "Roboto", label: "Roboto", cssFamily: 'Roboto, "Segoe UI", Arial, sans-serif' }
];

export function getPresentationFontCssFamily(fontFamily: PresentationFontFamily): string {
  return PRESENTATION_FONT_OPTIONS.find((option) => option.value === fontFamily)?.cssFamily ??
    '"Inter", "Segoe UI", Arial, sans-serif';
}

function normalizeLocalFilePath(inputPath: string): string {
  const sanitizedPath = inputPath.replace(/^\\\\\?\\/, "").replace(/\\/g, "/");

  if (inputPath.startsWith("file://")) {
    try {
      const parsed = new URL(inputPath);
      const decoded = decodeURIComponent(parsed.pathname);
      if (/^\/[A-Za-z]:\//.test(decoded)) {
        return decoded.slice(1);
      }
      return decoded;
    } catch {
      return decodeURIComponent(inputPath.replace(/^file:\/\//, "")).replace(/\\/g, "/");
    }
  }

  return sanitizedPath;
}

function getImageMimeType(path: string): string {
  const extension = path.split(".").pop()?.toLowerCase();
  switch (extension) {
    case "png":
      return "image/png";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "webp":
      return "image/webp";
    default:
      return "application/octet-stream";
  }
}

function toBase64(data: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;

  for (let offset = 0; offset < data.length; offset += chunkSize) {
    const chunk = data.subarray(offset, offset + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  return btoa(binary);
}

export async function getBackgroundImageSource(path: string | null): Promise<string | null> {
  if (!path) {
    return null;
  }

  const trimmed = path.trim();
  if (!trimmed) {
    return null;
  }

  if (trimmed.startsWith("data:image/") || trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    return trimmed;
  }

  const normalizedPath = normalizeLocalFilePath(trimmed);

  try {
    const imageBytes = await readBinaryFile(normalizedPath);
    const mimeType = getImageMimeType(normalizedPath);
    return `data:${mimeType};base64,${toBase64(imageBytes)}`;
  } catch (error) {
    console.warn("[presentation] failed to load background image bytes", error);
    return null;
  }
}
