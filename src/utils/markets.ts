export interface MarketOption {
  label: string;
  value: string;
}

export const MARKET_OPTIONS: MarketOption[] = [
  { label: "United States", value: "US" },
  { label: "United Kingdom", value: "GB" },
  { label: "Canada", value: "CA" },
  { label: "Australia", value: "AU" },
  { label: "Germany", value: "DE" },
  { label: "France", value: "FR" },
  { label: "Italy", value: "IT" },
  { label: "Spain", value: "ES" },
  { label: "Mexico", value: "MX" },
  { label: "Brazil", value: "BR" },
  { label: "Argentina", value: "AR" },
  { label: "India", value: "IN" },
  { label: "Japan", value: "JP" },
  { label: "South Korea", value: "KR" },
  { label: "China", value: "CN" },
  { label: "Singapore", value: "SG" },
  { label: "Netherlands", value: "NL" },
  { label: "Belgium", value: "BE" },
  { label: "Switzerland", value: "CH" },
  { label: "Sweden", value: "SE" },
  { label: "Norway", value: "NO" },
  { label: "Denmark", value: "DK" },
  { label: "Finland", value: "FI" },
  { label: "Poland", value: "PL" },
  { label: "Austria", value: "AT" },
  { label: "Ireland", value: "IE" },
  { label: "New Zealand", value: "NZ" },
  { label: "South Africa", value: "ZA" },
  { label: "UAE", value: "AE" },
  { label: "Saudi Arabia", value: "SA" },
];

// TikTok-specific market options (excludes restricted markets like US)
export const TIKTOK_MARKET_OPTIONS: MarketOption[] = MARKET_OPTIONS.filter(
  market => market.value !== "US"
);
