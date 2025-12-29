import { TaskKind } from "../core/TaskKind";
import { RemoteHarvestTaskData } from "../core/TaskData";
import { Task } from "./Task";
import { Action } from "actions/Action";
import { HarvestAction } from "actions/HarvestAction";
import { CreepState } from "creeps/CreepState";
import { countBodyParts, hasBodyPart } from "creeps/CreepUtils";
import { ResourceManager } from "rooms/ResourceManager";
import { MoveAction } from "actions/MoveAction";
import { getRemoteRoomMemory, updateRemoteRoomMemory } from "rooms/RemoteMiningData";

export function remoteHarvestTaskName(source: Source): string {
    return "RemoteHarvest-" + source.room.name + "-" + source.id;
}

export function createRemoteHarvestTaskData(source: Source): RemoteHarvestTaskData {
    let harvestSpots = 9;

    let terrain = source.room.lookForAtArea(
        LOOK_TERRAIN,
        source.pos.y - 1,
        source.pos.x - 1,
        source.pos.y + 1,
        source.pos.x + 1,
        true
    );
    terrain.forEach(terrainItem => {
        if (terrainItem.terrain === "wall") {
            harvestSpots -= 1;
        }
    });

    return {
        id: remoteHarvestTaskName(source),
        kind: TaskKind.REMOTE_HARVEST,
        room: source.room.name,
        assignedCreeps: [],
        targetId: source.id,
        maxSpots: harvestSpots,
        sourcePos: source.pos
    };
}

export class RemoteHarvestTask extends Task<RemoteHarvestTaskData> {
    source: Source | null;

    constructor(data: RemoteHarvestTaskData) {
        super(data);
        this.data = data;
        this.source = Game.getObjectById(data.targetId);
    }

    public override isStillValid(): boolean {
        return true;
    }

    public override canPerformTask(creepState: CreepState): boolean {
        return hasBodyPart(creepState.creep, WORK);
    }

    public override taskIsFull(): boolean {
        let workParts = this.data.assignedCreeps.reduce((total, creepInfo) => {
            const creep = Game.getObjectById(creepInfo[0]);

            if (creep) {
                total += countBodyParts(creep, WORK);
            }

            return total;
        }, 0);

        return (
            workParts >= 5 ||
            this.data.assignedCreeps.length >= 5 ||
            this.data.assignedCreeps.length >= this.data.maxSpots
        );
    }

    public override score(creep: Creep): number {
        return -1000 + creep.pos.getRangeTo(this.data.sourcePos);
    }

    public override nextAction(creepState: CreepState, resourceManager: ResourceManager): Action | null {
        if (!this.source) {
            return new MoveAction(this.data.sourcePos);
        }

        // update that we are still harvesting
        const remoteRoomMemory = getRemoteRoomMemory(this.data.room);
        remoteRoomMemory.lastHarvestTick = Game.time;
        updateRemoteRoomMemory(this.data.room, remoteRoomMemory);

        return new HarvestAction(this.source);
    }

    public override validCreationSetup(): void {
        if (this.source) {
            this.source.room.memory.numHarvestSpots += this.data.maxSpots;
        }
    }
}
