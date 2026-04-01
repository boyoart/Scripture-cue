import { convertFileSrc } from "@tauri-apps/api/tauri";
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

export function isSupportedBackgroundImagePath(path: string): boolean {
  return getImageMimeType(path) !== "application/octet-stream";
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
  if (!isSupportedBackgroundImagePath(normalizedPath)) {
    console.warn("[presentation] unsupported background image extension", { path: normalizedPath });
    return null;
  }

  try {
    return convertFileSrc(normalizedPath);
  } catch (error) {
    console.warn("[presentation] failed to resolve background image source", error);
    return null;
  }
}
