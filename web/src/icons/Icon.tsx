import { useSyncExternalStore } from "react";
import type { SVGProps } from "react";
import type { IconName } from "./registry";
import { getIconThemeSnapshot, resolveIconComponent, subscribeIconTheme } from "./runtime";

type IconProps = {
  name: IconName;
  size: number;
} & Omit<SVGProps<SVGSVGElement>, "name">;

export function Icon({ name, size, ...props }: IconProps) {
  useSyncExternalStore(subscribeIconTheme, getIconThemeSnapshot, getIconThemeSnapshot);
  const Component = resolveIconComponent(name);
  return <Component size={size} aria-hidden="true" {...props} />;
}
