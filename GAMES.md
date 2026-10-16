# Tested games

The initial batch contains 62 games, which corresponds to 10% of the Dreamcast collection according to [Wikipedia](https://en.wikipedia.org/wiki/List_of_Dreamcast_games).

| Symbol | Meaning                        |
|:------:|--------------------------------|
|   ✅    | Works                          |
|   ❌    | Tried, and it doesn't work yet |
|   ➖    | The game has none of this type |
|   ❔    | Not tried                      |

## Tested with an existing dc-decomp-kickoff repo

These games have active dc-decomp-kickoff projects in different levels of completion.

| Game                                                                                 | Studio              | Year | Models | Textures | Skeletons | Images | Sounds | Code | Plugin                           | Notes                                                                   |
|--------------------------------------------------------------------------------------|---------------------|------|:------:|:--------:|:---------:|:------:|:------:|:----:|----------------------------------|-------------------------------------------------------------------------|
| [Boku Doraemon](https://github.com/consolesplayingconsoles/boku-doraemon-decomp)     | Sega Toys           | 2001 |   ✅    |    ✅     |     ➖     |   ✅    |   ✅    |  ✅   | [T41802M](app/src/games/T41802M) | The game has No skeletons: Only objects and rooms are in 3D             |
| [Crazy Taxi](https://github.com/consolesplayingconsoles/crazy-taxi-decomp)           | Hitmaker            | 2000 |   ✅    |    ✅     |     ✅     |   ✅    |   ✅    |  ✅   |                                  |                                                                         |
| [Illbleed](https://github.com/consolesplayingconsoles/illbleed-decomp)               | Crazy Games         | 2001 |   ✅    |    ✅     |     ✅     |   ✅    |   ✅    |  ✅   | [T45601M](app/src/games/T45601M) | Most sounds are listed but not decoded                                  |
| [Sonic Adventure](https://github.com/consolesplayingconsoles/sonic-adventure-decomp) | Sonic Team          | 1998 |   ✅    |    ✅     |     ✅     |   ✅    |   ✅    |  ✅   |                                  | Textures not mapped correctly (mapper in progress, needs deeper decomp) |
| [Virtua Tennis](https://github.com/consolesplayingconsoles/virtua-tennis-decomp)     | Hitmaker            | 2000 |   ✅    |    ✅     |     ✅     |   ✅    |   ✅    |  ✅   |                                  |                                                                         |
| [Zombie Revenge](https://github.com/consolesplayingconsoles/zombie-revenge-decomp)   | Sega AM1, Data East | 1999 |   ✅    |    ❔     |     ❔     |   ✅    |   ✅    |  ✅   |                                  |                                                                         |

## Tested without an existing dc-decomp-kickoff repo

These games were testing using the tools that both dc-decomp-kickoff and Shuriken share, without starting a decomp project.

| Game                                                 | Studio                   | Year | Models | Images | Sounds | Plugin                                 | Notes                                                                                       |
|------------------------------------------------------|--------------------------|------|:------:|:------:|:------:|----------------------------------------|---------------------------------------------------------------------------------------------|
| Ao no 6-gou - Saigetsu Hito o Matazu - Time and Tide | Sega                     | 2000 |   ✅    |   ✅    |   ✅    |                                        |                                                                                             |
| Bomber Hehhe!                                        | Fujicom                  | 2002 |   ✅    |   ✅    |   ✅    |                                        |                                                                                             |
| Bomberman Online                                     | h.a.n.d., Hudson Soft    | 2001 |   ❌    |   ✅    |   ✅    |                                        | Model format not identified                                                                 |
| Cannon Spike                                         | Psikyo                   | 2000 |   ✅    |   ❌    |   ✅    |                                        | Images are in BPE COMPRESS files, which are not decompressed yet                            |
| ChuChu Rocket!                                       | Sonic Team               | 1999 |   ✅    |   ✅    |   ✅    |                                        |                                                                                             |
| Crazy Taxi 2                                         | Hitmaker                 | 2001 |   ✅    |   ✅    |   ✅    |                                        |                                                                                             |
| Daytona USA                                          | Amusement Vision, Genki  | 2000 |   ✅    |   ✅    |   ✅    |                                        |                                                                                             |
| Dead or Alive 2                                      | Team Ninja               | 2000 |   ✅    |   ❌    |   ✅    |                                        | Only the disc cover image found                                                             |
| Densha de Go                                         | Taito                    | 2000 |   ❌    |   ✅    |   ❌    |                                        | Windows CE. Images are listed as tile sheets: the game builds each picture from 16x16 tiles |
| Donald Duck: Quack Attack                            | Ubi Soft Casablanca      | 2000 |   ❌    |   ✅    |   ✅    |                                        | Images are only backgrounds                                                                 |
| Dynamite Cop!                                        | Sega AM1                 | 1999 |   ✅    |   ✅    |   ✅    |                                        |                                                                                             |
| Ecco the Dolphin                                     | Appaloosa Interactive    | 2000 |   ❌    |   ✅    |   ✅    |                                        | Model format not identified                                                                 |
| Grand Theft Auto 2                                   | DMA Design               | 2000 |   ❌    |   ❌    |   ✅    |                                        | Images are only the browser's                                                               |
| Grandia II                                           | Game Arts                | 2000 |   ✅    |   ✅    |   ✅    |                                        |                                                                                             |
| Ikaruga                                              | Treasure                 | 2002 |   ✅    |   ✅    |   ✅    |                                        |                                                                                             |
| Marvel vs. Capcom 2                                  | Capcom                   | 2000 |   ✅    |   ✅    |   ✅    |                                        |                                                                                             |
| Metropolis Street Racer                              | Bizarre Creations        | 2000 |   ❌    |   ✅    |   ✅    |                                        | Only the browser 3D avatar loads                                                            |
| Power Stone                                          | Capcom                   | 1999 |   ✅    |   ❌    |   ✅    |                                        | Only the disc cover image                                                                   |
| Power Stone 2                                        | Capcom                   | 2000 |   ✅    |   ✅    |   ✅    |                                        |                                                                                             |
| Project Justice                                      | Capcom                   | 2000 |   ✅    |   ❌    |   ✅    |                                        | Only the disc cover image                                                                   |
| Rez                                                  | United Game Artists      | 2001 |   ✅    |   ✅    |   ✅    |                                        |                                                                                             |
| Seaman                                               | Vivarium, Jellyvision    | 1999 |   ✅    |   ✅    |   ✅    |                                        |                                                                                             |
| The House of the Dead 2                              | Sega AM1, CRI            | 1999 |   ✅    |   ❌    |   ✅    |                                        | Only the disc cover image                                                                   |
| Hydro Thunder                                        | Eurocom                  | 1999 |   ❌    |   ✅    |   ❌    |                                        |                                                                                             |
| Jet Grind Radio / Jet Set Radio                      | Smilebit                 | 2000 |   ✅    |   ✅    |   ✅    |                                        |                                                                                             |
| L.O.L. - Lack of Love                                | Love-de-Lic              | 2000 |   ✅    |   ✅    |   ✅    |                                        |                                                                                             |
| Love Hina - Totsuzen no Engage Happening             | Fortyfive                | 2000 |   ✅    |   ✅    |   ✅    |                                        |                                                                                             |
| Quake III Arena                                      | Raster Productions       | 2000 |   ✅    |   ✅    |   ✅    |                                        |                                                                                             |
| Rayman 2                                             | Ubi Pictures             | 2000 |   ❌    |   ❌    |   ✅    |                                        | Only the browser 3D avatar and an empty model load. Images are only the browser's           |
| Re-Volt                                              | Acclaim Studios London   | 1999 |   ✅    |   ✅    |   ✅    |                                        | Models are untextured; 175 of its 654 mesh files do not read                                |
| Ready 2 Rumble                                       | Midway Studios San Diego | 1999 |   ❌    |   ❌    |   ✅    |                                        | Only the disc cover image                                                                   |
| Rent a Hero No. 1                                    | Aspect                   | 2000 |   ✅    |   ✅    |   ✅    |                                        |                                                                                             |
| Roommania #203                                       | Sega                     | 2000 |   ✅    |   ✅    |   ✅    |                                        | Two textures use the Bump format, which is not decoded                                      |
| Rush 2049                                            | Midway Games West        | 2000 |   ❌    |   ✅    |   ✅    |                                        | Only the browser 3D avatar loads                                                            |
| Samba de Amigo                                       | Sonic Team               | 2000 |   ✅    |   ✅    |   ✅    |                                        |                                                                                             |
| Sega Bass Fishing                                    | SIMS                     | 1999 |   ✅    |   ❌    |   ✅    |                                        | Only the disc cover image                                                                   |
| Sega Extreme Sports                                  | Innerloop Studios        | 2000 |   ❌    |   ❌    |   ✅    |                                        | Only the browser 3D avatar loads. Models are in a custom format                             |
| Sega GT                                              | Wow Entertainment, TOSE  | 2000 |   ✅    |   ✅    |   ✅    |                                        |                                                                                             |
| Sega Worldwide Soccer Euro Edition                   | Silicon Dreams Studio    | 2000 |   ❌    |   ❌    |   ✅    |                                        | No pictures in a knwon format                                                               |
| Segagaga                                             | Hitmaker                 | 2001 |   ✅    |   ✅    |   ✅    |                                        | Only 5 images found                                                                         |
| Shadow Man                                           | Acclaim Studios Teesside | 1999 |   ❌    |   ❌    |   ✅    |                                        | Only the disc cover image found                                                             |
| Sonic Adventure 2                                    | Sonic Team USA           | 2001 |   ✅    |   ✅    |   ✅    |                                        |                                                                                             |
| Sonic Shuffle                                        | Sega, Hudson Soft        | 2000 |   ✅    |   ✅    |   ❌    |                                        |                                                                                             |
| Soulcalibur                                          | Namco                    | 1999 |   ❌    |   ✅    |   ❌    |                                        | Most images are not decoded                                                                 |
| South Park Rally                                     | Tantalus Interactive     | 2000 |   ❌    |   ❌    |   ❌    |                                        | Only the disc cover image found                                                             |
| Star Wars Demolition                                 | Luxoflux                 | 2000 |   ❌    |   ✅    |   ✅    |                                        |                                                                                             |
| Star Wars Jedi Power Battles                         | LucasArts                | 2000 |   ❌    |   ✅    |   ✅    |                                        |                                                                                             |
| Star Wars Racer                                      | LucasArts                | 2000 |   ✅    |   ✅    |   ✅    | [T23001D_50](app/src/games/T23001D_50) | Models load, but some are not built correctly by Shuriken (plugin in progress)              |
| Tee Off                                              | Bottom Up                | 1999 |   ✅    |   ✅    |   ✅    |                                        |                                                                                             |
| Tokyo Bus Guide                                      | Fortyfive                | 1999 |   ✅    |   ✅    |   ✅    |                                        |                                                                                             |
| Tomb Raider: The Last Revelation                     | Core Design              | 2000 |   ✅    |   ✅    |   ❌    |                                        | No pictures in a known format. Models are the untextured meshes of the level files          |
| Toy Story 2                                          | Traveller's Tales        | 2000 |   ❌    |   ✅    |   ✅    |                                        |                                                                                             |
| TrickStyle                                           | Criterion Games          | 1999 |   ❌    |   ✅    |   ✅    |                                        |                                                                                             |
| Virtua Fighter 3tb                                   | Sega AM2, Genki          | 1998 |   ✅    |   ❌    |   ✅    |                                        | No pictures in a known format                                                               |
| Virtua Striker 2                                     | Sega, Genki              | 1999 |   ✅    |   ❌    |   ✅    |                                        | Only the disc cover image found                                                             |

## Tested on dc-kickoff-decomp, and failed

| Game                 | Studio     | Year | Decomp | Models | Plugin | Notes                                       |
|----------------------|------------|------|:------:|:------:|--------|---------------------------------------------|
| Phantasy Star Online | Sonic Team | 2000 |   ❌    |   ✅    |        | Game code loads at runtime from other files |

## NOTES

- All games were tested, but a ✅ doesn't mean every asset of that type was found. That can't be known without a deeper analysis of each game.

- Some audio formats are tracked but not yet decoded.

- Different studios use different techniques and data formats and finding patterns for all takes time and effort. 
Some are easier to match than others and Sega games give the best results so far. 

- The tooling grows with use, so please report your findings: a fix for one game can unlock many.

- This is not a complete list: only games that have been tested are in it. If you want your game included, open an
issue and include your decomp (if any) link and Shuriken screenshots.
