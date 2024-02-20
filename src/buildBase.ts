export function buildBase(room: Room)
{
    let controller: StructureController | undefined = room.controller;

    if (controller)
    {
        let center: [number, number] = room.memory.baseCenter;
        if (controller.level >= 2)
        {
            createExtensionsAroundPoint(center[0] + 2, center[1] - 3, room);
        }
        if (controller.level >= 3)
        {
            createExtensionsAroundPoint(center[0] - 2, center[1] - 3, room);
            room.createConstructionSite(center[0], center[0] - 1, STRUCTURE_TOWER);
        }
    }
}


export function createExtensionsAroundPoint(x: number, y: number, room: Room)
{
    room.createConstructionSite(x, y, STRUCTURE_EXTENSION);
    room.createConstructionSite(x - 1, y, STRUCTURE_EXTENSION);
    room.createConstructionSite(x, y - 1, STRUCTURE_EXTENSION);
    room.createConstructionSite(x + 1, y, STRUCTURE_EXTENSION);
    room.createConstructionSite(x, y + 1, STRUCTURE_EXTENSION);

}
