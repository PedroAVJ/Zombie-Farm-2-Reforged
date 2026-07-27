export type MutationReplacement = "body" | "armF" | "head";

/** True when a base-model part should be hidden by a replacement mutation. */
export function matchesMutationReplacement(
  file: string,
  replacement: MutationReplacement,
): boolean {
  return replacement === "body"
    ? /Body(?:\.png)?$/i.test(file)
    : replacement === "armF"
      ? /ArmF(?:\.png)?$/i.test(file)
      : /(?:Head|Eye[LR]|UpperTeeth|LowerTeeth|Jaw|Scar|Feature)(?:\.png)?$/i.test(file);
}
