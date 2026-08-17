import type {
  CaptionBlock,
  CaptionProject,
  CaptionStyle,
  CaptionStylePatch,
  WordToken,
} from '@/types/project';

export type StyleScope = 'caption' | 'all';

export function mergeStyle(
  base: CaptionStyle,
  patch?: CaptionStylePatch,
): CaptionStyle {
  if (!patch) return base;

  return {
    ...base,
    ...patch,
    font: { ...base.font, ...patch.font },
    stroke: { ...base.stroke, ...patch.stroke },
    shadow: { ...base.shadow, ...patch.shadow },
    background: { ...base.background, ...patch.background },
    position: { ...base.position, ...patch.position },
    box: { ...base.box, ...patch.box },
    animation: { ...base.animation, ...patch.animation },
  };
}

export function resolveCaptionStyle(
  projectStyle: CaptionStyle,
  caption?: CaptionBlock,
  word?: WordToken,
): CaptionStyle {
  return mergeStyle(
    mergeStyle(projectStyle, caption?.styleOverride),
    word?.styleOverride,
  );
}

export function applyStylePatch(
  project: CaptionProject,
  captionId: string,
  scope: StyleScope,
  patch: CaptionStylePatch,
): CaptionProject {
  const updatedAt = new Date().toISOString();

  if (scope === 'all') {
    return {
      ...project,
      updatedAt,
      projectStyle: mergeStyle(project.projectStyle, patch),
    };
  }

  return {
    ...project,
    updatedAt,
    captions: project.captions.map((caption) =>
      caption.id === captionId
        ? {
            ...caption,
            styleOverride: mergePatch(caption.styleOverride, patch),
          }
        : caption,
    ),
  };
}

export function mergePatch(
  base: CaptionStylePatch | undefined,
  patch: CaptionStylePatch,
): CaptionStylePatch {
  return {
    ...base,
    ...patch,
    font: { ...base?.font, ...patch.font },
    stroke: { ...base?.stroke, ...patch.stroke },
    shadow: { ...base?.shadow, ...patch.shadow },
    background: { ...base?.background, ...patch.background },
    position: { ...base?.position, ...patch.position },
    box: { ...base?.box, ...patch.box },
    animation: { ...base?.animation, ...patch.animation },
  };
}
