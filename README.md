# Pixel Realms

A 2D pixel-art sandbox you play in the browser. Build homes block by block, grow
anything from seeds, and explore a seeded world with villages, a city, water,
caves and nine parkour courses. The world opens with a cinematic fly-through.

Everything is drawn and synthesised in code: there are no image or audio files.

## Play

Open `index.html` in a modern browser. No install, build step or server needed.

To get a single file you can send to someone or keep offline:

```sh
node tools/bundle.js        # writes dist/pixel-realms.html
```

The game also works as-is on GitHub Pages or any static host.

## What's in a world

- **Seeds.** Type any word or number on the title screen. The same seed always
  builds the same world, so you can share a seed with friends.
- **Villages.** Two villages with houses, a well, farms, a market stall, a
  chapel, lamp posts and villagers who chat with you. Building styles follow the
  biome (oak, birch, pine, cherry or desert sandstone).
- **City.** Towers with lit windows, ladders up to every roof, street lamps,
  cars driving through, a park with a fountain and a skyline in the distance.
- **Water.** Water flows downhill and spreads out. Oceans sit at both ends of
  the world and lakes appear in between. Water Springs make endless water and
  Sponges soak it up.
- **Nine parkour courses**, each a different kind of challenge:

  | Course | Challenge |
  | --- | --- |
  | Meadow Hops | Floating platforms, a warm-up near spawn |
  | Frost Run | Slippery ice |
  | Lava Leap | Basalt pillars over a lava pit |
  | Bounce Castle | Bounce pads launch you to high ledges |
  | Crumble Sky | Platforms fall away after you land |
  | Ladder Tower | A 46-block climb of ladders, ledges and pads |
  | Speed Way | Speed pads fling you over long gaps |
  | Cloud Walk | A tall ladder, then a walk across the clouds |
  | Rooftop Rush | Jumping between city rooftops |

  Courses keep your best time per seed. Every generated jump is checked to be
  possible with the game's physics.
- **Biomes:** plains, forest, desert, snowy tundra, mountains, cherry grove,
  beaches and oceans, plus caves with ores, crystals and deep lava.
- **Day, night and weather.** A ten-minute day with sunrise and sunset, stars,
  rain and snow, fireflies at night and chimney smoke in the villages.

## Grow anything

Plant seeds on grass, dirt or farmland. Plants grow faster near water, on
farmland and in the rain. Use Fertilizer to grow a plant right away.

| Seed | Grows into |
| --- | --- |
| Wheat, carrot, corn, tomato, berries | Crops with several growth stages |
| Pumpkin, melon | A pumpkin or melon block |
| Rose, tulip, daisy, bluebell, sunflower | Flowers |
| Oak, birch, pine, cherry, palm saplings | Full trees, with a growth animation |
| Sugar cane, bamboo, cactus | Taller and taller stalks |
| Mushroom | A giant mushroom |
| House Seed | A whole cottage with furniture |
| Tower Seed | A lookout tower |
| Wonder Seed | A surprise: rainbow tree, crystal spire, giant sunflower, fountain and more |

## Controls

| Keyboard and mouse | Action |
| --- | --- |
| `A` `D` | Walk |
| `Space` / `W` | Jump (W also climbs ladders and swims up) |
| `S` | Climb down, drop through platforms |
| `Shift` | Run |
| Left click | Dig |
| Right click | Place a block, sleep in a bed, light a Boom Block |
| `1`–`9`, mouse wheel | Choose a hotbar slot |
| `E` | All blocks and items |
| `M` | World map and travel |
| `F` | Fly |
| `Tab` | Back wall mode (build walls behind you) |
| `C` | Cinematic camera |
| `R` | Back to the last parkour checkpoint |
| `+` `-` | Zoom |
| `Esc` | Menu |

On phones and tablets, on-screen buttons handle walking and jumping, and a
Dig / Build button sets what tapping the world does.

Your world saves in the browser automatically every minute and when you open the
menu. Choose **Continue** on the title screen to pick up where you left off.

## Project layout

| File | Purpose |
| --- | --- |
| `js/util.js` | Math, seeded random numbers, noise, colours, storage |
| `js/blocks.js` | Block list and the procedural pixel-art textures |
| `js/world.js` | Block storage, water flow, plant growth, lighting |
| `js/worldgen.js` | Terrain, biomes, caves, lakes and where everything goes |
| `js/structures.js` | Trees, houses, villages, city towers, parkour courses |
| `js/entities.js` | Physics, the player, villagers, animals, cars |
| `js/particles.js` | Dust, splashes, sparkles, smoke, fireworks |
| `js/render.js` | Sky, parallax, blocks, water, light and weather |
| `js/cinematic.js` | Intro fly-through, title cards, letterbox and fades |
| `js/parkour.js` | Flags, timer, checkpoints and best times |
| `js/audio.js` | Synthesised sound effects and music |
| `js/ui.js`, `css/style.css` | HUD, hotbar, block picker, map and menus |
| `js/main.js` | Game loop and how everything fits together |
