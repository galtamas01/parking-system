# Parkoló foglalási rendszer — Felhasználói kézikönyv

Ez a dokumentum azt írja le, hogyan kell a rendszert elindítani és használni: a funkciókat, az indítás lépéseit, az API-t, a tesztek futtatását és a konfigurációt.

## Áttekintés

Backend szolgáltatás parkolóhelyek és időhöz kötött foglalások kezelésére, ahol az átfedések kiszűrése adatbázis szinten van kikényszerítve.

## Funkciók

- Parkolóhelyek nyilvántartása és listázása
- Foglalások létrehozása egy időintervallumra (kezdet / vég)
- Döntés a foglalás elfogadhatóságáról (átfedésmentesség + üzleti szabályok)
- Adott parkolóhely foglalásainak lekérdezése
- Foglalás lemondása (soft delete, az előzmény megőrzésével)
- Interaktív API-dokumentáció Swagger UI-on keresztül

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

## Környezeti változók

| Változó | Használja | Megjegyzés |
|---|---|---|
| `DATABASE_URL` | app, Prisma CLI | A futó rendszerhez a Docker Compose automatikusan biztosítja; lokális (nem Docker) fejlesztéshez `.env`-ben, tesztekhez `.env.test`-ben állítandó |
| `PORT` | szerver | Alapértelmezés: `3000` |

A várt formátumot lásd a `.env.example` fájlban. A `docker-compose.yml`-ben szereplő hozzáférési adatok csak lokális fejlesztéshez valók, nem éles környezetre szántak.
