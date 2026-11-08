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

## Tests

```sh
npm test                     # geometry, login, API
node test/browser-smoke.mjs  # the real pages in system Chrome, against throwaway data; screenshots in shots/
node test/call-smoke.mjs     # the Call button with a fake microphone and a stand-in call service
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
- **Deploying the site drops a call in progress**, because the audio runs through its process. Check `active_calls` on hotline-calld's `/health` first.
- **One call at a time. A phone that locks may cut the mic.** The page asks the screen to stay on where the browser allows it.
- **Messages typed on the site are not verified Discord messages.** Any process on the box could post the same thing, so money and outward actions still need a message from Discord itself.
- **Talk shows the last 100 channel messages** and links image attachments rather than showing them.
- **One user, one password.** Forgotten password: `room-studio setup-link`.
- **No backups.** Measurements keep a history in the data dir, on the same disk. A deleted photo moves to `trash/` there.
