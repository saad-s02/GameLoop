# Agent 6: GO Transit GTFS static feed verification

Phase 0 adversarial verification, executed 2026-07-13 (Monday evening).
Domain: PRD sections 8, 9, 10 (TransitOption schema, Metrolinx GTFS decision, snapshot steps).

## Verdict summary

| Claim | Verdict | Evidence |
|---|---|---|
| GO GTFS static zip is publicly downloadable from the Metrolinx assets URL | CONFIRMED | HTTP 200, 18,758,854 bytes, see Download below |
| Feed is current (covers the build and demo window) | CONFIRMED | feed_start_date 20260707, feed_end_date 20260904; demo day 2026-07-16 is covered |
| Archive contains stops.txt, stop_times.txt, trips.txt, routes.txt | CONFIRMED | unzip listing below |
| Archive contains calendar.txt | CORRECTED | No calendar.txt. The feed uses calendar_dates.txt only, with one service_id per calendar date (service_id equals the yyyymmdd date, exception_type 1 for every date from 20260707 to 20260904). "Weekday service" means selecting a weekday date, for example 20260714 |
| Union Station stop id identifiable | CONFIRMED | UN = "Union Station GO" (rail). A separate stop 02300 = "Union Station Bus Terminal" exists for buses. No parent_station relationship between them |
| Exhibition stop id identifiable | CONFIRMED | EX = "Exhibition GO" |
| Lakeshore corridor routes identifiable | CONFIRMED | Train route_ids: 06260926-LW (Lakeshore West), 06260926-LE (Lakeshore East), route_type 2. Bus twins exist (06260926-18 LW bus, 06260926-90 LE bus, route_type 3); the extraction used trains only |
| 6 to 10 real weekday evening Union arrivals extractable in 17:00 to 19:30 | CONFIRMED | Exactly 10 Union-bound LW/LE train arrivals exist in the window on 2026-07-14; all 10 extracted to research/transit-sample.json |
| stop_times.txt is tens of MB | CONFIRMED | 87,105,289 bytes uncompressed |
| Metrolinx open data license and attribution wording capturable verbatim | CONFIRMED | License PDF downloaded and text extracted, quoted in full below |
| PRD demo prompt "Our train arrives at 6:18" matches a real arrival | ADJUSTMENT | No LW or LE train arrives at Union at 18:18 on a July 2026 weekday. Nearest real arrivals: 18:12 (Lakeshore East) and 18:15 (Lakeshore West). Recommend changing the demo prompt to "arrives at 6:15" or keeping 6:18 as the fan's stated belief while the planner snaps to the real 18:15 arrival. Data realness policy (PRD section 4) says snapshot times are real, so the itinerary itself should display 18:15, not 18:18 |

No BLOCKER findings. The PRD's GTFS decision (section 9) and snapshot steps (section 10) are executable as written, with the calendar_dates.txt correction and the 6:18 prompt adjustment noted above.

## 1. Download record

- URL used: `https://assets.metrolinx.com/raw/upload/Documents/Metrolinx/Open%20Data/GO-GTFS.zip`
- Command: `curl -sS -L -o GO-GTFS.zip -D headers.txt -w "HTTP %{http_code} ..." <url>`
- HTTP status: 200
- File size: 18,758,854 bytes (about 17.9 MiB)
- Last-Modified header: `Tue, 07 Jul 2026 15:18:43 GMT`
- ETag: `"d2bfad47ded8d45f92fa8744829184f6"`
- Server: Cloudinary (fronted by Fastly)
- Saved to: `D:\Projects\GameLoop\research\raw\GO-GTFS.zip` (research/raw/ is in .gitignore, verified)

feed_info.txt (quoted in full):

```
feed_publisher_name,feed_publisher_url,feed_lang,feed_start_date,feed_end_date,feed_version
Metrolinx,https://www.metrolinx.com,en,20260707,20260904,20260707085724
```

Feed date used as snapshotDate: **2026-07-07** (consistent across feed_version, feed_start_date, and the Last-Modified header).

## 2. Archive structure

Extracted to `research/raw/gtfs/`. Contents:

