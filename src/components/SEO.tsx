import { useEffect } from "react";

interface SEOProps {
  title: string;
  description: string;
  keywords?: string;
  canonicalUrl?: string;
  ogTitle?: string;
  ogDescription?: string;
  ogImage?: string;
  ogUrl?: string;
  twitterTitle?: string;
  twitterDescription?: string;
}

const DEFAULT_OG_IMAGE =
  "https://storage.googleapis.com/gpt-engineer-file-uploads/VuvQwKFcSYVB8pjmkGgvmjMDEvF3/social-images/social-1767660811434-logo-product-square transparent.png";

const SEO = ({
  title,
  description,
  keywords,
  canonicalUrl,
  ogTitle,
  ogDescription,
  ogImage = DEFAULT_OG_IMAGE,
  ogUrl,
  twitterTitle,
  twitterDescription,
}: SEOProps) => {
  useEffect(() => {
    document.title = title;

    const setMeta = (name: string, content: string, attr = "name") => {
      let el = document.querySelector(`meta[${attr}="${name}"]`) as HTMLMetaElement | null;
      if (!el) {
        el = document.createElement("meta");
        el.setAttribute(attr, name);
        document.head.appendChild(el);
      }
      el.setAttribute("content", content);
    };

    const setLink = (rel: string, href: string, extra?: Record<string, string>) => {
      let el = document.querySelector(`link[rel="${rel}"]`) as HTMLLinkElement | null;
      if (!el) {
        el = document.createElement("link");
        el.setAttribute("rel", rel);
        document.head.appendChild(el);
      }
      el.setAttribute("href", href);
      if (extra) {
        Object.entries(extra).forEach(([k, v]) => el!.setAttribute(k, v));
      }
    };

    // Basic meta
    setMeta("description", description);
    if (keywords) setMeta("keywords", keywords);
    setMeta("robots", "index, follow");
    setMeta("author", "ActiPlan");
    setMeta("theme-color", "#6366f1");

    // Favicon / icons
    setLink("icon", "/favicon.ico");
    setLink("icon", "/favicon.png", { type: "image/png" });
    setLink("apple-touch-icon", "/logo.png");

    // Canonical
    const resolvedCanonical = canonicalUrl || window.location.href.split("?")[0];
    setLink("canonical", resolvedCanonical);

    // Open Graph
    setMeta("og:type", "website", "property");
    setMeta("og:site_name", "ActiPlan", "property");
    setMeta("og:title", ogTitle || title, "property");
    setMeta("og:description", ogDescription || description, "property");
    if (ogImage) setMeta("og:image", ogImage, "property");
    setMeta("og:url", ogUrl || resolvedCanonical, "property");

    // Twitter Card
    setMeta("twitter:card", "summary_large_image");
    setMeta("twitter:site", "@actiplan");
    setMeta("twitter:title", twitterTitle || ogTitle || title);
    setMeta("twitter:description", twitterDescription || ogDescription || description);
    if (ogImage) setMeta("twitter:image", ogImage);
  }, [title, description, keywords, canonicalUrl, ogTitle, ogDescription, ogImage, ogUrl, twitterTitle, twitterDescription]);

  return null;
};

export default SEO;
