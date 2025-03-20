declare global
{

    /*
      Example types, expand on these or remove them and add your own.
      Note: Values, properties defined here do no fully *exist* by this type definiton alone.
            You must also give them an implemention if you would like to use them. (ex. actually setting a `role` property in a Creeps memory)

      Types added in this `global` block are in an ambient, global context. This is needed because `main.ts` is a module file (uses import or export).
      Interfaces matching on name from @types/screeps will be merged. This is how you can extend the 'built-in' interfaces from @types/screeps.
    */
    // Memory extension samples
    interface Memory
    {
        uuid: number;
        log: any;
    }

    interface CreepMemory
    {
    }

    interface RoomMemory
    {
    }


    var roomMemory: { [roomName: string]: RoomMemory };

}

// Syntax for adding proprties to `global` (ex "global.log")
declare namespace NodeJS
{
    interface Global
    {
        log: any;
    }
}

// When compiling TS to JS and bundling with rollup, the line numbers and file names in error messages change
// This utility uses source maps to get the line numbers and file names of the original, TS source code
export const loop = ErrorMapper.wrapLoop(() =>
{
  const gameRooms: [string, Room][] = Object.entries(Game.rooms);

    if (global.roomMemory == null)
    {
        global.roomMemory = {};
        gameRooms.forEach(([roomName, room]) =>
        {
            global.roomMemory[roomName] =
            {
                tasks: {},
                energyLocations: {},
                workerCreepCount: 0,
                transporterCreepCount: 0,
                harvesterCreepCount: 0,
                harvesterLimit: 10,
                baseCenter: [0, 0]
            }

        });
        // need to recreate memory
    }

});
