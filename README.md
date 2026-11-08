# room-studio

A private website for designing a room and its furniture with an agent. It holds a 3D model of the room, photos, an inventory, drawings, and animated block studies of each piece, and carries the conversation with the agent.

## How it works

```
browser (laptop or phone, tailnet only)
   |  HTTPS through Tailscale Serve; password login, then a 1-year session cookie
server (Node, no framework) ---- data dir: JSON files, photos, drawings
   |     \\_ WebSocket audio <-> Unix socket <-> hotline-calld (voice, ears, agent bridge)
   |                                  ^
   |  hotline --to AGENT              |  room-studio CLI (agent writes studies, reads inbox)
agent session  <-- Discord channel (site chat reads it with hotline's bot token)
```

Choices that may look odd:

- **Node with no framework, not Next.js.** The root disk had 3.6 GB free when this was built, and one person using a 3D page gets nothing from server rendering. `node_modules` is 45 MB.
- **No model file format.** A study is plain JSON of boxes and keyframes, so the agent can answer in minutes. Real CAD belongs to a later, separate project.
- **Strokes are stored in 0 to 1 coordinates of the image**, so the on-screen preview and the sent PNG cannot drift apart. For 3D views each stroke is also projected onto the floor, giving millimetre positions.
- **The password link is one-time.** It gets pasted into chat, so it dies when used and after 24 hours.
- **HTTPS through Tailscale Serve.** Browsers refuse the microphone over plain HTTP. Serve stays tailnet-only. Issuing the certificate does put the machine's name in public certificate logs. The server itself binds loopback and the tailnet address, never `0.0.0.0`, and plain HTTP still works for everything but calls.
- **Voice is not implemented here.** The Call button streams 16 kHz PCM to [hotline-call](https://github.com/BogdanStamenovic/hotline-call), which holds the conversation and connects `ROOM_STUDIO_AGENT` through its agent bridge. If that daemon is down, the site still works and Call says so.
- **The chat is a shim.** There is no chat system here: it reads the agent's Discord channel and delivers through `hotline --to`. hotlined ignores bot messages, so the copy posted to the channel cannot loop back.

## Install

```sh
ownbox install room-studio
```

Setup installs dependencies, writes `~/.config/room-studio/env`, and starts a systemd user unit on port 3300. Data goes to `/mnt/windows/room-studio-data` if that disk is mounted, otherwise `~/.local/share/room-studio`. Then set the two values setup cannot know, in that env file, and restart:

| Setting | Meaning |
|---|---|
| `ROOM_STUDIO_AGENT` | hotline name of the agent to notify. Empty means nobody is told about drawings or messages. |
| `ROOM_STUDIO_CHANNEL` | Discord channel id for Talk. Empty means Talk cannot show replies. |

`ownbox update room-studio --yes` keeps data and config and restarts the service. `ownbox uninstall` asks before deleting data; without a terminal it keeps it.

## Usage

```sh
room-studio setup-link            # one-time link to set the password
room-studio status                # data location, room shape, counts
room-studio room                  # measurements and the solved shape
room-studio inbox                 # unread drawings: note, image path, floor coordinates
room-studio ack ID
room-studio study put FILE [--dry-run]   # same id adds a revision
room-studio study list | study rm ID
room-studio item put FILE         # agent places items: "placed": {"x","y","z","rot"}
```

A study, in millimetres, with x and y on the floor (+y is north) and z up:

```json
{
  "id": "flap-table",
  "title": "Flap table",
  "understanding": "One line saying what I think you mean",
  "duration": 4,
  "place": { "x": 1200, "y": 800, "rot": 90 },
  "blocks": [
    { "id": "top", "label": "Top", "size": [1200, 600, 30], "pos": [0, 0, 735] },
    { "id": "flap", "size": [1200, 300, 30], "pivot": [0, -150, 0], "pos": [0, 300, 735], "rot": [-90, 0, 0] }
  ],
  "keyframes": { "flap": [{ "t": 0.5, "rot": [-90, 0, 0] }, { "t": 2.5, "rot": [0, 0, 0] }] },
  "captions": [{ "t": 0, "text": "Flap hangs down" }]
}
```

`pos` is where the block's pivot sits, relative to its `parent` if it has one. `pivot` is measured from the block's centre and defaults to the centre. Omit `place` to show the study alone on the mat.

## Render page

`/render` shows the design at finished-look quality, beside the block studies, which are unchanged and still the place to check motion.

| Mode | What it is | Works on |
|---|---|---|
| Stills | JPEGs path-traced ahead of time | Anything that shows an image; needs no WebGL |
| Look around | A path-traced 360 from inside the room; drag to look | Anything with basic WebGL |
| Orbit | Live PBR with sun shadows, and on a desktop GPU ambient occlusion and a live mirror. Sliders fold the seat and run the table through its order of motion. From outside, walls in the way are cut away | Anything with WebGL 2; a slow frame rate drops ambient occlusion and the mirror once |
| Refine | Path traces the current Orbit view on the viewer's own GPU, starting noisy and clearing over a minute or so | Desktop GPUs, from inside the room only |

The scene is built in the browser from `room.json`, `items.json` and the numbers in `web/hifi/plan.mjs`: real window holes, rounded forms, generated oak, parquet and fabric textures. Nothing is a mesh file, so no asset downloads and no build step. `plan.mjs` has no three.js in it, so `test/hifi-plan.test.mjs` checks the design against the measured room.

To make the stills, with a server running on the data directory they belong to:

```sh
node scripts/render-stills.mjs --base http://127.0.0.1:3300 --password P --out "$DATA/renders" JOBS.json
```

It drives the real page in headless Chrome on the real GPU and writes `NAME.png`, `NAME.jpg` and `manifest.json`. Each job is the arguments of `hifi.renderPT` in `web/render.js`, plus a `label` to list it and an optional `group` (`table` files it under the Table button). Copies live in `$DATA/renders`, served behind the login, and not in this repo: the repo is public and these show his room.

**Design B** is a separate option on the same page: a black steel frame with a second bed on top and a lounge arm to the door, in place of the corner box and folding seat. Its numbers are in `web/hifi/loft-plan.mjs` with a reason beside every departure from the first study, and `test/loft-plan.test.mjs` checks them against the room, the table's path and the door. `scripts/loft-study.mjs` writes its block study from those numbers, and `node scripts/loft-light.mjs` measures how much of each surface's direct view of the windows each design leaves. Figures in its stills are neutral stand-ins with a 96 cm sitting height, an estimate.

`scripts/table-study.mjs` writes the table's block study from the same `plan.mjs` numbers as the render, so `room-studio study put` keeps them in step.

Choices that may look odd:

- **The table's set has a fold-out leaf.** With a plain 700 deep tray under the closed top there is nowhere for a 184 cm person's thighs. Stowed, the leaf stands up behind the knees; raised, it folds out and lands on the front beam, so leaning on it loads steel and not the lift.
- **The table's top rides on a wall rail with a leg at the far corner, not telescopic slides.** A slide that extends 100 percent of its length sags most exactly where the load is. Rail, front roller and leg hold it at four points at every position, once the leg is down.
- **Rail bare over the radiator, duct only south of it.** A cover over the radiator would stop the heat rising.
- **Stills first, not live path tracing.** See the numbers under Limitations: a phone cannot do it, and even an RTX 4060 needs minutes.
- **Design B's posts are not where the first study had them.** The low bed reaches the north wall and the table reaches the bed, so three study posts stood inside the mattress. The deck's north edge rests on a wall angle instead, which means it is not fully freestanding.
- **Design B's piano faces west, at the arm's edge.** Against the wall a seated player's head would be 110 mm into the 1300 deck (estimate of 96 cm sitting height on a 450 bench).
- **`RANDOM_TYPE` is forced to 0 in `web/hifi/pt.mjs`.** three-gpu-pathtracer 0.0.24's default sampler left a fixed per-pixel speckle on three 0.180: noise on a flat wall measured 78.0, 73.9 and 74.8 at 25, 100 and 400 samples. With plain PCG random it is 38.0, 20.4 and 10.5, halving per four times the samples as it should.
- **Three.js stays at 0.180, the path tracer at 0.0.24.** Newer path tracer releases need three 0.185 or later, which would touch the block viewer.
- **Sky light comes through area lights in the window holes.** Nearly every sky ray from inside a room hits a wall. The lighting map holds only the sun; camera rays still see the painted sky.
- **White plaster, not brick and concrete.** He said the walls are brick and the ceiling concrete. The photos show them plastered white, so that decides the fixings, not the look.

## Tests

```sh
npm test                     # geometry, login, API
node test/browser-smoke.mjs  # the real pages in system Chrome, against throwaway data; screenshots in shots/
node test/call-smoke.mjs     # the Call button with a fake microphone and a stand-in call service
node test/render-smoke.mjs   # the render page on software GL: orbit, phone, no-WebGL fallback, and that the block page still loads
```

## Limitations

What works today: login, room shell from measurements, measurement check, fixed things on walls, photos, inventory, drawing on any view or photo, block studies with revisions, chat.

- **The Measure form handles four-sided rooms only.** Other shapes need the agent to set `polygon` in `room.json`; the viewer already draws them. `fixed` entries on those extra walls need the same route.
- **Openings do not cut holes in the wall.** Doors and windows are flat boxes on it.
- **Sloped ceilings are approximated.** Each wall's top is a straight line between corner heights, and there is no ceiling surface. Beams and bulkheads are boxes.
- **The check covers plan shape only.** With 15 mm tolerance it catches a wrong reading, not an error spread evenly across every measurement.
- **Items are placed by the agent**, not by dragging. Draw where you want them. Sized items with no position wait in a row on the mat beside the room.
- **"Inside" is an orbit from near a corner**, not a walkable view.
- **Calls are Serbian-first.** That is how hotline-call's speech recognition is set; English is misheard.
- **Calls are cut at 2 hours** by hotline-call.
- **Each spoken turn waits for the agent's whole reply**, usually seconds and sometimes tens of seconds, because the bridge reads a finished turn. Holding phrases fill the wait.
- **Measured on one test call each, 2026-11-08, with synthesized speech:** agent connected 3.6 s after media started, first audio 2.0 s after the speaker stopped (a one-line agent reply), first call from cold about 18 s extra to load speech recognition.
- **Hanging up takes about 25 s to reach the agent and free the GPU** (measured on one call; the audio socket closes at once, but the daemon notices later). Calling back inside that window has not been tested.
- **Not tested on a real phone or a real microphone**, only Chrome with a fake mic and paced synthesized speech.
- **Path-traced renders freeze during a call.** `scripts/render-stills.mjs` starts `scripts/yield-to-calls.sh`, which SIGSTOPs the job while gpu-share holds a call lease or hotline-calld has a voice leg, because at 99% GPU speech recognition took 37-43 s to load instead of 4-6 s. Frozen jobs keep their VRAM, and the check runs every 2 s, so a call's first seconds can still overlap.
- **Deploying the site drops a call in progress**, because the audio runs through its process. Check `active_calls` on hotline-calld's `/health` first.
- **One call at a time. A phone that locks may cut the mic.** The page asks the screen to stay on where the browser allows it.
- **Messages typed on the site are not verified Discord messages.** Any process on the box could post the same thing, so money and outward actions still need a message from Discord itself.
- **Talk shows the last 100 channel messages** and links image attachments rather than showing them.
- **One user, one password.** Forgotten password: `room-studio setup-link`.
- **Render page, measured 2026-11-08 on an RTX 4060 at 1440 x 810 unless noted:** 800 path-traced samples take about 200 s, and the wall still shows faint grain after a light smoothing pass. A 360 at 2880 x 1440 with 260 samples takes about 240 s and is noticeably grainier. Stills are about 180 KB as JPEG, a 360 about 720 KB. Live orbit at 1280 x 720: 5.4 ms a frame on that GPU. On software GL 900 ms low tier and 1830 ms high, and path tracing is about 5 s a sample at 640 x 360 after a 54 s compile. Those software numbers are a floor, not a phone: **no real iPhone or laptop has run this page.**
- **The live orbit is not the stills.** It has no real bounce light, so it is flatter and brighter. Judge the design on the stills.
- **Refine needs the camera inside the room** and at least a 700 px short screen edge. Phones are refused by screen size, which is a guess at what they can do.
- **Stills do not update themselves.** A design change means rerunning `scripts/render-stills.mjs`. Live orbit and Refine follow the code at once.
- **The table is a design, not an engineered machine.** Every size is a proposal, the radiator and the server's case are unmeasured, and no load, deflection or tipping calculation has been done. The motors' torque margins are hand estimates against REV's published stall figures. The location under the west windows is a proposal.
- **Design B is unverified.** No section, plate, bolt, anchor, floor load or sway has been calculated; his worst-case simulation rule still applies. Radiator, fan, switches, sockets and his sitting height are unmeasured, and any of them can move a number here. Its guard rail gaps are wider than bunk-bed rules ask, since it is meant for an adult.
- **No backups.** Measurements keep a history in the data dir, on the same disk. A deleted photo moves to `trash/` there.
