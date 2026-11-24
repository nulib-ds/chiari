import {useEffect} from "react";

// The filters button's label, in each of the site's languages: a verb, as
// on a key. Any other language falls back to English.
const LABELS: Record<string, string> = {en: "Filter", it: "Filtra"};

// Canopy hardcodes the filters button's label: SearchTabs defaults its
// `filtersLabel` prop to "Filters", which shadows the locale's
// `common.nouns.filters`, so it reads "Filters" on every page, Italian too
// (Canopy 2.0.2). Replace only its text node, so React's active-filter count
// stays intact, with the page's own word, chosen by <html lang>: Canopy
// builds every language's search page from content/search/_layout.mdx, so a
// prop there can't vary by language.
export default function SearchFilterLabel() {
  useEffect(() => {
    const tabs = document.querySelector("[data-canopy-search-tabs]");
    if (!tabs) return;
    const lang = (document.documentElement.lang || "en").toLowerCase().split("-")[0];
    const label = LABELS[lang] || LABELS.en;
    const updateLabel = () => {
      const node = tabs.querySelector(".canopy-search-tabs__filters-button > span:first-child");
      node?.childNodes.forEach(child => {
        if (child.nodeType === Node.TEXT_NODE && child.textContent?.trim() === "Filters") {
          child.textContent = child.textContent.replace("Filters", label);
        }
      });
    };
    updateLabel();
    const observer = new MutationObserver(updateLabel);
    observer.observe(tabs, {childList: true, subtree: true, characterData: true});
    return () => observer.disconnect();
  }, []);
  return null;
}
