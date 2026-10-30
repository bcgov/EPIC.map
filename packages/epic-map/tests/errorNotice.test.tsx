// @vitest-environment jsdom
//
// The panel's one error design, and the retry it gives a failed delete.

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ErrorNotice from "@/components/Layers/ErrorNotice";
import DeleteLayerConfirm from "@/components/Layers/UserLayers/DeleteLayerConfirm";

afterEach(cleanup);

describe("an error notice", () => {
  it("shows its message and runs its action", async () => {
    const onAction = vi.fn();
    render(
      <ErrorNotice
        message="Couldn’t load your favourites"
        action="Try again"
        onAction={onAction}
      />,
    );

    expect(screen.getByText("Couldn’t load your favourites")).toBeDefined();
    expect(screen.queryByRole("alert")).toBe(null);
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));

    expect(onAction).toHaveBeenCalledTimes(1);
  });

  it("names a row's action after the row, and announces itself", () => {
    render(
      <ErrorNotice
        message="Couldn’t load this layer"
        action="Try again"
        onAction={vi.fn()}
        actionName="Try loading Roads again"
        alert
      />,
    );

    expect(screen.getByRole("alert").textContent).toContain(
      "Couldn’t load this layer",
    );
    const button = screen.getByRole("button", {
      name: "Try loading Roads again",
    });
    expect(button.textContent).toBe("Try again");
  });
});

describe("a failed delete", () => {
  it("offers a retry that deletes again", async () => {
    const onDelete = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(new Error("refused"))
      .mockResolvedValueOnce(undefined);
    render(
      <DeleteLayerConfirm
        layerName="Roads"
        onCancel={vi.fn()}
        onDelete={onDelete}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect((await screen.findByRole("alert")).textContent).toContain(
      "Couldn’t delete this layer",
    );

    await userEvent.click(
      screen.getByRole("button", { name: "Try deleting Roads again" }),
    );

    expect(onDelete).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("alert")).toBe(null);
  });
});
