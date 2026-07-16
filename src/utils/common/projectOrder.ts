export function orderItemsByKeys<T extends { key: string }>(
  items: T[],
  orderKeys: string[],
) {
  const orderIndex = new Map(orderKeys.map((key, index) => [key, index]));

  return items
    .map((item, index) => ({ item, index }))
    .sort((left, right) => {
      const leftOrder = orderIndex.get(left.item.key);
      const rightOrder = orderIndex.get(right.item.key);

      if (leftOrder === undefined && rightOrder === undefined) {
        return left.index - right.index;
      }

      if (leftOrder === undefined) return 1;
      if (rightOrder === undefined) return -1;

      return leftOrder - rightOrder;
    })
    .map(({ item }) => item);
}

export function mergeOrderKeys(orderKeys: string[], currentKeys: string[]) {
  const orderedKeySet = new Set(orderKeys);
  return [
    ...orderKeys,
    ...currentKeys.filter((key) => !orderedKeySet.has(key)),
  ];
}
