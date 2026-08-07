# Parkoló foglalási rendszer — Rendszerterv

Ez a dokumentum azt írja le, hogyan épül fel a megoldás: a technológiai választásokat, az adatmodellt, a tervezési döntéseket és a projekt szerkezetét.

## Áttekintés

Backend szolgáltatás parkolóhelyek és időhöz kötött foglalások kezelésére, ahol az átfedések kiszűrése adatbázis szinten van kikényszerítve. Rövid határidős feladatként készült, a helyességre, a tesztelhetőségre és az egyparancsos indításra fókuszálva.

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
