import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { CollectionVisibilityToggles } from "./CollectionVisibilityToggles";

function renderToggles(isPublic: boolean, isDiscoverable: boolean) {
  const onChange = vi.fn();
  render(<CollectionVisibilityToggles isPublic={isPublic} isDiscoverable={isDiscoverable} onChange={onChange} />);
  return {
    onChange,
    linkSwitch: screen.getByRole("switch", { name: "Anyone with the link can view" }),
    discoverSwitch: screen.getByRole("switch", { name: "List in Discover" }),
  };
}

describe("CollectionVisibilityToggles", () => {
  it("disables List in Discover while link access is off", () => {
    const { linkSwitch, discoverSwitch, onChange } = renderToggles(false, false);

    expect(linkSwitch).toHaveAttribute("aria-checked", "false");
    expect(discoverSwitch).toBeDisabled();
    expect(discoverSwitch).toHaveAttribute("aria-checked", "false");

    fireEvent.click(linkSwitch);
    expect(onChange).toHaveBeenCalledWith({ isPublic: true, isDiscoverable: false });
  });

  it("turns Discover on and off while link access is on", () => {
    const { discoverSwitch, onChange } = renderToggles(true, false);

    expect(discoverSwitch).toBeEnabled();
    fireEvent.click(discoverSwitch);
    expect(onChange).toHaveBeenCalledWith({ isPublic: true, isDiscoverable: true });
  });

  it("turning link access off also turns Discover off", () => {
    const { linkSwitch, discoverSwitch, onChange } = renderToggles(true, true);

    expect(discoverSwitch).toHaveAttribute("aria-checked", "true");
    fireEvent.click(linkSwitch);
    expect(onChange).toHaveBeenCalledWith({ isPublic: false, isDiscoverable: false });
  });

  it("never shows Discover as on for a private collection", () => {
    const { discoverSwitch } = renderToggles(false, true);
    expect(discoverSwitch).toHaveAttribute("aria-checked", "false");
  });
});
