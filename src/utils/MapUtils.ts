export function filterMap<K, V>(
    source: Map<K, V>,
    predicate: (value: V, key: K) => boolean,
    out?: Map<K, V>
): Map<K, V> {
    const result = out ?? new Map<K, V>();

    for (const [key, value] of source) {
        if (predicate(value, key)) {
            result.set(key, value);
        }
    }

    return result;
}

export function mapMap<K, V, U>(source: Map<K, V>, mapper: (value: V, key: K) => U, out?: Map<K, U>): Map<K, U> {
    const result = out ?? new Map<K, U>();
    result.clear();

    for (const [key, value] of source) {
        result.set(key, mapper(value, key));
    }

    return result;
}

export function filterMapToArray<K, V, T = V>(
    source: Map<K, V>,
    predicate: (value: V, key: K) => boolean,
    out?: T[],
    project?: (value: V, key: K) => T
): T[] {
    const result = out ?? [];

    // Important for reuse
    result.length = 0;

    if (project) {
        for (const [key, value] of source) {
            if (predicate(value, key)) {
                result.push(project(value, key));
            }
        }
    } else {
        // Fast path: no projection
        for (const [, value] of source) {
            if (predicate(value, undefined as K)) {
                result.push(value as unknown as T);
            }
        }
    }

    return result;
}

export function mapToArray<K, V, T>(source: Map<K, V>, mapper: (value: V, key: K) => T, out?: T[]): T[] {
    const result = out ?? [];
    result.length = 0;

    for (const [key, value] of source) {
        result.push(mapper(value, key));
    }

    return result;
}
