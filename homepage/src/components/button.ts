// Licensed under the Apache License, Version 2.0 (see LICENSE).
// Addonium's own buttons. Framework-free: the server renders these classes
// directly, so CTAs look right with JS disabled. No component library.

export type ButtonVariant = "primary" | "outline";
export type ButtonSize = "md" | "lg";

export function buttonClass(
  variant: ButtonVariant = "primary",
  size: ButtonSize = "lg",
): string {
  return `abtn abtn-${variant} abtn-${size}`;
}
