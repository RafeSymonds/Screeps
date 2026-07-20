/**
 * Id → live game object resolution for intent execution. Adapter-layer only:
 * cores emit ids, never objects. See docs/design/snapshot.md.
 */
export function resolve<T extends _HasId>(id: Id<T>): T | null {
    return Game.getObjectById(id);
}
