import { type CSSProperties, type ComponentPropsWithoutRef, type ElementType, type PropsWithChildren } from "react";
import type { PresentationBackgroundMode } from "../features/display/projectorSync";

type PresentationSurfaceProps<T extends ElementType> = PropsWithChildren<{
  as?: T;
  className: string;
  contentClassName: string;
  backgroundMode: PresentationBackgroundMode;
  backgroundSource: string | null;
  blurBackgroundImage: boolean;
  dimOpacity: number;
  containerProps?: Omit<ComponentPropsWithoutRef<T>, "as" | "className" | "children"> & Record<string, unknown>;
}>;

function buildBackgroundImageStyle(source: string): CSSProperties {
  return {
    backgroundImage: `url("${source}")`
  };
}

export default function PresentationSurface<T extends ElementType = "div">({
  as,
  className,
  contentClassName,
  backgroundMode,
  backgroundSource,
  blurBackgroundImage,
  dimOpacity,
  containerProps,
  children
}: PresentationSurfaceProps<T>) {
  const Component = (as ?? "div") as ElementType;
  const shouldRenderImage = backgroundMode === "custom-image" && Boolean(backgroundSource);

  return (
    <Component className={`presentation-surface ${className}`.trim()} {...containerProps}>
      <div
        className={`presentation-surface__background-layer ${shouldRenderImage ? "presentation-surface__background-layer--image" : "presentation-surface__background-layer--solid"} ${shouldRenderImage && blurBackgroundImage ? "presentation-surface__background-layer--blur" : ""}`.trim()}
        style={shouldRenderImage && backgroundSource ? buildBackgroundImageStyle(backgroundSource) : undefined}
        aria-hidden="true"
      />
      <div className="presentation-surface__overlay-layer" style={{ opacity: dimOpacity }} aria-hidden="true" />
      <div className={`presentation-surface__content-layer ${contentClassName}`.trim()}>{children}</div>
    </Component>
  );
}
