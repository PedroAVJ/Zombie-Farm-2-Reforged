/** Match a quest's named subject. Most requirements are exact, while these
 * decorating objectives intentionally target a whole object family. */
export function questSubjectMatches(requirement: string, subject: string): boolean {
  if (!requirement) return true;
  const wanted = requirement.trim().toLowerCase();
  const actual = subject.trim().toLowerCase();
  if (wanted === actual) return true;
  return (wanted === "barrel" || wanted === "hedge") &&
    new RegExp(`\\b${wanted}\\b`, "i").test(subject);
}
