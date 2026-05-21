import type { ReactNode } from "react";

type IconButtonProps = {
  label: string;
  children: ReactNode;
  type?: "button" | "submit";
  onClick?: () => void;
};

export function IconButton({ label, children, type = "button", onClick }: IconButtonProps) {
  return (
    <button className="icon-button" type={type} title={label} aria-label={label} onClick={onClick}>
      {children}
    </button>
  );
}
