# Room overhaul: outline

Room Studio is the private site where we design the room together. The work runs in nine stages.
Nothing gets detailed until you have seen it as blocks and said yes.

| # | Stage | What you do | What I produce |
|---|---|---|---|
| 1 | Capture the room | Measure, upload photos | A 3D shell accurate to the millimetres you gave, with a check that flags inconsistent measurements |
| 2 | Inventory | List everything that must live here, including the unseen stuff | A register with size, power, heat, noise and how often you need to reach each thing |
| 3 | Systems | Say what should be automated | Power, data and cable routes, sensors, motors and controllers, placed in the model |
| 4 | Layout | Draw on the floor plan | 2 or 3 block layouts to compare; your drawings become real coordinates |
| 5 | Furniture, one piece at a time | Explain it, correct me by drawing on it | Block model and animated motion study, then proportions, then a dimensioned model |
| 6 | CAD and simulation | Review results, decide what changes | Real CAD of every part; stress, deflection and motion simulation of everything, with the numbers |
| 7 | Build pack | Check it against your tools and budget | Cut list, joints, hardware list, printable parts for the Prusa, assembly order |
| 8 | Sequencing | Say what must keep working during the build | Which old piece leaves when and what replaces it, viewable as a timeline in 3D |
| 9 | Automation software | Test it in the room | The control software, as a separate project that uses this model |

## Order of work

Hidden systems come before furniture. Those cables, controllers and unseen things decide which
cavities the furniture needs, so a table designed first may have to be redesigned.

Measurements come from your laser and tape, and they are the source of truth. Photos show how things sit today, so you do not have to describe them.

Stages 1 to 5 and 7 to 8 stay in Room Studio. CAD and simulation need heavy solvers and automation code changes for different reasons, so each gets its own project that reads this model.

## The correction loop

1. You explain a piece here or on Discord.
2. I post a block study within minutes: plain boxes, a timeline, and one line saying what I think you mean.
3. You scrub to the frame that is wrong, draw on it and send it.
4. I get the picture, the time in the animation, and floor coordinates of your strokes.
5. I post the next revision. Earlier revisions stay available.

Money stays with you: I bring the full list and cost before anything is bought.

## Measurements

The Measure page will walk through these once the site is up:

- Each wall's length, and both diagonals (the second diagonal exposes measuring errors)
- Ceiling height at each corner
- Each door and window: position, width, height, sill height, which way it swings
- Sockets, switches, radiators, pipes, beams, skirting and anything else fixed in place
- Which walls can take screws and heavy loads, and where cables can run
