# Parkoló foglalási rendszer

Backend szolgáltatás parkolóhelyek és időhöz kötött foglalások kezelésére, ahol az átfedések kiszűrése adatbázis szinten van kikényszerítve. Rövid határidős feladatként készült, a helyességre, a tesztelhetőségre és az egyparancsos indításra fókuszálva.

## Funkciók

- Parkolóhelyek nyilvántartása és listázása
- Foglalások létrehozása egy időintervallumra (kezdet / vég)
- Döntés a foglalás elfogadhatóságáról (átfedésmentesség + üzleti szabályok)
- Adott parkolóhely foglalásainak lekérdezése
- Foglalás lemondása (soft delete, az előzmény megőrzésével)
- Interaktív API-dokumentáció Swagger UI-on keresztül

## Technológiai stack

| Terület | Választás |
|---|---|
| Nyelv / futtatókörnyezet | TypeScript (ESM), Node.js 22 |
| Webes keretrendszer | Fastify 5 |
| Validáció + OpenAPI | TypeBox + `@fastify/type-provider-typebox` |
| ORM | Prisma 7 a `@prisma/adapter-pg` driver adapterrel |
| Adatbázis | PostgreSQL 16 |
| Tesztelés | Vitest 4 (unit + integráció `app.inject`-tel) |
| Orkesztráció | Docker Compose |
| API-dokumentáció | Swagger UI (`/docs`) |

## Első lépések

### Előfeltételek

- Docker és Docker Compose

Ez az egyetlen követelmény — az adatbázis, a migrációk, a seed és a szerver együtt állnak fel.

### A teljes rendszer indítása egyetlen paranccsal

```bash
docker compose up --build
```

Ez elindítja a PostgreSQL-t, megvárja, amíg egészséges (healthy) állapotba kerül, majd a backend konténerben sorban lefuttatja:

1. `prisma migrate deploy` — alkalmazza a sémát és az átfedés-kiszűrő constraintet
2. a seed scriptet — beszúrja a minta parkolóhelyeket (idempotens)
3. a Fastify szervert — a `3000`-es porton figyel

Amint feláll:

- API alap-URL: `http://localhost:3000`
- Swagger UI: `http://localhost:3000/docs`

### Indítás tiszta lapról

Az adatbázis egy perzisztens Docker-volumenben él. Ennek törléséhez és a nulláról való újraseedeléshez (pl. a mintaadatok módosítása után):

```bash
docker compose down -v && docker compose up --build
```

## API-referencia

| Metódus | Útvonal | Leírás |
|---|---|---|
| `GET` | `/parking-spots` | Az összes parkolóhely listázása |
| `GET` | `/parking-spots/:id/reservations` | Egy hely **aktív** foglalásai, növekvő kezdőidő szerint |
| `POST` | `/reservations` | Foglalás létrehozása |
| `POST` | `/reservations/:id/cancel` | Foglalás lemondása (soft delete) |
| `GET` | `/docs` | Swagger UI |

### `POST /reservations`

Kérés törzse:

```json
{
  "parkingSpotId": 1,
  "startTime": "2026-01-01T10:00:00Z",
  "endTime": "2026-01-01T12:00:00Z"
}
```

Válaszok:

| Státusz | Mikor |
|---|---|
| `201 Created` | A foglalás létrejött |
| `400 Bad Request` | Érvénytelen törzs, múltbeli kezdés, a kezdet nem korábbi a végnél, vagy egy ELECTRIC hely 3 óránál hosszabb foglalása |
| `404 Not Found` | A hivatkozott parkolóhely nem létezik |
| `409 Conflict` | Az időintervallum átfed egy meglévő aktív foglalást azon a helyen |

### `POST /reservations/:id/cancel`

A foglalás státuszát `CANCELLED`-re állítja (a sor megmarad). `404`-et ad, ha nincs ilyen id-jű foglalás, `400`-at érvénytelen id-re.

### `GET /parking-spots/:id/reservations`

Csak az `ACTIVE` foglalásokat adja vissza (a lemondottak kimaradnak), kezdőidő szerint rendezve. `404`-et ad, ha a hely nem létezik, és `400`-at érvénytelen id-re.

## Adatmodell

```prisma
enum SpotType {
  STANDARD
  ELECTRIC
  DISABLED
}

enum ReservationStatus {
  ACTIVE
  CANCELLED
}

model ParkingSpot {
  id           Int           @id @default(autoincrement())
  code         String        @unique
  type         SpotType      @default(STANDARD)
  createdAt    DateTime      @default(now()) @db.Timestamptz
  reservations Reservation[]
}

model Reservation {
  id            Int               @id @default(autoincrement())
  parkingSpot   ParkingSpot       @relation(fields: [parkingSpotId], references: [id])
  parkingSpotId Int
  startTime     DateTime          @db.Timestamptz
  endTime       DateTime          @db.Timestamptz
  status        ReservationStatus @default(ACTIVE)
  createdAt     DateTime          @default(now()) @db.Timestamptz
}
```

