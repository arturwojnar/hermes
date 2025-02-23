const createSimpleQueue = <Item = unknown>() => {
  const _queue: Item[] = []

  const queue = (item: Item) => {
    _queue.push(item)
  }

  const dequeue = () => {
    _queue.shift()
  }

  const remove = (item: Item) => {
    const index = _queue.indexOf(item)

    if (index > -1) {
      _queue.splice(index, 1)
    }
  }

  const head = () => (_queue.length ? _queue[0] : undefined)
  const tail = () => (_queue.length ? _queue[_queue.length - 1] : undefined)
  const size = () => _queue.length

  return {
    queue,
    dequeue,
    remove,
    head,
    tail,
    size,
  }
}

export { createSimpleQueue }
