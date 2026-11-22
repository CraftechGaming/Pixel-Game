# Pixel Realms

A 3D block game you play in the browser. Pick the kind of world you want:

- **Survival**: mine blocks to collect them, craft tools, and build a home. Watch your hearts.
- **Creative**: every block, flying, and instant building.
- **Parkour**: a party race against eleven rivals through wobbly obstacle courses.

Everything (the 3D engine, textures, characters and sounds) is made in code. There are no image or audio files and no libraries.

## Play

Open `index.html` in a recent browser (it needs WebGL 2). No install, build step or server.

To get one self-contained file you can share or keep offline:

```sh
node tools/bundle.js        # writes dist/pixel-realms.html
```

## Survival

- Hold left click (or the pickaxe button on touch) to mine. The block pops out and you pick it up.
- Start by mining a tree. Open **Inventory** (`E`) to turn logs into planks and sticks, then make a pickaxe.
- Tools come in wood, stone, iron and gem. Stone needs a pickaxe, iron ore needs a stone pickaxe, and gold and gems need iron.
- Cook ore, sand and clay with coal to get ingots, glass and bricks.
- You have 10 hearts. Falling too far, lava, cactus and running out of air hurt. Hearts come back slowly, faster if you eat apples or bread.
- Sleep in a bed to skip the night and set your spawn point.

There are about 60 recipes: tools, torches, doors, ladders, fences, beds, chests, lanterns, dyed cloth, roofs, bricks, a **House Seed** that grows a whole cottage, and a **Wonder Seed** that grows a surprise.

## Creative

Every block is available from **Blocks** (`E`). Press `F` to fly, `Space` to rise and `Shift` to sink. Blocks break in one click.

## The world

Each seed makes the same infinite world every time:

- Plains, forest, cherry grove, desert, snowy tundra, mountains, beaches and oceans
- Caves with coal, iron, gold and gem ores, and lava deep down
- Villages with houses, a well, farms, lamp posts and villagers who give tips
- A city of towers with lit windows, ladders to every roof, street lamps and little parks
- Flowing water, a day and night cycle with sunrises, stars and clouds, and animals

## Parkour

Race eleven bots across courses floating in the sky. Jump the spinning sweepers, dodge the swinging hammers and side pushers, ride moving platforms, run up conveyor belts, bounce on pads and cross crumbling tiles. Falling off sends you back to the last checkpoint.

| Course | What's in it |
| --- | --- |
| Block Rush | Stepping stones, a sweeper, a bounce climb and crumbling tiles |
| Hammer Hall | Swinging hammers and side pushers |
| Conveyor Chaos | Conveyor belts, moving platforms and a double sweeper |
| Tumble Tower | Stairs and bounce pads up into the sky |
| Lucky Mix | A new random course every time |

The **Knockout Cup** is three rounds: the top 8 of 12 go through, then the top 4, then the first across the line in the final wins the crown.

## Controls

| Keyboard and mouse | Action |
| --- | --- |
| `W` `A` `S` `D` | Move |
| Mouse | Look (click the game first) |
| `Space` | Jump, swim up, climb ladders |
| `Shift` | Run (fly down in Creative) |
| Left click | Hold to mine |
| Right click | Place a block, eat, open a door, sleep |
| `1`–`9`, wheel | Choose a hotbar slot |
| `E` | Inventory and crafting (all blocks in Creative) |
| `F` | Fly (Creative) |
| `V` | First or third person |
| `C` | Cinematic camera |
| `R` | Back to the last checkpoint (Parkour) |
| `Esc` | Menu |

On phones and tablets: drag on the left side to walk, drag on the right to look, tap to place, hold to mine, and use the jump button.

Survival and Creative worlds save in your browser every minute and when you open the menu. Choose **Continue** to pick up where you left off.

## Project layout

| File | Purpose |
| --- | --- |
| `js/util.js`, `js/math3d.js` | Math, seeded randomness, noise, matrices |
| `js/blocks.js` | Blocks, items, tools, recipes and the procedural textures |
| `js/world.js` | Chunks, block access, water flow, plant growth, timed blocks |
| `js/terrain.js` | Terrain, biomes, caves, ores, trees, villages and the city |
| `js/mesher.js` | Chunk meshes with smooth light, torch light and shading |
| `js/gl.js` | WebGL 2 renderer: chunks, sky, clouds, water, models |
| `js/entities.js` | Physics, the bean characters, animals, item drops, particles |
| `js/parkour.js` | Obstacles, course builder, racer bots and race rules |
| `js/input.js` | Keyboard, mouse look and touch controls |
| `js/ui.js`, `css/style.css` | Title screen, HUD, inventory, crafting, menus |
| `js/save.js` | Saving and loading worlds |
| `js/audio.js` | Synthesised sound effects and music |
| `js/main.js` | Game loop, modes, camera, mining and building |
