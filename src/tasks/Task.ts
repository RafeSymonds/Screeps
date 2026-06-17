/**
 * Task-chaining layer (seam). A Task will be an ordered, persistent sequence of
 * steps composed from the action primitives — e.g. travel -> reserve -> return.
 * It is dispatched from runCreep (actions/executors/index.ts) when a creep
 * carries a task stack, sitting above jobs as the execution-composition layer.
 * Not implemented yet.
 */
export interface Task {
    kind: string;
    // Step state and transitions to be defined when the chaining layer is built.
}