## Tervezési döntések

**Az átfedés kiszűrése az adatbázisban él.** Egy PostgreSQL exclusion constraint (`EXCLUDE USING gist`) elutasít bármely két aktív foglalást ugyanazon a helyen, ha az időintervallumaik átfednek:

```sql
EXCLUDE USING gist (
  "parkingSpotId" WITH =,
  tstzrange("startTime", "endTime", '[)') WITH &&
) WHERE (status = 'ACTIVE')
```

Ha ezt az adatbázis rétegben kényszerítjük ki, versenyhelyzet-biztos lesz: két egyidejű kérés ugyanarra a helyre nem járhat mindkettő sikerrel — ezt egy alkalmazásszintű „előbb ellenőrzöm, aztán beszúrom" megközelítés nem tudja garantálni. Az elérhetőség egyetlen igazságforrása az adatbázis.

**Fél-nyílt intervallumok (`[)`).** Egy 12:00-kor végződő és egy 12:00-kor kezdődő foglalás nem ütközik. A fél-nyílt tartományok elkerülik a határmenti (off-by-one) ütközéseket.

**Soft delete parciális constrainttel.** A lemondás `status = CANCELLED`-re állít a sor törlése helyett, megőrizve az előzményt. Az exclusion constraint a `WHERE (status = 'ACTIVE')` feltétellel van szűkítve, így egy lemondott foglalás már nem blokkolja a helyet — ugyanarra az intervallumra egy új foglalás ekkor elfogadható.

**`timestamptz` oszlopok.** Az időoszlopok `@db.Timestamptz` típusúak. Az időzóna-helyességen túl ez teszi a `tstzrange(...)` kifejezést immutable-lé, ami feltétele annak, hogy a GiST exclusion constraint belsejében használható legyen.

**`buildApp()` factory.** A Fastify példány egy factory-ban áll össze, amely nem hív `listen()`-t, így a tesztek `app.inject()`-tel tudják meghajtani a szervert socket nyitása nélkül, míg a szerver belépési pontja meghívja a `buildApp()`-ot, majd figyelni kezd.

**Egy séma, két feladat.** A route-sémák egyszer, TypeBox-ban vannak megírva, és egyszerre szolgálják a futásidejű kérés-validációt és a generált OpenAPI-dokumentációt.

**`ELECTRIC` helyek és a `SpotType` enum.** A `type` mező előretekintő sémamunka; az MVP egyetlen üzleti szabályhoz használja (elektromos hely legfeljebb 3 órára foglalható), és teret hagy a jövőbeli, helytípus-specifikus logikának.

## Tesztelés

```bash
npm test
```

Egy `pretest` hook előkészít egy izolált teszt-adatbázist (`parking_test_db`), és alkalmazza rá a migrációkat, így a parancs önellátó — csak azt igényli, hogy a Docker PostgreSQL szolgáltatás elérhető legyen.

A tesztsor három réteget fed le:

- **Unit tesztek** a foglalás-validációs logikára, injektálható `now`-val a determinisztikus időellenőrzésekhez.
- **API-validációs tesztek** `app.inject()`-en keresztül, adatbázis érintése nélkül.
- **Integrációs tesztek** valódi PostgreSQL ellen, amelyek az exclusion constraintet végponttól végpontig kipróbálják: sikeres foglalás (201), átfedés elutasítása (409), lemondott foglalás felszabadítja a helyet, érintkező határok nem ütköznek, helyenkénti szűrés, valamint a lemondási és üzleti szabály útvonalak.

Az integrációs tesztek minden teszt előtt truncate-elik a táblákat az izolációért, és a teszt-fájlok párhuzamossága ki van kapcsolva, hogy a közös adatbázist ne módosítsák egyidejűleg.

## Projektstruktúra

```
prisma/
  schema.prisma          # adatmodell
  migrations/            # SQL migrációk, köztük az exclusion constraint
  seed.ts                # idempotens mintaadatok
src/
  app.ts                 # buildApp() factory: pluginok, route-ok, hibakezelő
  server.ts              # belépési pont: buildApp() + listen + graceful shutdown
  plugins/prisma.ts      # Prisma kliens a pg driver adapterrel
  routes/                # parking-spots és reservations route-ok (TypeBox sémák)
  services/              # foglalás-validáció és üzleti szabályok
tests/                   # unit, API és DB integrációs tesztek
docker-compose.yml
Dockerfile
```

## Környezeti változók

| Változó | Használja | Megjegyzés |
|---|---|---|
| `DATABASE_URL` | app, Prisma CLI | A futó rendszerhez a Docker Compose automatikusan biztosítja; lokális (nem Docker) fejlesztéshez `.env`-ben, tesztekhez `.env.test`-ben állítandó |
| `PORT` | szerver | Alapértelmezés: `3000` |

A várt formátumot lásd a `.env.example` fájlban. A `docker-compose.yml`-ben szereplő hozzáférési adatok csak lokális fejlesztéshez valók, nem éles környezetre szántak.
