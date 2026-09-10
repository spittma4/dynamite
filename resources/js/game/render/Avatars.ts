import { TILE_PX, type FactoryState, type PlayerState } from '@shared';
import type Phaser from 'phaser';

import { gameAudio } from '../audio/Audio';
import { RemoteTrack } from './Interpolation';
import { UI, lineColour, playerColour } from './palette';
import { INTERP_DELAY_MS } from '../constants';
import type { Factory } from '../scenes/Factory';

/**
 * Squares with faces — the whole M1 art budget (F04 §4). Everything an avatar
 * shows is a state field, so what a player reads off someone else's square is
 * what the server believes about them: where they face, what they said, whether
 * they are sooted, whether they are seeing stars.
 */

const BODY_PX = 24;
const HAT_WIDTH = 20;
const HAT_HEIGHT = 5;
const EYE_PX = 3;
const FACE_OFFSET = 4;
const SOOT_BODY = 0x2a2a2a;
const BOB_HZ = 4;
const BOB_PX = 2;
const WOBBLE_HZ = 6;
const WOBBLE_RAD = 0.14;
const BUBBLE_WRAP_PX = 150;
const BUBBLE_PAD = 5;

const DIAGONAL = Math.SQRT1_2;

const EAST = { dx: 1, dy: 0 };

/** Facing 0 is east and climbs clockwise on screen, matching `facingFrom`. */
const FACE_VECTORS: readonly { dx: number; dy: number }[] = [
    EAST,
    { dx: DIAGONAL, dy: DIAGONAL },
    { dx: 0, dy: 1 },
    { dx: -DIAGONAL, dy: DIAGONAL },
    { dx: -1, dy: 0 },
    { dx: -DIAGONAL, dy: -DIAGONAL },
    { dx: 0, dy: -1 },
    { dx: DIAGONAL, dy: -DIAGONAL },
];

export interface AvatarPose {
    x: number;
    y: number;
    facing: number;
    moving: boolean;
}

function faceVector(facing: number): { dx: number; dy: number } {
    return FACE_VECTORS[Math.min(7, Math.max(0, Math.round(facing)))] ?? EAST;
}

export class AvatarView {
    private readonly container: Phaser.GameObjects.Container;
    private readonly body: Phaser.GameObjects.Graphics;
    private readonly label: Phaser.GameObjects.Text;
    private readonly hat: number;
    private bubbleBox: Phaser.GameObjects.Graphics | null = null;
    private bubbleText: Phaser.GameObjects.Text | null = null;
    private painted = '';

    constructor(
        private readonly scene: Factory,
        layer: Phaser.GameObjects.Container,
        private readonly colour: number,
        name: string,
        line: string,
    ) {
        this.body = scene.add.graphics();
        this.label = scene.add.text(0, 18, name, {
            fontFamily: 'monospace',
            fontSize: '11px',
            color: '#ffffff',
        });
        this.label.setOrigin(0.5, 0.5);
        this.label.setStroke('#000000', 2);

        this.container = scene.add.container(0, 0, [this.body, this.label]);
        this.hat = lineColour(line);
        layer.add(this.container);
    }

    update(pose: AvatarPose, player: PlayerState, serverNow: number, nowMs: number): void {
        this.container.setPosition(pose.x * TILE_PX, pose.y * TILE_PX);
        this.container.setVisible(serverNow >= player.drivenOffUntil);

        const key = `${Math.round(pose.facing)}|${player.sooted ? 1 : 0}`;

        if (key !== this.painted) {
            this.painted = key;
            this.paint(pose.facing, player.sooted);
        }

        const seconds = nowMs / 1000;

        this.body.y = pose.moving ? -Math.abs(Math.sin(seconds * 2 * Math.PI * BOB_HZ)) * BOB_PX : 0;
        this.container.rotation =
            serverNow < player.stunnedUntil
                ? Math.sin(seconds * 2 * Math.PI * WOBBLE_HZ) * WOBBLE_RAD
                : 0;

        this.bubble(player.bubble, serverNow < player.bubbleUntil);
    }

    destroy(): void {
        this.container.destroy();
    }

    /** Soot swaps body and outline: still your colour, visibly your own fault. */
    private paint(facing: number, sooted: boolean): void {
        const half = BODY_PX / 2;
        const fill = sooted ? SOOT_BODY : this.colour;
        const outline = sooted ? this.colour : UI.outline;
        const ink = sooted ? 0xffffff : 0x000000;
        const vector = faceVector(facing);
        const ox = vector.dx * FACE_OFFSET;
        const oy = vector.dy * FACE_OFFSET;

        this.body.clear();
        this.body.fillStyle(fill, 1);
        this.body.fillRect(-half, -half, BODY_PX, BODY_PX);
        this.body.lineStyle(2, outline, 1);
        this.body.strokeRect(-half, -half, BODY_PX, BODY_PX);

        this.body.fillStyle(this.hat, 1);
        this.body.fillRect(-HAT_WIDTH / 2, -half - 2, HAT_WIDTH, HAT_HEIGHT);

        this.body.fillStyle(ink, 1);
        this.body.fillRect(ox - 5, oy - 4, EYE_PX, EYE_PX);
        this.body.fillRect(ox + 2, oy - 4, EYE_PX, EYE_PX);
        this.body.fillRect(ox - 3, oy + 3, 6, 2);
    }