| File | Size (bytes) | Present |
|---|---|---|
| agency.txt | 199 | yes |
| calendar_dates.txt | 1,295 | yes (calendar.txt is ABSENT) |
| fare_attributes.txt | 189,365 | yes |
| fare_rules.txt | 108,418 | yes |
| feed_info.txt | 169 | yes |
| routes.txt | 2,496 | yes |
| shapes.txt | 16,377,705 | yes |
| stop_amenities.txt | 18,946 | yes (non-standard extension file) |
| stop_times.txt | 87,105,289 | yes |
| stops.txt | 127,492 | yes |
| transfers.txt | 124 | yes |
| trips.txt | 7,800,942 | yes |

Calendar model: calendar_dates.txt defines 60 service_ids, one per date from 20260707 through 20260904, each service_id literally equal to its date string. There are no day-of-week service patterns. Any code that joins on service_id must pick a concrete date.

### Union and Exhibition stop entries (grep of stops.txt)

```
UN,Union Station GO,43.645195,-79.3806,02,...,0,,1,
02300,Union Station Bus Terminal,43.644042,-79.376939,02,...,0,,1,102300
UI,Unionville GO,43.851689,-79.314332,71,...
00128,Unionville GO Bus,43.851935,-79.313774,71,...
00170,Kingston Rd. @ Port Union Rd.,...
EX,Exhibition GO,43.635549,-79.418927,02,...,0,,1,
```

For rail planning use **UN** (Union Station GO) and **EX** (Exhibition GO). "Union" grep hits Unionville and Port Union; filter carefully. There is no stops.txt parent_station grouping for Union (both UN and 02300 have location_type 0 and empty parent_station).

## 3. Extraction methodology (transit-sample.json)

Service date chosen: **2026-07-14 (Tuesday)**, the first full weekday after snapshot, inside the feed window and one day before the Wednesday build gate. Service_id = `20260714`.

Pipeline (all streaming, stop_times.txt never loaded into context or memory beyond the filtered trips):

1. routes.txt: Lakeshore train route_ids are `06260926-LW` and `06260926-LE` (route_type 2).
2. trips.txt: selected trips with route_id in that set, service_id `20260714`, and trip_headsign containing "Union Station GO" (Union-bound direction, direction_id 1). 184 LW/LE trips run that day in both directions.
3. stop_times.txt (87 MB): single awk pass keeping only rows for the selected trips; recorded the Union (UN) arrival, the trip's first stop (origin terminal) departure, and the stop immediately before Union.
4. Window filter: Union arrival_time between 17:00:00 and 19:30:00 inclusive. Result: exactly 10 trains, all of which terminate at Union.

Gotcha found and handled: stop_sequence values are NOT consecutive in this feed (example: trip 20260714-LW-1028 uses sequences 1, 7, 9, 11, ... 28, 34). The prior-stop lookup walks backward until it finds an existing sequence. Any consumer code must never assume sequence+1 or sequence-1 exists.

### The 10 extracted arrivals (trip-level evidence)

| GTFS trip_id | Line | Origin terminal (dep) | Stop before Union (dep) | Union arrival |
|---|---|---|---|---|
| 20260714-LE-9027 | Lakeshore East | Durham College Oshawa GO 16:09 | Danforth GO 16:58 | 17:12:00 |
| 20260714-LW-1026 | Lakeshore West | Aldershot GO 16:07 | Exhibition GO 17:06 | 17:15:00 |
| 20260714-LE-9227 | Lakeshore East | Durham College Oshawa GO 16:39 | Danforth GO 17:28 | 17:42:00 |
| 20260714-LW-1626 | Lakeshore West | West Harbour GO 16:23 | Exhibition GO 17:36 | 17:45:00 |
| 20260714-LE-9029 | Lakeshore East | Durham College Oshawa GO 17:09 | Danforth GO 17:58 | 18:12:00 |
| 20260714-LW-1028 | Lakeshore West | Aldershot GO 17:03 | Exhibition GO 18:06 | 18:15:00 |
| 20260714-LE-9229 | Lakeshore East | Durham College Oshawa GO 17:39 | Danforth GO 18:28 | 18:42:00 |
| 20260714-LW-1628 | Lakeshore West | West Harbour GO 17:23 | Exhibition GO 18:36 | 18:45:00 |
| 20260714-LE-9031 | Lakeshore East | Durham College Oshawa GO 18:09 | Danforth GO 18:58 | 19:12:00 |
| 20260714-LW-1030 | Lakeshore West | Aldershot GO 18:03 | Exhibition GO 19:06 | 19:15:00 |

The service is a clean 30-minute alternating cadence: LE arrives at :12 and :42, LW at :15 and :45. Every Lakeshore West train calls at Exhibition GO nine minutes before Union, which directly supports the PRD's "Union/Exhibition corridor" framing.

