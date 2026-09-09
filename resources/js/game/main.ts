import type { StationType } from '@shared';
import { INPUT_HEARTBEAT_MS, TILE_PX, type PlayerState } from '@shared';
import Phaser from 'phaser';

import { EMOTE_MIN_INTERVAL_MS, HUD_HEIGHT } from './constants';
import { Keys } from './input/Keys';
import { Host } from './minigames/Host';
import { type MountData, readMount } from './mount';
import { Connection, describeJoinFailure, nextInputSeq } from './net/connection';
import { Boot } from './scenes/Boot';
import { Factory, type FactoryConn } from './scenes/Factory';
import { ReportScene } from './scenes/Report';
import { Debug } from './ui/Debug';
import { Hud } from './ui/Hud';

/**
 * The Vite entry (contracts §6). It connects first and starts Phaser second, so
 * the scene never has to render a world it does not have yet, and a failed
 * clock-in stays a readable line of text instead of a black canvas.
 */

/** The MVP map (28 × 18 tiles) plus the HUD band; `Factory` resizes to the real layout. */
const DEFAULT_WIDTH = 896;
const DEFAULT_HEIGHT = HUD_HEIGHT + 18 * TILE_PX;

async function boot(): Promise<void> {
    const el = document.getElementById('game');

    if (!el) throw new Error('game mount: #game is missing');

    const mount = readMount(el);
    const status = statusLine(el);

    let conn: Connection;

    try {
        conn = await Connection.join(mount);
    } catch (error) {
        status.textContent = `COULDN'T CLOCK IN — ${describeJoinFailure(error, mount)}`;
        status.style.color = '#d9463d';

        return;
    }

    status.remove();

    const game = new Phaser.Game({
        type: Phaser.AUTO,
        parent: 'game',
        width: DEFAULT_WIDTH,
        height: DEFAULT_HEIGHT,
        backgroundColor: '#1b1b1f',
        pixelArt: true,
        roundPixels: true,
        scale: {
            mode: Phaser.Scale.ScaleModes.FIT,
            autoCenter: Phaser.Scale.Center.CENTER_BOTH,
        },
        scene: [Boot, Factory, ReportScene],
    });

    game.registry.set('mount', mount);
    // The scene reads the seat through `FactoryConn`, and the registry is
    // untyped: this is the only place the two shapes are checked against
    // each other.
    game.registry.set('conn', conn satisfies FactoryConn);
    game.registry.set('wire', (factory: Factory) => wire(factory, mount, conn));
}

function statusLine(parent: HTMLElement): HTMLElement {
    const el = document.createElement('div');

    el.textContent = 'CLOCKING IN…';
    el.style.cssText = [
        'position:absolute',
        'inset:0',
        'display:flex',
        'align-items:center',
        'justify-content:center',
        'font:20px system-ui,sans-serif',
        'color:#ffffff',
        'background:#1b1b1f',
    ].join(';');
    parent.appendChild(el);

    return el;
}

/**
 * Everything the scene needs but does not own. `Factory` renders the world;
 * this decides what a key becomes on the wire and what the HUD is told, which
 * is why the two are wired together here rather than inside the scene.
 */
