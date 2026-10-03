# Off-grid RCB: protokół BLE węzeł ↔ telefon (v1)

Kontrakt między węzłem (docelowo nRF52840 + SX1262, np. RAK4631) a aplikacją telefonu.
Firmware i aplikacja implementują dokładnie to, co jest tutaj. Referencyjna implementacja
w TypeScript: `src/ble/protocol/` (format) oraz `src/ble/sender/nodeCore.ts` (zachowanie węzła).

## 1. Założenia

- Telefon jest wyłącznie w roli **central**. Tylko odbiera, nigdy nie rozgłasza i nie przekazuje alertów dalej.
- Węzeł jest **peripheral** i **niezaufanym kanałem transportu**. Autentyczność daje wyłącznie
  podpis Ed25519 wydawcy (RCB). Bez parowania, bez bondingu, bez szyfrowania łącza.
- Zero internetu i sieci komórkowej po stronie telefonu. Klucz publiczny wydawcy jest wbudowany w aplikację.
- Wszystkie liczby wielobajtowe są **big-endian**. Czas to sekundy Unix jako `u32`.
- Alert ma maksymalnie **200 B**, żeby zmieścić się w jednej ramce LoRa.

## 2. GATT

Jeden serwis główny.

| Element | UUID | Właściwości |
|---|---|---|
| Serwis Off-grid RCB | `ea02c142-1975-4fa3-b208-4b6639140b6a` | primary |
| INFO | `ea02c143-1975-4fa3-b208-4b6639140b6a` | read |
| ALERT | `ea02c144-1975-4fa3-b208-4b6639140b6a` | notify (CCCD) |
| CONTROL | `ea02c145-1975-4fa3-b208-4b6639140b6a` | write (with response) |

Żadna charakterystyka nie wymaga szyfrowania ani uwierzytelnienia.

## 3. Rozgłaszanie

- Typ: connectable, undirected (ADV_IND), legacy advertising (telefony z Androidem 8 nie widzą extended).
- **Główny pakiet** (21 z 31 B):
  - Flags: `02 01 06` (3 B)
  - Complete List of 128-bit Service UUIDs: `11 07` + UUID serwisu w kolejności little-endian (18 B):
    `11 07 6a 0b 14 39 66 4b 08 b2 a3 4f 75 19 42 c1 02 ea`
- **Scan response**: Complete Local Name `RCB-XXXX`, gdzie `XXXX` to 4 cyfry hex z młodszych 16 bitów `node_id`.
- Interwał: 100–250 ms. Telefon skanuje z filtrem po UUID serwisu (wymóg Androida przy zgaszonym ekranie).

## 4. Format alertu

| Offset | Rozmiar | Pole | Opis |
|---|---|---|---|
| 0 | 1 | `ver` | `0x01` |
| 1 | 1 | `key_id` | identyfikator klucza wydawcy (rotacja kluczy) |
| 2 | 4 | `alert_id` | `u32`, rośnie monotonicznie u wydawcy, `≠ 0` |
| 6 | 4 | `issued_at` | `u32`, czas nadania |
| 10 | 4 | `expires_at` | `u32`, czas wygaśnięcia, `> issued_at` |
| 14 | 1 | `severity` | `0` test, `1` info, `2` warning, `3` severe, `4` extreme |
| 15 | 1 | `category` | typ zdarzenia, sekcja 4.1 |
| 16 | 4 | `area_code` | `u32`, obszar, sekcja 4.2 |
| 20 | 1 | `text_len` | `n`, 1..115 |
| 21 | n | `text` | UTF-8 |
| 21+n | 64 | `sig` | podpis Ed25519 |

Długość całkowita = `85 + n`, czyli od 86 do 200 B. Tekst ma maks. **115 B UTF-8** (polskie znaki diakrytyczne zajmują 2 B).
UI nadawcy musi liczyć limit w bajtach UTF-8, nie w znakach.

