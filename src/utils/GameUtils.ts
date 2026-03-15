let cachedUsername: string | undefined;

export function getMyUsername(): string {
    if (cachedUsername) return cachedUsername;

    for (const name in Game.rooms) {
        const room = Game.rooms[name];
        if (room.controller?.my && room.controller.owner) {
            cachedUsername = room.controller.owner.username;
            return cachedUsername;
        }
    }

    return "";
}
