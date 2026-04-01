import type { CSSProperties } from "react";
import { getPresentationFontCssFamily } from "./presentationStyling";
import type { PresentationFontFamily } from "./projectorSync";

export type ProjectionTypography = {
  fontFamily: PresentationFontFamily;
  baseFontSizePx: number;
  lineHeight: number;
  fontWeight?: CSSProperties["fontWeight"];
};

export type ComputedProjectionTypography = {
  fontFamilyCss: string;
  fontSizePx: number;
  lineHeight: number;
  fontWeight?: CSSProperties["fontWeight"];
};

export function getComputedProjectionTypography(
  projectionTypography: ProjectionTypography,
  fittedFontSizePx: number,
  fittedLineHeight: number
): ComputedProjectionTypography {
  return {
    fontFamilyCss: getPresentationFontCssFamily(projectionTypography.fontFamily),
    fontSizePx: fittedFontSizePx,
    lineHeight: fittedLineHeight,
    fontWeight: projectionTypography.fontWeight
  };
}

export function getProjectionVerseStyle(typography: ComputedProjectionTypography): CSSProperties {
  return {
    fontFamily: typography.fontFamilyCss,
    fontSize: `${typography.fontSizePx}px`,
    lineHeight: typography.lineHeight,
    fontWeight: typography.fontWeight
  };
}