**Tekst:** poprawny UTF-8 (bez overlong, bez surogatów), bez znaków kontrolnych C0/C1 poza `\n` (0x0A) i bez znaków
sterujących kierunkiem tekstu (U+2028, U+2029, U+202A–U+202E, U+2066–U+2069).

**Podpis:** czyste Ed25519 (RFC 8032) nad komunikatem

```
M = "OGRCB-ALERT-v1" (14 B ASCII, nietransmitowany prefiks domeny) || bajty [0 .. 21+n)
```

Prefiks domeny zapobiega użyciu podpisu z innego kontekstu. Węzeł **nie weryfikuje** i **nie modyfikuje** alertów, tylko je przechowuje i przekazuje bajt w bajt.

### 4.1 Kategoria (`category`)

| Wartość | Nazwa w kodzie | Etykieta w UI |
|---|---|---|
| 0 | `other` | Zagrożenie (inne) |
| 1 | `fire` | Pożar |
| 2 | `flood` | Powódź |
| 3 | `accident` | Wypadek |
| 4 | `medical` | Medyczne |
| 5 | `storm` | Burza |
| 6 | `strong_wind` | Silny wiatr |
| 7 | `heat` | Upał |
| 8 | `frost` | Mróz |
| 9 | `heavy_snow` | Intensywne opady śniegu |
| 10 | `chemical_hazard` | Skażenie chemiczne |
| 11 | `air_threat` | Zagrożenie z powietrza |
| 12 | `power_outage` | Brak prądu |
| 13 | `water_contamination` | Skażenie wody |
| 14 | `missing_person` | Zaginięcie osoby |
| 15 | `avalanche` | Zagrożenie lawinowe |
| 16 | `mountain_danger` | Zagrożenie w górach |
| 17 | `water_rescue` | Ratownictwo wodne |

- Lista jest tylko dopisywana. Nowe wartości dostają kolejne numery, a istniejących się nie zmienia.
- Odbiorca pokazuje nieznaną wartość jako `other` i **nie odrzuca** alertu. Starsza aplikacja nie może zgubić
  prawdziwego alertu tylko dlatego, że wydawca dodał nową kategorię. Bajt jest objęty podpisem, więc węzeł go nie podmieni.
- Ikony i kolory kategorii to sprawa UI. Protokół przenosi tylko numer.

### 4.2 Obszar (`area_code`)

Kody TERYT (GUS) zapisane jako liczba `u32`:

| Wartość | Znaczenie | Przykład |
|---|---|---|
| `0` | cała Polska | `0` |
| 2..32, parzyste | województwo, kod TERYT `WOJ` (2 cyfry) | `12` małopolskie |
| `WWPPGGR` | gmina, 7-cyfrowy kod TERYT: `WW` województwo, `PP` powiat, `GG` gmina, `R` rodzaj gminy | `1261011` Kraków |

- Kod gminy zapisany liczbowo traci wiodące zero dla województw 02–08: TERYT `0201011` to `area_code` = `201011`.
- Poprawny kod gminy mieści się w zakresie 200000..3299999, jego prefiks `WW` to istniejące województwo,
  a ostatnia cyfra `R` jest z zakresu 1–5 lub 8–9 (dzielnice miast). Wartości spoza konwencji odbiorca odrzuca
  (`bad_area`), bo podpisany alert z błędnym obszarem to błąd wydawcy, a nie nowa funkcja.
- Powiat (4 cyfry) nie jest obsługiwany w v1.

Kody województw (`src/ble/regions.ts`, tabela `VOIVODESHIPS`, nazwa → kod dla pickera w UI):

| Kod | Województwo | Kod | Województwo |
|---|---|---|---|
| 2 | Dolnośląskie | 18 | Podkarpackie |
| 4 | Kujawsko-pomorskie | 20 | Podlaskie |
| 6 | Lubelskie | 22 | Pomorskie |
| 8 | Lubuskie | 24 | Śląskie |
| 10 | Łódzkie | 26 | Świętokrzyskie |
| 12 | Małopolskie | 28 | Warmińsko-mazurskie |
| 14 | Mazowieckie | 30 | Wielkopolskie |
| 16 | Opolskie | 32 | Zachodniopomorskie |

