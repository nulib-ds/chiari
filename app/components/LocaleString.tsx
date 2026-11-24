import React from "react";

/**
 * One of the page's locale strings, for the templates Canopy shares between
 * languages: it builds every language's work pages from
 * content/works/_layout.mdx, and every search page from
 * content/search/_layout.mdx, so words typed there show in English on the
 * Italian pages too.
 *
 * <h2><LocaleString id="common.misc.related_items">Related Items</LocaleString></h2>
 *
 * `id` is a key in content/locale.yml, which content/it/locale.yml overrides
 * on Italian pages; the children are the English, shown wherever the key is
 * missing. Canopy hands the page context the page's strings whole, the site's
 * own keys among them (see getSafePageContext in @nulib/canopy/ui).
 */
export default function LocaleString({id, children}: {id: string; children?: React.ReactNode}) {
  const PageContext = (globalThis as any)[Symbol.for("__CANOPY_PAGE_CONTEXT__")];
  const context = PageContext ? (React.useContext(PageContext) as any) : null;
  const messages = context && context.site && context.site.localeMessages;
  const value = String(id || "")
    .split(".")
    .reduce((node: any, part) => (node && typeof node === "object" ? node[part] : undefined), messages);
  return <>{typeof value === "string" && value.trim() ? value : children}</>;
}
