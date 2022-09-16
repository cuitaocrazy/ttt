namespace saga {
  export type SagaSchedulerStatus = 'running' | 'stopping' | 'none' | 'stopped'

  /**
   * Saga调度器
   */
  export interface SagaScheduler {
    start(): Promise<void>
    instanceCount(): number
    stop(): Promise<void>
    status(): SagaSchedulerStatus
  }

  export function createSagaScheduler(
    sagas: { [key: string]: Saga | undefined },
    loadIter: AsyncGenerator<LoadCmd, void>,
    cmdIter: AsyncGenerator<Cmd, void>,
    maxSagaInstanceCount: number = 0,
  ): SagaScheduler {
    let status: SagaSchedulerStatus = 'none'
    const sagasWithoutKey = Object.values(sagas)

    let instanceCountLock = createPromiseLock()
    const stopLock = createPromiseLock()

    instanceCountLock.resolve()

    sagasWithoutKey.forEach((saga) =>
      saga?.registoryInstanceDoneCallback(() => {
        instanceCountLock.resolve()
      }),
    )

    function instanceCount() {
      return sagasWithoutKey.reduce(
        (count, saga) => count + (saga?.getInstanceCount() || 0),
        0,
      )
    }

    async function start() {
      if (status !== 'none') {
        return
      }

      status = 'running'

      let loadPromise = loadIter.next()
      let cmdPromise = cmdIter.next()

      // 如果loadPromise和cmdPromise都已经完成，那么优先处理loadPromise, 当两个都抛出异常时，则会结束循环
      while (true) {
        // @ts-ignore
        if (status === 'stopping') {
          stopLock.resolve()
          return
        }

        if (
          maxSagaInstanceCount > 0 &&
          instanceCount() >= maxSagaInstanceCount
        ) {
          instanceCountLock = createPromiseLock()
          await instanceCountLock.promise
          continue
        }

        let whois: string

        try {
          whois = await Promise.any([
            loadPromise.then(() => 'load'),
            cmdPromise.then(() => 'cmd'),
          ])
        } catch (e) {
          // todo: 当两个都抛出异常时, 则会结束循环, 日志?
          return
        }

        if (whois === 'load') {
          const loadCmdIterResult = await loadPromise

          if (loadCmdIterResult.done) {
            loadPromise = Promise.reject(new Error('loadIter should be done'))
          } else {
            const loadCmd = loadCmdIterResult.value

            await sagas[loadCmd.name]?.load(loadCmd.id)

            loadPromise = loadIter.next()
          }
        } else {
          const cmdIterResult = await cmdPromise

          if (cmdIterResult.done) {
            cmdPromise = Promise.reject(new Error('cmdIter should be done'))
          } else {
            const cmd = cmdIterResult.value

            const saga = sagas[cmd.type]

            if (saga) {
              const { wait } = await saga.run(cmd.payload)

              cmdPromise = cmdIter.next(wait)
            } else {
              cmdPromise = cmdIter.next(
                Promise.reject(new Error(`saga ${cmd.type} not found`)),
              )
            }
          }
        }
      }
    }

    async function stop() {
      if (status !== 'running') {
        return
      }

      status = 'stopping'

      await stopLock.promise

      const allInstance = sagasWithoutKey.reduce(
        (all, saga) =>
          all.concat(
            Object.values(saga?.getInstances() || {}).map(
              (inst) => inst.instance,
            ),
          ),
        [] as SagaInstance[],
      )

      await Promise.all(allInstance.map((inst) => inst.close()))
      status = 'stopped'
    }

    return {
      start,
      instanceCount,
      status: () => status,
      stop,
    }
  }
}
