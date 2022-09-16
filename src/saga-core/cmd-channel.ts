namespace saga {
  export function createChannel() {
    const cmdPayloads: [Cmd, ReturnType<typeof createPromiseLock>][] = []
    let continueLock = createPromiseLock()

    async function put(cmdPayload: Cmd) {
      const yieldLock = createPromiseLock()

      cmdPayloads.push([cmdPayload, yieldLock])
      continueLock.resolve()
      return yieldLock.promise
    }

    async function* iter(): AsyncGenerator<Cmd, any, any> {
      while (true) {
        await continueLock.promise

        if (cmdPayloads.length === 0) {
          continueLock = createPromiseLock()
          continue
        }
        const [cmdPayload, yieldPromise] = cmdPayloads.shift()!
        const wait = yield cmdPayload

        yieldPromise.resolve(wait)
      }
    }

    return { put, iter: iter() }
  }
}
