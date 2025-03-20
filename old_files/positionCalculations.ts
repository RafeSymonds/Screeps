export function distance(pos1: RoomPosition, pos2: RoomPosition): number
{
    return Math.sqrt(Math.pow(pos1.x - pos2.x, 2) + Math.pow(pos1.y - pos2.y, 2));
}
