import React from "react";

type MarkType = "highlight" | "strike" | "underline" | "circle";
type MarkColor = "yellow" | "green" | "blue" | "red" | "teal";

/**
 * A marker annotation over printed text: a highlighter swipe, a felt-tip
 * strike-through, underline or circle. Styles live in `app/styles/custom.css`
 * (`.fx-mark`).
 *
 * <Mark>highlighted</Mark>
 * <Mark type="strike" color="red">struck through</Mark>
 */
export default function Mark({
  type = "highlight",
  color = "yellow",
  children,
}: {
  type?: MarkType;
  color?: MarkColor;
  children?: React.ReactNode;
}) {
  const className = `fx-mark fx-mark--${type} fx-mark--${color}`;
  // A strike-through reads as deleted text; the other marks emphasize.
  if (type === "strike") return <s className={className}>{children}</s>;
  return <mark className={className}>{children}</mark>;
}