    private bubble(text: string, visible: boolean): void {
        if (!visible || text === '') {
            this.bubbleBox?.setVisible(false);
            this.bubbleText?.setVisible(false);

            return;
        }

        if (!this.bubbleText || !this.bubbleBox) {
            this.bubbleBox = this.scene.add.graphics();
            this.bubbleText = this.scene.add.text(0, 0, '', {
                fontFamily: 'monospace',
                fontSize: '11px',
                color: '#000000',
                align: 'center',
                wordWrap: { width: BUBBLE_WRAP_PX },
            });
            this.bubbleText.setOrigin(0.5, 1);
            this.container.add([this.bubbleBox, this.bubbleText]);
        }

        this.bubbleBox.setVisible(true);
        this.bubbleText.setVisible(true);

        if (this.bubbleText.text !== text) {
            this.bubbleText.setText(text);
            this.bubbleText.setPosition(0, -20);
            this.drawBubbleBox(this.bubbleText.width, this.bubbleText.height);
        }
    }

    private drawBubbleBox(width: number, height: number): void {
        if (!this.bubbleBox) return;

        const w = width + BUBBLE_PAD * 2;
        const h = height + BUBBLE_PAD * 2;
        const top = -20 - height - BUBBLE_PAD;

        this.bubbleBox.clear();
        this.bubbleBox.fillStyle(0xffffff, 0.95);
        this.bubbleBox.fillRoundedRect(-w / 2, top, w, h, 4);
        this.bubbleBox.fillTriangle(-4, top + h, 4, top + h, 0, top + h + 4);
    }
}

/**
 * The scene event a shout arrives on. One constant so the layer that spots it
 * and the HUD that prints it cannot spell it differently.
 */
export const SHOUT_EVENT = 'crew-shout';

/**
 * Whether a crew-mate's bubble is news this frame (F18). `bubbleUntil` is the
 * only thing that moves when somebody shouts again, so it doubles as the
 * identity of the shout: announce a bubble whose expiry is later than the last
 * one announced for that player, and only theirs — your own shout is a key you
 * just pressed.
 */
export function newShout(
    bubble: string,
    bubbleUntil: number,
    seenUntil: number,
    serverNow: number,
    own: boolean,
): boolean {
    if (own || bubble === '') return false;

    return bubbleUntil > serverNow && bubbleUntil > seenUntil;
}

export class AvatarsLayer {
    private readonly views = new Map<string, AvatarView>();
    private readonly tracks = new Map<string, RemoteTrack>();
    private readonly positions = new Map<string, { x: number; y: number }>();
    /** The last shout announced per player, so one bubble is announced once. */
    private readonly shouted = new Map<string, number>();

    constructor(
        private readonly scene: Factory,
        private readonly layer: Phaser.GameObjects.Container,
    ) {}

    /**
     * `own` is the predicted pose; everyone else is drawn `INTERP_DELAY_MS` in
     * the past, which is what turns 20 Hz patches into smooth walking.
     */
    update(
        state: FactoryState,
        sessionId: string,
        own: AvatarPose | null,
        serverNow: number,
        nowMs: number,
    ): void {
        const seen = new Set<string>();

        state.players.forEach((player, key) => {
            seen.add(key);

            let view = this.views.get(key);

            if (!view) {
                view = new AvatarView(
                    this.scene,
                    this.layer,
                    playerColour(player.colour),
                    player.name,
                    player.line,
                );
                this.views.set(key, view);
            }

            const pose = key === sessionId && own ? own : this.remotePose(key, player, nowMs);

            view.update(pose, player, serverNow, nowMs);
            this.positions.set(key, { x: pose.x * TILE_PX, y: pose.y * TILE_PX });
            this.announceShout(key, player, sessionId, serverNow);
        });

        for (const [key, view] of this.views) {
            if (seen.has(key)) continue;

            view.destroy();
            this.views.delete(key);
            this.tracks.delete(key);
            this.positions.delete(key);
            this.shouted.delete(key);
        }

        this.layer.sort('y');
    }

    /** Px inside the avatar layer; `null` for a session with no avatar. */
    positionOf(sessionId: string): { x: number; y: number } | null {
        const found = this.positions.get(sessionId);

        return found ? { x: found.x, y: found.y } : null;
    }

    destroy(): void {
        for (const view of this.views.values()) view.destroy();

        this.views.clear();
        this.tracks.clear();
        this.positions.clear();
        this.shouted.clear();
    }

    /**
     * A shout, off the world layer and onto the two channels a player inside a
     * mini-game still has: the HUD strip they are already reading, and the ear.
     * The word itself carries which shout it was, which is why one cue serves
     * all four rather than four cues nobody would tell apart.
     */
    private announceShout(
        key: string,
        player: PlayerState,
        sessionId: string,
        serverNow: number,
    ): void {
        const seen = this.shouted.get(key) ?? Number.NEGATIVE_INFINITY;

        if (!newShout(player.bubble, player.bubbleUntil, seen, serverNow, key === sessionId)) {
            return;
        }

        this.shouted.set(key, player.bubbleUntil);
        gameAudio.play('shout');
        this.scene.events.emit(SHOUT_EVENT, player.bubble);
    }

    private remotePose(key: string, player: PlayerState, nowMs: number): AvatarPose {
        let track = this.tracks.get(key);

        if (!track) {
            track = new RemoteTrack();
            this.tracks.set(key, track);
        }

        track.push(player.x, player.y, nowMs);

        const point = track.at(nowMs - INTERP_DELAY_MS) ?? { x: player.x, y: player.y };

        return { x: point.x, y: point.y, facing: player.facing, moving: player.moving };
    }
}