### Schema mapping decisions (documented per task)

- `scheduledDeparture`: the departure from the **trip origin terminal** (the first stop of the GTFS trip). Rationale: it is the only trip-level departure that exists for every option without assuming where the fan boards; the fan's actual boarding station is unknown to the snapshot. The prior-stop departures are preserved in the table above if the planner later wants a "last stop before Union" field.
- `origin`: line name plus origin terminal, for example "Lakeshore West from Aldershot GO".
- `routeId`: the GTFS route_id verbatim (`06260926-LW` / `06260926-LE`) to preserve provenance back to routes.txt.
- `walkingMinutes`: placeholder **12** on every option. This value is owned by the venue simulation (Harbourview Arena walking graph, PRD section 10) and must be replaced when venue.json is built. It is flagged in the JSON's notes array.
- Times kept in GTFS HH:MM:SS format. **GTFS times exceed 24:00:00 in this feed**: 81,531 stop_times rows have arrival hour 24 or greater (example row: `20260825-19-19920,25:00:00,25:00:00,00736,14,0,0,`). None fall in the 17:00 to 19:30 extraction window, so the committed sample needs no special handling, but the PRD's rule "all time math in normalized minutes from event start" must treat hour values of 24+ correctly if any later snapshot touches post-midnight service.
- Top-level metadata: `snapshotDate` (2026-07-07, the feed date), `sourceUrl`, plus `feedVersion`, `serviceDate`, and `attribution` for provenance. The `options` array entries carry exactly the seven TransitOption fields from PRD section 8.

Output file: `D:\Projects\GameLoop\research\transit-sample.json` (10 options).

## 4. License and attribution (verbatim)

- Open data page: https://www.metrolinx.com/en/about-us/open-data
- License name as published on that page: **"Open Government Licence – Ontario – Metrolinx"** (the license PDF header renders it as "OPEN GOVERNMENT LICENCE - ONTARIO - METROLINX", version 1.0)
- License URL (PDF): https://assets.metrolinx.com/image/upload/v1663237565/Documents/Metrolinx/Open-Government-Licence-Ontario-Metrolinx.pdf
- PDF downloaded (HTTP 200, 144,302 bytes) and text extracted locally; quotes below are verbatim from the extracted text.

Grant of rights (sections 2 and 3):

> "The information provider grants you a worldwide, royalty-free, perpetual, non-exclusive licence to use the Information, including for commercial purposes, subject to the terms below."

> "You are free to: Copy, modify, publish, translate, adapt, distribute or otherwise use the Information in any medium, mode or format for any lawful purpose."

Attribution requirement (section 4):

> "You must, where you do any of the above: Acknowledge the source of the information by including any attribution statement specified by the information provider(s) and, where possible, provide a link to this licence."

Required default attribution statement (section 4, exact wording for /how-it-works):

> "Contains information licensed under the Open Government Licence - Ontario - Metrolinx."

Additional terms relevant to this project:

- Non-endorsement (section 7): "This licence does not grant you any right to use the Information in a way that suggests any official status or that the information provider endorses you or your use of the information."
- Exemption (section 6d): the licence does not cover "the names, crests, logos, or other official symbols of the information provider". This aligns with the PRD's no-logos branding rule; use plain text "GO Transit" schedule data only.
- No warranty (section 8): information is licensed "as is".

Recommended /how-it-works block: the default attribution sentence above, plus a link to the licence PDF, plus the snapshot date (2026-07-07). This satisfies both halves of section 4 (attribution statement and link to the licence).

## 5. Risk notes and follow-ups

1. Feed refresh cadence: the feed was published 2026-07-07 and expires 2026-09-04. The snapshot is stable for the July 16 demo. If the zip is re-downloaded later in the week, feed_version may change; do not re-download after committing the snapshot.
2. The download URL is a Cloudinary asset served with `Cache-Control: max-age=31536000` and an ETag; the same URL serves updated content over time (the "raw/upload" path is stable). Record the ETag with the snapshot if byte-level reproducibility matters.
3. The GO API (registration-gated) was not touched; the PRD decision to avoid a runtime dependency stands.
4. The demo prompt time mismatch (6:18 versus real 18:15/18:12 arrivals) is the only PRD text change suggested (ADJUSTMENT above).
5. Raw files kept out of git: `research/raw/` is present in `D:\Projects\GameLoop\.gitignore` (verified by reading the file).
