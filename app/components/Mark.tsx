import React from "react";

type MarkType = "underline" | "circle" | "annotate";
type MarkColor = "red" | "blue" | "green" | "yellow" | "pink" | "black";

/** The annotation library, in the order annotations.py generates it. */
const GESTURES = [
  "scribble-fill", "coil", "hatching", "arc", "underline", "spring", "tangle",
  "ticks", "brush-swipes", "dabs", "cross-hatch", "open-oval", "strike",
  "verticals", "spiral", "wave", "hook", "crossing-diagonals", "taps", "lasso",
];

/**
 * A paint-marker annotation over text, using the same marks as the site
 * chrome: the main menu's colored underlines, the search bar's black stroke,
 * the language toggle's open brush loops, and the search results' hover
 * annotations. Styles live in `app/styles/custom.css` (`.fx-mark`). Use
 * sparingly.
 *
 * <Mark color="red">underlined in red paint</Mark>
 * <Mark>underlined in black, like the search bar</Mark>
 * <Mark type="circle">circled</Mark>
 * <Mark type="circle" variant="b">circled with the other loop</Mark>
 * <Mark type="annotate" gesture="coil" color="pink">a marked line</Mark>
 * <Mark type="annotate" gesture="spiral" side="right">marked on the right</Mark>
 */
export default function Mark({
  type = "underline",
  color,
  variant = "a",
  gesture = "scribble-fill",
  side = "left",
  children,
}: {
  type?: MarkType;
  /** Paint color. Underlines default to black, annotations to yellow. */
  color?: MarkColor;
  /** Which of the two loops to circle with. */
  variant?: "a" | "b";
  /** Annotation gesture, by name (as in the lookbook) or number, 1 to 20. */
  gesture?: string | number;
  /** Annotations: which margin the mark sits in, beside the line. */
  side?: "left" | "right";
  children?: React.ReactNode;
}) {
  if (type === "annotate") {
    const byName = GESTURES.indexOf(String(gesture).toLowerCase().replace(/\s+/g, "-")) + 1;
    const n = byName || Number(gesture);
    return (
      <mark className="fx-mark fx-mark--annotate" data-fx-ann={n >= 1 && n <= GESTURES.length ? n : 1}
        data-fx-ann-side={side} data-fx-ann-color={color || "yellow"}>
        {children}
      </mark>
    );
  }
  const className =
    type === "circle"
      ? `fx-mark fx-mark--circle fx-mark--${variant}`
      : `fx-mark fx-mark--underline fx-mark--${color || "black"}`;
  return <mark className={className}>{children}</mark>;
}
