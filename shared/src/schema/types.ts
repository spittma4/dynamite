/**
 * The string unions behind the enumerated schema fields (contracts §3). The
 * wire types stay plain strings so the encoder can grow a value without a
 * client rebuild; these unions are how everything on both sides agrees on the
 * spelling.
 */

export type Phase = 'lobby' | 'running' | 'ended';
export type StationType = 'boom_powder' | 'assembly' | 'dock';
export type StationRunState = 'idle' | 'starved' | 'working' | 'jammed' | 'damaged';
export type ItemType = 'keg' | 'casing' | 'stick' | 'crate' | 'parts';
export type ShelfSide = 'in' | 'out' | '';
export type Chore = '' | 'stomp' | 'unjam' | 'sweep' | 'repair';
export type Banner =
    | 'WHOOPS'
    | 'INCIDENT'
    | 'EXPLODED'
    | 'NICE SAVE'
    | 'CLEAN SWEEP'
    | 'HOT STREAK'
    | 'TAILGATE'
    | '';
export type Beacon = 'off' | 'gold' | 'red';
export type TruckPhase = 'away' | 'docked' | 'leaving';
export type OrderStatus = 'open' | 'partial' | 'complete' | 'failed';
export type FuseLength = 'short' | 'long' | '';
export type Line = 'a' | 'b';
export type Product = 'red_stick';
