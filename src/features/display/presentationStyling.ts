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

export function getBackgroundImageSource(path: string | null): string | null {
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

  const toTauriFileSource = (value: string) => {
    const normalized = value.replace(/\\/g, "/");
    return convertFileSrc(normalized);
  };

  try {
    if (trimmed.startsWith("file://")) {
      const decoded = decodeURIComponent(trimmed.replace(/^file:\/\//, ""));
      return toTauriFileSource(decoded);
    }

    return toTauriFileSource(trimmed);
  } catch (error) {
    console.warn("[presentation] failed to convert background image path", error);
    return null;
  }
}