Pokrycie: alert dla `0` dotyczy wszystkich, alert dla województwa dotyczy jego gmin, a alert dla gminy tylko tej gminy
(`areaCovers()`). W PoC telefon pokazuje wszystkie poprawne alerty. Filtrowanie po lokalizacji użytkownika to decyzja UI.

### Reguły odbiorcy

Telefon pokazuje alert tylko wtedy, gdy przejdzie wszystkie warunki:

1. długość 86..200 B i `85 + text_len == długość`
2. `ver == 1`, `alert_id != 0`, `severity <= 4`, `expires_at > issued_at`
3. `area_code` zgodny z sekcją 4.2 (`category` nie jest walidowana, nieznana wartość = `other`)
4. tekst spełnia reguły powyżej
5. `key_id` jest na liście zaufanych kluczy aplikacji
6. `expires_at > teraz` (bez tolerancji)
7. `issued_at <= teraz + 300 s` (tolerancja zegara 5 min)
8. poprawny podpis
9. `alert_id` nie był wcześniej zaakceptowany (pamięć trwała do wygaśnięcia + 5 min)

`alert_id` trafia do zbioru „widzianych" dopiero po poprawnym podpisie. Fałszywka z cudzym ID nie blokuje prawdziwego alertu.

## 5. Ramki ALERT (notify)

Alert dzielony jest na fragmenty. Każda notyfikacja zawiera jeden fragment:

| Offset | Rozmiar | Pole |
|---|---|---|
| 0 | 4 | `alert_id` (jak w alercie) |
| 4 | 1 | `frag_idx` (0..`frag_count`-1) |
| 5 | 1 | `frag_count` (1..15) |
| 6 | 1..chunk | dane |

- `chunk = min(ATT_MTU − 3, 244) − 6`.
- Najgorszy przypadek: MTU 23, czyli 20 B notyfikacji i **14 B danych**. Alert 200 B daje 15 fragmentów.
- MTU 247 daje `chunk` 238, więc każdy alert mieści się w jednej ramce.
- Węzeł liczy `chunk` z wynegocjowanego MTU danego połączenia. Jeśli go nie zna, używa MTU 23.
- Wszystkie fragmenty oprócz ostatniego mają dokładnie `chunk` bajtów. Węzeł wysyła je kolejno i czeka na
  potwierdzenie wysłania poprzedniego (np. `BLE_GATTS_EVT_HVN_TX_COMPLETE`) przed następnym.

### Składanie po stronie telefonu

- Bufor na każdy `alert_id`, maks. 4 równolegle (najstarszy jest wyrzucany).
- Duplikat fragmentu jest ignorowany, a sprzeczny `frag_count` usuwa bufor.
- Suma danych > 200 B, nierówne rozmiary fragmentów lub zły nagłówek powodują odrzucenie.
- Brak postępu przez 5 s: telefon wysyła `RESEND` z bitmapą brakujących fragmentów, maks. 2 razy, potem porzuca bufor.
- Złożone bajty przechodzą reguły z sekcji 4. Uszkodzenie przy składaniu wychodzi jako zły podpis.

## 6. INFO (read)

10 B (telefon akceptuje dłuższe i ignoruje nadmiar, dla zgodności w przód):

| Offset | Rozmiar | Pole |
|---|---|---|
| 0 | 1 | `proto_ver` = `0x01` |
| 1 | 4 | `node_id` (`u32`) |
| 5 | 4 | `latest_alert_id`: największe `alert_id` wśród niewygasłych, `0` gdy brak |
| 9 | 1 | `stored_count`: liczba niewygasłych alertów (maks. 255) |

## 7. CONTROL (write with response)

