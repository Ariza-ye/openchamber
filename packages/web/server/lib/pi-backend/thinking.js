/**
 * pi's thinking levels, projected as the UI's model variants.
 *
 * The UI fills its effort picker from a model's `variants`, so the levels pi
 * would accept have to be listed there before anyone can choose one. pi's rule
 * is `getSupportedThinkingLevels`: a model without `reasoning` accepts only
 * `off`, `thinkingLevelMap` rules a level out with `null`, and `xhigh`/`max`
 * stay unavailable unless the map names a provider value for them. Repeating
 * that rule keeps the picker to levels the session will not clamp away.
 */
const THINKING_LEVELS = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'];

export const supportedThinkingLevels = (model) => {
  if (model?.reasoning !== true) return ['off'];
  return THINKING_LEVELS.filter((level) => {
    const mapped = model.thinkingLevelMap?.[level];
    if (mapped === null) return false;
    return level === 'xhigh' || level === 'max' ? mapped !== undefined : true;
  });
};

/**
 * The variant ids the model picker lists.
 *
 * A model that cannot think gets none: `off` is the only level pi accepts for
 * it, and the picker's "Default" already runs at exactly that level.
 */
export const modelVariantIds = (model) => (
  model?.reasoning === true ? supportedThinkingLevels(model) : []
);
