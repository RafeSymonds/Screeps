export type Comparator<T> = (a: T, b: T) => number;

export type LessThanComparator<T> = (a: T, b: T) => number;


export class PriorityQueue<T>
{
    private data: T[];
    private comparator: Comparator<T>;

    constructor(comparator: Comparator<T>)
    {
        this.data = [];
        this.comparator = comparator;
    }

    private fixUp(i: number)
    {
        while (i > 0 && this.comparator(this.data[(i - 1) / 2], this.data[i]))
        {
            let temp: T = this.data[(i - 1) / 2];
            this.data[(i - 1) / 2] = this.data[i];
            this.data[i] = temp;
            i = (i - 1) / 2;
        }
    }

    private fixDown(i: number)
    {
        let size: number = this.data.length;
        while (2 * (i + 1) - 1 < size)
        {
            let j: number = 2 * (i + 1) - 1;
            if (j < size - 1 && this.comparator(this.data[j], this.data[j + 1]))
            {
                ++j;
            }
            if (this.data[i] < this.data[j])
            {
                break;
            }
            let temp: T = this.data[i];
            this.data[i] = this.data[j];
            this.data[j] = temp;
            i = j;
        }
    }
    push(val: T)
    {
        this.data.push(val);
        this.fixUp(this.data.length - 1);
    }
    pop()
    {
        this.data[0] = this.data[this.data.length - 1];
        this.data.pop();
        this.fixDown(0);
    }
    top(): T
    {
        return this.data[0];
    }
    size(): number
    {
        return this.data.length;
    }

}