function wire(factory: Factory, mount: MountData, conn: Connection): void {
    const keys = new Keys(factory, mount.debug);
    const hud = new Hud(factory, conn);
    const debug = new Debug(factory, conn);
    const host = new Host(factory, conn, keys);

    // One object, shared: the scene integrates whatever the keys last wrote.
    factory.intent = keys.intent;

    let seq = 0;
    let lastEmoteMs = -EMOTE_MIN_INTERVAL_MS;
    let helpOpen = false;
    let lastPhase = conn.state.phase;

    const sendInput = (): void => {
        if (conn.status !== 'joined' || conn.state.phase === 'ended') return;

        seq = nextInputSeq(seq, conn.me?.seq);
        conn.send('input', { dx: keys.intent.dx, dy: keys.intent.dy, seq });
        factory.prediction.noteSent(seq, { ...keys.intent }, performance.now());
    };

    keys.on('intent', sendInput);
    factory.time.addEvent({ delay: INPUT_HEARTBEAT_MS, loop: true, callback: sendInput });

    keys.on('interact', (repeat) => {
        if (!host.handleKey('interact', true, repeat)) {
            conn.send('interact', { t: performance.now() });
        }
    });
    keys.on('interactUp', () => host.handleKey('interact', false, false));
    keys.on('action', (repeat) => {
        if (!host.handleKey('space', true, repeat)) conn.send('action', { t: performance.now() });
    });
    keys.on('actionUp', () => host.handleKey('space', false, false));
    keys.on('leave', () => {
        if (!host.handleKey('esc', true, false)) conn.send('leave', {});
    });
    keys.on('overlayKey', (key, down, repeat) => {
        host.handleKey(key, down, repeat);
    });
    keys.on('emote', (kind) => {
        const now = performance.now();

        if (now - lastEmoteMs < EMOTE_MIN_INTERVAL_MS) return;

        lastEmoteMs = now;
        conn.send('emote', { kind });
    });
    keys.on('board', (open) => hud.board(open));
    keys.on('help', () => {
        helpOpen = !helpOpen;

        const me = conn.state.players.get(conn.sessionId);
        const station = me?.stationId ? conn.state.stations.get(me.stationId) : undefined;

        hud.help(helpOpen, (station?.type as StationType | undefined) ?? null);
    });
    keys.on('debug', () => debug.toggle());
    keys.on('start', () => {
        if (conn.state.phase === 'lobby') conn.send('start', {});
    });

    const unsubscribes = [
        conn.on('fx', (m) => factory.fx.play(m)),
        conn.on('toast', (m) => hud.toast(m)),
        conn.on('config', (config) => factory.applyConfig(config.level, config.layout)),
        conn.on('report', (payload) => {
            if (!factory.scene.get('Report')) return;

            factory.scene.start('Report', { payload, factoryUrl: mount.factoryUrl });
        }),
        conn.on('status', (status, detail) => {
            console.info(`connection: ${status} (${detail})`);
            localBanner(hud, conn);
        }),
    ];

    // The next patch after a resumed socket is authoritative in full: whatever
    // the player walked during the outage never reached the server.
    const onReconnect = (): void => factory.prediction.onReconnect();

    conn.room.onReconnect(onReconnect);

    const onPostUpdate = (): void => {
        const state = conn.state;
        const serverNow = conn.clock.now();
        const me: PlayerState | undefined = conn.me;

        // `world.level` is only scaled at `start`, so every consumer of the
        // level needs the reply that follows the flip.
        if (state.phase !== lastPhase) {
            if (lastPhase === 'lobby' && state.phase === 'running') conn.send('config', {});

            lastPhase = state.phase;
        }

        localBanner(hud, conn);
        hud.update(state, me, serverNow);
        host.update(me, serverNow);
        debug.update(serverNow, performance.now());
    };

    factory.events.on(Phaser.Scenes.Events.POST_UPDATE, onPostUpdate);

    // `Connection` outlives the scene: F11's `Report` takes over at day end, and
    // a late `fx` or `toast` must not draw into a scene that has shut down.
    factory.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
        for (const off of unsubscribes) off();

        conn.room.onReconnect.remove(onReconnect);
        factory.events.off(Phaser.Scenes.Events.POST_UPDATE, onPostUpdate);
        host.destroy();
    });
}

function localBanner(hud: Hud, conn: Connection): void {
    if (conn.status === 'reconnecting') {
        hud.localBanner('RECONNECTING…', 0xf2d33b);

        return;
    }

    if (conn.status === 'closed' || conn.me === undefined) {
        hud.localBanner('DISCONNECTED — reload to rejoin', 0xd9463d);

        return;
    }

    hud.localBanner(null);
}

void boot();
