import React from "react";

// Flip-through for plates with several pages: one page shows at a time and the
// rest are `hidden`.
const FLIP_SCRIPT = `(function () {
  if (window.__fxFlip) return;
  window.__fxFlip = true;
  document.addEventListener("click", function (event) {
    var flip = event.target.closest && event.target.closest("[data-fx-flip]");
    if (!flip) return;
    var plate = flip.closest("[data-fx-plate]");
    var pages = plate.querySelectorAll("[data-fx-page]");
    var current = 0;
    pages.forEach(function (el, n) { if (!el.hidden) current = n; });
    var next = (current + Number(flip.getAttribute("data-fx-flip")) + pages.length) % pages.length;
    pages.forEach(function (el, n) { el.hidden = n !== next; });
    plate.querySelector("[data-fx-count]").textContent = (next + 1) + " / " + pages.length;
  });

  // Scribbles for the hover: a different gesture (1-20, annotations.css) and
  // a paint color per plate, shuffled on every load; each mark lands either
  // in the gap below its plate or in the margin beside it.
  function shuffle(list) {
    for (var i = list.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = list[i]; list[i] = list[j]; list[j] = t;
    }
    return list;
  }
  var gestures = shuffle(Array.apply(null, Array(20)).map(function (_, i) { return String(i + 1); }));
  var colors = ["pink", "blue", "green", "yellow"];
  var last = "";
  document.querySelectorAll("[data-fx-plate]").forEach(function (plate, n) {
    var color;
    do { color = colors[Math.floor(Math.random() * colors.length)]; } while (color === last);
    last = color;
    var marks = [plate.querySelector(".fx-scribble--gap"), plate.querySelector(".fx-scribble--margin")];
    var left = Math.random() < 0.5;
    marks.forEach(function (mark, k) {
      if (!mark) return;
      mark.setAttribute("data-fx-ann", gestures[(n * 2 + k) % gestures.length]);
      mark.setAttribute("data-fx-ann-color", color);
      mark.setAttribute("data-fx-ann-side", left ? "left" : "right");
    });
  });
})();`;

/**
 * Home-page spread: one full-width column. The MDX children are the text;
 * drop <FeaturedWork n={…} /> between paragraphs to place the works listed
 * under `featured:` in canopy.yml.
 *
 * <FeaturedWorks>
 *   Paragraph…
 *   <FeaturedWork n={1} />
 *   Paragraph…
 * </FeaturedWorks>
 */
export default function FeaturedWorks({
  label = "Featured works",
  children,
}: {
  label?: string;
  children?: React.ReactNode;
}) {
  if (!children) return null;

  return (
    <section className="fx-spread" aria-label={label}>
      {children}
      <script dangerouslySetInnerHTML={{__html: FLIP_SCRIPT}} />
    </section>
  );
}
