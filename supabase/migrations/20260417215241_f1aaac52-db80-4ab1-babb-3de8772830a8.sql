UPDATE campaigns
SET market_splits = REPLACE(REPLACE(REPLACE(
  market_splits::text,
  '"name": "United States"', '"name": "US"'),
  '"name": "United Kingdom"', '"name": "GB"'),
  '"name": "Germany"', '"name": "DE"'
)::jsonb,
platforms = REPLACE(REPLACE(REPLACE(
  platforms::text,
  '"name": "United States"', '"name": "US"'),
  '"name": "United Kingdom"', '"name": "GB"'),
  '"name": "Germany"', '"name": "DE"'
)::jsonb
WHERE is_sample = true;