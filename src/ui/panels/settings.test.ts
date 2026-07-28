import { describe, expect, it, vi } from "vitest";
import { confirmLocalFarmReset } from "./settings";

describe("Local Farm reset confirmation", () => {
  it("keeps the farm when the player cancels", async () => {
    const reset = vi.fn();
    const confirmInGame = vi.fn().mockResolvedValue(false);

    await confirmLocalFarmReset({ confirmInGame, onResetLocal: reset });

    expect(confirmInGame).toHaveBeenCalledWith(
      "Reset Local Farm?",
      "This permanently deletes the current Local Farm and its automatic recovery copy from this browser. Downloaded export files and your Online Farm will not be affected.",
      "Reset Farm",
    );
    expect(reset).not.toHaveBeenCalled();
  });

  it("resets only after explicit confirmation", async () => {
    const reset = vi.fn();

    await confirmLocalFarmReset({
      confirmInGame: vi.fn().mockResolvedValue(true),
      onResetLocal: reset,
    });

    expect(reset).toHaveBeenCalledOnce();
  });
});