| Opcode | Długość | Treść | Działanie węzła |
|---|---|---|---|
| `0x01` HELLO | 6 B | `proto_ver u8`, `last_known_id u32` | wysyła wszystkie niewygasłe alerty z `alert_id > last_known_id`, rosnąco po `alert_id` |
| `0x02` RESEND | 7 B | `alert_id u32`, `missing u16` | wysyła ponownie fragmenty `i`, dla których bit `i` jest ustawiony; `0xFFFF` = wszystkie |

Kody błędów ATT zwracane na zapis:

| Kod | Znaczenie |
|---|---|
| `0x80` | nieobsługiwana `proto_ver` |
| `0x81` | nieznany opcode albo zła długość |
| `0x82` | `alert_id` z RESEND nieznany lub wygasły |

Telefon traktuje każdy błąd zapisu jako sygnał do ponownego połączenia. Symulator na telefonie (munim-bluetooth)
nie umie zwrócić własnych kodów, więc zwraca ogólny `0x06 Request Not Supported`.

## 8. Przebieg połączenia

```
telefon                                   węzeł
  | -- skan (filtr: UUID serwisu) -------> |  ADV_IND
  | -- CONNECT (bez parowania) ----------> |
  | -- ATT Exchange MTU (247) -----------> |
  | -- read INFO ------------------------> |  sprawdza proto_ver
  | -- write CCCD(ALERT) = 0x0001 -------> |  subskrypcja
  | -- write CONTROL HELLO(1, last_id) --> |
  | <------- notify ALERT (zaległe) ------ |
  | <------- notify ALERT (nowe z mesh) -- |  na bieżąco
  | -- write CONTROL RESEND (gdy luka) --> |
```

- Kolejność „subskrypcja przed HELLO" jest obowiązkowa.
- Węzeł **nie wysyła nic** do danego połączenia przed otrzymaniem HELLO. Jeśli HELLO przyjdzie przed CCCD, węzeł wstrzymuje wysyłkę do momentu włączenia CCCD.
- Nowy alert z sieci LoRa węzeł wysyła od razu do wszystkich połączeń po HELLO.
- Po rozłączeniu stan HELLO danego połączenia wygasa.
- Telefon łączy się ponownie sam, z odstępami 1, 2, 4, 8 … 60 s (z losowym rozrzutem w górnej połowie przedziału). Po udanym HELLO licznik się zeruje.
- `last_known_id` to największe `alert_id` zaakceptowane przez telefon. Duplikaty i tak odrzuca telefon, więc węzeł nie musi pamiętać stanu telefonów.

## 9. Wymagania dla węzła (firmware)

- Przechowywanie: co najmniej 16 ostatnich niewygasłych alertów (RAM wystarczy), usuwanie po `expires_at`.
  Węzeł potrzebuje zegara tylko do sprzątania. Bez RTC może trzymać alerty do wyparcia przez nowsze.
- Co najmniej 1 równoczesne połączenie, zalecane 2–4.
- Nie wymagać parowania. Nie zmieniać bajtów alertu.
- Ten sam alert z mesh odebrany drugi raz (to samo `alert_id`) nie jest ponownie rozsyłany do telefonów.

## 10. Wektory testowe

Klucz **TESTOWY**, publicznie znany (seed `01 02 03 … 20`). Nie używać produkcyjnie. Wygenerowane przez
`npx tsx tools/fake-node/cli.ts vectors`, które są też w `src/ble/__tests__/vectors.json`
(test pilnuje, żeby się zgadzały).

```
seed (secret key) : 0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f20
public key        : 79b5562e8fe654f94078b112e8a98ba7901f853ae695bed7e0e3910bad049664
key_id            : 1
```

### Alert poprawny

Pola: `alert_id` = 1001, `issued_at` = 1767225600 (2026-01-01T00:00:00Z), `expires_at` = 4102444800
(2100-01-01T00:00:00Z), `severity` = 3 (severe), `category` = 2 (flood), `area_code` = 1465011 (gmina Warszawa),
tekst „TEST: Ostrzeżenie powodziowe. Zostań w domu." (46 B UTF-8). Długość 131 B.

