import {useEffect} from "react";

// Canopy 1.14 hardcodes the tab button label and does not forward MDX props.
// Update only its text node so React's active-filter count remains intact.
export default function SearchFilterLabel() {
  useEffect(() => {
    const tabs = document.querySelector("[data-canopy-search-tabs]");
    if (!tabs) return;
    const updateLabel = () => {
      const label = tabs.querySelector(".canopy-search-tabs__filters-button > span:first-child");
      label?.childNodes.forEach(node => {
        if (node.nodeType === Node.TEXT_NODE && node.textContent?.trim() === "Filters") {
          node.textContent = node.textContent.replace("Filters", "Filter");
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
