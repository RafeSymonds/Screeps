export abstract class Task<T> {
    data: T;

    constructor(data: T) {
        this.data = data;
    }
}