```
0101000003e96955b900f4865700030200165ab32e544553543a204f7374727a65c5bc656e696520706f776f647a696f77652e205a6f737461c584207720646f6d752e104eff021038d3f8c093edfdddd46bdce7246772d0e4ddfc24a16d0ecb763d68d71a12adf75e84a7c333db37fd864cf899abf03da54b241d3c285902612e9c0d
```

Rozbiór: `01` ver · `01` key_id · `000003e9` alert_id · `6955b900` issued_at · `f4865700` expires_at ·
`03` severity · `02` category · `00165ab3` area_code · `2e` text_len · tekst (46 B) · podpis (64 B, od `104eff02…`).

Komunikat podpisywany (prefiks domeny + 67 B):

```
4f475243422d414c4552542d76310101000003e96955b900f4865700030200165ab32e544553543a204f7374727a65c5bc656e696520706f776f647a696f77652e205a6f737461c584207720646f6d752e
```

Ramki ALERT przy MTU 23 (10 fragmentów, każdy ≤ 20 B, ostatni niepełny):

```
000003e9000a0101000003e96955b900f4865700
000003e9010a030200165ab32e544553543a204f
000003e9020a7374727a65c5bc656e696520706f
000003e9030a776f647a696f77652e205a6f7374
000003e9040a61c584207720646f6d752e104eff
000003e9050a021038d3f8c093edfdddd46bdce7
000003e9060a246772d0e4ddfc24a16d0ecb763d
000003e9070a68d71a12adf75e84a7c333db37fd
000003e9080a864cf899abf03da54b241d3c2859
000003e9090a02612e9c0d
```

Przy MTU 247 jest jedna ramka: `000003e90001` + cały alert.

### Alert z błędnym podpisem (ostatni bit podpisu odwrócony, musi zostać odrzucony)

```
0101000003e96955b900f4865700030200165ab32e544553543a204f7374727a65c5bc656e696520706f776f647a696f77652e205a6f737461c584207720646f6d752e104eff021038d3f8c093edfdddd46bdce7246772d0e4ddfc24a16d0ecb763d68d71a12adf75e84a7c333db37fd864cf899abf03da54b241d3c285902612e9c0c
```

### Alert wygasły (poprawny podpis, `alert_id` 1002, ważny 2025-01-01 00:00–01:00 UTC, musi zostać odrzucony)

```
0101000003ea6774858067749390030200165ab32e544553543a204f7374727a65c5bc656e696520706f776f647a696f77652e205a6f737461c584207720646f6d752e4d8876ad1ce1cc29c7fb69ee1051ccbba4dbf3aefccbea0ac4d3f3185ba9ec5de042d110f59b036c71b03ab0462629a0ad6a3b635eab92bf9b72577fb848fc03
```

### Alert maksymalny (200 B, `category` = 1 fire, `area_code` = 12 małopolskie, tekst 115 × „A", `alert_id` 1003)

```
0101000003eb6955b900f486570003010000000c7341414141414141414141414141414141414141414141414141414141414141414141414141414141414141414141414141414141414141414141414141414141414141414141414141414141414141414141414141414141414141414141414141414141414141414141414141414141414141eba9ed8647f84935c3225bc61be4fd2cca4ad9cab4e8a4377f1167e30cfa71c9c505b613a861065cc8fc25100f459068d0b2717a72ecde2d8ef5d5fd8eb47104
```

### Wiadomości sterujące

```
INFO   (node_id 0x5e1d0001, latest 1001, stored 1) : 015e1d0001000003e901
HELLO  (proto 1, last_known_id 1000)               : 0101000003e8
RESEND (alert 1001, brak fragmentów 0 i 2)         : 02000003e90005
```

## 11. Wersjonowanie

- `proto_ver` (INFO, HELLO) dotyczy GATT i ramek, a `ver` w alercie dotyczy formatu alertu. Zmieniają się niezależnie.
- Nowe opcode'y CONTROL i dłuższe INFO są zmianą zgodną wstecz. Zmiana ramek lub alertu wymaga podbicia wersji.
