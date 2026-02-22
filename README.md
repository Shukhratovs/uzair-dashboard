# UzAir Daily Routes Dashboard (Domestic)

Next.js app that queries uzairways.online (Aerotur backend) to count **domestic** flights for a selected date and origin city/airport code.

## Run

```bash
npm install
npm run dev
```

Open http://localhost:3000

## API

- Daily summary:
  `/api/daily?date=2026-02-23&from=TAS&class=Economy`

- Excel download:
  `/api/export-xlsx?date=2026-02-23&from=TAS&class=Economy`

## Notes

- The app tries to load the domestic airport/city list from Aerotur APIs (best-effort).
  If it cannot find the list endpoint, it falls back to a built-in Uzbekistan domestic code list.
- For production: add caching, rate limiting, and concurrency controls.


- Reyslar soni = faqat DIRECT (segments=1). Tranzit alohida ko'rsatiladi.
