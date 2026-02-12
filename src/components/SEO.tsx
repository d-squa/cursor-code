import { useEffect } from "react";

interface SEOProps {
  title: string;
  description: string;
  keywords?: string;
  ogTitle?: string;
  ogDescription?: string;
  ogImage?: string;
  twitterTitle?: string;
  twitterDescription?: string;
}

const SEO = ({
  title,
  description,
  keywords,
  ogTitle,
  ogDescription,
  ogImage = "https://storage.googleapis.com/gpt-engineer-file-uploads/VuvQwKFcSYVB8pjmkGgvmjMDEvF3/social-images/social-1767660811434-logo-product-square transparent.png",
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

    setMeta("description", description);
    if (keywords) setMeta("keywords", keywords);

    setMeta("og:title", ogTitle || title, "property");
    setMeta("og:description", ogDescription || description, "property");
    if (ogImage) setMeta("og:image", ogImage, "property");

    setMeta("twitter:title", twitterTitle || ogTitle || title);
    setMeta("twitter:description", twitterDescription || ogDescription || description);
  }, [title, description, keywords, ogTitle, ogDescription, ogImage, twitterTitle, twitterDescription]);

  return null;
};

export default SEO;
