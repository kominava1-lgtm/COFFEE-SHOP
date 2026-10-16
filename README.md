# EspressoXPress

EspressoXPress is a small, browser-based cafe finder focused on Pangasinan. Search for cafes near an address or your current location, browse the results, and open them on an interactive map.

## Pages and files

- `index.html` — cafe search homepage, results, radar preview, and cafe details panel.
- `map.html` — full-size interactive map. Click the map to add a named visited-cafe pin.
- `script.js` — homepage search, result cards, filters, cafe details, and photo uploads.
- `map.js` — map markers, directions, and visited pins.
- `style.css` — shared page styles.
- `supabase-client.js` — Supabase project connection settings.

## Run locally

This project has no build step or package installation. Serve the folder over HTTP, then open the local address in a browser. For example, with Python installed, run this from the project folder:

```bash
python -m http.server 8000
```

Then visit `http://localhost:8000`. A local web server is recommended because browser location access generally requires a secure context such as `localhost` or HTTPS. Internet access is needed for the external APIs, map tiles, fonts, and JavaScript libraries.

## Features

- Search by typed address or browser location.
- Find nearby cafes within 3 km using Geoapify Places.
- View cafe results and their locations in a radar-style preview.
- Open the Leaflet map, get directions, and save named visited-cafe pins.
- View and edit cafe address, hours, phone, website, cover photo, and menu photo.
- Keep the latest search in browser `localStorage` while navigating between pages.

## External services

- **Geoapify Places** supplies nearby cafe results. Set `GEOAPIFY_API_KEY` in `script.js` to a key for your Geoapify account.
- **Nominatim (OpenStreetMap)** geocodes typed addresses.
- **Leaflet**, **Leaflet Routing Machine**, and **CARTO** provide the map, routing control, and map tiles. They are loaded from public CDNs and tile servers.
- **Supabase** stores visited pins and cafe details and hosts uploaded cafe photos. Configure the project URL and publishable key in `supabase-client.js`.
- **Google Fonts** supplies the page typefaces.

### Supabase data

The app expects these resources in the configured Supabase project:

- `visited_cafes` table, with `cafe_name` (text), `lat` (number), and `lon` (number) columns. The app inserts pins and reads saved pins.
- `cafe_details` table, with `cafe_key` (text, unique), `cafe_name` (text), `address`, `hours`, `phone`, `website`, `cover_image`, and `menu_image` fields. The app looks up and upserts records by `cafe_key`.
- A public `cafe-menus` Storage bucket for cover and menu image uploads.

Set up suitable Supabase table permissions and Storage policies for your deployment. The browser uses the publishable key, so database and storage access must be controlled by Supabase policies; never put a secret/service-role key in frontend code.

## Notes

- Location search requires the user to grant browser location permission.
- Cafe data and address lookup depend on the availability and usage limits of the external services above.
- The Supabase and Geoapify settings are used by frontend JavaScript and are visible to visitors. Use public client keys with appropriate provider-side restrictions and database policies.
