/** A browser reload is an explicit request to leave the current play session.
 * Activating a worker then is safe; background update discovery remains prompt-only. */
export function shouldActivateWaitingWorker(navigationType: string | undefined): boolean {
  return navigationType === "reload";
}
