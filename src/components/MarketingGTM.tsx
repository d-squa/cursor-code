import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

const PUBLIC_ROUTES = [
  '/',
  '/compare-plans',
  '/book-demo',
  '/book-demo/confirmation',
  '/terms',
  '/privacy',
  '/generic',
  '/media-buying-software',
  '/media-planning-software',
  '/ai-media-buying-software',
  '/cross-platform-ad-management-software',
  '/auth',
  '/onboarding',
  '/accept-invitation',
  '/choose-plan',
  '/app/settings/plans',
];

const GTM_ID = 'GTM-PVH2QLMC';
const SCRIPT_ID = 'gtm-marketing-script';

export function MarketingGTM() {
  const location = useLocation();

  useEffect(() => {
    const isPublic = PUBLIC_ROUTES.includes(location.pathname);
    const existingScript = document.getElementById(SCRIPT_ID);

    if (isPublic && !existingScript) {
      // Inject GTM script
      const script = document.createElement('script');
      script.id = SCRIPT_ID;
      script.innerHTML = `
        (function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
        new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
        j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
        'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
        })(window,document,'script','dataLayer','${GTM_ID}');
      `;
      document.head.appendChild(script);

      // Inject noscript iframe
      const noscript = document.createElement('noscript');
      noscript.id = 'gtm-marketing-noscript';
      const iframe = document.createElement('iframe');
      iframe.src = `https://www.googletagmanager.com/ns.html?id=${GTM_ID}`;
      iframe.height = '0';
      iframe.width = '0';
      iframe.style.display = 'none';
      iframe.style.visibility = 'hidden';
      noscript.appendChild(iframe);
      document.body.insertBefore(noscript, document.body.firstChild);
    } else if (!isPublic && existingScript) {
      // Remove marketing GTM from protected pages
      existingScript.remove();
      document.getElementById('gtm-marketing-noscript')?.remove();
      // Remove the injected gtm.js script tag too
      const gtmScripts = document.querySelectorAll(`script[src*="gtm.js?id=${GTM_ID}"]`);
      gtmScripts.forEach(s => s.remove());
    }
  }, [location.pathname]);

  return null;
}
