import { useEffect } from 'react';

const AMPLITUDE_KEY = 'eb2d306db6c143ddb21e543ad9b82759';
const SCRIPT_ID = 'amplitude-analytics-script';

export function AmplitudeAnalytics() {
  useEffect(() => {
    if (document.getElementById(SCRIPT_ID)) return;

    // Load Amplitude SDK
    const sdk = document.createElement('script');
    sdk.id = SCRIPT_ID;
    sdk.src = `https://cdn.amplitude.com/script/${AMPLITUDE_KEY}.js`;
    sdk.async = true;
    sdk.onload = () => {
      try {
        (window as any).amplitude.add((window as any).sessionReplay.plugin({ sampleRate: 1 }));
        (window as any).amplitude.init(AMPLITUDE_KEY, {
          fetchRemoteConfig: true,
          autocapture: {
            attribution: true,
            fileDownloads: true,
            formInteractions: true,
            pageViews: true,
            sessions: true,
            elementInteractions: true,
            networkTracking: true,
            webVitals: true,
            frustrationInteractions: {
              thrashedCursor: true,
              errorClicks: true,
              deadClicks: true,
              rageClicks: true,
            },
          },
        });
      } catch (err) {
        console.error('Amplitude init error:', err);
      }
    };
    document.head.appendChild(sdk);
  }, []);

  return null;
}
