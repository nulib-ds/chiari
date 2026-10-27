import React from "react";

type MarkType = "underline" | "circle";
type MarkColor = "red" | "blue" | "green" | "yellow" | "pink" | "black";

/**
 * A paint-marker annotation over text, using the same marks as the site
 * chrome: the main menu's colored underlines, the search bar's black stroke,
 * and the language toggle's open brush loops. Styles live in
 * `app/styles/custom.css` (`.fx-mark`). Use sparingly.
 *
 * <Mark color="red">underlined in red paint</Mark>
 * <Mark>underlined in black, like the search bar</Mark>
 * <Mark type="circle">circled</Mark>
 * <Mark type="circle" variant="b">circled with the other loop</Mark>
 */
export default function Mark({
  type = "underline",
  color = "black",
  variant = "a",
  children,
}: {
  type?: MarkType;
  /** Underline color: the main menu's four, plus pink and black. */
  color?: MarkColor;
  /** Which of the two loops to circle with. */
  variant?: "a" | "b";
  children?: React.ReactNode;
}) {
  const className =
    type === "circle"
      ? `fx-mark fx-mark--circle fx-mark--${variant}`
      : `fx-mark fx-mark--underline fx-mark--${color}`;
  return <mark className={className}>{children}</mark>;
}
